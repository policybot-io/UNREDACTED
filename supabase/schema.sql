-- ============================================================================
-- UNREDACTED — Supabase PostgreSQL Schema
-- Government accountability platform
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================================================
-- HELPER: updated_at trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PUBLIC DATA TABLES (existing ETL tables)
-- ============================================================================

-- Contracts (USASpending.gov)
CREATE TABLE IF NOT EXISTS contracts (
  id                            SERIAL PRIMARY KEY,
  award_id                      VARCHAR(255) UNIQUE NOT NULL,
  recipient_name                VARCHAR(500),
  recipient_uei                 VARCHAR(50),
  awarding_agency               VARCHAR(255),
  awarding_sub_agency           VARCHAR(255),
  award_amount                  DECIMAL(15,2),
  award_date                    DATE,
  period_of_performance_start   DATE,
  period_of_performance_end     DATE,
  description                   TEXT,
  naics_code                    VARCHAR(10),
  naics_description             VARCHAR(255),
  contract_award_type           VARCHAR(50),
  funding_agency                VARCHAR(255),
  place_of_performance_state    VARCHAR(10),
  place_of_performance_country  VARCHAR(100),
  recipient_country_code        VARCHAR(10),
  recipient_state_code          VARCHAR(10),
  recipient_zip                 VARCHAR(20),
  base_and_all_options_value    DECIMAL(15,2),
  current_total_value           DECIMAL(15,2),
  raw_data                      JSONB,
  created_at                    TIMESTAMPTZ DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contracts_recipient        ON contracts(recipient_name);
CREATE INDEX IF NOT EXISTS idx_contracts_agency           ON contracts(awarding_agency);
CREATE INDEX IF NOT EXISTS idx_contracts_award_date       ON contracts(award_date);
CREATE INDEX IF NOT EXISTS idx_contracts_award_amount     ON contracts(award_amount);
CREATE INDEX IF NOT EXISTS idx_contracts_search
  ON contracts USING gin(to_tsvector('english',
    COALESCE(description, '') || ' ' || COALESCE(recipient_name, '') || ' ' || COALESCE(awarding_agency, '')));

-- Grants (USASpending.gov)
CREATE TABLE IF NOT EXISTS grants (
  id                    SERIAL PRIMARY KEY,
  award_id              VARCHAR(255) UNIQUE NOT NULL,
  recipient_name        VARCHAR(500),
  recipient_uei         VARCHAR(50),
  awarding_agency       VARCHAR(255),
  award_amount          DECIMAL(15,2),
  award_date            DATE,
  description           TEXT,
  cfda_number           VARCHAR(20),
  cfda_title            VARCHAR(255),
  award_type            VARCHAR(50),
  funding_opportunity_number VARCHAR(100),
  raw_data              JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grants_recipient    ON grants(recipient_name);
CREATE INDEX IF NOT EXISTS idx_grants_agency       ON grants(awarding_agency);
CREATE INDEX IF NOT EXISTS idx_grants_award_date   ON grants(award_date);
CREATE INDEX IF NOT EXISTS idx_grants_search
  ON grants USING gin(to_tsvector('english',
    COALESCE(description, '') || ' ' || COALESCE(recipient_name, '') || ' ' || COALESCE(cfda_title, '')));

-- Regulations (Federal Register)
CREATE TABLE IF NOT EXISTS regulations (
  id               SERIAL PRIMARY KEY,
  document_number  VARCHAR(100) UNIQUE NOT NULL,
  title            TEXT,
  agency_names     TEXT[],
  publication_date DATE,
  type             VARCHAR(50),
  abstract         TEXT,
  html_url         TEXT,
  pdf_url          TEXT,
  significant      BOOLEAN DEFAULT FALSE,
  raw_data         JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_regulations_pub_date    ON regulations(publication_date);
CREATE INDEX IF NOT EXISTS idx_regulations_significant ON regulations(significant);
CREATE INDEX IF NOT EXISTS idx_regulations_type        ON regulations(type);
CREATE INDEX IF NOT EXISTS idx_regulations_search
  ON regulations USING gin(to_tsvector('english',
    COALESCE(title, '') || ' ' || COALESCE(abstract, '')));

-- ETL Jobs log (service role only)
CREATE TABLE IF NOT EXISTS etl_jobs (
  id                SERIAL PRIMARY KEY,
  source_name       VARCHAR(100) NOT NULL,
  job_type          VARCHAR(50)  NOT NULL,
  status            VARCHAR(50)  NOT NULL,
  records_processed INTEGER DEFAULT 0,
  records_inserted  INTEGER DEFAULT 0,
  records_updated   INTEGER DEFAULT 0,
  records_failed    INTEGER DEFAULT 0,
  duration_seconds  DECIMAL(10,2),
  error_message     TEXT,
  metadata          JSONB,
  started_at        TIMESTAMPTZ DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_etl_jobs_source ON etl_jobs(source_name);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_status ON etl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_started ON etl_jobs(started_at DESC);

-- API request logs (service role only)
CREATE TABLE IF NOT EXISTS api_logs (
  id              SERIAL PRIMARY KEY,
  endpoint        VARCHAR(255),
  method          VARCHAR(10),
  status_code     INTEGER,
  response_time_ms INTEGER,
  user_agent      TEXT,
  ip_address      INET,
  query_params    JSONB,
  timestamp       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_logs_endpoint   ON api_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_api_logs_timestamp  ON api_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_api_logs_status_code ON api_logs(status_code);

-- ============================================================================
-- PHASE 2: DONOR INTELLIGENCE TABLES
-- ============================================================================

-- Politicians
CREATE TABLE IF NOT EXISTS politicians (
  id               SERIAL PRIMARY KEY,
  bioguide_id      VARCHAR(20) UNIQUE,
  fec_candidate_id VARCHAR(20) UNIQUE,
  name             VARCHAR(255) NOT NULL,
  party            VARCHAR(10),
  state            VARCHAR(2),
  district         VARCHAR(10),
  chamber          VARCHAR(20),
  office           VARCHAR(100),
  in_office        BOOLEAN DEFAULT TRUE,
  first_elected    INTEGER,
  next_election    INTEGER,
  committees       JSONB,
  raw_data         JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_politicians_state_party ON politicians(state, party);
CREATE INDEX IF NOT EXISTS idx_politicians_chamber     ON politicians(chamber);
CREATE INDEX IF NOT EXISTS idx_politicians_name        ON politicians(name);
CREATE INDEX IF NOT EXISTS idx_politicians_fec_id      ON politicians(fec_candidate_id);

-- Contributions (FEC Schedule A)
CREATE TABLE IF NOT EXISTS contributions (
  id                      SERIAL PRIMARY KEY,
  contribution_id         VARCHAR(255) UNIQUE NOT NULL,
  contributor_name        VARCHAR(500),
  contributor_employer    VARCHAR(500),
  contributor_occupation  VARCHAR(255),
  contributor_city        VARCHAR(100),
  contributor_state       VARCHAR(2),
  contributor_zip         VARCHAR(10),
  amount                  DECIMAL(12,2),
  date                    DATE,
  committee_id            VARCHAR(20),
  candidate_id            VARCHAR(20),
  receipt_type            VARCHAR(50),
  memo_text               TEXT,
  raw_data                JSONB,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contributions_committee ON contributions(committee_id);
CREATE INDEX IF NOT EXISTS idx_contributions_candidate ON contributions(candidate_id);
CREATE INDEX IF NOT EXISTS idx_contributions_date      ON contributions(date);
CREATE INDEX IF NOT EXISTS idx_contributions_employer  ON contributions(contributor_employer);
CREATE INDEX IF NOT EXISTS idx_contributions_amount    ON contributions(amount);
CREATE INDEX IF NOT EXISTS idx_contributions_search
  ON contributions USING gin(to_tsvector('english',
    COALESCE(contributor_name, '') || ' ' ||
    COALESCE(contributor_employer, '') || ' ' ||
    COALESCE(contributor_occupation, '')));

-- PAC Committees
CREATE TABLE IF NOT EXISTS pac_committees (
  id                   SERIAL PRIMARY KEY,
  committee_id         VARCHAR(20) UNIQUE NOT NULL,
  name                 VARCHAR(500),
  committee_type       VARCHAR(100),
  designation          VARCHAR(50),
  party                VARCHAR(10),
  connected_org_name   VARCHAR(500),
  total_receipts       DECIMAL(15,2),
  total_disbursements  DECIMAL(15,2),
  cash_on_hand         DECIMAL(15,2),
  cycle                INTEGER,
  raw_data             JSONB,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pac_committees_type  ON pac_committees(committee_type);
CREATE INDEX IF NOT EXISTS idx_pac_committees_party ON pac_committees(party);
CREATE INDEX IF NOT EXISTS idx_pac_committees_cycle ON pac_committees(cycle);

-- Disbursements (FEC Schedule B)
CREATE TABLE IF NOT EXISTS disbursements (
  id               SERIAL PRIMARY KEY,
  disbursement_id  VARCHAR(255) UNIQUE NOT NULL,
  committee_id     VARCHAR(20),
  recipient_name   VARCHAR(500),
  recipient_state  VARCHAR(2),
  amount           DECIMAL(12,2),
  date             DATE,
  purpose          VARCHAR(500),
  category         VARCHAR(100),
  raw_data         JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disbursements_committee ON disbursements(committee_id);
CREATE INDEX IF NOT EXISTS idx_disbursements_date      ON disbursements(date);
CREATE INDEX IF NOT EXISTS idx_disbursements_recipient ON disbursements(recipient_name);

-- Candidate totals
CREATE TABLE IF NOT EXISTS candidate_totals (
  id                      SERIAL PRIMARY KEY,
  candidate_id            VARCHAR(20) NOT NULL,
  cycle                   INTEGER NOT NULL,
  total_receipts          DECIMAL(15,2),
  total_disbursements     DECIMAL(15,2),
  cash_on_hand            DECIMAL(15,2),
  individual_contributions DECIMAL(15,2),
  pac_contributions       DECIMAL(15,2),
  other_committees        DECIMAL(15,2),
  candidate_loans         DECIMAL(15,2),
  raw_data                JSONB,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(candidate_id, cycle)
);

CREATE INDEX IF NOT EXISTS idx_candidate_totals_cycle       ON candidate_totals(cycle);
CREATE INDEX IF NOT EXISTS idx_candidate_totals_candidate   ON candidate_totals(candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidate_totals_receipts    ON candidate_totals(total_receipts);

-- OpenSecrets summaries
CREATE TABLE IF NOT EXISTS opensecrets_summaries (
  id                SERIAL PRIMARY KEY,
  cid               VARCHAR(20) UNIQUE NOT NULL,
  cycle             INTEGER NOT NULL,
  top_industries    JSONB,
  top_contributors  JSONB,
  total_raised      DECIMAL(15,2),
  spent             DECIMAL(15,2),
  cash_on_hand      DECIMAL(15,2),
  raw_data          JSONB,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(cid, cycle)
);

-- ============================================================================
-- PHASE 3: STOCK ACT & CORRUPTION TABLES
-- ============================================================================

-- Senate STOCK Act PTR filings
CREATE TABLE IF NOT EXISTS senate_disclosures (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  senator_name    VARCHAR(255) NOT NULL,
  senator_state   VARCHAR(2),
  fec_candidate_id VARCHAR(20),
  filing_date     DATE,
  transaction_date DATE,
  ticker          VARCHAR(20),
  asset_name      VARCHAR(500),
  transaction_type VARCHAR(50),  -- Purchase, Sale, Exchange
  amount_range    VARCHAR(100),  -- e.g., "$1,001 - $15,000"
  amount_min      DECIMAL(15,2),
  amount_max      DECIMAL(15,2),
  comment         TEXT,
  is_violation    BOOLEAN DEFAULT FALSE,
  violation_reason TEXT,
  raw_data        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_senate_disclosures_senator     ON senate_disclosures(senator_name);
CREATE INDEX IF NOT EXISTS idx_senate_disclosures_filing_date ON senate_disclosures(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_senate_disclosures_ticker      ON senate_disclosures(ticker);
CREATE INDEX IF NOT EXISTS idx_senate_disclosures_violation   ON senate_disclosures(is_violation) WHERE is_violation = TRUE;
CREATE INDEX IF NOT EXISTS idx_senate_disclosures_fec_id      ON senate_disclosures(fec_candidate_id);

-- House STOCK Act PTR filings
CREATE TABLE IF NOT EXISTS house_disclosures (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  member_name     VARCHAR(255) NOT NULL,
  member_state    VARCHAR(2),
  member_district VARCHAR(10),
  fec_candidate_id VARCHAR(20),
  filing_date     DATE,
  transaction_date DATE,
  ticker          VARCHAR(20),
  asset_name      VARCHAR(500),
  transaction_type VARCHAR(50),
  amount_range    VARCHAR(100),
  amount_min      DECIMAL(15,2),
  amount_max      DECIMAL(15,2),
  comment         TEXT,
  is_violation    BOOLEAN DEFAULT FALSE,
  violation_reason TEXT,
  raw_data        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_house_disclosures_member       ON house_disclosures(member_name);
CREATE INDEX IF NOT EXISTS idx_house_disclosures_filing_date  ON house_disclosures(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_house_disclosures_ticker       ON house_disclosures(ticker);
CREATE INDEX IF NOT EXISTS idx_house_disclosures_violation    ON house_disclosures(is_violation) WHERE is_violation = TRUE;

-- Corruption scores cache (RECEIPTS Accountability Score)
CREATE TABLE IF NOT EXISTS corruption_scores (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type  VARCHAR(20) NOT NULL,   -- 'politician' or 'company'
  entity_id    VARCHAR(255) NOT NULL,  -- candidate_id or company name
  entity_name  VARCHAR(500),
  overall_score INTEGER,
  tier         VARCHAR(10),            -- A/B/C/D/F for politicians, LOW/MEDIUM/HIGH/CRITICAL for companies
  components   JSONB,
  risk_factors JSONB,
  evidence     JSONB,
  raw_data     JSONB,
  scored_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
  UNIQUE(entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_corruption_scores_entity_type ON corruption_scores(entity_type);
CREATE INDEX IF NOT EXISTS idx_corruption_scores_entity_id   ON corruption_scores(entity_id);
CREATE INDEX IF NOT EXISTS idx_corruption_scores_scored_at   ON corruption_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_corruption_scores_expires_at  ON corruption_scores(expires_at);
CREATE INDEX IF NOT EXISTS idx_corruption_scores_tier        ON corruption_scores(tier);
CREATE INDEX IF NOT EXISTS idx_corruption_scores_score       ON corruption_scores(overall_score);

-- ============================================================================
-- USER TABLES
-- ============================================================================

-- User profiles (extends auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT,
  display_name   VARCHAR(100),
  avatar_url     TEXT,
  bio            TEXT,
  is_public      BOOLEAN DEFAULT FALSE,
  notification_prefs JSONB DEFAULT '{"email": true, "browser": true}'::jsonb,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);

-- Watchlist
CREATE TABLE IF NOT EXISTS watchlist (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL,  -- 'politician' or 'company'
  entity_id   VARCHAR(255) NOT NULL,
  entity_name VARCHAR(500) NOT NULL,
  metadata    JSONB DEFAULT '{}'::jsonb,
  is_public   BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id     ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_entity_type ON watchlist(entity_type);
CREATE INDEX IF NOT EXISTS idx_watchlist_entity_id   ON watchlist(entity_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_created_at  ON watchlist(created_at DESC);

-- Alert rules
CREATE TABLE IF NOT EXISTS alerts (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type  VARCHAR(20) NOT NULL,
  entity_id    VARCHAR(255) NOT NULL,
  entity_name  VARCHAR(500),
  alert_type   VARCHAR(50) NOT NULL,   -- 'score_drop', 'new_disclosure', 'new_flag', 'tier_change'
  threshold    JSONB DEFAULT '{}'::jsonb, -- e.g., {"score_below": 50}
  is_active    BOOLEAN DEFAULT TRUE,
  last_checked TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_user_id    ON alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_alerts_entity_id  ON alerts(entity_id);
CREATE INDEX IF NOT EXISTS idx_alerts_is_active  ON alerts(is_active) WHERE is_active = TRUE;

-- Alert events (triggered alerts)
CREATE TABLE IF NOT EXISTS alert_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  alert_id     UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_id    VARCHAR(255) NOT NULL,
  event_type   VARCHAR(50) NOT NULL,
  event_data   JSONB DEFAULT '{}'::jsonb,
  message      TEXT NOT NULL,
  is_read      BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_events_user_id   ON alert_events(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_alert_id  ON alert_events(alert_id);
CREATE INDEX IF NOT EXISTS idx_alert_events_is_read   ON alert_events(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_alert_events_created   ON alert_events(created_at DESC);

-- Community corruption flags
CREATE TABLE IF NOT EXISTS corruption_flags (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  submitted_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type   VARCHAR(20) NOT NULL,
  entity_id     VARCHAR(255) NOT NULL,
  entity_name   VARCHAR(500),
  flag_type     VARCHAR(50) NOT NULL,  -- 'quid_pro_quo', 'revolving_door', 'dark_money', 'stock_act', 'other'
  description   TEXT NOT NULL,
  evidence_urls TEXT[],
  status        VARCHAR(20) DEFAULT 'pending',  -- pending, reviewed, verified, dismissed
  upvotes       INTEGER DEFAULT 0,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_corruption_flags_entity_id   ON corruption_flags(entity_id);
CREATE INDEX IF NOT EXISTS idx_corruption_flags_entity_type ON corruption_flags(entity_type);
CREATE INDEX IF NOT EXISTS idx_corruption_flags_flag_type   ON corruption_flags(flag_type);
CREATE INDEX IF NOT EXISTS idx_corruption_flags_status      ON corruption_flags(status);
CREATE INDEX IF NOT EXISTS idx_corruption_flags_created     ON corruption_flags(created_at DESC);

-- Search history
CREATE TABLE IF NOT EXISTS search_history (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query       TEXT NOT NULL,
  query_type  VARCHAR(50),   -- 'politician', 'company', 'keyword', 'agent'
  results_count INTEGER,
  metadata    JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_id   ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_created   ON search_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_history_query     ON search_history USING gin(to_tsvector('english', query));

-- ============================================================================
-- updated_at TRIGGERS
-- ============================================================================

CREATE OR REPLACE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_grants_updated_at
  BEFORE UPDATE ON grants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_regulations_updated_at
  BEFORE UPDATE ON regulations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_politicians_updated_at
  BEFORE UPDATE ON politicians FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_pac_committees_updated_at
  BEFORE UPDATE ON pac_committees FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_candidate_totals_updated_at
  BEFORE UPDATE ON candidate_totals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_opensecrets_updated_at
  BEFORE UPDATE ON opensecrets_summaries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_senate_disclosures_updated_at
  BEFORE UPDATE ON senate_disclosures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_house_disclosures_updated_at
  BEFORE UPDATE ON house_disclosures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_alerts_updated_at
  BEFORE UPDATE ON alerts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trg_corruption_flags_updated_at
  BEFORE UPDATE ON corruption_flags FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE contracts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE grants              ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE etl_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_logs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE politicians         ENABLE ROW LEVEL SECURITY;
ALTER TABLE contributions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pac_committees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE disbursements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidate_totals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE opensecrets_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE senate_disclosures  ENABLE ROW LEVEL SECURITY;
ALTER TABLE house_disclosures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_scores   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist           ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE corruption_flags    ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_history      ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES — Public read tables
-- ============================================================================

-- contracts: public read
CREATE POLICY "contracts_public_select" ON contracts
  FOR SELECT TO anon, authenticated USING (true);

-- grants: public read
CREATE POLICY "grants_public_select" ON grants
  FOR SELECT TO anon, authenticated USING (true);

-- regulations: public read
CREATE POLICY "regulations_public_select" ON regulations
  FOR SELECT TO anon, authenticated USING (true);

-- politicians: public read
CREATE POLICY "politicians_public_select" ON politicians
  FOR SELECT TO anon, authenticated USING (true);

-- contributions: public read
CREATE POLICY "contributions_public_select" ON contributions
  FOR SELECT TO anon, authenticated USING (true);

-- pac_committees: public read
CREATE POLICY "pac_committees_public_select" ON pac_committees
  FOR SELECT TO anon, authenticated USING (true);

-- disbursements: public read
CREATE POLICY "disbursements_public_select" ON disbursements
  FOR SELECT TO anon, authenticated USING (true);

-- candidate_totals: public read
CREATE POLICY "candidate_totals_public_select" ON candidate_totals
  FOR SELECT TO anon, authenticated USING (true);

-- opensecrets_summaries: public read
CREATE POLICY "opensecrets_summaries_public_select" ON opensecrets_summaries
  FOR SELECT TO anon, authenticated USING (true);

-- senate_disclosures: public read
CREATE POLICY "senate_disclosures_public_select" ON senate_disclosures
  FOR SELECT TO anon, authenticated USING (true);

-- house_disclosures: public read
CREATE POLICY "house_disclosures_public_select" ON house_disclosures
  FOR SELECT TO anon, authenticated USING (true);

-- corruption_scores: public read
CREATE POLICY "corruption_scores_public_select" ON corruption_scores
  FOR SELECT TO anon, authenticated USING (true);

-- etl_jobs: no public access (service role only via bypass)
-- api_logs: no public access (service role only via bypass)

-- ============================================================================
-- RLS POLICIES — User-owned tables
-- ============================================================================

-- user_profiles: users manage their own profile
CREATE POLICY "user_profiles_select_own" ON user_profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

CREATE POLICY "user_profiles_insert_own" ON user_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_update_own" ON user_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "user_profiles_delete_own" ON user_profiles
  FOR DELETE TO authenticated USING (auth.uid() = id);

-- watchlist: users manage their own watchlist
CREATE POLICY "watchlist_select_own" ON watchlist
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "watchlist_select_public" ON watchlist
  FOR SELECT TO anon, authenticated USING (is_public = true);

CREATE POLICY "watchlist_insert_own" ON watchlist
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "watchlist_delete_own" ON watchlist
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- alerts: users manage their own alerts
CREATE POLICY "alerts_select_own" ON alerts
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "alerts_insert_own" ON alerts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alerts_update_own" ON alerts
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "alerts_delete_own" ON alerts
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- alert_events: users see their own events
CREATE POLICY "alert_events_select_own" ON alert_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "alert_events_update_own" ON alert_events
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- corruption_flags: authenticated users can submit, all can read
CREATE POLICY "corruption_flags_select_all" ON corruption_flags
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "corruption_flags_insert_auth" ON corruption_flags
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = submitted_by);

-- search_history: users see their own history
CREATE POLICY "search_history_select_own" ON search_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "search_history_insert_own" ON search_history
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "search_history_delete_own" ON search_history
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ============================================================================
-- USEFUL FUNCTIONS
-- ============================================================================

-- Search politicians by name, state, or party
CREATE OR REPLACE FUNCTION search_politicians(query_text TEXT)
RETURNS TABLE (
  id               INTEGER,
  name             VARCHAR(255),
  party            VARCHAR(10),
  state            VARCHAR(2),
  chamber          VARCHAR(20),
  office           VARCHAR(100),
  fec_candidate_id VARCHAR(20),
  in_office        BOOLEAN,
  rank             REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.party,
    p.state,
    p.chamber,
    p.office,
    p.fec_candidate_id,
    p.in_office,
    ts_rank(
      to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.state, '') || ' ' || COALESCE(p.party, '')),
      plainto_tsquery('english', query_text)
    ) AS rank
  FROM politicians p
  WHERE
    to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.state, '') || ' ' || COALESCE(p.party, ''))
    @@ plainto_tsquery('english', query_text)
    OR p.name ILIKE '%' || query_text || '%'
    OR p.state ILIKE query_text
  ORDER BY rank DESC, p.name ASC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user watchlist with most recent corruption scores
CREATE OR REPLACE FUNCTION get_watchlist_with_scores(p_user_id UUID)
RETURNS TABLE (
  watchlist_id  UUID,
  entity_type   VARCHAR(20),
  entity_id     VARCHAR(255),
  entity_name   VARCHAR(500),
  overall_score INTEGER,
  tier          VARCHAR(10),
  scored_at     TIMESTAMPTZ,
  added_at      TIMESTAMPTZ,
  is_public     BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id           AS watchlist_id,
    w.entity_type,
    w.entity_id,
    w.entity_name,
    cs.overall_score,
    cs.tier,
    cs.scored_at,
    w.created_at   AS added_at,
    w.is_public
  FROM watchlist w
  LEFT JOIN corruption_scores cs
    ON cs.entity_type = w.entity_type
    AND cs.entity_id  = w.entity_id
    AND cs.expires_at > NOW()
  WHERE w.user_id = p_user_id
  ORDER BY w.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get unread alert count for a user
CREATE OR REPLACE FUNCTION get_unread_alert_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM alert_events
  WHERE user_id = p_user_id AND is_read = FALSE;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- AUTO-CREATE USER PROFILE ON SIGNUP
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
