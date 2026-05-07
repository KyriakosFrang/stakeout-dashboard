# Stakeout Dashboard

Immersive React dashboard for [stakeout-agent](https://github.com/KyriakosFrang/stakeout-agent) — real-time observability for LangGraph and CrewAI runs.

## Features

- **Overview** — live stats (24h), active run counter, 7-day cost trend chart
- **Runs Explorer** — filterable/sortable table with graph, status, date range filters; live updates
- **Run Inspector** — event timeline with latency bars, LLM prompt/response viewer, raw JSON
- **Cost Analytics** — spend over time, breakdown by graph and model, most expensive runs

## Prerequisites

- Node.js 18+
- MongoDB running with the `stakeout` database (or configure via env)

## Setup

```bash
# Install all dependencies (root + server + client)
npm install

# Start both API server and React dev server
npm run dev
```

- React app: http://localhost:5173
- API server: http://localhost:3001

## Configuration

Copy the example and edit as needed:

```bash
cp server/.env.example server/.env
```

**`server/.env`**

```env
# MongoDB connection
MONGO_URI=mongodb://localhost:27017
MONGO_DB=stakeout

# API server port
PORT=3001
```

| Env var | Default | Description |
|---------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string — use `mongodb+srv://...` for Atlas |
| `MONGO_DB` | `stakeout` | Database name (must match the one stakeout-agent writes to) |
| `PORT` | `3001` | API server port |

## Project structure

```
stakeout-dashboard/
├── server/          # Express + TypeScript API + SSE
│   └── src/
│       ├── index.ts         # Entry point
│       ├── db.ts            # MongoDB client
│       ├── sse.ts           # Server-Sent Events poller
│       └── routes/
│           ├── runs.ts      # GET /api/runs, /api/runs/:id, /api/runs/:id/events
│           ├── stats.ts     # GET /api/stats, /api/stats/cost
│           └── graphs.ts    # GET /api/graphs
└── client/          # Vite + React + TypeScript + Tailwind
    └── src/
        ├── pages/
        │   ├── Overview.tsx
        │   ├── Runs.tsx
        │   ├── RunDetail.tsx
        │   └── Cost.tsx
        ├── components/
        ├── context/SSEContext.tsx
        └── hooks/
```

## Production build

```bash
npm run build
npm run start   # serves the API; point a reverse proxy at it and serve client/dist statically
```
