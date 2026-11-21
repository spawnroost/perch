#!/usr/bin/env bash
# Build the images here, ship them over SSH (no registry, no CI), `docker compose up -d` on the server,
# then install the Caddy site file into the shared edge (/srv/edge) and reload it if it validates.
#
#   deploy/ship.sh                       build + ship + start + edge site   (host: ssh alias ovh-vps)
#   deploy/ship.sh --rollback <tag>      start images already on the server (no build)
#   deploy/ship.sh --dry-run             build only; print what would be shipped
#
# Settings (env or flags):
#   DEPLOY_HOST (default ovh-vps, an ssh alias or address), DEPLOY_USER (default: from the ssh config),
#   DEPLOY_DIR (default /srv/perch), EDGE_DIR (default /srv/edge), SSH_OPTS, IMAGE_TAG (default: <git sha>-<utc time>),
#   VITE_SUPPORT_URL (optional tip link, baked into the web build).
# The server keeps its own $DEPLOY_DIR/.env (chmod 600); this script never copies secrets.
# It only touches /srv/perch and /srv/edge/sites/perch.caddy: other projects' containers are left alone.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${DEPLOY_HOST:-ovh-vps}"; USER_="${DEPLOY_USER:-}"; DIR="${DEPLOY_DIR:-/srv/perch}"; EDGE="${EDGE_DIR:-/srv/edge}"
SSH_OPTS="${SSH_OPTS:-}"; TAG="${IMAGE_TAG:-}"; SUPPORT="${VITE_SUPPORT_URL:-}"
SITE="https://perch.spawnroost.com"
ROLLBACK=""; DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --host) HOST="$2"; shift 2 ;;
    --user) USER_="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --rollback) ROLLBACK="$2"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

TARGET="${HOST}"; [ -n "$USER_" ] && TARGET="${USER_}@${HOST}"
# shellcheck disable=SC2206
SSH=(ssh $SSH_OPTS "$TARGET")
log() { printf '== %s\n' "$*"; }

IMAGES=(api web tools)

if [ -z "$ROLLBACK" ]; then
  if [ -z "$TAG" ]; then
    TAG="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)-$(date -u +%Y%m%d%H%M%S)"
    git diff --quiet 2>/dev/null || TAG="${TAG}-dirty"
  fi
  log "building perch-{api,web,tools}:${TAG}"
  for t in "${IMAGES[@]}"; do
    docker build --target "$t" --build-arg "VITE_SUPPORT_URL=${SUPPORT}" -t "perch-${t}:${TAG}" .
  done
else
  TAG="$ROLLBACK"
fi

if [ "$DRY" = 1 ]; then
  log "dry run: would ship tag ${TAG} to ${TARGET}:${DIR}"
  exit 0
fi

if [ -z "$ROLLBACK" ]; then
  log "shipping images to ${TARGET}"
  docker save $(for t in "${IMAGES[@]}"; do printf 'perch-%s:%s ' "$t" "$TAG"; done) | gzip | "${SSH[@]}" 'gunzip | docker load'
fi

log "syncing compose files to ${DIR}"
"${SSH[@]}" "mkdir -p '${DIR}'"
# shellcheck disable=SC2086
scp $SSH_OPTS deploy/compose.yml deploy/perch.caddy deploy/env.example "${TARGET}:${DIR}/"

log "starting tag ${TAG}"
"${SSH[@]}" bash -s -- "$DIR" "$TAG" "$EDGE" <<'REMOTE'
set -euo pipefail
dir="$1"; tag="$2"; edge="$3"
cd "$dir"
[ -f .env ] || { echo "missing $dir/.env: copy env.example to .env, fill it in and chmod 600" >&2; exit 1; }
docker network inspect edge >/dev/null 2>&1 || { echo "docker network 'edge' not found: start the edge stack in $edge first" >&2; exit 1; }
for t in api web tools; do docker image inspect "perch-$t:$tag" >/dev/null || { echo "image perch-$t:$tag not on this server" >&2; exit 1; }; done
prev="$(grep -E '^IMAGE_TAG=' .env | tail -1 | cut -d= -f2- || true)"
[ -n "$prev" ] && [ "$prev" != "$tag" ] && echo "$prev" > .previous-tag
if grep -qE '^IMAGE_TAG=' .env; then sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$tag|" .env; else echo "IMAGE_TAG=$tag" >> .env; fi
docker compose --env-file .env up -d --no-build --remove-orphans
docker compose --env-file .env ps
echo "deployed ${tag}; previous: $(cat .previous-tag 2>/dev/null || echo none)"

# Edge site file: install, validate the whole edge config, reload only if it is valid (else restore).
site="$edge/sites/perch.caddy"
[ -d "$edge/sites" ] || { echo "no $edge/sites: is the edge stack installed?" >&2; exit 1; }
if [ -f "$site" ] && cmp -s "$dir/perch.caddy" "$site"; then
  echo "edge: $site unchanged, no reload"
else
  [ -f "$site" ] && cp "$site" "$site.bak"
  cp "$dir/perch.caddy" "$site"
  cd "$edge"
  if docker compose exec -T caddy caddy validate --config /etc/caddy/Caddyfile; then
    docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile
    rm -f "$site.bak"
    echo "edge: perch.caddy installed and Caddy reloaded"
  else
    if [ -f "$site.bak" ]; then mv "$site.bak" "$site"; else rm -f "$site"; fi
    echo "edge: caddy validate FAILED; previous perch.caddy restored, Caddy not reloaded" >&2
    exit 1
  fi
fi
REMOTE
log "done. Check: curl -fsS ${SITE}/api/health"
