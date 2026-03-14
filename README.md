# UN\*REDACTED MONITOR

> **The War on Greed starts here.**

A real-time government accountability platform that exposes corruption by cross-referencing federal spending, campaign finance, congressional stock trades, and regulatory decisions — powered by live government APIs, a graph database, and AI agents.

![Phase 3](https://img.shields.io/badge/Phase-3%20Complete-orange)
![Phase 4](https://img.shields.io/badge/Phase-4%20In%20Progress-blue)
![License](https://img.shields.io/badge/License-ISC-green)
![Node](https://img.shields.io/badge/Node.js-ES%20Modules-brightgreen)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![React](https://img.shields.io/badge/React-19.2-61DAFB)

---

## Table of Contents

1. [What is UNREDACTED?](#what-is-unredacted)
2. [Live Data Sources](#live-data-sources)
3. [Architecture Overview](#architecture-overview)
4. [Feature Modules](#feature-modules)
5. [RECEIPTS Accountability Score](#receipts-accountability-score)
6. [Tech Stack](#tech-stack)
7. [Project Structure](#project-structure)
8. [Quick Start](#quick-start)
9. [Environment Variables](#environment-variables)
10. [API Reference](#api-reference)
11. [AI Agents](#ai-agents)
12. [ETL Pipeline](#etl-pipeline)
13. [Database Schema](#database-schema)
14. [Supabase Integration](#supabase-integration)
15. [Deployment](#deployment)
16. [Development Roadmap](#development-roadmap)
17. [Data Integrity](#data-integrity)

---

## What is UNREDACTED?

UNREDACTED is a government accountability intelligence platform. It ingests data from six official U.S. government sources and uses graph analysis, AI agents, and real-time scoring to surface patterns that indicate corruption, insider trading, regulatory capture, and political influence-buying.

**Core thesis:** Corruption leaves a data trail. A defense contractor donates to a senator, that senator sits on the Armed Services Committee, the committee oversees the DoD, and the DoD awards the contractor a no-bid contract. Each step is documented in a public record — but no single government system connects them. UNREDACTED does.

### What it detects

| Pattern | How |
|---------|-----|
| **Quid Pro Quo** | Company donations → politician → agency → contracts back to the same company |
| **Regulatory Capture** | Companies that comment on rules regulating them, then receive favorable outcomes |
| **Revolving Door** | Officials who move between government and the industries they regulated |
| **Insider Trading (STOCK Act)** | Congressional stock trades within 30 days of relevant committee activity |
| **Dark Money Flows** | 501(c)(4) → Super PAC → candidate funding chains with disclosure gaps |

### No fake data — ever

Every number on this platform comes from a live government API or is computed from one. There are no hardcoded scores, no placeholder statistics, and no fallback fabrications. If a data source is unavailable, the UI shows an empty state — not invented data.

---

## Live Data Sources

| Source | API Endpoint | Auth | What We Pull |
|--------|-------------|------|-------------|
| **FEC** | `api.open.fec.gov/v1` | API Key (free) | Candidates, committees, contributions (Schedule A/B/E), PAC spending, financial totals |
| **USASpending** | `api.usaspending.gov/api/v2` | None | All federal contracts and grants (2017–present) |
| **Federal Register** | `federalregister.gov/api/v1` | None | Proposed rules, final regulations, significant documents |
| **Senate eFiling** | `efts.senate.gov/PROD/s_search.json` | None | Congressional stock trade disclosures (PTRs) |
| **House Clerk** | `disclosures-clerk.house.gov/api/v1` | None | House member PTR filings |
| **Supabase** | REST / Realtime | Service Key | User auth, watchlist, alerts, 24h score cache |

**Scale:**
- 1M+ federal contracts indexed (2017–present)
- 100M+ FEC contribution records
- 50,000+ regulations (2020–present)
- 600+ active candidates tracked across chambers
- 5,000+ committees monitored (Super PACs, 501(c)(4)s, candidate committees)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER (React 19)                        │
│  Spending | Policy | Donors | Corruption | STOCK Act | Dark Money│
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTP  (Vite dev: 5173 → 3001)
┌──────────────────────────▼──────────────────────────────────────┐
│                   EXPRESS.JS BACKEND  (port 3001)                 │
│  15 route groups  ·  60 req/min general  ·  10 req/min AI        │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌───────────────┐  │
│  │  FEC.js  │  │USASpend  │  │ FedReg.js │  │ StockAct.js   │  │
│  │ service  │  │ service  │  │  service  │  │ DarkMoney.js  │  │
│  └────┬─────┘  └────┬─────┘  └─────┬─────┘  └───────┬───────┘  │
│       └──────────────┴──────────────┴──────────────────┘         │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │   corruptionScoring.js  ·  graphQueries.js (Neo4j)       │   │
│  │   RECEIPTS Score Engine ·  Cypher pattern matching       │   │
│  └──────────────────────────┬───────────────────────────────┘   │
│                              │                                    │
│  ┌───────────────────────────▼──────────────────────────────┐   │
│  │          Supabase  (PostgreSQL + Auth + Realtime)         │   │
│  │  corruption_scores · watchlist · alerts · flags · users   │   │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────┘
                           │ proxy  (port 8000)
┌──────────────────────────▼──────────────────────────────────────┐
│               PYTHON FASTAPI AGENTS  (port 8000)                  │
│                                                                   │
│   CorruptionDetectionAgent  │  DonorIntelligenceAgent            │
│   PolicyAnalysisAgent        │  (LangGraph + Claude Sonnet 4.6)  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼────┐       ┌─────▼────┐      ┌──────▼───┐
   │  Neo4j  │       │PostgreSQL│      │  Redis   │
   │  Aura   │       │(Supabase)│      │  Cache   │
   │  Graph  │       │Relational│      │   TTL    │
   └─────────┘       └──────────┘      └──────────┘
```

---

## Feature Modules

### Phase 1 — Spending & Policy Intel

**Federal Contracts Browser**
- Real-time search across USASpending.gov contracts
- Filter by agency, recipient, and fiscal year
- Automatic fiscal year fallback (FY2025 → FY2024 → FY2023) ensures data always loads

**Regulatory Monitor**
- Pulls from Federal Register API
- Flags economically significant rules (>$100M projected impact)
- Filterable by agency, keyword, and rule type (proposed / final)

**News Ticker**
- Live RSS feed from government sources (DOJ, GAO, SEC, Congressional oversight)
- Hidden when no live data available — never shows fabricated headlines

---

### Phase 2 — Donor Intelligence

**FEC Campaign Finance Explorer**
- Search any committee, candidate, or donor across all FEC records
- View full contribution history, top donors by employer, PAC spending breakdowns
- Donor network maps showing who funds whom and by how much
- Side-by-side candidate comparison (fundraising totals, top contributors, cash-on-hand)
- Employer-based donor search (e.g., all employees of a defense contractor)

**Multi-Agent AI Analysis**
- Node.js AI orchestrator routes user queries to specialized sub-agents
- Each agent calls the appropriate government APIs and returns structured findings
- Supports Claude, OpenAI, Gemini, and Groq via a provider-agnostic abstraction layer

---

### Phase 3 — Corruption Intelligence

#### STOCK Act Monitor
Tracks congressional stock trades filed as Periodic Transaction Reports (PTRs).

- Pulls live filings from the Senate eFiling API and House Clerk API
- Filterable by chamber (Senate / House) and politician name
- **Violation watchlist**: aggregates PTR filing frequency to flag high-frequency traders
- Risk scoring proxy: 40 base + 5 per filing, capped at 95
- Individual trade details require PDF parsing (planned ETL enhancement)

#### Dark Money Tracker
Traces political spending from non-disclosing organizations through Super PACs.

- Fetches all Super PAC (type V) and 501(c)(4) hybrid (type W) committees from FEC
- Retrieves real financial totals via individual committee totals API calls (not list-endpoint estimates)
- Classifies each organization by disclosure level:
  - 🔴 **DARK** — No known donors or connected organization on file
  - 🟡 **PARTIAL** — Connected organization known; individual donors not disclosed
  - 🟢 **DISCLOSED** — Donors publicly identified in FEC records
- Traces funding chains: receipts flowing in, disbursements flowing out
- Sankey-compatible flow diagram data for visualization
- Industry inference: infers likely funding sectors from committee name analysis

#### Company Profiles
Full political footprint for any contractor or company.

- Contract history with amounts and dates from USASpending
- PAC presence and disbursements from FEC
- Regulatory exposure from Federal Register (agency rules affecting the company)
- Quid pro quo conflict signals from Neo4j graph traversal
- Revolving door data (planned: lobbyist disclosure API integration)
- RECEIPTS risk score: 0–100 with CRITICAL / HIGH / MEDIUM / LOW classification

#### Accountability Index (RECEIPTS Leaderboard)
Ranked list of active politicians scored on four accountability dimensions.

- Fetches 2024-cycle Senate candidates from FEC (`candidate_status=C`)
- Scores each politician in parallel across all four RECEIPTS dimensions
- Cached in Supabase for 24 hours — subsequent requests return in <5ms
- Filterable by chamber and party

---

### Phase 4 — User Platform (In Progress)

| Feature | Status | Description |
|---------|--------|-------------|
| **Authentication** | ✅ Done | Supabase email/password auth with `user_profiles` auto-creation |
| **Watchlist** | ✅ Done | Save politicians, companies, or regulations to track |
| **Alerts** | ✅ Done | Configure alerts when watched entities' scores change |
| **Community Flags** | ✅ Done | Flag suspicious entities; community upvoting |
| **Real-time Updates** | ✅ Done | Supabase Realtime subscriptions for live score changes |
| **Email Notifications** | 📋 Planned | Email delivery for fired alerts |

---

## RECEIPTS Accountability Score

A 0–100 composite score measuring political accountability. Four dimensions, each worth 25 points.

### Politician Score (0–100)

| Component | Max | Method | Data Source |
|-----------|-----|--------|-------------|
| **Donor Transparency** | 25 | Ratio of itemized to total contributions. Higher itemized ratio = more transparent. | FEC Schedule A totals |
| **STOCK Act Compliance** | 25 | PTR filing frequency. 0 PTRs = 24 pts · 1–3 = 22 · 4–10 = 18 · 11–25 = 12 · 26+ = 6 | Senate eFiling API |
| **Vote-Donor Alignment** | 25 | PAC contribution ratio as proxy. High PAC dependence suggests donor-aligned voting. | FEC committee totals |
| **Disclosure Timeliness** | 25 | FEC filing amendment ratio. >50% amended = 8 pts · <10% amended = 23 pts | FEC filings API |

**Grade tiers:** A (≥85) · B (≥70) · C (≥55) · D (≥40) · F (<40)

**Graceful degradation:** If a component's data source is unavailable, that component is excluded and the remaining components are scaled to 100 proportionally.

### Company Score (0–100)

| Component | Weight | Scoring Logic |
|-----------|--------|--------------|
| **Contract Concentration** | 30% | >$1B in federal contracts = 80 pts · >$100M = 60 · >$10M = 40 · <$10M = 20 |
| **Donor Links** | 30% | PAC committees registered with FEC = 70+ pts · None found = 15 pts |
| **Regulatory Capture** | 20% | >3 significant rules from contracting agencies = 65 pts · >0 = 45 · None = 15 |
| **Revolving Door** | 20% | >5 politician connections via PAC = 70 pts · >0 = 45 · None = 10 |

**Risk levels:** CRITICAL (≥80) · HIGH (≥60) · MEDIUM (≥35) · LOW (<35)

### Caching Strategy

```
Incoming score request
        │
        ▼
Check Supabase (expires_at > now())
        │
   ┌────┴────┐
   │  HIT   │  MISS
   │ <5ms   │  ~400–800ms
   ▼         ▼
Return    Compute from FEC + Neo4j
cached    → Write to Supabase (24h TTL)
score     → Return fresh score
```

Leaderboard warm-cache: if 5+ politicians were scored within the last 6 hours, the leaderboard returns from Supabase without any FEC API calls.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.2 | UI framework |
| Vite | 7.3 | Build tool and dev server |
| Recharts | 3.8 | Charts (Bar, Line, Area, Scatter, Composed) |
| @supabase/supabase-js | 2.99 | Auth and Realtime subscriptions |

**Design:** IBM Plex Mono (monospace) + Playfair Display (serif). Orange `#FF8000` primary accent. Full dark/light theme with 30+ semantic color tokens. No CSS framework — all styles are inline with the token system.

### Backend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Express | 5.2 | HTTP server |
| axios | 1.13 | HTTP client for all government APIs |
| neo4j-driver | 5.28 | Neo4j graph database queries |
| @supabase/supabase-js | 2.99 | Server-side cache and user data |
| express-rate-limit | 8.2 | Rate limiting (60/min general, 10/min AI) |
| @anthropic-ai/sdk | 0.78 | Claude API |
| openai / groq-sdk | latest | LLM provider fallbacks |
| rss-parser | 3.13 | Government RSS feed parsing |

### Python Agents

| Technology | Version | Purpose |
|-----------|---------|---------|
| FastAPI | 0.104+ | Agent HTTP server |
| LangGraph | 0.1+ | State machine agent workflows |
| LangChain Anthropic | 0.1+ | Claude Sonnet 4.6 integration |
| httpx | 0.28 | Async HTTP client for FEC API calls |
| Pydantic | 2.4+ | State schema validation |
| uvicorn | 0.24+ | ASGI server |

### Databases

| Database | Hosted | Purpose |
|---------|--------|---------|
| Neo4j 5 Enterprise | Neo4j Aura | Graph: corruption pattern detection via Cypher path queries |
| PostgreSQL 16 | Supabase | Relational: contracts, regulations, contributions, user data |
| Redis 7 | Docker / Upstash | Ephemeral caching, API response deduplication |

---

## Project Structure

```
UNREDACTED/
│
├── backend/                          # Express.js API server (port 3001)
│   ├── server.js                     # Entry point: routes, rate limits, CORS, logging
│   ├── routes/
│   │   ├── spending.js               # /api/spending  — contracts, grants, agency totals
│   │   ├── policy.js                 # /api/policy    — regulations, significant rules
│   │   ├── donors.js                 # /api/donors    — FEC committees, candidates, contributions
│   │   ├── corruption.js             # /api/corruption — RECEIPTS scoring, leaderboard, patterns
│   │   ├── companies.js              # /api/companies  — profiles, footprint, conflicts
│   │   ├── stockact.js               # /api/stockact   — PTR filings, violations, watchlist
│   │   ├── darkmoney.js              # /api/darkmoney  — orgs, funding chains, flow data
│   │   ├── feed.js                   # /api/feed       — government RSS news
│   │   ├── settings.js               # /api/settings   — user preferences, AI test
│   │   ├── watchlist.js              # /api/watchlist  — user watchlist (Supabase, auth-gated)
│   │   ├── alerts.js                 # /api/alerts     — user alerts (Supabase, auth-gated)
│   │   ├── flags.js                  # /api/flags      — community flags (public read)
│   │   ├── agent.js                  # /api/agent      — legacy Node.js AI agent
│   │   └── ai_agent.js               # /api/ai-agent   — FastAPI proxy
│   ├── services/
│   │   ├── fec.js                    # FEC API: candidates, committees, Schedule A/B/E
│   │   ├── usaSpending.js            # USASpending API: contracts, grants, agency totals
│   │   ├── federalRegister.js        # Federal Register API: rules, significant docs
│   │   ├── corruptionScoring.js      # RECEIPTS score engine + Supabase cache
│   │   ├── stockAct.js               # Senate/House PTR filings + violation detection
│   │   ├── darkMoney.js              # Super PAC / 501(c)(4) analysis + flow tracing
│   │   ├── graphQueries.js           # Neo4j Cypher: quid pro quo, regulatory, risk score
│   │   ├── aiService.js              # LLM abstraction (Claude / OpenAI / Gemini / Groq)
│   │   └── rssFeed.js                # Government RSS monitoring
│   ├── agents/                       # Node.js AI agents (legacy orchestrator)
│   │   ├── orchestrator.js
│   │   ├── corruptionAgent.js
│   │   ├── donorAgent.js
│   │   ├── policyAgent.js
│   │   └── spendingAgent.js
│   ├── lib/
│   │   └── supabase.js               # Service-role Supabase client + cache/user helpers
│   └── middleware/
│       └── auth.js                   # optionalAuth / requireAuth (Supabase JWT validation)
│
├── frontend/                         # React + Vite SPA (port 5173)
│   ├── src/
│   │   ├── App.jsx                   # Main app: navigation, theme system, all inline views
│   │   ├── api/
│   │   │   └── client.js             # 60+ API functions for all backend endpoints
│   │   ├── components/
│   │   │   ├── StockActMonitor.jsx   # Congressional trade tracker (PTR filings)
│   │   │   ├── DarkMoneyTracker.jsx  # Dark money flow visualization + org table
│   │   │   ├── CompanyProfile.jsx    # Company risk score + political footprint
│   │   │   ├── AccountabilityIndex.jsx # RECEIPTS politician leaderboard
│   │   │   ├── Auth.jsx              # Supabase sign-in / sign-up modal
│   │   │   ├── Watchlist.jsx         # User watchlist with score badges (auth-gated)
│   │   │   └── Settings.jsx          # Theme, AI provider, API key configuration
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx       # Global Supabase session state
│   │   └── lib/
│   │       └── supabase.js           # Anon-key Supabase client + Realtime subscriptions
│   ├── .env                          # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
│   └── vite.config.js
│
├── agents/                           # Python LangGraph AI agents (port 8000)
│   ├── main.py                       # FastAPI app, /analyze, /donor, /policy routes
│   ├── corruption_agent.py           # CorruptionDetectionAgent: 5-step LangGraph workflow
│   ├── donor_agent.py                # DonorIntelligenceAgent: live FEC API queries
│   ├── policy_agent.py               # PolicyAnalysisAgent: Federal Register + USASpending
│   └── requirements.txt
│
├── etl/                              # Python ETL pipeline
│   ├── base/
│   │   ├── worker.py                 # BaseETLWorker: extract → transform → load + retry
│   │   ├── neo4j_client.py           # Neo4j singleton, schema constraints + indexes
│   │   ├── postgres_client.py        # PostgreSQL: connection, bulk inserts, ETL job logging
│   │   └── redis_client.py           # Redis: caching layer, deduplication keys
│   ├── sources/
│   │   ├── fec.py                    # FEC → PostgreSQL politicians/contributions + Neo4j
│   │   ├── usa_spending.py           # USASpending → PostgreSQL contracts/grants + Neo4j
│   │   ├── federal_register.py       # Federal Register → PostgreSQL regulations + Neo4j
│   │   ├── senate_disclosures.py     # Senate PTRs → PostgreSQL senate_disclosures
│   │   └── house_disclosures.py      # House PTRs → PostgreSQL house_disclosures
│   └── enrichment/
│       ├── corruption_scorer.py      # Batch RECEIPTS score computation → Supabase cache
│       ├── dark_money_tracer.py      # 501(c)(4) funding chain inference
│       ├── quid_pro_quo_detector.py  # Cross-source 4-hop Neo4j pattern detection
│       ├── donor_resolver.py         # FEC donor deduplication (fuzzy name matching)
│       └── entity_resolution.py     # Cross-source entity linking (FEC ↔ USASpending ↔ SEC)
│
├── supabase/
│   ├── schema.sql                    # Complete PostgreSQL schema: 20 tables, 31 RLS
│   │                                 # policies, 3 custom functions, 12 triggers
│   └── seed.sql                      # Empty — scores computed on-demand, never hardcoded
│
├── docker-compose.yml                # Neo4j 5 Enterprise, PostgreSQL 16, Redis 7
├── test-endpoints.mjs                # Comprehensive API tester (80 tests, color output)
└── README.md
```

---

## Quick Start

### Prerequisites

- **Node.js 20+** and **npm**
- **Python 3.10+** and **pip**
- **Docker** (for local Neo4j, PostgreSQL, Redis) — or use Supabase cloud + Neo4j Aura
- **FEC API key** — free at [api.open.fec.gov/developers](https://api.open.fec.gov/developers/) (1,000 req/hr vs 60/hr without)
- **Anthropic API key** — for AI agents at [console.anthropic.com](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone https://github.com/policybot-io/UNREDACTED.git
cd UNREDACTED

# Backend
cd backend && npm install && cd ..

# Frontend
cd frontend && npm install && cd ..

# Python agents
cd agents && pip install -r requirements.txt && cd ..
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
# Edit backend/.env — add FEC_API_KEY, ANTHROPIC_API_KEY, Supabase credentials

cp frontend/.env.example frontend/.env
# Edit frontend/.env — add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### 3. Start infrastructure

```bash
# Start Neo4j, PostgreSQL, Redis via Docker
docker-compose up -d

# Wait ~30s for Neo4j to initialize
curl http://localhost:7474   # Should return Neo4j browser HTML
```

### 4. Deploy database schema

```bash
# Using the pg npm package (already installed as a backend dev dependency)
cd backend && node -e "
import('./node_modules/pg/lib/index.js').then(async ({ default: pg }) => {
  import('fs').then(async (fs) => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    await client.connect()
    await client.query(fs.readFileSync('../supabase/schema.sql', 'utf8'))
    console.log('Schema deployed')
    await client.end()
  })
})
"
```

### 5. Run ETL

```bash
cd etl

# Load government data (order matters)
python -m sources.fec                         # Campaign finance
python -m sources.usa_spending                # Contracts & grants
python -m sources.federal_register            # Regulations
python -m sources.senate_disclosures          # Stock trade disclosures

# Enrich data (after sources load)
python -m enrichment.corruption_scorer        # Pre-compute RECEIPTS scores
python -m enrichment.dark_money_tracer        # Trace 501(c)(4) chains
python -m enrichment.quid_pro_quo_detector    # Find corruption patterns
```

### 6. Launch the platform

```bash
# Terminal 1 — Backend API (port 3001)
cd backend && node server.js

# Terminal 2 — Frontend (port 5173)
cd frontend && npm run dev

# Terminal 3 — Python AI Agents (optional, port 8000)
cd agents && uvicorn main:app --reload --port 8000
```

Open **http://localhost:5173**.

### 7. Run the endpoint test suite

```bash
# From project root (backend must be running on port 3001)
node test-endpoints.mjs
# Expected: 58+ PASS, 0 FAIL
```

---

## Environment Variables

### Backend (`backend/.env`)

```env
# ─── Server ────────────────────────────────────────────────────────────────────
PORT=3001

# ─── AI Provider ───────────────────────────────────────────────────────────────
AI_PROVIDER=anthropic                   # anthropic | openai | gemini | groq | ollama
# AI_MODEL=claude-sonnet-4-6           # Model override (optional)

# ─── Anthropic (primary) ───────────────────────────────────────────────────────
ANTHROPIC_API_KEY=sk-ant-...

# ─── Other LLM providers (optional fallbacks) ──────────────────────────────────
OPENAI_API_KEY=
GROQ_API_KEY=
DEEPSEEK_API_KEY=
XAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# ─── FEC ───────────────────────────────────────────────────────────────────────
FEC_API_KEY=your_key_here               # Free at api.open.fec.gov/developers

# ─── Neo4j ─────────────────────────────────────────────────────────────────────
NEO4J_URI=bolt://localhost:7687         # or neo4j+s://xxx.databases.neo4j.io (Aura)
NEO4J_USERNAME=neo4j
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
NEO4J_DATABASE=neo4j

# ─── Supabase ──────────────────────────────────────────────────────────────────
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# ─── Redis ─────────────────────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0
CACHE_TTL=3600

# ─── Python Agents ─────────────────────────────────────────────────────────────
FASTAPI_URL=http://localhost:8000
```

### Frontend (`frontend/.env`)

```env
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_BASE_URL=http://localhost:3001   # Optional — defaults to localhost:3001
```

### ETL (`etl/.env`)

```env
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
DIRECT_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres
FEC_API_KEY=your_key_here
ANTHROPIC_API_KEY=sk-ant-...
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
```

---

## API Reference

All endpoints return `{ success: boolean, data: any }`. Rate limits apply: **60 req/min** general, **10 req/min** AI endpoints.

### Spending — `/api/spending`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/contracts` | `keyword, agency, limit` | Federal contracts from USASpending |
| GET | `/grants` | `keyword, agency, limit` | Federal grants |
| GET | `/agency` | `year, agency` | Agency-level spending totals |

### Policy — `/api/policy`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/rules` | `keyword, limit` | Federal Register regulations |
| GET | `/significant` | `limit` | Economically significant rules only |

### Feed — `/api/feed`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/spending-news` | `limit` | Live government RSS news items |

### Donors / FEC — `/api/donors`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/committees` | `keyword, limit` | Search FEC committees |
| GET | `/committees/:id/receipts` | `limit` | Committee fundraising |
| GET | `/committees/:id/contributions` | `limit, minAmount` | Contributions to other committees |
| GET | `/committees/:id/spending` | `limit` | PAC disbursements |
| GET | `/candidates` | `name, office, state, limit` | Search FEC candidates |
| GET | `/candidates/:id/totals` | — | Candidate financial totals |
| GET | `/candidates/:id/contributions` | `limit, minAmount` | Top contributors to candidate |
| GET | `/candidates/compare` | `ids, cycle` | Side-by-side candidate comparison |
| GET | `/donors/by-employer` | `employer, limit, cycle` | Top donors from employer |
| GET | `/donors/:name/network` | `limit` | Donor contribution network |
| GET | `/contributions/by-industry` | `keywords, limit, cycle` | Industry contribution analysis |

### Corruption — `/api/corruption`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/score/company` | `name` | Company RECEIPTS risk score (0–100) |
| GET | `/score/politician` | `candidateId` | Politician accountability score |
| GET | `/leaderboard` | `chamber, party, limit` | Ranked politician leaderboard |
| GET | `/hotspots` | `agency` | Top corruption risk pairs (Neo4j) |
| GET | `/patterns` | `query` | Quid pro quo pattern search |
| GET | `/signals/company/:name` | — | Risk signals for company |
| POST | `/analyze` | `{ query }` | AI corruption analysis (via FastAPI) |

### Companies — `/api/companies`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/search` | Search companies by name |
| GET | `/:name/profile` | Full company profile (score + contracts + network) |
| GET | `/:name/political-footprint` | PACs and political donations |
| GET | `/:name/contracts` | Government contracts awarded |
| GET | `/:name/regulatory` | Regulatory interactions |
| GET | `/:name/revolving-door` | Former government employee connections |
| GET | `/:name/conflicts` | Conflict-of-interest signals |

### STOCK Act — `/api/stockact`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/recent` | `chamber, limit` | Recent PTR filings (Senate + House) |
| GET | `/violations` | — | Detected STOCK Act violations |
| GET | `/politician/:name` | `chamber` | All trades for a politician |
| GET | `/politician/:name/performance` | — | Market outperformance analysis |
| GET | `/watchlist` | — | Violation watchlist by filing frequency |
| GET | `/companies/most-traded` | — | Most traded companies by Congress |

### Dark Money — `/api/darkmoney`

| Method | Endpoint | Query Params | Description |
|--------|----------|--------------|-------------|
| GET | `/orgs` | `limit` | Super PACs + 501(c)(4)s with real spending |
| GET | `/trace/:committeeId` | — | Funding chain for a specific committee |
| GET | `/candidate/:id/exposure` | — | Dark money exposure around a candidate |
| GET | `/candidate/:id/infer` | — | Inferred likely funding industry |
| GET | `/flow` | `cycle` | Sankey diagram flow data |
| GET | `/organizations/index` | `disclosureLevel` | Filter orgs by disclosure level |

### User Platform — `/api/watchlist`, `/api/alerts`, `/api/flags`

All watchlist and alert endpoints require `Authorization: Bearer <supabase_jwt>` header.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/watchlist` | Required | Get user's watchlist with scores |
| POST | `/api/watchlist` | Required | Add entity to watchlist |
| DELETE | `/api/watchlist` | Required | Remove entity from watchlist |
| GET | `/api/alerts` | Required | Get user's alert rules |
| POST | `/api/alerts` | Required | Create an alert rule |
| PATCH | `/api/alerts/:id/read` | Required | Mark alert as read |
| POST | `/api/alerts/check` | Required | Trigger alert evaluation |
| GET | `/api/flags` | Public | Get community-submitted flags |
| POST | `/api/flags` | Required | Submit a corruption flag |
| POST | `/api/flags/:id/upvote` | Required | Upvote an existing flag |
| GET | `/api/flags/:entityId` | Public | Flags for a specific entity |

### Settings & Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings` | Get user settings |
| POST | `/api/settings` | Save settings |
| POST | `/api/settings/test` | Test AI service connection |
| GET | `/health` | Server health check |

---

## AI Agents

### Node.js Orchestrator (Legacy, `/api/agent`)

A lightweight multi-agent system in `backend/agents/`. The orchestrator classifies incoming queries and routes to the best sub-agent:

```
User query → Orchestrator
                 ├── CorruptionAgent  (FEC + USASpending cross-reference)
                 ├── DonorAgent       (FEC committees, contributions, networks)
                 ├── PolicyAgent      (Federal Register + spending correlation)
                 └── SpendingAgent    (USASpending contract analysis)
```

### Python LangGraph Agents (Production, `/api/ai-agent`, port 8000)

Three agents using LangGraph state machines. All use `claude-sonnet-4-6` at temperature 0.1 for deterministic, factual outputs. No fabricated data — if APIs return nothing, the agent reports no findings.

#### CorruptionDetectionAgent (`agents/corruption_agent.py`)

```
query
  │
  ▼  extract_entities     — Extract company names, politician names, agencies from query
  │
  ▼  query_corruption_db  — Fetch FEC, Neo4j, USASpending data for those entities
  │
  ▼  detect_patterns      — Identify which of 5 corruption pattern types are present
  │
  ▼  score_risk           — Compute confidence and severity scores per pattern
  │
  ▼  generate_report      — Produce structured evidence chain and summary
```

**Patterns detected with lookback windows:**

| Pattern | Severity | Lookback |
|---------|----------|----------|
| Quid pro quo (donation → contract cycle) | HIGH | 12 months |
| Regulatory capture (comments → favorable rule) | HIGH | 18 months |
| Revolving door (official → industry job) | MEDIUM–HIGH | 24 months |
| STOCK Act (trade near committee hearing) | HIGH | 30 days |
| Dark money (501c4 → PAC → legislation) | MEDIUM | 24 months |

#### DonorIntelligenceAgent (`agents/donor_agent.py`)

```
query
  │
  ▼  extract_entities   — Identify person names, organizations, industries, offices
  │
  ▼  query_fec_api      — Live FEC API: candidate search + Schedule A contributions
  │                       (uses httpx async — no mock data, no fabricated results)
  │
  ▼  analyze_patterns   — Contribution volume, political leaning, network strength
  │
  ▼  generate_summary   — Key findings with dollar amounts and entity names
```

#### PolicyAnalysisAgent (`agents/policy_agent.py`)

```
query
  │
  ▼  extract_policy_entities  — Agencies, topics, industries, regulation numbers
  │
  ▼  fetch_regulations        — Federal Register API: matching proposed/final rules
  │
  ▼  correlate_spending       — USASpending: contracts from the same agencies
  │
  ▼  analyze_influence        — Cross-reference which companies are regulated vs. contracted
  │
  ▼  generate_insights        — Regulatory capture signals and policy impact summary
```

---

## ETL Pipeline

The ETL pipeline populates Neo4j and PostgreSQL from government APIs. All workers follow the same base architecture:

```python
class BaseETLWorker:
    async def extract(self) -> List[Dict]    # Fetch from government API
    def transform(self, raw: List) -> List   # Normalize, deduplicate, validate
    async def load(self, records: List)      # Write to Neo4j + PostgreSQL
    async def run(self)                      # Full pipeline with retry and logging
```

### Source Workers (`etl/sources/`)

#### FEC Worker
- Pulls candidates, committees, and Schedule A individual contributions
- Handles election cycle pagination (2-year periods)
- Loads to: `politicians`, `pac_committees`, `contributions` tables
- Neo4j: `Politician` nodes, `PAC` nodes, `DONATED` edges

#### USASpending Worker
- Pulls contracts and grants across all federal agencies (2017–present)
- Implements fiscal year fallback: FY2025 → FY2024 → FY2023
- Loads to: `contracts`, `grants` tables
- Neo4j: `Company`, `Contract`, `Agency` nodes; `RECEIVED`, `AWARDED` edges

#### Federal Register Worker
- Pulls proposed and final rules, flags economically significant rules (>$100M)
- Loads to: `regulations` table
- Neo4j: `Regulation` nodes; `ISSUED` edges from `Agency`

#### Senate Disclosures Worker
- Pulls PTR filings via Senate eFiling API (90-day rolling window)
- Parses FEC amount range codes (da=1k–15k · e=15k–50k · f=50k–100k · g=100k–250k · ph=5M–25M)
- Loads to: `senate_disclosures` table

#### House Disclosures Worker
- Pulls PTR filing metadata from House Clerk API
- Loads to: `house_disclosures` table

### Enrichment Workers (`etl/enrichment/`)

#### RECEIPTS Score Batch (`corruption_scorer.py`)
Pre-computes accountability scores for all active candidates in bulk and writes to Supabase cache. Avoids per-request FEC calls during peak traffic.

#### Dark Money Tracer (`dark_money_tracer.py`)
Follows FEC committee-to-committee transfers to build funding chains. Classifies each organization as DARK / PARTIAL / DISCLOSED based on connected organization and filing completeness.

#### Quid Pro Quo Detector (`quid_pro_quo_detector.py`)
Uses Neo4j's path-finding to identify the full 4-hop corruption cycle:
```cypher
MATCH path = (c:Company)-[:RECEIVED]->(contract:Contract)
             <-[:AWARDED]-(a:Agency)
             <-[:OVERSEES]-(comm:Committee)
             <-[:SITS_ON]-(p:Politician)
WHERE exists((c)-[:PAC_DONATED]->(p))
  AND contract.award_date >= date() - duration({months: 12})
  AND coalesce(contract.award_amount, 0) >= 100000
RETURN c.name, p.name, a.name, comm.name,
       count(contract) AS contracts,
       sum(contract.award_amount) AS totalValue
ORDER BY totalValue DESC
```

#### Donor Resolver (`donor_resolver.py`)
Deduplicates FEC donor records across election cycles using fuzzy string matching (Levenshtein distance) on name + employer + address combinations.

#### Entity Resolution (`entity_resolution.py`)
Links entities across data sources: FEC candidates ↔ USASpending recipients ↔ SEC filers, resolving naming variations (e.g., "Lockheed Martin" vs. "Lockheed Martin Corp. (LMT)").

---

## Database Schema

### PostgreSQL (Supabase) — 20 Tables

**Government data tables (public SELECT, no auth required)**

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `contracts` | USASpending federal contracts | `award_id`, `recipient_name`, `award_amount`, `awarding_agency`, `award_date` |
| `grants` | Federal grants | `award_id`, `recipient_name`, `award_amount`, `cfda_number` |
| `regulations` | Federal Register rules | `document_number`, `title`, `agency_names`, `significant`, `publication_date` |
| `politicians` | FEC candidates | `candidate_id`, `name`, `party`, `state`, `office`, `election_year` |
| `contributions` | FEC Schedule A | `contributor_name`, `amount`, `date`, `employer`, `candidate_id` |
| `pac_committees` | FEC committees | `committee_id`, `name`, `type`, `receipts`, `disbursements` |
| `disbursements` | FEC Schedule B | `committee_id`, `recipient_name`, `amount`, `purpose` |
| `candidate_totals` | FEC financial totals | `candidate_id`, `receipts`, `disbursements`, `cash_on_hand`, `cycle` |
| `opensecrets_summaries` | OpenSecrets industry data | `candidate_id`, `industry`, `total` |
| `senate_disclosures` | Senate PTR filings | `senator_name`, `filing_date`, `form_type`, `url` |
| `house_disclosures` | House PTR filings | `representative_name`, `filing_date`, `form_type` |
| `corruption_scores` | RECEIPTS score cache | `entity_type`, `entity_id`, `entity_name`, `overall_score`, `tier`, `expires_at` |
| `etl_jobs` | ETL pipeline log | `source_name`, `status`, `records_processed`, `started_at` |
| `api_logs` | Request log | `endpoint`, `method`, `status_code`, `response_time_ms` |

**User data tables (RLS-enforced — users see only their own rows)**

| Table | Purpose |
|-------|---------|
| `user_profiles` | User info (auto-created via trigger on `auth.users` insert) |
| `watchlist` | Saved entities (politician, company, regulation) |
| `alerts` | Alert configuration rules |
| `alert_events` | Fired alert records |
| `corruption_flags` | Community-submitted flags with upvote counts |
| `search_history` | User search history |

**Custom PostgreSQL functions**

| Function | Signature | Purpose |
|----------|-----------|---------|
| `search_politicians` | `(query TEXT) → SETOF politicians` | Full-text search on politician records |
| `get_watchlist_with_scores` | `(user_id UUID) → TABLE` | Watchlist joined with latest cached scores |
| `get_unread_alert_count` | `(user_id UUID) → INTEGER` | Count of unread alerts for a user |

**Triggers:** 12 `updated_at` auto-update triggers + `handle_new_user` trigger (creates `user_profiles` row on `auth.users` insert).

### Neo4j Graph — 7 Node Types, 8 Relationship Types

**Nodes**

| Node | Key Properties | Unique Constraint |
|------|---------------|------------------|
| `Company` | `name`, `uei`, `industry`, `total_spending` | `uei`, `name` |
| `Politician` | `name`, `bioguide_id`, `party`, `chamber`, `state` | `bioguide_id` |
| `Agency` | `name`, `code`, `department` | `code` |
| `Contract` | `award_id`, `award_amount`, `award_date` | `award_id` |
| `Regulation` | `document_number`, `title`, `agency_names`, `significant` | `document_number` |
| `PAC` | `committee_id`, `name`, `receipts`, `disbursements` | `committee_id` |
| `Contribution` | `contribution_id`, `amount`, `date` | `contribution_id` |

**Relationships**

| Relationship | From → To | Semantics |
|--------------|-----------|-----------|
| `RECEIVED` | Company → Contract | Company was awarded this contract |
| `AWARDED` | Agency → Contract | Agency issued this contract |
| `OVERSEES` | Committee → Agency | Congressional committee has jurisdiction |
| `SITS_ON` | Politician → Committee | Politician is a member |
| `PAC_DONATED` | PAC / Company → Politician | Direct political donation |
| `COMMENTED` | Company → Regulation | Company submitted public comment |
| `ISSUED` | Agency → Regulation | Agency published this rule |
| `SIMILAR_TO` | Company → Company | Same industry / parent-subsidiary |

---

## Supabase Integration

### Backend — Service Role Client (`backend/lib/supabase.js`)

The backend uses a service-role key that bypasses Row-Level Security for server-to-server operations:

```javascript
// Score caching (called automatically after each scorePolitician / scoreCompany computation)
getCachedCorruptionScore(entityType, entityId)
  // Returns cached score if expires_at > now(); null if expired or missing

cacheCorruptionScore(entityType, entityId, entityName, scoreData)
  // Upserts score with 24-hour TTL
  // ON CONFLICT (entity_type, entity_id) DO UPDATE SET ...

// User features (called by watchlist / alerts / flags routes)
getWatchlist(userId)               // Calls get_watchlist_with_scores RPC
addToWatchlist(userId, entity)
removeFromWatchlist(userId, entityId)
getUserAlerts(userId)
createAlert(userId, alertData)
getCorruptionFlags(entityId)
submitCorruptionFlag(userId, flagData)
```

### Frontend — Anon Key Client (`frontend/src/lib/supabase.js`)

The frontend uses an anon key that respects RLS — users can only read their own rows:

```javascript
// Authentication
signIn(email, password)      // supabase.auth.signInWithPassword
signUp(email, password)      // supabase.auth.signUp
signOut()                    // supabase.auth.signOut
getSession()                 // supabase.auth.getSession

// Realtime subscriptions (live updates without polling)
subscribeToCorruptionScores(callback)    // New scores as they're computed
subscribeToAlerts(userId, callback)      // Alert delivery to user
subscribeToWatchlist(userId, callback)   // Watchlist changes
```

### Auth Context (`frontend/src/contexts/AuthContext.jsx`)

Wraps the entire app. On load, calls `supabase.auth.getSession()` and subscribes to `onAuthStateChange`. On login, automatically fetches the user's `user_profiles` row.

```jsx
// Access anywhere in the app:
const { user, session, loading, signIn, signUp, signOut } = useAuth()
```

---

## Deployment

### Recommended Production Architecture

| Service | Provider | Notes |
|---------|---------|-------|
| Frontend | Vercel / Netlify | Static Vite build (`npm run build`) |
| Backend | Railway / Render / Fly.io | Node.js, port 3001 |
| Python Agents | Railway / Render | FastAPI, port 8000 |
| Neo4j | Neo4j Aura | Use `neo4j+s://` URI |
| PostgreSQL | Supabase | Managed + Auth + Realtime |
| Redis | Upstash | Serverless, per-request pricing |

### Production checklist

- [ ] Set `VITE_API_BASE_URL` to deployed backend URL in `frontend/.env`
- [ ] Add production frontend domain to Supabase Auth → URL Configuration
- [ ] Add production frontend URL to CORS `origin` array in `backend/server.js`
- [ ] Set `NEO4J_URI=neo4j+s://...` (TLS-secured Aura URI)
- [ ] Rotate all keys — never commit `.env` files
- [ ] Enable Supabase RLS (enabled by default in `schema.sql`)

### ETL scheduling (production cron)

```bash
# crontab -e
0  2 * * *   python -m etl.sources.fec                      # Daily 2am
0  3 * * *   python -m etl.sources.usa_spending              # Daily 3am
0  4 * * *   python -m etl.sources.federal_register          # Daily 4am
*/30 * * * * python -m etl.sources.senate_disclosures        # Every 30 min (PTRs)
0  5 * * *   python -m etl.enrichment.corruption_scorer      # Daily 5am (refresh scores)
0  6 * * *   python -m etl.enrichment.quid_pro_quo_detector  # Daily 6am
```

---

## Development Roadmap

### Completed

- ✅ **Phase 1** — USASpending ETL, Federal Register integration, RSS news ticker
- ✅ **Phase 2** — FEC campaign finance, multi-agent AI orchestration, donor network graphs
- ✅ **Phase 3** — RECEIPTS scoring engine, STOCK Act monitor, dark money tracker, company profiles, Accountability Index leaderboard
- ✅ **Phase 4 (backend)** — Supabase auth, watchlist, alerts, corruption flags, score caching
- ✅ **Data integrity** — Removed all mock/hardcoded data; platform shows only real computed results

### In Progress

- 🔄 Senate eFiling API reliability (endpoint intermittent)
- 🔄 House PTR rate limit handling and retry logic
- 🔄 Neo4j graph population via ETL (Cypher loaders for all node/edge types)
- 🔄 Individual trade detail extraction from PTR PDFs (currently only filing metadata)

### Planned

| Feature | Priority | Description |
|---------|----------|-------------|
| Revolving door API | High | OECD/ProPublica lobbyist disclosure integration |
| Vote cross-referencing | High | Link voting records to top donor industries (ProPublica Congress API) |
| EDGAR SEC integration | High | Cross-reference congressional trades with SEC insider filings |
| Email alerts | Medium | Supabase Edge Functions → Resend for alert delivery |
| OpenSecrets integration | Medium | Industry/sector categorization at scale |
| Mobile responsive layout | Medium | Current design is desktop-first |
| Public API | Low | Open read endpoints for researchers and journalists |
| Browser extension | Low | Inline Wikipedia/Congress.gov accountability badges |

---

## Data Integrity

All data on this platform originates exclusively from official U.S. government sources:

- **Federal Election Commission** — fec.gov
- **U.S. Treasury / USASpending** — usaspending.gov
- **National Archives / Federal Register** — federalregister.gov
- **U.S. Senate** — senate.gov / efts.senate.gov
- **U.S. House of Representatives** — clerk.house.gov

**RECEIPTS scores** are computed metrics derived from public records using transparent, documented formulas (see [RECEIPTS Accountability Score](#receipts-accountability-score)). They are analytical outputs, not editorial assessments. They should not be interpreted as legal determinations of wrongdoing.

**When data is unavailable** (API down, rate-limited, or no records found), the platform returns an empty state. It does not fall back to fabricated numbers or placeholder content.

---

*Built with public data, for the public interest.*
