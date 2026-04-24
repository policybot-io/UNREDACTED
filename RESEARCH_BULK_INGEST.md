# Bulk Ingest Plan — FEC + USASpending → Supabase

**Branch:** `feature-research` (pending merge → `main`)
**Author:** research doc, 2026-04-13 · last updated 2026-04-20
**Status:** ✅ CODE COMPLETE + PARTIAL LIVE — Phase 1 backfill executed, env flags live, frontend shipped
**Remaining user actions:** R2 bucket creation · full individual contribs + USASpending backfill · neo4j-driver removal · merge to main (see §9)

---

## 1. Problem

The app's "Follow the Money" and related research surfaces only return ~10 rows because:

1. `src/api/client.js:41-48` — frontend hard-defaults `limit=10`.
2. `server/services/fec.js` — every call uses `per_page: Math.min(limit, 20)` and **does not paginate**. Ceiling per request is 20 items, ever.
3. FEC rate limits (25/hr DEMO, 950/hr registered) make live-paging the full corpus infeasible.
4. `etl/sources/fec.py` + `etl/sources/usa_spending.py` exist but (a) cap at page 5–10, (b) write to a **local Postgres + Neo4j** via `etl/base/postgres_client.py` — **not** the Supabase the frontend reads from. Result: Supabase tables (`politicians`, `pac_committees`, `contributions`, `contracts`, `grants`) are largely empty.
5. The REST APIs are the wrong tool for "entire database." Both agencies publish bulk files designed for this.

---

## 2. Strategy: bulk files, not REST APIs

### 2.1 FEC bulk data (https://www.fec.gov/data/browse-data/?tab=bulk-data)

Stable per-cycle ZIP files, refreshed weekly, no API key required:

| File | Contents | Size (2024 cycle, approx) | Supabase target |
|---|---|---|---|
| `cn{YY}.zip` | All candidates | <5 MB | `politicians` (fec_candidate_id) |
| `cm{YY}.zip` | All committees | <10 MB | `pac_committees` |
| `ccl{YY}.zip` | Candidate↔committee links | <5 MB | new: `candidate_committee_links` |
| `webl{YY}.zip` | Candidate summary totals | <5 MB | `candidate_totals` |
| `webk{YY}.zip` | PAC summary totals | <5 MB | `pac_committees` (totals cols) |
| `itcont{YY}.zip` | Individual contributions (Schedule A) | **5–20 GB uncompressed** | `contributions` |
| `itpas2{YY}.zip` | PAC → candidate contribs (Schedule B) | ~500 MB | `contributions` (type=pac_to_cand) |
| `oppexp{YY}.zip` | Operating expenditures | ~1 GB | new: `disbursements_detail` |
| `oth{YY}.zip` | Committee-to-committee transfers | ~100 MB | new: `committee_transfers` |

URL pattern: `https://www.fec.gov/files/bulk-downloads/{YYYY}/{file}.zip`
Layouts: pipe-delimited `.txt` inside each zip; headers documented at fec.gov/campaign-finance-data.

**Update cadence:** FEC refreshes weekly during active cycles, less during off-cycle.

### 2.2 USASpending bulk (https://files.usaspending.gov/)

Two options — use both:

**(a) Monthly archive ZIPs** — `https://files.usaspending.gov/award_data_archive/FY{YYYY}_All_Contracts_Full_{YYYYMMDD}.zip` and `..._Assistance_Full_...zip`. Full snapshot monthly.

**(b) Custom Award Data API** — `POST https://api.usaspending.gov/api/v2/bulk_download/awards/` for filtered slices (date range, agency, award type). Returns a job ID; poll `GET /api/v2/bulk_download/status/?file_name=...` until `status=finished`, then download signed S3 URL. Useful for incremental refreshes.

| Source | Cadence | Supabase target |
|---|---|---|
| Monthly contracts archive | monthly full | `contracts` |
| Monthly assistance archive | monthly full | `grants` |
| Bulk-download API (delta) | weekly filtered | `contracts`, `grants` |

No API key required.

---

## 3. Supabase schema changes

Existing tables (`contracts`, `grants`, `politicians`, `contributions`, `pac_committees`, `candidate_totals`) mostly fit. Additions needed:

```sql
-- New tables
CREATE TABLE candidate_committee_links (
  fec_candidate_id VARCHAR(20),
  committee_id VARCHAR(20),
  cycle INT,
  link_type VARCHAR(10),  -- P=principal, A=authorized, J=joint
  PRIMARY KEY (fec_candidate_id, committee_id, cycle)
);

CREATE TABLE disbursements_detail (
  sub_id BIGINT PRIMARY KEY,
  committee_id VARCHAR(20),
  cycle INT,
  recipient_name TEXT,
  recipient_city TEXT,
  recipient_state VARCHAR(2),
  disbursement_date DATE,
  disbursement_amount NUMERIC(15,2),
  disbursement_description TEXT,
  purpose_category TEXT
);

CREATE TABLE committee_transfers (
  sub_id BIGINT PRIMARY KEY,
  from_committee_id VARCHAR(20),
  to_committee_id VARCHAR(20),
  transfer_date DATE,
  transfer_amount NUMERIC(15,2),
  cycle INT
);

-- Ingest tracking
CREATE TABLE bulk_ingest_runs (
  id BIGSERIAL PRIMARY KEY,
  source VARCHAR(50),      -- 'fec_cn', 'fec_itcont', 'usaspending_contracts', etc.
  cycle_or_period TEXT,
  file_url TEXT,
  file_checksum TEXT,      -- skip if unchanged
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  rows_inserted BIGINT,
  rows_upserted BIGINT,
  status TEXT,             -- running|ok|error
  error TEXT
);

-- Required indexes on contributions (likely missing for bulk-scale queries)
CREATE INDEX IF NOT EXISTS idx_contributions_candidate_id ON contributions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_contributions_committee_id ON contributions(committee_id);
CREATE INDEX IF NOT EXISTS idx_contributions_date ON contributions(date);
CREATE INDEX IF NOT EXISTS idx_contributions_amount ON contributions(amount) WHERE amount >= 2000;

-- RLS: public SELECT on all new tables (matches existing patterns)
```

