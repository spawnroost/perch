# Deploy runbook: perch.spawnroost.com

One Compose project, `perch`, in `/srv/perch` on the shared OVH VPS (ssh alias `ovh-vps`). The shared edge Caddy
(`/srv/edge`, Cloudflare proxied, SSL Full) terminates TLS and proxies to the containers over the external Docker
network `edge`; perch publishes no host ports. Images are built on your machine and sent over SSH.

```
postgres (volume pgdata, project network only) -> migrate (one-shot) -> api :8787  (alias perch-api)
                                                                     -> web :8080  (alias perch-web)
                                                                     -> cron  (IGDB backfills every 6 h, weekly refresh, backup 02:00 UTC)
```

Price-watch digest emails run inside the api process (hourly pass, one digest per user per day), not in cron.

## First deploy

1. Cloudflare: A record `perch` -> VPS IP, proxied, SSL/TLS mode Full. If the proxy blocks the first ACME HTTP-01
   challenge, set the record DNS-only until Caddy has its certificate.
2. Server: `sudo mkdir -p /srv/perch && sudo chown $USER /srv/perch`. Copy `deploy/env.example` to `/srv/perch/.env`,
   fill in, `chmod 600`. Required: `POSTGRES_PASSWORD` (hex), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `WEB_ORIGIN`.
   Also set `IGDB_CLIENT_ID/SECRET` (no games without them) and `RESEND_API_KEY` (else sign-up links only go to logs).
3. The edge stack must be running (it creates the `edge` network). `ship.sh` checks this.
4. From this repo: `deploy/ship.sh` (host `ovh-vps`, override with `DEPLOY_HOST`). It builds `perch-{api,web,tools}`,
   pipes them through `docker save | gzip | ssh docker load`, copies `compose.yml`, `perch.caddy`, `env.example` to
   `/srv/perch`, runs `docker compose up -d --no-build`, installs `perch.caddy` as `/srv/edge/sites/perch.caddy`,
   runs `caddy validate` on the whole edge config and reloads Caddy only if it passes (otherwise it restores the
   previous file). Other projects' containers are not touched.
5. Check: `curl -fsS https://perch.spawnroost.com/api/health` -> `{"ok":true}`.
6. Create your account in the UI, or `docker compose --env-file .env run --rm cron pnpm perch user:create you@x.y`.
7. OAuth redirect URIs: `https://perch.spawnroost.com/api/auth/callback/{google,discord}`. Steam sign-in return URL:
   `https://perch.spawnroost.com/api/auth/steam/callback`.
8. First data fill: `docker compose --env-file .env exec cron pnpm perch igdb:backfill-art` (the 6 h loop does it
   too, once games exist).

## Update / rollback

- Update: `deploy/ship.sh`. Tag is `<git sha>-<utc time>[-dirty]`. Migrations run in the `migrate` one-shot before the
  new api starts, so a non-backwards-compatible migration needs a plan first.
- Rollback: `cat /srv/perch/.previous-tag` on the server, then `deploy/ship.sh --rollback <tag>`. Database changes are
  not undone. Free disk now and then: `docker image prune -a --filter until=720h`.
- `deploy/ship.sh --dry-run` builds only.

## Day to day (on the server, in `/srv/perch`; prefix `docker compose --env-file .env`)

- Status / logs: `ps`, `logs -f --tail=200 api cron`, `logs migrate`.
- CLI: `run --rm cron pnpm perch igdb:refresh`, `run --rm cron pnpm perch user:create ...`.
- psql: `exec postgres psql -U perch -d perch`.
- Env change: edit `.env`, then `up -d` (recreates changed services). Web build args (`VITE_SUPPORT_URL`) need a new ship.

## Backups and restore test

`cron` writes `/backups/daily/perch-YYYY-MM-DD.dump` (pg_dump -Fc, 14 kept) in the `backups` volume at 02:00 UTC.
With `R2_*` set it also copies to `r2:<bucket>/perch/daily/`. Without R2 the dumps sit on the same disk as the
database, so set R2 before relying on them.

- Run one now: `exec cron sh /app/deploy/backup.sh`.
- Restore test into a scratch database (never into `perch`):
  ```
  exec postgres psql -U perch -d perch -c 'create database scratch'
  exec cron sh -c 'RESTORE_DATABASE_URL=$(echo "$DATABASE_URL" | sed "s|/perch\$|/scratch|") \
     sh /app/deploy/restore.sh /backups/daily/perch-<date>.dump'
  exec postgres psql -U perch -d perch -c 'drop database scratch'
  ```
