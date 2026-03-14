"""PostgreSQL connection and utilities."""
import os
import psycopg2
from psycopg2.extras import execute_values, RealDictCursor
from typing import Optional, List, Dict, Any
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

# Prefer DATABASE_URL (Supabase pooled connection via PgBouncer) over the legacy POSTGRES_URI.
# When using Supabase, set DATABASE_URL to the "Transaction mode" pooled connection URL
# (port 6543) from the Supabase dashboard → Project Settings → Database → Connection string.
POSTGRES_URI = os.getenv(
    "DATABASE_URL",   # Supabase pooled connection URL (preferred)
    os.getenv("POSTGRES_URI", "postgresql://postgres:password@localhost:5432/unredacted")
)

# Optional: Supabase Python client for direct table access with RLS support.
# Install with: pip install supabase
# Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.
try:
    from supabase import create_client, Client as SupabaseClient

    _supabase_url = os.getenv("SUPABASE_URL")
    _supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    supabase: Optional[SupabaseClient] = (
        create_client(_supabase_url, _supabase_key)
        if _supabase_url and _supabase_key
        else None
    )
    if supabase:
        logger.info("Supabase Python client initialized")
except ImportError:
    supabase = None
    logger.debug("supabase Python package not installed — skipping Supabase client init")


class PostgresConnection:
    """PostgreSQL connection manager."""

    _instance = None
    _pool = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def get_connection(self):
        """Get a database connection."""
        return psycopg2.connect(POSTGRES_URI)

    @contextmanager
    def cursor(self, cursor_factory=None):
        """Context manager for database cursor."""
        conn = self.get_connection()
        cur = conn.cursor(cursor_factory=cursor_factory)
        try:
            yield cur
            conn.commit()
        except Exception as e:
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()

    def execute(self, query: str, params: Optional[tuple] = None) -> None:
        """Execute a query."""
        with self.cursor() as cur:
            cur.execute(query, params)

    def fetchone(self, query: str, params: Optional[tuple] = None) -> Optional[Dict]:
        """Fetch a single row."""
        with self.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchone()

    def fetchall(self, query: str, params: Optional[tuple] = None) -> List[Dict]:
        """Fetch all rows."""
        with self.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            return cur.fetchall()

    def insert_many(self, table: str, columns: List[str], values: List[tuple]) -> int:
        """Bulk insert rows. Returns count inserted."""
        if not values:
            return 0

        query = f"INSERT INTO {table} ({', '.join(columns)}) VALUES %s ON CONFLICT DO NOTHING"
        with self.cursor() as cur:
            execute_values(cur, query, values, page_size=1000)
            return len(values)


