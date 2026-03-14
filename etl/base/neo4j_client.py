"""Neo4j graph database connection and utilities."""
import os
from neo4j import GraphDatabase, AsyncGraphDatabase
from typing import Optional, List, Dict, Any
import logging

logger = logging.getLogger(__name__)

NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USERNAME") or os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")


class Neo4jConnection:
    """Neo4j connection manager."""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._driver = None
        return cls._instance

    def connect(self):
        """Initialize driver connection."""
        if self._driver is None:
            self._driver = GraphDatabase.driver(
                NEO4J_URI,
                auth=(NEO4J_USER, NEO4J_PASSWORD)
            )
            logger.info("Neo4j connection established")
        return self

    def close(self):
        """Close driver connection."""
        if self._driver:
            self._driver.close()
            self._driver = None
            logger.info("Neo4j connection closed")

    def get_driver(self):
        """Get the driver instance."""
        if self._driver is None:
            self.connect()
        return self._driver

    def run(self, query: str, parameters: Optional[Dict] = None) -> List[Dict]:
        """Execute a Cypher query."""
        with self.get_driver().session() as session:
            result = session.run(query, parameters or {})
            return [record.data() for record in result]

    async def run_async(self, query: str, parameters: Optional[Dict] = None) -> List[Dict]:
        """Execute a Cypher query asynchronously."""
        async with AsyncGraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD)) as driver:
            async with driver.session() as session:
                result = await session.run(query, parameters or {})
                records = []
                async for record in result:
                    records.append(record.data())
                return records


# Schema definition
SCHEMA_CONSTRAINTS = [
    # Entity constraints
    "CREATE CONSTRAINT company_uei IF NOT EXISTS FOR (c:Company) REQUIRE c.uei IS UNIQUE",
    "CREATE CONSTRAINT company_name IF NOT EXISTS FOR (c:Company) REQUIRE c.name IS UNIQUE",
    "CREATE CONSTRAINT politician_id IF NOT EXISTS FOR (p:Politician) REQUIRE p.bioguide_id IS UNIQUE",
    "CREATE CONSTRAINT agency_code IF NOT EXISTS FOR (a:Agency) REQUIRE a.code IS UNIQUE",
    "CREATE CONSTRAINT contract_id IF NOT EXISTS FOR (c:Contract) REQUIRE c.award_id IS UNIQUE",
    "CREATE CONSTRAINT regulation_id IF NOT EXISTS FOR (r:Regulation) REQUIRE r.document_number IS UNIQUE",
    "CREATE CONSTRAINT pac_id IF NOT EXISTS FOR (p:PAC) REQUIRE p.committee_id IS UNIQUE",
    "CREATE CONSTRAINT contribution_id IF NOT EXISTS FOR (c:Contribution) REQUIRE c.contribution_id IS UNIQUE",
]

SCHEMA_INDEXES = [
    # Performance indexes
    "CREATE INDEX contract_date IF NOT EXISTS FOR (c:Contract) ON (c.award_date)",
    "CREATE INDEX contract_amount IF NOT EXISTS FOR (c:Contract) ON (c.award_amount)",
    "CREATE INDEX regulation_date IF NOT EXISTS FOR (r:Regulation) ON (r.publication_date)",
    "CREATE INDEX contribution_date IF NOT EXISTS FOR (c:Contribution) ON (c.date)",
    "CREATE INDEX company_normalized IF NOT EXISTS FOR (c:Company) ON (c.normalized_name)",
    "CREATE INDEX politician_state IF NOT EXISTS FOR (p:Politician) ON (p.state)",
    "CREATE INDEX politician_party IF NOT EXISTS FOR (p:Politician) ON (p.party)",
]


def init_schema():
    """Initialize Neo4j schema with constraints and indexes."""
    conn = Neo4jConnection()
    conn.connect()

    for constraint in SCHEMA_CONSTRAINTS:
        try:
            conn.run(constraint)
            logger.info(f"Created constraint: {constraint[:50]}...")
        except Exception as e:
            logger.warning(f"Constraint may already exist: {e}")

    for index in SCHEMA_INDEXES:
        try:
            conn.run(index)
            logger.info(f"Created index: {index[:50]}...")
        except Exception as e:
            logger.warning(f"Index may already exist: {e}")

    logger.info("Neo4j schema initialization complete")
    return conn
