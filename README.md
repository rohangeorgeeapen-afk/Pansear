# Restaurant Thing — Kitchen Order Scheduler (v1)

MVP kitchen-side scheduling system. Tells chefs which dish to cook next based on order time, cook time, and station capacity.

## One-time setup (Homebrew Postgres)

```bash
brew install postgresql@16
brew services start postgresql@16

createuser -s kitchen
createdb -O kitchen kitchen
psql -d kitchen -c "ALTER USER kitchen WITH PASSWORD 'kitchen';"
```

Defaults assume Postgres on `localhost:5432`, db/user/password all `kitchen`. Override via env (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`).

## Run

```bash
npm install
npm run migrate           # applies schema + seed (idempotent)
npm run dev               # server :3001 + client :5173
```

In another terminal:

```bash
npm run simulate -w packages/server -- --orders 20
```

## Routes (client)

- `/new-order` — create an order
- `/expo` — expeditor view (all active orders)
- `/station/:id` — per-station "cook next" view (1=Grill, 2=Fryer, 3=Cold)

## Tests

```bash
npm test
```

Scheduler tests live at `packages/server/src/scheduler.test.ts`. The scheduler is the brain of the app.

## Architecture

See `packages/server/README.md` for the WebSocket protocol + event flow.

## Docker (alternative to Homebrew)

`docker-compose.yml` is included if you'd rather run Postgres in a container. Note it maps to host port `5433`, so set `PGPORT=5432` ... wait, it maps `5433:5432`, so you'd run `PGPORT=5433 npm run migrate`.
