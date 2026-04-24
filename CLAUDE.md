# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quality Assurance Output
- Codex will review your output once you are done with your responses.
## Commands

```bash
# Full-stack local dev (frontend + backend together — use this by default)
npm run dev:all

# Frontend only (Vite on :3000, proxies /api/* → :3001)
npm run dev

# Backend only (Express on :3001, nodemon)
npm run dev:server

# Production build
npm run build

# Lint (ESLint on src/, server/, api/)
npm run lint
```

No test framework is configured.

### Important local gotcha
On Windows, `localhost` resolves to `::1` (IPv6). If the Vite proxy returns HTML instead of JSON, it has hit the wrong process. The proxy target in `vite.config.js` must be `http://127.0.0.1:3001`, not `http://localhost:3001`.

### ESM dotenv timing
`server/app.js` uses `import 'dotenv/config'` as its **first import**. In ESM, all module bodies execute before the importing module's body — so `dotenv.config()` called anywhere else in `app.js` would run *after* `supabase.js` initialises, leaving `supabase = null`. Never change the import order.

---

## Architecture

### Full-stack monorepo

| Layer | Directory | Runtime |
|---|---|---|
| React SPA | `src/` | Browser / Vite |
| Express API | `server/` | Node 20+ |
| Vercel serverless | `api/[...path].js` | Vercel Functions |
| ETL pipelines | `etl/` | GitHub Actions / Node |

**In dev:** Vite (`npm run dev`) proxies `/api/*` to the Express server (`npm run dev:server`) on port 3001.
**In production:** Vercel rewrites `/api/*` to `api/[...path].js`, which simply imports and re-exports the Express `app` from `server/app.js`.

### Frontend (`src/`)

- **No React Router.** All page switching is conditional rendering inside `src/App.jsx` (~2700 lines). Pages live in `src/pages/`.
- **Theming** — `src/theme/index.js` exports `ThemeProvider` and `useTheme()`. Two themes: `DARK_THEME` (default) and `LIGHT_THEME`. All components call `useTheme()` and apply `t.bg`, `t.card`, `t.hi`, `t.mid`, `t.low`, `t.border`, etc. as inline styles. No CSS-in-JS library. Accent colour constant is `ORANGE` (`#FF8000`) from `src/theme/tokens.js`.
- **UI primitives** — `src/components/ui/` (Band, Card, CardTitle, SourceFooter, etc.). **No MUI or shadcn/ui** — if you see MUI imports, rewrite to inline styles using `useTheme()`.
- **API client** — `src/api/client.js`. Relative base URL (empty string) — works in both dev proxy and Vercel prod. All methods group by domain (`donors`, `spending`, `corruption`, …). Query params built with `URLSearchParams`.
- **Charts** — Recharts for all bar/line/area/Sankey charts. Deck.gl for WebGL maps. D3 + TopoJSON for SVG fallback maps.
- **DonorIntel** is defined inline in `src/App.jsx` (not a separate file) and passed as a prop to `src/pages/FollowTheMoney.jsx`.

### Backend (`server/`)

- `server/app.js` mounts ~21 Express routers under `/api/*`. Routes live in `server/routes/`, each backed by services in `server/services/`.
- **Feature flag** — `DONOR_SOURCE=supabase` (set in `.env` and Vercel) switches donor/FEC routes from live FEC API calls to Supabase bulk-ingested data. Per-request override via `?source=supabase|fec`. Check `useSupabase(req)` in `server/routes/donors.js`.
- **Supabase** (`server/lib/supabase.js`) — initialised at module load time; requires env vars to be loaded first (hence the ESM dotenv import order above). Returns `null` if env vars are missing; routes call `ensure()` which throws a clear error.
- **Sector classifier** — `server/lib/sectorClassifier.js` keyword-maps raw `contributor_employer` strings to 13 sectors. Used server-side in the employers route.
- **AI agents** — `server/agents/` contains an orchestrator that decomposes queries and fans out to SpendingAgent, PolicyAgent, DonorAgent, CorruptionAgent. Multi-provider LLM support via `server/services/aiService.js` (DeepSeek, OpenAI, Claude, Groq, Ollama, Qwen, xAI); configured via `AI_PROVIDER` env var.
- **Rate limiting** — agents: 10 req/min; general endpoints: 60 req/min.
- **Swagger UI** available at `http://localhost:3001/api/docs` when `ENABLE_API_DOCS=true`.

### Database

| Store | Purpose |
|---|---|
| **Supabase (PostgreSQL)** | Main relational data — FEC bulk tables (`politicians`, `pac_committees`, `candidate_totals`, `contributions`, `committee_transfers`, `money_flow_edges` MV, `disbursements_detail`, `independent_expenditures`, `lobbyist_bundles`) |
| **Redis / Upstash** | Response caching (`server/lib/cache.js`); in-memory fallback if `REDIS_URL` absent |
| **Neo4j** | Entity relationship graphs |
| **DuckDB** | ETL-time analytics (in-process, not persistent) |

Key Supabase tables:
- `politicians` — FEC candidate master (filtered by `fec_candidate_id`)
- `candidate_totals` — financial summaries per (candidate, cycle)
- `contributions` — individual Schedule A receipts; `contributor_employer` is a raw self-reported string
- `pac_committees` — includes `connected_org_name` (corporate parent), `is_super_pac`, `is_501c4`
- `money_flow_edges` — pre-aggregated 5-tier Sankey MV; refresh via `refresh_money_flow_edges()` RPC (heavy — set `statement_timeout = 0` before running)

### ETL (`etl/`)

GitHub Actions workflows (`.github/workflows/`) trigger daily bulk ingestion of FEC and USASpending data. Local runs use DuckDB for transformation before upserting to Supabase. `etl/bulk/upsertBatched.js` handles Supabase free-tier timeouts with retry logic and batch sizing.

### Deployment

`vercel.json` defines:
- `/api/*` → Express serverless function (max 30s)
- `/*` → SPA (`/index.html`)
- 8 daily cron jobs at 07:xx UTC seeding news, gas prices, stock trades, FEC data, corruption scoring, etc.
- Security headers (HSTS, CSP, X-Frame-Options)

---

## Environment variables

See `.env.example` for the full list. Critical ones:

```
SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY   # required for all Supabase-backed routes
DONOR_SOURCE=supabase                       # switches FEC routes to bulk data
AI_PROVIDER=deepseek                        # or openai|anthropic|groq|ollama
FEC_API_KEY                                 # live FEC API fallback
```

`VITE_*` variables are exposed to the browser. Keep all secrets in unprefixed server-side vars.
