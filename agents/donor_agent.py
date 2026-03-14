"""Donor Intelligence Agent using LangGraph."""
from typing import Dict, Any, List, Optional
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, END
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Define state schema
class AgentState(BaseModel):
    query: str = Field(description="The user's query")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context")
    donor_data: Optional[Dict[str, Any]] = Field(default=None, description="Donor data from database")
    candidate_data: Optional[Dict[str, Any]] = Field(default=None, description="Candidate data from database")
    analysis: Optional[Dict[str, Any]] = Field(default=None, description="Analysis results")
    summary: str = Field(default="", description="Summary of findings")
    sources: List[str] = Field(default_factory=list, description="Data sources used")

class DonorIntelligenceAgent:
    """AI agent for donor intelligence analysis."""

    def __init__(self):
        # Initialize LLM
        self.llm = ChatAnthropic(
            model="claude-sonnet-4-6",
            temperature=0.1,
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )

        # Build the workflow graph
        self.workflow = self._build_workflow()

    def _build_workflow(self):
        """Build the LangGraph workflow."""
        workflow = StateGraph(AgentState)

        # Add nodes
        workflow.add_node("extract_entities", self._extract_entities)
        workflow.add_node("query_database", self._query_database)
        workflow.add_node("analyze_patterns", self._analyze_patterns)
        workflow.add_node("generate_summary", self._generate_summary)

        # Add edges
        workflow.set_entry_point("extract_entities")
        workflow.add_edge("extract_entities", "query_database")
        workflow.add_edge("query_database", "analyze_patterns")
        workflow.add_edge("analyze_patterns", "generate_summary")
        workflow.add_edge("generate_summary", END)

        return workflow.compile()

    async def _extract_entities(self, state: AgentState) -> Dict[str, Any]:
        """Extract entities from the query."""
        messages = [
            SystemMessage(content="""You are an expert in political finance and donor intelligence.
            Extract entities from the user's query that are relevant to campaign finance analysis.
            Focus on:
            1. Person names (politicians, donors)
            2. Organization names (companies, PACs, committees)
            3. Industries or sectors
            4. Political offices or positions
            5. Geographic locations (states, districts)

            Return a JSON object with the extracted entities."""),
            HumanMessage(content=state.query)
        ]

        response = await self.llm.ainvoke(messages)

        # Parse response (in production, use proper JSON parsing)
        entities = {
            "persons": [],
            "organizations": [],
            "industries": [],
            "offices": [],
            "locations": []
        }

        # This is a simplified implementation
        # In production, you'd use proper entity extraction
        query_lower = state.query.lower()

        # Simple keyword matching for demonstration
        if "senator" in query_lower or "senate" in query_lower:
            entities["offices"].append("senate")
        if "representative" in query_lower or "congress" in query_lower:
            entities["offices"].append("house")
        if "pac" in query_lower or "committee" in query_lower:
            entities["organizations"].append("political committee")

        return {"context": {"entities": entities}}

    async def _query_database(self, state: AgentState) -> Dict[str, Any]:
        """Query FEC API for real candidate and donor data."""
        import httpx

        entities = state.context.get("entities", {}) if state.context else {}
        fec_key = os.getenv("FEC_API_KEY", "DEMO_KEY")
        fec_base = "https://api.open.fec.gov/v1"

        donor_data = {}
        candidate_data = {}
        sources = []

        # Build search term from extracted entities or raw query
        persons = entities.get("persons", [])
        orgs = entities.get("organizations", [])
        search_term = " ".join(persons) if persons else " ".join(orgs) if orgs else state.query[:60]

        async with httpx.AsyncClient(timeout=12.0) as client:
            # Search FEC candidates
            try:
                resp = await client.get(
                    f"{fec_base}/candidates/search/",
                    params={"q": search_term, "api_key": fec_key, "per_page": 5, "sort": "-receipts"}
                )
                if resp.status_code == 200:
                    candidates = resp.json().get("results", [])
                    sources.append("FEC Candidates API")
                    candidate_details = []

                    for cand in candidates[:3]:
                        cand_info = {
                            "name": cand.get("name"),
                            "party": cand.get("party_full"),
                            "state": cand.get("state"),
                            "office": cand.get("office_full"),
                            "candidate_id": cand.get("candidate_id"),
                            "total_raised": 0,
                            "cash_on_hand": 0,
                        }
                        # Fetch financial totals for each candidate
                        try:
                            tot_resp = await client.get(
                                f"{fec_base}/candidate/{cand['candidate_id']}/totals/",
                                params={"api_key": fec_key}
                            )
                            if tot_resp.status_code == 200:
                                totals = tot_resp.json().get("results", [{}])
                                if totals:
                                    cand_info["total_raised"] = totals[0].get("receipts", 0)
                                    cand_info["cash_on_hand"] = totals[0].get("cash_on_hand", 0)
                        except Exception:
                            pass

                        candidate_details.append(cand_info)

                    if candidate_details:
                        candidate_data = {"candidates": candidate_details}
            except Exception as e:
                pass  # FEC unavailable — return empty, not fake data

            # Search FEC schedule_a for top donors by employer
            try:
                current_cycle = 2024 if 2026 % 2 == 0 else 2024  # current two-year period
                resp = await client.get(
                    f"{fec_base}/schedules/schedule_a/",
                    params={
                        "contributor_employer": search_term,
                        "api_key": fec_key,
                        "per_page": 20,
                        "sort": "-contribution_receipt_amount",
                        "two_year_transaction_period": current_cycle,
                    }
                )
                if resp.status_code == 200:
                    contributions = resp.json().get("results", [])
                    sources.append("FEC Schedule A (Contributions)")

                    # Aggregate by contributor
                    by_contributor: Dict[str, Any] = {}
                    for c in contributions:
                        name = c.get("contributor_name", "Unknown")
                        if not name or name == "Unknown":
                            continue
                        if name not in by_contributor:
                            by_contributor[name] = {
                                "name": name,
                                "employer": c.get("contributor_employer"),
                                "total_contributions": 0.0,
                                "top_recipients": [],
                            }
                        amount = float(c.get("contribution_receipt_amount") or 0)
                        by_contributor[name]["total_contributions"] += amount
                        candidate_info = c.get("candidate") or {}
                        if candidate_info.get("name"):
                            by_contributor[name]["top_recipients"].append({
                                "name": candidate_info.get("name"),
                                "amount": amount,
                                "party": candidate_info.get("party_full", "Unknown"),
                            })

                    if by_contributor:
                        donor_data = {"donors": list(by_contributor.values())[:10]}
            except Exception:
                pass  # FEC unavailable — return empty, not fake data

        return {
            "donor_data": donor_data,
            "candidate_data": candidate_data,
            "sources": sources if sources else ["FEC API (no data returned for query)"],
        }

    async def _analyze_patterns(self, state: AgentState) -> Dict[str, Any]:
        """Analyze patterns in the data."""
        donor_data = state.donor_data or {}
        candidate_data = state.candidate_data or {}

        # Simple pattern analysis
        analysis = {
            "total_funds": 0,
            "political_leaning": "neutral",
            "network_strength": "weak",
            "notable_patterns": [],
            "risk_factors": []
        }

        # Calculate total funds
        if candidate_data.get("candidates"):
            for candidate in candidate_data["candidates"]:
                analysis["total_funds"] += candidate.get("total_raised", 0)

        # Analyze political leaning
        if candidate_data.get("candidates"):
            parties = [c.get("party", "").lower() for c in candidate_data["candidates"]]
            dem_count = parties.count("democratic")
            rep_count = parties.count("republican")

            if dem_count > rep_count:
                analysis["political_leaning"] = "democratic"
            elif rep_count > dem_count:
                analysis["political_leaning"] = "republican"

        # Check for risk factors
        if donor_data.get("donors"):
            for donor in donor_data["donors"]:
                if donor.get("total_contributions", 0) > 100000:
                    analysis["risk_factors"].append(f"Large donor: {donor.get('name')}")

        # Check for notable patterns
        if candidate_data.get("candidates"):
            for candidate in candidate_data["candidates"]:
                top_donors = candidate.get("top_donors", [])
                if len(top_donors) > 0:
                    avg_donation = sum(d.get("amount", 0) for d in top_donors) / len(top_donors)
                    if avg_donation > 10000:
                        analysis["notable_patterns"].append(f"High average donation for {candidate.get('name')}")

        return {"analysis": analysis}

    async def _generate_summary(self, state: AgentState) -> Dict[str, Any]:
        """Generate a summary of the analysis."""
        analysis = state.analysis or {}

        # Generate summary based on analysis
        summary_parts = []

        if analysis.get("total_funds", 0) > 0:
            funds_formatted = f"${analysis['total_funds']:,}"
            summary_parts.append(f"Total political funds identified: {funds_formatted}")

        if analysis.get("political_leaning") != "neutral":
            summary_parts.append(f"Political leaning: {analysis['political_leaning']}")

        if analysis.get("notable_patterns"):
            patterns = ", ".join(analysis["notable_patterns"][:3])
            summary_parts.append(f"Notable patterns: {patterns}")

        if analysis.get("risk_factors"):
            risks = ", ".join(analysis["risk_factors"][:3])
            summary_parts.append(f"Risk factors: {risks}")

        summary = " ".join(summary_parts) if summary_parts else "No significant patterns detected."

        return {"summary": summary}

    async def analyze(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Main analysis method."""
        try:
            # Initialize state
            initial_state = AgentState(
                query=query,
                context=context
            )

            # Run the workflow
            result = await self.workflow.ainvoke(initial_state)

            return {
                "data": {
                    "donor_data": result.donor_data,
                    "candidate_data": result.candidate_data,
                    "analysis": result.analysis
                },
                "summary": result.summary,
                "sources": result.sources
            }

        except Exception as e:
            # Fallback to simple analysis if LangGraph fails
            return await self._simple_analysis(query, context)

    async def _simple_analysis(self, query: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Simple fallback analysis without LangGraph."""
        messages = [
            SystemMessage(content="""You are an expert in political finance and donor intelligence.
            Analyze the query and provide insights about potential donor networks, campaign finance patterns,
            and political influence. Focus on:
            1. Identifying potential entities (politicians, donors, organizations)
            2. Analyzing potential relationships and influence patterns
            3. Assessing campaign finance implications
            4. Identifying potential risk factors or notable patterns

            Provide a concise summary and key findings."""),
            HumanMessage(content=query)
        ]

        response = await self.llm.ainvoke(messages)

        return {
            "data": {
                "analysis": "AI-generated analysis based on query",
                "entities": ["Extracted from query"],
                "patterns": ["AI-identified patterns"]
            },
            "summary": response.content[:500],  # Limit summary length
            "sources": ["AI Analysis", "Public Knowledge Base"]
        }

# Example usage
if __name__ == "__main__":
    import asyncio

    async def test_agent():
        agent = DonorIntelligenceAgent()
        result = await agent.analyze("Analyze campaign finance for Senator from California")
        print("Summary:", result["summary"])
        print("Data keys:", result["data"].keys())

    asyncio.run(test_agent())