Also: verify `contributions.contribution_id` / `contributions.sub_id` is `BIGINT PRIMARY KEY` — required for the 20M+ rows per cycle.

---

## 4. Ingest pipeline design

### 4.1 Runtime: Node, not the existing Python ETL

The existing Python ETL targets local Postgres+Neo4j and is architecturally mismatched. Build a Node-based ingester under `etl/bulk/` using:

- `@supabase/supabase-js` with **service-role key** (server-side only; already in env)
- `adm-zip` (already a dep) for FEC zips
- Node streams + `csv-parse` for line-by-line processing (itcont is too big for memory)
- Supabase REST `upsert` in batches of 1,000–5,000

### 4.2 File structure

```
etl/bulk/
  fec/
    download.js          # fetch + checksum + cache to /tmp
    parse-candidates.js  # cn.zip -> politicians upsert
    parse-committees.js  # cm.zip -> pac_committees upsert
    parse-links.js       # ccl.zip -> candidate_committee_links
    parse-totals.js      # webl/webk -> candidate_totals / pac totals
    parse-contribs.js    # itcont.zip streamed -> contributions
    parse-pac2cand.js    # itpas2.zip -> contributions
    parse-disbursements.js
    parse-transfers.js
    schemas.js           # FEC bulk file column layouts
  usaspending/
    download.js
    parse-contracts.js
    parse-assistance.js
    bulk-api-job.js      # async POST+poll+download for deltas
  shared/
    upsert.js            # batched upsert with conflict-on-pk
    run-tracker.js       # bulk_ingest_runs writer
    checksum.js
  run.js                 # CLI: node etl/bulk/run.js --source fec --cycle 2024
```

### 4.3 Upsert strategy (idempotent)

For each table, declare a natural PK:

