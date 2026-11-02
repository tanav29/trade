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
FRONTEND_ORIGIN=http://localhost:3000
PORT=8080
NODE_ENV=development
```

Create `apps/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Admin access is granted only to existing account IDs listed in `ADMIN_USER_IDS`. Create an account, find its ID in the `users` table, configure the ID, and restart the backend. The admin panel at `/admin` is the only application interface for adding stocks. The initial shares entered when creating a stock are allocated to the admin account, so they can place sell orders. A stock has no last traded price until its first trade.

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
