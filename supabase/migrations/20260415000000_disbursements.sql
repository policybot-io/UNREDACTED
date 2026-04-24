-- Phase 2 hot-tier table: FEC operating expenditures (oppexp) → disbursements_detail.
-- Stores disbursements ≥ $2,000 for the self-dealing & vendor analysis screens.
-- Raw full rows live in R2 Parquet (fec/oppexp/cycle=.../part-*.parquet).

BEGIN;

CREATE TABLE IF NOT EXISTS disbursements_detail (
  sub_id                BIGINT PRIMARY KEY,
  committee_id          VARCHAR(20) NOT NULL,
  cycle                 INT         NOT NULL,
  recipient_name        TEXT,
  recipient_city        TEXT,
  recipient_state       VARCHAR(2),
  disbursement_date     DATE,
  disbursement_amount   NUMERIC(15,2),
  disbursement_description TEXT,
  purpose_category      TEXT,        -- FEC CATEGORY code
  purpose_category_desc TEXT,        -- FEC CATEGORY_DESC
  raw_data              JSONB        -- original row for debugging
);

CREATE INDEX IF NOT EXISTS idx_disb_committee ON disbursements_detail(committee_id, cycle);
CREATE INDEX IF NOT EXISTS idx_disb_recipient  ON disbursements_detail(recipient_name);
CREATE INDEX IF NOT EXISTS idx_disb_amount     ON disbursements_detail(disbursement_amount DESC);
CREATE INDEX IF NOT EXISTS idx_disb_date       ON disbursements_detail(disbursement_date);

ALTER TABLE disbursements_detail ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disbursements_detail_public_select ON disbursements_detail;
CREATE POLICY disbursements_detail_public_select ON disbursements_detail FOR SELECT USING (true);

COMMIT;
