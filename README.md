# TradeX - Real-Time Trading System

TradeX is a full-stack trading simulation built as a Bun + Turborepo monorepo. It pairs a Next.js trading dashboard with a Hono API, PostgreSQL persistence, Redis-backed order books, and Server-Sent Events (SSE) for live market depth and candlestick updates.

![TradeX preview](https://github.com/user-attachments/assets/bfde9e9e-6456-4e66-add1-be71bbcb700b)

## Highlights

- Limit and market order placement with basic order matching
- Redis-backed bid/ask order book with live depth broadcasts
- Real-time candlestick chart and order book updates over SSE
- Authenticated user accounts with signed HTTP-only cookie sessions
- Portfolio dashboard for cash, holdings, active orders, and paginated trade history
- PostgreSQL schema and migrations managed with Drizzle ORM
- Shared TypeScript, ESLint, and UI packages across the monorepo

## Tech Stack

| Layer | Tools |
| --- | --- |
| Monorepo | Bun workspaces, Turborepo |
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TanStack Query, Zustand |
| Backend | Bun, Hono, SSE, Zod, JWT, bcrypt |
| Data | PostgreSQL, Drizzle ORM, Redis |
| Charts | lightweight-charts, Recharts |

## Project Structure

```txt
apps/
  frontend/   Next.js web app and trading dashboard
  backend/    Hono API, matching logic, SSE, database access
packages/
  ui/         Shared React UI primitives
  eslint-config/
  typescript-config/
```

## Getting Started

### Prerequisites

- Bun 1.3+
- PostgreSQL
- Redis

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment variables

Create `apps/backend/.env`:

```env
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/tradex
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_USER_IDS=1 # comma-separated IDs of existing admin accounts
ADMIN_EMAILS=tanav@me.xyz # comma-separated admin email addresses
FRONTEND_ORIGIN=http://localhost:3000
PORT=8080
NODE_ENV=development
```

Create `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Admin access is granted to accounts listed by ID in `ADMIN_USER_IDS` or by email in `ADMIN_EMAILS`. Restart the backend after changing these settings. Signup does not verify email addresses, so make sure an admin email is registered by its intended owner before enabling email-based access. The admin panel at `/admin` is the only application interface for adding stocks. The initial shares entered when creating a stock are allocated to the admin account, so they can place sell orders. A stock has no last traded price until its first trade.

### 3. Prepare the database

```bash
cd apps/backend
bun run db:migrate
```

### 4. Run the app

From the repository root:

```bash
bun run dev
```

The frontend runs on `http://localhost:3000` and the backend defaults to `http://localhost:8080`.

## Useful Scripts

```bash
bun run dev          # Start all apps through Turborepo
bun run build        # Build all workspaces
bun run lint         # Run lint checks
bun run check-types  # Run TypeScript checks

docker run -d --name redis -p 6379:6379 redis:latest # spin docker
```

Backend-specific commands:

```bash
cd apps/backend
bun run db:gen       # Generate Drizzle migrations
bun run db:migrate   # Apply migrations
bun run db:studio    # Open Drizzle Studio
bun test             # Matching engine unit tests
```

## API Overview

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create an account with starter cash and stock |
| `POST` | `/auth/login` | Authenticate and set session cookie |
| `GET` | `/auth/logout` | Clear session cookie |
| `GET` | `/user` | Return the current portfolio profile |
| `GET` | `/user/transactions?page=&limit=` | Paginated trade history |
| `POST` | `/trade/makeorder` | Place a limit or market order |
| `GET` | `/trade/depth` | Return current bid/ask depth |
| `GET` | `/trade/chart` | Return recent candlestick data |
| `GET` | `/trade/myorders` | Return the authenticated user's open orders |
| `GET` | `/trade/order-history` | Paginated filled/cancelled/partial orders |
| `POST` | `/trade/cancelorder` | Cancel an open order (releases reserved funds) |
| `GET` | `/events?symbol=` | SSE stream for live depth + chart |

## Real-Time Events (SSE)

Load recent candles once from `GET /trade/chart?symbol=TNV`, then connect to `GET /events?symbol=TNV` (EventSource). Each trade updates the current one-minute candle. Events:

| Event | Payload |
| --- | --- |
| `depth` | `{ symbol, asks, bids }` |
| `price` | `{ time, price }` for the latest executed trade |
| `ping` | Keep-alive timestamp |

## Quality Checks

Before opening a PR or presenting the project, run:

```bash
bun run lint
bun run check-types
```

## Notes

This is a trading simulator for engineering and product demonstration. It is not connected to live brokerage infrastructure and should not be used for real-money trading.


## Matching, retries, and recovery

PostgreSQL is the source of truth for orders, reservations, trades, balances, holdings, and candles. Each submission or cancellation runs in one PostgreSQL transaction. A transaction-scoped advisory lock serializes work for each symbol across backend processes; user rows are locked in ID order so orders for different symbols cannot spend the same available cash concurrently. An order is processed synchronously: if the worker stops before commit, PostgreSQL rolls back and releases its locks; if it stops after commit, the order remains committed. The client can retry to learn its order ID.

`POST /trade/makeorder` requires an `Idempotency-Key` header (1?128 characters), unique per user and logical order. Reuse the same key and identical body after a timeout or lost response. A committed retry returns the existing order ID; changing the body for the same key returns HTTP 409. Rejected orders are not recorded and may be retried. The web form retains its key after a network error for an unchanged order.

Every transaction that changes an open book writes a pending-symbol marker in PostgreSQL. After commit, a worker rebuilds both Redis lists from committed open orders using an atomic Redis transaction. It holds the same symbol lock until the cache write and marker deletion complete, so a stale rebuild cannot overwrite a newer book. If the worker stops before the Redis write, or after the write but before deleting the marker, a later rebuild safely repeats it. All symbols are rebuilt on Redis connection and every five seconds, including after Redis loses its data. Redis and depth views can lag while Redis is unavailable; matching and balances never depend on the cache. Recovery and broadcast occur only while a backend process is running. Apply the new migration before starting this version. Existing books should be reconciled against PostgreSQL before upgrading: older versions could leave Redis, orders and reservations inconsistent, and rebuilding cannot infer missing historical state.

## Integration and load tests

Use a **disposable**, migrated PostgreSQL database and Redis instance. Set `DATABASE_URL` and `REDIS_URL` for `apps/backend`; then from that directory run:

```bash
RUN_INTEGRATION=1 bun test src/durable-matching.integration.test.ts
```

The test creates its own users and symbol, submits overlapping orders and a duplicate request, deliberately skips the post-commit cache update, and checks balances, quantities and recovery. On PowerShell use `$env:RUN_INTEGRATION="1"` before the command. Do not point this test at a production database.

For an HTTP load run, start the backend with the migrated disposable database and Redis, create a dedicated user and symbol with no crossing asks, and provide the user's authentication cookie. The test creates real resting bid orders and reserves cash (one cent per order), so use disposable data. From `apps/backend`:

```bash
LOAD_COOKIE='YOUR_SESSION_COOKIE' LOAD_SYMBOL=TEST LOAD_ORDERS=200 LOAD_CONCURRENCY=20 bun scripts/load-test.ts
```

PowerShell: set those four values with `$env:LOAD_COOKIE`, `$env:LOAD_SYMBOL`, `$env:LOAD_ORDERS`, and `$env:LOAD_CONCURRENCY`, then run `bun scripts/load-test.ts`. The script reports order volume, concurrency, p50/p95 request latency, error count/rate, elapsed time, Bun version and OS/architecture. The default API rate limit is 300 requests per 15 minutes per IP, so larger runs include rate-limit errors unless configured in an isolated test deployment.

**Measurement status (2026-11-03):** No valid load result is available. The development environment had Bun 1.4.2 on Windows x64 and reachable PostgreSQL, but Redis was unavailable and the Docker engine was not running. Volume, concurrency, p50/p95 and error rate are therefore unmeasured; run the command above with both services available to produce results.