def init_tables():
    """Initialize PostgreSQL tables."""
    conn = PostgresConnection()

    # Contracts table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contracts (
            id SERIAL PRIMARY KEY,
            award_id VARCHAR(255) UNIQUE NOT NULL,
            recipient_name VARCHAR(500),
            recipient_uei VARCHAR(50),
            awarding_agency VARCHAR(255),
            awarding_sub_agency VARCHAR(255),
            award_amount DECIMAL(15, 2),
            award_date DATE,
            period_of_performance_start DATE,
            period_of_performance_end DATE,
            description TEXT,
            naics_code VARCHAR(10),
            naics_description VARCHAR(255),
            contract_award_type VARCHAR(50),
            funding_agency VARCHAR(255),
            place_of_performance_state VARCHAR(10),
            place_of_performance_country VARCHAR(100),
            recipient_country_code VARCHAR(10),
            recipient_state_code VARCHAR(10),
            recipient_zip VARCHAR(20),
            base_and_all_options_value DECIMAL(15, 2),
            current_total_value DECIMAL(15, 2),
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Grants table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS grants (
            id SERIAL PRIMARY KEY,
            award_id VARCHAR(255) UNIQUE NOT NULL,
            recipient_name VARCHAR(500),
            recipient_uei VARCHAR(50),
            awarding_agency VARCHAR(255),
            award_amount DECIMAL(15, 2),
            award_date DATE,
            description TEXT,
            cfda_number VARCHAR(20),
            cfda_title VARCHAR(255),
            award_type VARCHAR(50),
            funding_opportunity_number VARCHAR(100),
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Regulations table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS regulations (
            id SERIAL PRIMARY KEY,
            document_number VARCHAR(100) UNIQUE NOT NULL,
            title TEXT,
            agency_names TEXT[],
            publication_date DATE,
            type VARCHAR(50),
            abstract TEXT,
            html_url TEXT,
            pdf_url TEXT,
            significant BOOLEAN DEFAULT FALSE,
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # ETL Jobs log
    conn.execute("""
        CREATE TABLE IF NOT EXISTS etl_jobs (
            id SERIAL PRIMARY KEY,
            source_name VARCHAR(100) NOT NULL,
            job_type VARCHAR(50) NOT NULL,
            status VARCHAR(50) NOT NULL,
            records_processed INTEGER DEFAULT 0,
            records_inserted INTEGER DEFAULT 0,
            records_updated INTEGER DEFAULT 0,
            records_failed INTEGER DEFAULT 0,
            duration_seconds DECIMAL(10, 2),
            error_message TEXT,
            metadata JSONB,
            started_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP
        );
    """)

    # API request logs
    conn.execute("""
        CREATE TABLE IF NOT EXISTS api_logs (
            id SERIAL PRIMARY KEY,
            endpoint VARCHAR(255),
            method VARCHAR(10),
            status_code INTEGER,
            response_time_ms INTEGER,
            user_agent TEXT,
            ip_address INET,
            query_params JSONB,
            timestamp TIMESTAMP DEFAULT NOW()
        );
    """)

    # Full text search indexes
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_contracts_search
        ON contracts USING gin(to_tsvector('english', COALESCE(description, '') || ' ' || COALESCE(recipient_name, '')));
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_grants_search
        ON grants USING gin(to_tsvector('english', COALESCE(description, '') || ' ' || COALESCE(recipient_name, '')));
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_regulations_search
        ON regulations USING gin(to_tsvector('english', COALESCE(title, '') || ' ' || COALESCE(abstract, '')));
    """)

    # ========== PHASE 2: DONOR INTELLIGENCE TABLES ==========

    # Politicians table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS politicians (
            id SERIAL PRIMARY KEY,
            bioguide_id VARCHAR(20) UNIQUE,
            fec_candidate_id VARCHAR(20) UNIQUE,
            name VARCHAR(255) NOT NULL,
            party VARCHAR(10),
            state VARCHAR(2),
            district VARCHAR(10),
            chamber VARCHAR(20),
            office VARCHAR(100),
            in_office BOOLEAN DEFAULT TRUE,
            first_elected INTEGER,
            next_election INTEGER,
            committees JSONB,
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Contributions table (FEC Schedule A)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS contributions (
            id SERIAL PRIMARY KEY,
            contribution_id VARCHAR(255) UNIQUE NOT NULL,
            contributor_name VARCHAR(500),
            contributor_employer VARCHAR(500),
            contributor_occupation VARCHAR(255),
            contributor_city VARCHAR(100),
            contributor_state VARCHAR(2),
            contributor_zip VARCHAR(10),
            amount DECIMAL(12, 2),
            date DATE,
            committee_id VARCHAR(20),
            candidate_id VARCHAR(20),
            receipt_type VARCHAR(50),
            memo_text TEXT,
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # PAC Committees table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pac_committees (
            id SERIAL PRIMARY KEY,
            committee_id VARCHAR(20) UNIQUE NOT NULL,
            name VARCHAR(500),
            committee_type VARCHAR(100),
            designation VARCHAR(50),
            party VARCHAR(10),
            connected_org_name VARCHAR(500),
            total_receipts DECIMAL(15, 2),
            total_disbursements DECIMAL(15, 2),
            cash_on_hand DECIMAL(15, 2),
            cycle INTEGER,
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Disbursements table (FEC Schedule B)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS disbursements (
            id SERIAL PRIMARY KEY,
            disbursement_id VARCHAR(255) UNIQUE NOT NULL,
            committee_id VARCHAR(20),
            recipient_name VARCHAR(500),
            recipient_state VARCHAR(2),
            amount DECIMAL(12, 2),
            date DATE,
            purpose VARCHAR(500),
            category VARCHAR(100),
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        );
    """)

    # Candidate totals table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS candidate_totals (
            id SERIAL PRIMARY KEY,
            candidate_id VARCHAR(20) NOT NULL,
            cycle INTEGER NOT NULL,
            total_receipts DECIMAL(15, 2),
            total_disbursements DECIMAL(15, 2),
            cash_on_hand DECIMAL(15, 2),
            individual_contributions DECIMAL(15, 2),
            pac_contributions DECIMAL(15, 2),
            other_committees DECIMAL(15, 2),
            candidate_loans DECIMAL(15, 2),
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(candidate_id, cycle)
        );
    """)

    # OpenSecrets summaries table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS opensecrets_summaries (
            id SERIAL PRIMARY KEY,
            cid VARCHAR(20) UNIQUE NOT NULL,
            cycle INTEGER NOT NULL,
            top_industries JSONB,
            top_contributors JSONB,
            total_raised DECIMAL(15, 2),
            spent DECIMAL(15, 2),
            cash_on_hand DECIMAL(15, 2),
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(cid, cycle)
        );
    """)

    # ========== PHASE 2 INDEXES ==========

    # Politician indexes
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_politicians_state_party
        ON politicians(state, party);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_politicians_chamber
        ON politicians(chamber);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_politicians_name
        ON politicians(name);
    """)

    # Contribution indexes
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_contributions_committee
        ON contributions(committee_id);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_contributions_candidate
        ON contributions(candidate_id);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_contributions_date
        ON contributions(date);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_contributions_employer
        ON contributions(contributor_employer);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_contributions_search
        ON contributions USING gin(to_tsvector('english',
            COALESCE(contributor_name, '') || ' ' ||
            COALESCE(contributor_employer, '') || ' ' ||
            COALESCE(contributor_occupation, '')));
    """)

    # PAC Committee indexes
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_pac_committees_type
        ON pac_committees(committee_type);
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_pac_committees_party
        ON pac_committees(party);
    """)

    # Candidate totals indexes
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_candidate_totals_cycle
        ON candidate_totals(cycle);
    """)

    logger.info("PostgreSQL tables initialized")
    return conn
