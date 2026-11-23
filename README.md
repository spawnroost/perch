# Perch

**What should I play next?** Perch picks your next game from the library you already own, matched to your
taste, the device in your hand and the time you have tonight.

Live at **[perch.spawnroost.com](https://perch.spawnroost.com)**. Free; open source under AGPL-3.0.

<!-- Screenshot/GIF: docs/perch.gif -->

## What it does

- **For you** shelves ranked from your library, ratings and feedback, with a short reason per pick.
- **Will it run?** Fit per device (PC specs, Steam Deck verified status, consoles), so picks match what you hold.
- **Quick session:** "I have 30 minutes and 40% battery" gives games you can enjoy in that time.
- **Imports:** Steam sign-in, Xbox (OpenXBL), PlayStation (psn-api), Epic/GOG via Playnite or Heroic export files,
  or paste a list.
- **Game detail:** ratings, how long to beat, where to buy with current price and historic low, soundtrack,
  and an AI summary of what Steam players say.
- **Extras:** backlog roulette, personal 1–5 ratings, price watch with a daily email digest, taste card you can
  download as an image, browse by genre and theme, `/` search.

## Stack

TypeScript monorepo (pnpm). Node 24.

| Path                   | What                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| `packages/core`        | Recommendation engine, device fit, imports, data sources (IGDB, Steam) |
| `packages/db`          | Postgres schema and migrations (Drizzle)                               |
| `packages/taste-vocab` | Tag vocabulary used to build taste profiles                            |
| `apps/api`             | JSON API (Hono + better-auth)                                          |
| `apps/web`             | Web app (React + Vite)                                                 |
| `apps/cli`             | `perch` CLI for the engine, data refreshes and checks                  |
| `deploy/`              | Docker Compose, Caddy and backup scripts for a single VPS              |

Data comes from [IGDB](https://www.igdb.com/) (Twitch API), Steam, CheapShark, OpenXBL and PSN. Reasons and
review summaries use DeepSeek, capped per day.

## Run it locally

```sh
pnpm install
cp .env.example .env      # fill in at least IGDB_*, DATABASE_URL*, BETTER_AUTH_SECRET
pnpm db:up                # Postgres in Docker
pnpm db:migrate
pnpm api:dev              # http://localhost:8787
pnpm web:dev              # http://localhost:5173
```

Optional keys in `.env.example` turn on the rest: Steam, Xbox, PSN, Google/Discord sign-in, email (Resend) and
DeepSeek. Without them the matching features are hidden; emails print to the API log.

Checks: `pnpm test`, `pnpm typecheck`, `pnpm lint`.

## Deploy

See [`deploy/README.md`](deploy/README.md): images are built locally and shipped over SSH with `deploy/ship.sh`.

## Support

Perch is free. If it helped you pick a game, there is a tip link in the app.

## License

[AGPL-3.0](LICENSE). If you run a modified Perch as a service, you must share your source.