| Table | PK for upsert |
|---|---|
| politicians | `fec_candidate_id` |
| pac_committees | `committee_id, cycle` |
| contributions | `sub_id` (FEC's unique transaction id) |
| candidate_totals | `fec_candidate_id, cycle` |
| contracts | `award_id` |
| grants | `award_id` |

Each run: stream rows → accumulate batch of 2,000 → `supabase.from(table).upsert(batch, { onConflict: pk })` → log progress every 100k rows.

### 4.4 Incremental vs. full

- **First run:** full 2024 + 2022 cycles for FEC (skip older unless requested); full last-12-months for USASpending. Estimated ~30–40M contribution rows, ~5M contract/grant rows. Disk cost on Supabase depends on plan.
- **Refresh runs:** checksum the remote file; if unchanged, skip. If changed, re-upsert (idempotent on PK). For USASpending, prefer the delta bulk-download API with `last_modified_date` filter.

---

## 5. Scheduling

**Option A (recommended): GitHub Actions cron.**
- Runs on GH runners (unlimited time, free for public repos, big disk for the itcont zip).
- Secrets: `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`.
- Schedules:
  - FEC weekly: `0 6 * * 1` (Mondays 06:00 UTC)
  - USASpending monthly: `0 7 1 * *` (1st of month)
  - USASpending delta: weekly

**Option B: Vercel cron** — too short on execution time (10s hobby, 60s pro) and disk for itcont. Not suitable.

**Option C: Supabase scheduled edge function** — same timeout issue (~150s).

Pick A. Add `.github/workflows/bulk-ingest-fec.yml` and `.github/workflows/bulk-ingest-usaspending.yml`.

---

## 6. Frontend / API read-path swap

Once Supabase is populated, `server/routes/donors.js`, `server/routes/spending.js`, `server/routes/darkmoney.js` must **stop calling FEC/USASpending live** and **query Supabase** instead. The existing live FEC service stays as a fallback for real-time-freshness endpoints only (e.g. "last 24h contributions").

Also bump `src/api/client.js` defaults: `limit = 10` → `limit = 50` (or remove cap; pagination via offset). The 20-per-page service cap in `server/services/fec.js` becomes irrelevant once reads are from Supabase.

---

## 6a. Drop Neo4j — render "Follow the Money" as a layered flow graph

**Decision:** remove Neo4j. The money-flow is an inherently **layered DAG** (5 fixed tiers), not an arbitrary graph — Postgres joins + a client-side viz library handle it better, cheaper, and with fewer moving parts.

### Reference design
Visual target: Humans First "AI Spending / Leading the Future Network" section (https://www.humansfirst.com/ai-spending). The page is JS-rendered so exact DOM could not be scraped in this plan — during implementation, first load the page in a headless browser and capture the actual layout, node styling, edge curvature, and color mapping before building. Treat the description below as the *structural* target; final styling should match the reference visually.

### Tier structure (money flows left → right)

```
[ Companies / Industries ]     tier 1  — source of money (contributors grouped by employer or NAICS)
           │
           ▼
[ SuperPACs / Hybrid PACs ]    tier 2  — independent-expenditure committees
           │
           ▼
[ 501(c)(4) Dark Money Orgs ]  tier 3  — non-disclosing intermediaries
           │
           ▼
[ Political Party / Committee ] tier 4  — DNC/RNC/party cmtes + leadership PACs
           │
           ▼
[ Politician (campaign status) ] tier 5  — candidate + in_office / election status
```

Each node shows: name, total $ in, total $ out, cycle, (for politicians) campaign status badge (Incumbent / Challenger / Won / Lost / Active).

### Data model in Supabase (no graph DB)

Money flows are already edges in the relational model. Add one materialized view keyed by `(source_id, source_tier, target_id, target_tier, cycle)`:

```sql
CREATE MATERIALIZED VIEW money_flow_edges AS
-- tier 1 → 2: employer/industry → PAC (via individual contribs aggregated by employer)
SELECT
  contributor_employer AS source_id, 1 AS source_tier,
  committee_id         AS target_id, 2 AS target_tier,
  SUM(amount) AS amount, cycle
FROM contributions
WHERE contributor_employer IS NOT NULL AND amount >= 200
GROUP BY contributor_employer, committee_id, cycle
UNION ALL
-- tier 2 → 3 and 2 → 4: committee-to-committee transfers (oth bulk file)
SELECT from_committee_id, 2, to_committee_id, 3_or_4, transfer_amount, cycle
FROM committee_transfers
-- tier 4 → 5: PAC → candidate (itpas2 bulk file)
UNION ALL
SELECT committee_id, 4, candidate_id, 5, SUM(amount), cycle
FROM contributions
WHERE candidate_id IS NOT NULL
GROUP BY committee_id, candidate_id, cycle;

CREATE INDEX ON money_flow_edges (target_tier, target_id);
CREATE INDEX ON money_flow_edges (source_tier, source_id);
```

Refreshed after each bulk ingest (`REFRESH MATERIALIZED VIEW CONCURRENTLY`).

Classifying committees into tier 2/3/4 uses `pac_committees.committee_type` + `designation` (FEC codes: `O`=SuperPAC, `U`=Independent-only, `V/W`=Hybrid; 501(c)(4)s appear as donor orgs without an FEC committee — pulled from Schedule A memo/employer fields + IRS 990 cross-ref in a later phase).

### Rendering — two complementary views

1. **Sankey diagram** (primary "Follow the Money" view) — D3 `d3-sankey` or `@nivo/sankey`. Fixed 5 columns, widths proportional to $. Great for showing volume flow. Interactive: click a node → drill into its edges, filter by industry/PAC/politician, toggle cycle.
2. **Layered node-edge graph** (secondary, Humans-First-style) — `reactflow` with custom tier-column layout + curved bezier edges. Better for "which entities connect to which" when the Sankey gets dense. Same data, different renderer.

Both read from `money_flow_edges` via a single Supabase RPC: `get_flow_for_entity(entity_id, entity_tier, depth, cycle)` returns ≤N hops upstream + downstream.

### Why this beats Neo4j here

| Concern | Neo4j | Postgres + D3 |
|---|---|---|
| Fixed 5-tier flow | overkill | natural fit |
| Infra to run/sync | separate DB, dual-write | none |
| Query perf on bounded depth (≤4 hops) | good | equally good with proper indexes |
| Client rendering | still needs D3/sankey | D3/sankey, unchanged |
| Cost | another service to host | $0 extra |
| Dev-team cognitive load | Cypher + driver | just SQL |

Neo4j is strong when traversals are unbounded or topology is truly graph-shaped (social networks, fraud rings). Money flow here is a short-bounded hierarchical DAG — the wrong problem for it.

**Action:** remove `neo4j-driver` dep, `server/services/graphService.js`, `server/services/graphQueries.js`, and the `_sync_to_neo4j` code paths in `etl/sources/*.py` (those paths are being replaced by `etl/bulk/*` anyway).

### Donor Intelligence renovation

`src/pages/FollowTheMoney.jsx` gets a "Donor Intelligence" tab with:
- search/pick an entity at any tier (company, PAC, party, politician)
- Sankey centered on that entity showing full 5-tier path upstream + downstream
- per-node cards listing top inflows/outflows, cycle toggle (2024/2022), $ totals
- politician end-nodes show campaign status from `candidate_totals` + `politicians.in_office`

---

## 6b. Storage sizing & hybrid Parquet strategy (decided 2026-04-13)

### Measured state
- Supabase project `vuomevhbspeinpbgjucv` (org `DSSG NYC`)
- Plan: **Free** (500 MB cap)
- Status: **INACTIVE** (paused — live size query timed out; free tier auto-pauses)

### Scope (final, 2026-04-13 revision)

**Primary user:** journalists & researchers doing lookups for the **2026 midterm election**. Relevance > historical depth.

- **FEC:** cycles **2024 + 2026** only
- **USASpending:** **FY2024 → present** (contracts + assistance)
- Older cycles (2022 and back) deferred — added later as Parquet partitions with no schema change when the ML corruption model work begins

### Estimated corpus

| Table | Rows | Postgres (w/ idx) | Parquet (zstd) |
|---|---|---|---|
| FEC contributions 2024+2026 | ~90M | ~45 GB | **~6 GB** |
| FEC committees/candidates/totals/links | ~50k | ~0.2 GB | ~0.05 GB |
| USASpending contracts FY2024→ | ~15M | ~22 GB | **~3 GB** |
| USASpending assistance FY2024→ | ~20M | ~20 GB | **~2 GB** |
| **Total** | **~125M** | **~87 GB** | **~11 GB** |

**Google Sheets ruled out** — 2024 contribs alone = ~70M rows × 15 cols = 1B cells vs 10M-cell workbook cap (100× over). Even aggressive filtering to ≥$200 stays 37× over, and Sheets has no joins/indexes.

### Decision: free-tier hybrid — Supabase Free (hot) + Cloudflare R2 (cold)

**Hot tier — Supabase Free (500 MB DB, 1 GB Storage)**
Summary tables only — `politicians`, `pac_committees`, `candidate_totals`, `candidate_committee_links`, `committee_transfers`, `money_flow_edges` MV (top-N edges for Sankey), plus filtered current-cycle `contributions` at `amount >= $2000` (~1M rows). Estimated footprint: **~300–400 MB**. Fits inside the 500 MB free cap with headroom.

**Cold / analytical tier — Cloudflare R2 free tier (10 GB storage, 1M Class-A ops/mo, ZERO egress fees)**
Full Parquet corpus (~11 GB — slight overflow handled by slightly smaller first partitions; R2 overage is $0.015/GB/mo so ~$0.02 at worst). S3-compatible API, DuckDB `httpfs` reads it natively with a single connection string.

Partition layout:
```
r2://unredacted-bulk/
  fec/contributions/cycle=2024/part-*.parquet
  fec/contributions/cycle=2026/part-*.parquet
  fec/committees/cycle=2024/part-*.parquet
  ...
  usaspending/contracts/fy=2024/month=01/part-*.parquet
  usaspending/assistance/fy=2024/month=01/part-*.parquet
  ...
```

**Cost: $0/mo** (or ~$0.02/mo if R2 drifts slightly past 10 GB). Upgrade path to Supabase Pro only triggered when hot tier outgrows 500 MB or when older cycles are added for ML.

### Read paths

- **Frontend (hot)** — hits Supabase REST for current-cycle aggregates, Sankey edges, politician cards. Millisecond latency, RLS-gated. Unchanged auth flow.
- **Heavy analytical (`/api/analytics/*`)** — new Node route spawns DuckDB (`duckdb` npm package), runs SQL over R2 Parquet URLs via `httpfs`, returns aggregated JSON. E.g. "all $ from industry X to candidates running in 2026" → DuckDB query on R2 → JSON in <1 s.
- **Future ML (regression/classification for corruption)** — pandas/polars read the same Parquet files directly. No data duplication. Train notebooks locally or in Colab/Kaggle from a signed URL.

### Ingest pipeline adjustment

`etl/bulk/run.js` does **two writes per source**:
1. Stream-parse FEC/USASpending bulk CSV → write partitioned Parquet to **Cloudflare R2** (cold, all rows).
2. Derive summary aggregates + filtered hot rows → upsert into **Supabase Free** tables (hot, UI path).

`etl/bulk/shared/parquet-writer.js` uses `duckdb` Node bindings (simplest — `COPY ... TO 's3://bucket/path/part.parquet'` with R2 credentials). Checkpoints per cycle in `bulk_ingest_runs`.

### Why this wins

| Criterion | All-Postgres Pro | Hybrid Free + R2 |
|---|---|---|
| Monthly cost | $25 base + ~$10 overage = **~$35** | **$0** (≤~$0.02 R2 overage at worst) |
| Fits 2024+2026 journalist scope | yes, overpaying | yes, free |
| ML training workflow (future) | dump to CSV manually | pandas/polars read Parquet directly |
| Adds older cycle later | DB grows | one more Parquet partition |
| Cold-storage backup | separate process | Parquet *is* the archive |

### Impact on plan

- Section §3 schema unchanged for hot tier.
- Section §4 ingest gains Parquet write step. New dep: `duckdb` Node package + `@aws-sdk/client-s3` (for R2 signed URLs).
- Section §5 GitHub Actions cron unchanged.
- New: `etl/bulk/cold/` for Parquet writers, `server/routes/analytics.js` for DuckDB-backed queries over R2.

### Required actions from user

1. **Unpause Supabase project** (login to dashboard, or run any live query).
2. **Create Cloudflare account + R2 bucket** (`unredacted-bulk`). Provision R2 API token with read+write. Free tier covers 10 GB storage, 1M Class-A ops, zero egress.
3. Add `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` to `.env` and GitHub Actions secrets.
4. (Optional) Upgrade to Supabase Pro only if/when hot tier outgrows 500 MB.

---

## 7. Risks & open questions

1. **Supabase storage + row-count cost.** `itcont` is 20M+ rows/cycle. Confirm current Supabase plan can hold it, or filter to `amount >= 200` at ingest time (still keeps ~80% of $-volume, cuts rows 5–10×).
2. **RLS + service-role writes.** Ingest must use service-role key; frontend keeps anon RLS-gated reads. Already the pattern in `server/lib/supabase.js` — verify.
3. **FEC file schema drift.** Headers occasionally change. Pin layout in `schemas.js` and fail-loud on mismatch.
4. **USASpending award ID collisions** across monthly archives (re-published rows). PK upsert handles it but confirm `award_id` uniqueness.
5. **Neo4j parity.** The Python ETL also syncs to Neo4j. If the graph pages still use Neo4j, add a Neo4j sync step after Supabase upsert, or deprecate Neo4j entirely. Decision needed.
6. **Retention.** Do we keep cycles 2016/2018/2020/2022 or only current+prior? Affects storage 5×.

---

## 7a. Full FEC bulk data catalog — confirmation & mapping

Confirmed against https://www.fec.gov/data/browse-data/?tab=bulk-data. **All of the following are in scope** for ingest (2024+2026 cycles). Note: the openFEC GitHub repo (fecgov/openfec) is REST-API only and does not document bulk files — schemas come from fec.gov/campaign-finance-data/.

### Raising
| File | Prefix | What it is | Supabase hot | R2 Parquet cold | Why journalists care |
|---|---|---|---|---|---|
| All candidates summary | `weball` | candidate $ raised/spent totals | ✅ `candidate_totals` | ✅ | leaderboards, "who's outraising whom" |
| Individual contributions | `indiv` | every $ from a person to a committee | partial (≥$2000) | ✅ full | donor lookup, bundler networks, industry money |
| Committee→candidate contribs + IEs | `pas2` | PAC/party money to candidates | ✅ `contributions` | ✅ | core "Follow the Money" flow, IE attack spending |
| Lobbyist bundled contributions | `lobbyist_bundle` | PACs run by registered lobbyists, bundled $ amounts | ✅ new `lobbyist_bundles` | ✅ | **bundler stories, lobbyist→lawmaker pipelines** |

### Spending
| File | Prefix | What it is | Supabase hot | R2 Parquet cold | Journalist value |
|---|---|---|---|---|---|
| Operating expenditures | `oppexp` | every disbursement from a committee | aggregate only | ✅ full | **self-dealing, family payroll, consultant rings, suspicious vendor $** |
| Independent expenditures | (IE 24h/48h) | attack/support ads by SuperPACs | ✅ new `independent_expenditures` | ✅ | attack ad coordination, dark money IEs |
| Electioneering communications | — | issue ads near elections | ✅ new `electioneering_comms` | ✅ | disguised-issue-ad exposure |
| Communication costs | — | corp/labor org direct comms | ✅ new `communication_costs` | ✅ | corporate advocacy tracking |

### Candidates & Committees
| File | Prefix | Supabase hot | Notes |
|---|---|---|---|
| Candidate master | `cn` | ✅ `politicians` | every registered candidate |
| Candidate summary | — | merged into `candidate_totals` | |
| Form 2 (Statements of Candidacy) | — | ✅ new `candidate_statements` | declaration of candidacy |
| Committee master | `cm` | ✅ `pac_committees` | every registered committee |
| Committee summary | — | merged into `pac_committees` totals | |
| PAC/party summary | `webk` | merged into `pac_committees` | |
| Leadership PACs | — | ✅ flag on `pac_committees.is_leadership_pac` | **members-of-Congress funneling $ to each other** |
| Lobbyist/registrant committees | — | ✅ flag on `pac_committees.is_lobbyist_pac` | |
| Form 1 Filers | — | ✅ new `committee_statements` | committee formation metadata |

### Filings & Reports
| File | Prefix | Storage | Journalist value |
|---|---|---|---|
| Candidate-committee linkages | `ccl` | ✅ `candidate_committee_links` | required to join candidates to their money |
| House/Senate current campaigns | `webl` | ✅ `candidate_totals` | active race financials |
| Committee-to-committee transactions | `oth` | ✅ `committee_transfers` + Parquet | **dark money flow between committees** |
| Electronic `.fec` filings (daily) | — | Parquet only + metadata table | loans, debts, amendments live here |
| Paper `.fec` filings (daily) | — | Parquet only + metadata | same, paper-filed |

### Loans & Debts — special handling
**No dedicated bulk CSV exists.** Loans (Schedule C) and debts (Schedule D) live inside the per-filing `.fec` files published daily at `https://docquery.fec.gov/`. Plan:
- Download daily filing archive for current cycle, parse `.fec` files with an open-source parser (`fech` or port the schema ourselves)
- Extract Schedule C + D rows → new tables `loans` and `debts` in hot tier (sparse, small — fits easily)
- Parquet copy for ML

This adds an extra worker: `etl/bulk/fec/parse-filings.js`.

**Yes — every category on the FEC bulk page is in the plan**, stored in a shape that supports both UI lookups and ML feature engineering.

---

## 7b. What Unredacted actually needs to expose — brainstorm

Journalists & researchers aren't looking for a "data browser." They want **leads**. Every screen should answer "what's suspicious here?" Ideas below are grouped by story type, each tied to the bulk datasets that feed it.

### A. Self-dealing & insider enrichment
*"Is this candidate paying themselves?"*
- Payments from campaign to **vendors owned by the candidate or family** (e.g. Trump→Trump properties pattern)
- Spouse/child payroll on campaign
- Leadership PAC expenditures going to candidate-owned LLCs
- **Data:** `oppexp` (payee name, address, tax ID) joined against candidate addresses + business filings (OpenCorporates / state registries, phase 2)
- **Screen:** per-candidate "disbursements to affiliated entities" card with flagged rows

### B. Pay-to-play / contractor donations
*"Did this contractor donate to the committee that approved their contract?"*
- Join USASpending `contracts.recipient_name` → FEC `indiv.contributor_employer`
- Timeline overlap: donation in month N, contract awarded in month N+k
- **Data:** FEC `indiv` + `pas2` × USASpending contracts — the **unique cross-dataset value of Unredacted**
- **Screen:** "contractor-donor index" leaderboard

### C. Dark money flow
*"Who's really funding this SuperPAC?"*
- 501(c)(4) → SuperPAC → candidate chains via `oth` committee-to-committee transfers
- 501(c)(4) identification via absence from IRS 990 public disclosure (phase 2)
- **Data:** `oth` + `cm` committee types (O=SuperPAC, U=independent-only, V/W=hybrid)
- **Screen:** the Humans-First-style Sankey (§6a)

### D. Bundler networks & industry capture
*"Which industries own this politician?"*
- `indiv.contributor_employer` clustering — normalize employer strings, rank industries per candidate
- `lobbyist_bundle` file directly exposes lobbyist bundling
- Same-address / same-employer donor clusters → straw-donor flags (multiple max-out donations from one household)
- **Data:** `indiv` + `lobbyist_bundle`
- **Screen:** "top employers behind candidate X" + lobbyist bundler table

### E. Self-funding & wealthy-candidate bias
*"Is this candidate buying their own seat?"*
- Candidate personal loans (Schedule C) vs public donations
- Phantom loans never repaid = de facto illegal contribution
- **Data:** `.fec` filing Schedule C (loans) + Schedule D (debts)
- **Screen:** per-candidate self-funding ratio + unpaid-loan flag

### F. Attack-ad coordination
*"Are these 'independent' PACs really independent?"*
- Same media-buy vendors, same timing, same targets across multiple SuperPACs
- **Data:** Independent expenditures file + `oppexp` vendors
- **Screen:** IE coordination network

### G. Amendment-filing anomalies
*"Who's hiding numbers by amending reports repeatedly?"*
- Count `amendment_indicator='A'` filings per committee
- Late-filing fines via FEC enforcement (MUR) — phase 2
- **Data:** filing metadata from daily `.fec` archives
- **Screen:** "most-amended filers" watchlist

### H. Vote-donor alignment (already scaffolded)
*"Did this vote follow the money?"*
- Congress.gov votes × FEC industry donations, time-correlated
- **Data:** existing `congressGov.js` + FEC `indiv` employer aggregates
- **Screen:** already present at `VoteDonorAlignment.jsx` — needs real data

### I. Revolving door
*"Did this lobbyist used to work for this member?"*
- LDA lobbyist registrations × former staff/member lists
- Phase 2 — needs LDA ingestion

### J. Cash flood anomalies
*"This candidate raised $5M in one week — where from?"*
- Time-series z-score on `indiv` receipts per committee
- Spikes near primary dates / scandals
- **Data:** `indiv` with date index
- **Screen:** alert feed

---

## 7c. Prioritized ingest order (visualization-first)

**Principle:** get the most journalist-impactful screens working on smallest data first. Heavy files last.

### Phase 1 — Core lookup + Sankey (Week 1)
Files: `cn`, `cm`, `ccl`, `weball`, `webl`, `webk`, `pas2`, `oth`
- **Size:** <500 MB total across 2024+2026. All fit in Supabase Free hot tier.
- **Unlocks:** Follow the Money Sankey (§6a), candidate lookup pages, committee pages, top-donor-committee leaderboard, leadership-PAC network, dark-money flow between committees.
- **This alone removes the "only 10 candidates" bug and delivers 80% of journalist lookups.**

### Phase 2 — Spending & self-dealing (Week 2)
Files: `oppexp`
- **Size:** ~2 GB Postgres, ~300 MB Parquet per cycle. Aggregates in hot tier, raw rows in R2.
- **Unlocks:** story types A, F (self-dealing, consultant rings). "Disbursements to affiliated entities" screen.

### Phase 3 — Individual contributions (Week 2–3)
Files: `indiv`
- **Size:** largest. Hot tier gets ≥$2000 filter (~1M rows); R2 gets all (~6 GB Parquet).
- **Unlocks:** story types B, D, J (contractor donations, bundler networks, cash-flood anomalies). Industry-capture heatmap. Vote-donor alignment real data.

### Phase 4 — IEs, electioneering, comm costs (Week 3)
Files: independent expenditures, electioneering, communication costs, `lobbyist_bundle`
- **Size:** each <500 MB. All hot + Parquet.
- **Unlocks:** story type F (attack-ad coordination), D (bundlers explicit).

### Phase 5 — USASpending cross-link (Week 3–4)
Files: USASpending contracts + assistance FY2024→
- **Unlocks:** story type B (pay-to-play) — the **biggest unique differentiator** for Unredacted.

### Phase 6 — `.fec` filings parser (Week 4+)
Files: daily `.fec` archives (Schedule C loans, Schedule D debts, amendment metadata)
- **Unlocks:** story type E (self-funding/phantom loans), G (amendment anomalies).

---

## 7d. Local ML corruption-detection dataset

These files are downloadable for local model training once the pipeline writes them to Parquet on R2 (or just `aws s3 cp` from R2 to your laptop):

### Features (X)
- `indiv` — donor name/employer/occupation/amount/date (strongest signal)
- `pas2` — PAC→candidate flows
- `oppexp` — self-dealing features (recipient address overlap with candidate, family-surname matches)
- `oth` — dark money intermediation depth
- `.fec` Schedule C — personal loans, unpaid-loan flag
- `.fec` amendment counts — filing anomaly feature
- Candidate demographics from `cn`
- USASpending `contracts` — contractor-donation-timing features

### Labels (Y)
Hardest part. Sources:
- **FEC MUR enforcement cases** (Matters Under Review) — publicly listed at fec.gov/legal-resources/enforcement/audits/; parse to identify committees with findings
- **DOJ press releases** tagged "public corruption" (ojp.gov / justice.gov/opa) — manual + regex
- **House Ethics Committee findings** — scraped from ethics.house.gov
- **OpenSecrets "Congressional investigations"** list
- **Wikipedia: "List of American federal politicians convicted of crimes"** (noisy but useful negative class seed)

With ~500 labeled corrupt vs ~5000 clean members as a starting training set, a gradient-boosted classifier (XGBoost) on ~30 engineered features will likely yield usable precision for flagging "investigate further" — not courtroom proof, but **journalist lead generation**.

**Workflow for ML:**
1. Pipeline writes Parquet to R2 (every ingest)
2. Analyst downloads: `rclone sync r2:unredacted-bulk ~/data/unredacted/`
3. Load with polars/pandas directly from `~/data/unredacted/*.parquet`
4. Train in Jupyter, export feature importances
5. Push model scores back to `corruption_scores` table in Supabase for display

---

## 8. Proposed implementation order (aligned with §7c phases)

**Progress (as of 2026-04-15): ALL 12 STEPS CODE-COMPLETE.** Steps 1–5 were done by 2026-04-14. Steps 6–12 completed 2026-04-15. Step 13 (ML baseline) removed from scope.

### ✅ Completed user actions (as of 2026-04-20)

1. ✅ **Supabase unpaused + both migrations applied** (`20260414000000_bulk_ingest.sql`, `20260415000000_disbursements.sql`)
2. ✅ **Phase 1 FEC backfill executed** — `politicians`, `pac_committees`, `candidate_totals`, `candidate_committee_links`, `committee_transfers`, `contributions` (pas2 + partial indiv) now populated. `money_flow_edges` MV refreshed (~1.7M rows — required `SET statement_timeout = 0` directly in Supabase SQL editor; RPC `refresh_money_flow_edges()` created for future GH Actions use).
3. ✅ **Env flags set in Vercel** — `DONOR_SOURCE=supabase`, `SPENDING_SOURCE=supabase`
4. ✅ **ESM dotenv timing fixed** — `server/app.js` changed to `import 'dotenv/config'` as first import (Supabase client was initialising before env vars loaded, returning `null`)
5. ✅ **IPv6 proxy fixed** — `vite.config.js` proxy target changed to `http://127.0.0.1:3001` (Windows `localhost` → `::1` was hitting wrong process)

### ✅ Additional completed actions (as of 2026-04-20)

1. ✅ **Full individual contributions backfilled** — FEC Schedule A `indiv` data is now in `contributions` table; story types B, D, J have data to query against.
2. ✅ **USASpending backfill complete** — `contracts` and `grants` tables populated; `SPENDING_SOURCE=supabase` active.
5. ✅ **`feature-research` merged → `main`** — production Vercel running latest code.

### ⚠️ Still pending

3. **Create Cloudflare R2 bucket** `unredacted-bulk` — required for cold Parquet tier (full individual contribs, oppexp, USASpending). Add to `.env` and GitHub Actions secrets: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`
4. **`npm uninstall neo4j-driver`** — `graphQueries.js` is now a re-export shim; once confirmed no active callers, delete the shim and remove the dep.

### 🔨 Now actionable — story type screens (data is live)

With contributions + contracts/grants backfilled, the following story screens can now be built:

- **Story B — Pay-to-play / Contractor Donations** — join `contracts.recipient_name` against `contributions.contributor_employer`; show contractors who donated to committees before/after receiving contracts. Timeline correlation: donation month N → contract award month N+k.
- **Story D — Industry Capture** — per-candidate "top employer industries" breakdown using `contributions.contributor_employer` + `classifySector()`; explicit lobbyist bundler table from `lobbyist_bundles`.
- **Story J — Cash Flood Anomalies** — ✅ already implemented (`CashFloodAnomalies.jsx`, `getCashFloodAlerts()` in `supabaseDonors.js`).

### Step 5 — what was done

**Backend (behind flag):**
- `server/services/supabaseDonors.js` — 7 Supabase query functions (`searchCandidates`, `searchCommittees`, `getCandidateRaisedTotals`, `getCandidateContributions`, `getCommitteeContributions`, `getTopDonorsByEmployer`, `getMoneyFlow`)
- `server/routes/donors.js` — `DONOR_SOURCE` env flag + per-request `?source=supabase|fec`. New `GET /api/donors/money-flow` endpoint (Supabase-only, feeds Sankey).
- `src/api/client.js` — `limit` defaults raised 10 → 100; added `offset`, `cycle`, `party`, `source` params; added `donors.moneyFlow()`.

**Frontend:**
- `src/components/MoneyFlowSankey.jsx` — Recharts Sankey reading from `donors.moneyFlow()`, cycle/minAmount/limit controls.
- `src/components/CandidatesBrowser.jsx` — paginated table, name/office/state/party/cycle filters.

**Still blocked:** backfill execution + `DONOR_SOURCE=supabase` env flip.

---

1. ✅ **Supabase migration** — 11 new tables + indexes + `money_flow_edges` MV + RLS — `supabase/migrations/20260414000000_bulk_ingest.sql`
2. ✅ **R2 bucket + credentials** — `etl/bulk/shared/env.js`, `duck.js` (S3 Parquet write via DuckDB httpfs)
3. ✅ **`etl/bulk/shared/`** — `downloader.js`, `duck.js`, `supabase.js`, `run-tracker.js`, `fec-schemas.js`
4. ✅ **Phase 1 parsers** — `ingest-candidates/committees/links/totals/pas2/oth.js` (8 sources). **Backfill still needs to be executed.**
5. ✅ **Read-path swap #1** — `supabaseDonors.js`, donors route flag, client defaults, `MoneyFlowSankey.jsx`, `CandidatesBrowser.jsx`. **Blocked: needs backfill + env flag.**
6. ✅ **Phase 2 — oppexp** — `etl/bulk/fec/ingest-oppexp.js` → `disbursements_detail` (≥$2K hot, full R2). New migration `20260415000000_disbursements.sql`.
7. ✅ **Phase 3 — indiv** — `etl/bulk/fec/ingest-indiv.js` — DuckDB streaming, 5–20 GB file, ≥$2K hot tier, full R2.
8. ✅ **Phase 4 — IEs, electioneering, comm costs, lobbyist bundles** — 4 new schemas in `fec-schemas.js` + `ingest-ies/electioneering/comm-costs/lobbyist-bundles.js`. Frontend `IndependentExpenditures.jsx` and `LobbyistBundlers.jsx` rewritten with real `/api/spending/` calls (mock data removed).
9. ✅ **Phase 5 — USASpending** — `etl/bulk/usaspending/download.js` (archive discovery + streaming), `parse-contracts.js`, `parse-assistance.js`, `bulk-api-job.js` (weekly delta via POST+poll API).
10. ✅ **Phase 6 — `.fec` filings** — `etl/bulk/fec/parse-filings.js` — daily ZIPs from docquery.fec.gov, parses Schedule C (loans) + Schedule D (debts), `ingestFilingRange()` for date-range backfills.
11. ✅ **GH Actions cron** — `.github/workflows/bulk-ingest-fec.yml` (weekly Mon 06:00 UTC, 6-hr timeout) + `bulk-ingest-usaspending.yml` (monthly full + weekly delta). `etl/bulk/run.js` updated with all 17 sources.
12. ✅ **Read-path swap #2** — `server/services/supabaseSpending.js` (contracts, grants, agency, disbursements, IEs, lobbyist bundles). `spending.js` upgraded with `SPENDING_SOURCE=supabase` flag + 3 new Supabase-only endpoints. `graphQueries.js` replaced with re-export shim from `graphService.js` (Neo4j removed).

13. ✅ **Post-MVP frontend + source-switch (2026-04-19/20)** — additional work on `feature-research`:
    - **FEC→Supabase for 5 remaining FEC-only routes** — added `useSupabase()` check to `/committees/:id/receipts`, `/donors/by-employer`, `/contributions/by-industry`, `/candidates/compare`, `/committees/:id/spending`. New functions in `supabaseDonors.js`: `getCommitteeReceipts`, `getContributionsByIndustry`, `getCandidateTotalsComparison`, `getCommitteeSpending`.
    - **Corporate PAC flow** — `getCorporatePACs` + `getCorporatePACRecipients` in `supabaseDonors.js`; `/corporate-pacs` and `/corporate-pacs/:id/recipients` routes; `CorporatePACFlow.jsx` stacked bar chart with politician recipients showing real names (not FEC IDs).
    - **Cash Flood Anomalies** — `getCashFloodAlerts()` detects 30-day fundraising spikes (≥1.5× prior window, ≥$100k); `CashFloodAnomalies.jsx` component; `/cash-flood` route.
    - **Employer Leaderboard** — `getTopEmployers()` and `getEmployerFlow()` via `money_flow_edges` MV; `EmployerLeaderboard.jsx` split-panel with sector badges and 3-tier mini Sankey.
    - **FollowTheMoney restructure** — 8 subtabs: Money Flow · Donor Intelligence · Dark Money · Cash Flood · Donor Web · Lobbyist Bundlers · Indep. Expenditures · Corporate PACs. DonorIntel (politician profile + candidate lookup) restored on its own tab.
    - **CandidatesBrowser sort** — default sort by Raised ▼ (server-side `candidate_totals`-led query when no filters); Spent column also sortable; client-side fallback sort when filters active.
    - **Sankey light-mode fix** — `SankeyNode fill="#BBB"` → `fill={theme?.mid||"#BBB"}` in `MoneyFlowSankey.jsx` and `EmployerLeaderboard.jsx`; `color: t.hi` added to all Sankey Tooltip `contentStyle` objects.
    - **LobbyistBundlers + IndependentExpenditures** — rewritten to remove MUI imports (MUI not installed); uses `useTheme()` inline styles.
    - **CLAUDE.md** — created project guidance file.

Estimated total implementation effort: completed in ~2 focused sessions.
- ~~Confirmation on **Supabase plan / storage budget**~~ — **decided 2026-04-13**: hybrid Parquet cold tier + Supabase Pro hot tier (see §6b). User must unpause project + upgrade to Pro before first ingest.
- ~~Decision on **Neo4j**~~ — **decided 2026-04-13: drop**. Replaced by `money_flow_edges` materialized view + D3 Sankey / React Flow rendering (§6a).
- ~~Decision on **cycle retention**~~ — **decided 2026-04-13, revised same day**: scope is **FEC cycles 2024 + 2026** and **USASpending FY2024 → present** only. Primary user = journalists/researchers doing lookups for the 2026 midterms — relevance > historical depth. Older cycles (2022/2020/…) can be added later as Parquet partitions when the ML model work begins.

Then implementation proceeds in the order above.
