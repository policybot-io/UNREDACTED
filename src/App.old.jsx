import { useState, useEffect, useRef, useCallback } from "react";
import {
  queryAgent,
  fetchContracts,
  fetchSpendingNews,
  searchCandidates,
  getCandidateTotals,
  getCandidateContributions,
  searchCommittees,
  getCommitteeReceipts,
  getTopDonorsByEmployer,
  getDonorNetwork,
  getIndustryContributions,
  compareCandidates,
  getPACSpending,
  formatCurrency,
  formatDate,
  getPartyColor,
} from "./api/client.js";

const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { id: "agent", label: "AI Intel", icon: "◈" },
  { id: "spending", label: "Spending", icon: "◎" },
  { id: "politicians", label: "Politicians", icon: "◉" },
  { id: "donors", label: "Donors", icon: "◆" },
  { id: "graph", label: "Entity Graph", icon: "⬡" },
];

const CHAT_MESSAGES = [
  {
    role: "user",
    text: "Which defense companies donated to members of the Senate Armed Services Committee, then received sole-source contracts in the same fiscal year?",
  },
  {
    role: "ai",
    text: null,
    structured: {
      summary: "I found 14 companies matching this pattern across FY2022–2024. Here are the most significant:",
      findings: [
        { company: "Northrop Grumman", pattern: "PAC → Committee → Sole-source contract", spendingAmount: "$8.7B", riskScore: 88, confidence: "HIGH" },
        { company: "Raytheon Technologies", pattern: "PAC → 5 committee members → Contract", spendingAmount: "$5.1B", riskScore: 82, confidence: "HIGH" },
        { company: "L3Harris Technologies", pattern: "PAC → 2 committee members → Contract", spendingAmount: "$2.3B", riskScore: 71, confidence: "MED" },
      ],
      sources: ["USASpending.gov", "FEC Schedule B", "OpenSecrets", "DoD Procurement Records"],
      inference: "Pattern detected: donation → committee oversight → contract award within 11 months avg",
    },
  },
];

// Fallback feed items — match the full RSS schema (source, detail, url, type, text, time, risk)
// Shown while live RSS is loading or if the backend is unreachable
const FEED_ITEMS = [
  {
    type: "AUDIT",
    source: "GAO",
    text: "GAO: DoD Sole-Source Contracts — Billions Awarded Without Competition",
    detail: "GAO found that sole-source justifications lacked required documentation in 34% of reviewed awards.",
    time: "loading…",
    risk: "HIGH",
    url: "https://www.gao.gov/reports-testimonies",
  },
  {
    type: "BUDGET",
    source: "CBO",
    text: "CBO: Federal Discretionary Spending Exceeds FY2024 Appropriations by $180B",
    detail: "New CBO analysis projects a $180 billion gap between enacted appropriations and projected outlays.",
    time: "loading…",
    risk: "HIGH",
    url: "https://www.cbo.gov/publications",
  },
  {
    type: "RULE",
    source: "FedReg",
    text: "Federal Register: Proposed Rule — Government Procurement Threshold Raised to $500K",
    detail: "Proposed amendment to FAR Part 13 would raise the simplified acquisition threshold, reducing competition requirements.",
    time: "loading…",
    risk: "MED",
    url: "https://www.federalregister.gov/documents/search?conditions%5Btopics%5D%5B%5D=government-procurement",
  },
  {
    type: "FINANCE",
    source: "Treasury",
    text: "Treasury: U.S. Debt Ceiling Suspension Expires — Extraordinary Measures Now in Effect",
    detail: "Treasury Department has begun deploying extraordinary measures to avoid default as debt ceiling suspension expires.",
    time: "loading…",
    risk: "HIGH",
    url: "https://home.treasury.gov/news/press-releases",
  },
  {
    type: "BUDGET",
    source: "OMB",
    text: "OMB Issues Guidance on FY2025 Continuing Resolution Spending Restrictions",
    detail: "New OMB memorandum outlines agency spending restrictions during continuing resolution period.",
    time: "loading…",
    risk: "MED",
    url: "https://www.whitehouse.gov/omb/information-for-agencies/memoranda/",
  },
  {
    type: "AUDIT",
    source: "GAO",
    text: "GAO: Improper Payments Across Federal Programs Totaled $236B in FY2023",
    detail: "Annual GAO report identifies Medicare, Medicaid, and EITC as top sources of improper federal payments.",
    time: "loading…",
    risk: "HIGH",
    url: "https://www.gao.gov/reports-testimonies",
  },
];

const STATIC_KPIS = [
  { label: "STOCK Act Violations", value: "34", change: "12 new", up: true, sub: "pending DOJ review" },
  { label: "Nat'l Corruption Index", value: "61/100", change: "↓ 3 pts", up: false, sub: "higher = more corrupt" },
];

const POLITICIANS = [
  { name: "Sen. Robert Hughes", party: "R", state: "TX", score: 28, donors: "$4.2M", topIndustry: "Defense", trades: 12, conflicts: 3 },
  { name: "Rep. Diana Marsh", party: "D", state: "CA", score: 71, donors: "$1.8M", topIndustry: "Tech", trades: 2, conflicts: 0 },
  { name: "Sen. Craig Whitfield", party: "R", state: "FL", score: 19, donors: "$6.1M", topIndustry: "Finance", trades: 28, conflicts: 7 },
  { name: "Rep. Sandra Torres", party: "D", state: "NY", score: 84, donors: "$920K", topIndustry: "Labor", trades: 0, conflicts: 0 },
  { name: "Sen. Michael Pratt", party: "I", state: "VT", score: 91, donors: "$340K", topIndustry: "Small Biz", trades: 1, conflicts: 0 },
];

const DONOR_INDUSTRIES = [
  { name: "Defense & Aerospace", amount: 847, pct: 84, color: "#E63946" },
  { name: "Finance & Banking", amount: 612, pct: 61, color: "#F4A261" },
  { name: "Pharmaceuticals", amount: 498, pct: 49, color: "#E9C46A" },
  { name: "Energy & Fossil Fuels", amount: 441, pct: 44, color: "#2A9D8F" },
  { name: "Technology", amount: 389, pct: 38, color: "#457B9D" },
  { name: "Agriculture & Agribusiness", amount: 267, pct: 26, color: "#6A4C93" },
];


const GRAPH_NODES = [
  { id: 1, label: "Raytheon", type: "COMPANY", x: 320, y: 200, score: 34 },
  { id: 2, label: "Sen. Hughes", type: "POLITICIAN", x: 160, y: 120, score: 28 },
  { id: 3, label: "Armed Services\nCommittee", type: "COMMITTEE", x: 160, y: 300, score: null },
  { id: 4, label: "DoD / Air Force", type: "AGENCY", x: 320, y: 360, score: null },
  { id: 5, label: "RaytheonPAC", type: "PAC", x: 480, y: 120, score: null },
  { id: 6, label: "F-35 Contract\n$5.1B", type: "CONTRACT", x: 480, y: 360, score: null },
  { id: 7, label: "Former AF General\nNow Raytheon VP", type: "PERSON", x: 320, y: 80, score: null },
];

const GRAPH_EDGES = [
  { from: 5, to: 2, label: "$2.8M PAC", color: "#E63946" },
  { from: 2, to: 3, label: "Sits on", color: "#888" },
  { from: 3, to: 4, label: "Oversees", color: "#888" },
  { from: 4, to: 6, label: "Awarded", color: "#F4A261" },
  { from: 6, to: 1, label: "Recipient", color: "#2A9D8F" },
  { from: 1, to: 5, label: "Controls", color: "#6A4C93" },
  { from: 7, to: 4, label: "Former role", color: "#888" },
  { from: 7, to: 1, label: "Now employed", color: "#E63946" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDollar(amount) {
  if (!amount && amount !== 0) return "N/A";
  const n = parseFloat(amount);
  if (isNaN(n)) return "N/A";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function amountColor(amount) {
  const n = parseFloat(amount);
  if (isNaN(n)) return "#888";
  if (n >= 1e9) return "#E63946";
  if (n >= 1e8) return "#F4A261";
  return "#F0EDE8";
}

function ScoreBadge({ score }) {
  const color = score >= 70 ? "#2A9D8F" : score >= 40 ? "#F4A261" : "#E63946";
  const label = score >= 70 ? "CLEAN" : score >= 40 ? "WATCH" : "HIGH RISK";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color,
        fontWeight: 700,
      }}>{score}</div>
      <span style={{ fontSize: 9, color, fontFamily: "monospace", letterSpacing: 1 }}>{label}</span>
    </div>
  );
}

function RiskBadge({ level }) {
  const colors = { HIGH: "#E63946", MED: "#F4A261", LOW: "#2A9D8F" };
  return (
    <span style={{
      padding: "2px 6px", borderRadius: 2, fontSize: 9, fontWeight: 700,
      background: (colors[level] || "#888") + "22", color: colors[level] || "#888",
      fontFamily: "monospace", letterSpacing: 1,
    }}>{level}</span>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 10 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 6, height: 6, background: "#E63946", borderRadius: "50%", animation: `pulse ${0.8 + i * 0.15}s infinite alternate` }} />
      ))}
    </div>
  );
}

function Ticker() {
  const [offset, setOffset] = useState(0);
  const items = ["● FEC FILING: $12M dark money Q1 2025", "● STOCK ACT: 3 new potential violations detected", "● CONTRACT: $4.2B DoD award — sole source justification filed", "● RULE: FTC antitrust rulemaking comment period closes in 4 days", "● DONOR: Top 5 defense PACs collectively donated $18M this cycle"];
  const text = items.join("     ");

  useEffect(() => {
    const interval = setInterval(() => setOffset(o => (o + 1) % (text.length * 8)), 40);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ background: "#E6394611", borderTop: "1px solid #E6394633", padding: "6px 20px", overflow: "hidden" }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#E63946", whiteSpace: "nowrap", transform: `translateX(-${offset}px)`, transition: "transform 0.04s linear" }}>
        {text + "     " + text}
      </div>
    </div>
  );
}

// ── Source Badge ──────────────────────────────────────────────────────────────

const SOURCE_COLORS = {
  GAO:      { bg: "#457B9D22", border: "#457B9D66", text: "#457B9D" },
  CBO:      { bg: "#6A4C9322", border: "#6A4C9366", text: "#6A4C93" },
  FedReg:   { bg: "#2A9D8F22", border: "#2A9D8F66", text: "#2A9D8F" },
  Treasury: { bg: "#E9C46A22", border: "#E9C46A66", text: "#E9C46A" },
  OMB:      { bg: "#F4A26122", border: "#F4A26166", text: "#F4A261" },
};

function SourceBadge({ source }) {
  const c = SOURCE_COLORS[source] || { bg: "#33333322", border: "#55555566", text: "#888" };
  return (
    <span style={{
      padding: "1px 5px", borderRadius: 2, fontSize: 8, fontWeight: 700,
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      fontFamily: "monospace", letterSpacing: 1,
    }}>{source}</span>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard() {
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fiscalYear, setFiscalYear] = useState(null);

  // RSS feed state
  const [feedItems, setFeedItems] = useState(FEED_ITEMS);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState(null);
  const [feedLastUpdated, setFeedLastUpdated] = useState(null);
  const [feedCached, setFeedCached] = useState(false);

  // Fetch contracts on mount
  useEffect(() => {
    fetchContracts({ limit: 50 })
      .then(res => {
        if (res.success) {
          setContracts(res.data || []);
          setFiscalYear(res.fiscalYear);
        } else {
          setError("Failed to load contract data");
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Fetch RSS feed + auto-refresh every 5 minutes
  useEffect(() => {
    const loadFeed = () => {
      setFeedLoading(true);
      setFeedError(null);
      fetchSpendingNews(14)
        .then(res => {
          if (res.success && res.items?.length > 0) {
            setFeedItems(res.items);
            setFeedLastUpdated(res.fetchedAt ? new Date(res.fetchedAt) : new Date());
            setFeedCached(res.cached || false);
          } else {
            // Keep static fallback silently
            setFeedLastUpdated(new Date());
          }
        })
        .catch(e => {
          setFeedError(e.message);
          // Fall back to static FEED_ITEMS on error — already set as default state
        })
        .finally(() => setFeedLoading(false));
    };

    loadFeed();
    const interval = setInterval(loadFeed, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, []);

  const totalSpend = contracts.reduce((sum, c) => sum + parseFloat(c["Award Amount"] || 0), 0);
  const flagged = contracts.filter(c => parseFloat(c["Award Amount"] || 0) >= 5e8).length;

  const dynamicKPIs = [
    {
      label: fiscalYear ? `FY${fiscalYear} Contracts Loaded` : "Contracts Loaded",
      value: loading ? "…" : error ? "ERR" : contracts.length.toLocaleString(),
      change: loading ? "fetching…" : error ? "API error" : `+${flagged} >$500M`,
      up: true,
      sub: loading ? "loading from USASpending.gov" : "from USASpending.gov (live)",
    },
    {
      label: "Total Contract Spend",
      value: loading ? "…" : error ? "ERR" : formatDollar(totalSpend),
      change: loading ? "calculating…" : `across ${contracts.length} awards`,
      up: true,
      sub: loading ? "" : fiscalYear ? `FY${fiscalYear} · top 50 by amount` : "top 50 by amount",
    },
    ...STATIC_KPIS,
  ];

  const feedUpdatedLabel = feedLastUpdated
    ? feedLastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {dynamicKPIs.map((kpi, i) => (
          <div key={i} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>{kpi.label.toUpperCase()}</div>
            {loading && i < 2 ? (
              <Spinner />
            ) : (
              <>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#F0EDE8", marginBottom: 4 }}>{kpi.value}</div>
                <div style={{ fontFamily: "monospace", fontSize: 11, color: kpi.up ? "#E63946" : "#2A9D8F" }}>{kpi.change}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#444", marginTop: 4 }}>{kpi.sub}</div>
              </>
            )}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ background: "#E6394611", border: "1px solid #E6394644", borderRadius: 4, padding: "12px 16px", fontFamily: "monospace", fontSize: 11, color: "#E63946" }}>
          ⚠ Dashboard data error: {error} — static values shown below
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
        {/* Industry donor chart */}
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 16 }}>▲ INDUSTRY DONOR INFLUENCE — FY2024 ($M PAC CONTRIBUTIONS)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DONOR_INDUSTRIES.map((ind, i) => (
              <div key={i}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#CCC" }}>{ind.name}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: ind.color }}>${ind.amount}M</span>
                </div>
                <div style={{ background: "#111", height: 6, borderRadius: 1 }}>
                  <div style={{ background: ind.color, height: "100%", width: `${ind.pct}%`, borderRadius: 1, transition: "width 1s ease" }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Live Intelligence Feed ── */}
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Panel header */}
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid #1E1E1E", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%",
                background: feedLoading ? "#555" : feedError ? "#E63946" : "#E63946",
                boxShadow: feedLoading || feedError ? "none" : "0 0 6px #E63946",
                animation: (!feedLoading && !feedError) ? "pulse 2s infinite alternate" : "none",
              }} />
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>
                ◈ LIVE INTELLIGENCE FEED
              </span>
            </div>
            <div style={{ display: "flex", align: "center", gap: 6 }}>
              {feedLoading && <span style={{ fontFamily: "monospace", fontSize: 8, color: "#555" }}>FETCHING…</span>}
              {feedCached && !feedLoading && <span style={{ fontFamily: "monospace", fontSize: 8, color: "#333" }}>CACHED</span>}
              {feedUpdatedLabel && !feedLoading && (
                <span style={{ fontFamily: "monospace", fontSize: 8, color: "#3A3A3A" }}>↻ {feedUpdatedLabel}</span>
              )}
            </div>
          </div>

          {/* Source attribution row */}
          <div style={{ padding: "6px 16px", borderBottom: "1px solid #1A1A1A", display: "flex", gap: 4, flexWrap: "wrap", flexShrink: 0, background: "#111" }}>
            {["GAO", "CBO", "FedReg", "Treasury", "OMB"].map(src => (
              <SourceBadge key={src} source={src} />
            ))}
          </div>

          {/* Feed error banner */}
          {feedError && (
            <div style={{ padding: "6px 16px", background: "#E6394608", borderBottom: "1px solid #E6394622", fontFamily: "monospace", fontSize: 9, color: "#E63946", flexShrink: 0 }}>
              ⚠ Live feed unavailable — showing fallback data
            </div>
          )}

          {/* Scrollable feed list */}
          <div style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 0",
            minHeight: 0,
            maxHeight: 420,
          }}>
            {feedLoading && feedItems === FEED_ITEMS ? (
              <div style={{ padding: "16px 16px" }}><Spinner /></div>
            ) : (
              feedItems.map((item, i) => {
                const riskColor = item.risk === "HIGH" ? "#E63946" : item.risk === "MED" ? "#F4A261" : "#2A9D8F";
                const isClickable = !!item.url;
                return (
                  <div
                    key={i}
                    style={{
                      display: "block",
                      padding: "8px 16px",
                      borderLeft: `3px solid ${riskColor}`,
                      marginBottom: 2,
                      background: "transparent",
                    }}
                  >
                    {/* Clickable headline title */}
                    {isClickable ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline",
                          fontFamily: "monospace",
                          fontSize: 10,
                          color: "#D0CCC6",
                          lineHeight: 1.45,
                          textDecoration: "none",
                          cursor: "pointer",
                          borderBottom: "1px solid transparent",
                          transition: "color 0.12s, border-bottom-color 0.12s",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.color = "#F0EDE8";
                          e.currentTarget.style.borderBottomColor = "#E6394688";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.color = "#D0CCC6";
                          e.currentTarget.style.borderBottomColor = "transparent";
                        }}
                      >
                        {item.text}
                        <span style={{ marginLeft: 4, fontSize: 8, color: "#E6394699", fontFamily: "monospace", verticalAlign: "middle" }}>↗</span>
                      </a>
                    ) : (
                      <div style={{ fontFamily: "monospace", fontSize: 10, color: "#D0CCC6", lineHeight: 1.45 }}>
                        {item.text}
                      </div>
                    )}

                    {/* Detail / summary if present */}
                    {item.detail && (
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", lineHeight: 1.4, marginTop: 4, marginBottom: 4 }}>
                        {item.detail}
                      </div>
                    )}

                    {/* Meta row: time · risk · source */}
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 5 }}>
                      <span style={{ fontFamily: "monospace", fontSize: 8, color: "#3A3A3A" }}>{item.time}</span>
                      <RiskBadge level={item.risk} />
                      {item.source && <SourceBadge source={item.source} />}
                      {item.type && !item.source && (
                        <span style={{ fontFamily: "monospace", fontSize: 8, color: "#444", letterSpacing: 1 }}>{item.type}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 16px", borderTop: "1px solid #1E1E1E", flexShrink: 0, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111" }}>
            <span style={{ fontFamily: "monospace", fontSize: 8, color: "#333" }}>
              GAO · CBO · Federal Register · Treasury · OMB
            </span>
            <span style={{ fontFamily: "monospace", fontSize: 8, color: "#2A2A2A" }}>
              AUTO-REFRESH 5m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Spending Module ───────────────────────────────────────────────────────────

function SpendingModule() {
  const [keyword, setKeyword] = useState("");
  const [inputVal, setInputVal] = useState("");
  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = (kw) => {
    setLoading(true);
    setError(null);
    fetchContracts({ keyword: kw || undefined, limit: 25 })
      .then(res => {
        if (res.success) setContracts(res.data || []);
        else setError("Failed to load contract data");
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(""); }, []);

  const handleSearch = () => {
    setKeyword(inputVal);
    load(inputVal);
  };

  const topRecipients = [...contracts]
    .sort((a, b) => parseFloat(b["Award Amount"] || 0) - parseFloat(a["Award Amount"] || 0))
    .slice(0, 6);

  const maxAmount = topRecipients.length ? parseFloat(topRecipients[0]["Award Amount"] || 1) : 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Search bar */}
      <div style={{ display: "flex", gap: 10 }}>
        <input
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSearch()}
          placeholder="Search contractors, agencies, keywords… (e.g. Lockheed, defense, energy)"
          style={{ flex: 1, background: "#1A1A1A", border: "1px solid #333", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", outline: "none" }}
        />
        <button onClick={handleSearch} style={{ background: "#E63946", border: "none", borderRadius: 2, padding: "10px 20px", fontFamily: "monospace", fontSize: 12, color: "#fff", cursor: "pointer", fontWeight: 700, whiteSpace: "nowrap" }}>
          SEARCH
        </button>
        {keyword && (
          <button onClick={() => { setInputVal(""); setKeyword(""); load(""); }} style={{ background: "#222", border: "1px solid #333", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#888", cursor: "pointer" }}>
            CLEAR
          </button>
        )}
      </div>

      {/* Top contractors bar chart */}
      {!loading && !error && topRecipients.length > 0 && (
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20 }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 14 }}>
            ▲ TOP CONTRACTORS{keyword ? ` — "${keyword.toUpperCase()}"` : " — ALL"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {topRecipients.map((c, i) => {
              const amt = parseFloat(c["Award Amount"] || 0);
              const pct = (amt / maxAmount) * 100;
              return (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 11, color: "#CCC" }}>{(c["Recipient Name"] || "Unknown").slice(0, 40)}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: amountColor(amt) }}>{formatDollar(amt)}</span>
                  </div>
                  <div style={{ background: "#111", height: 5, borderRadius: 1 }}>
                    <div style={{ background: amountColor(amt), height: "100%", width: `${pct}%`, borderRadius: 1, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status / error */}
      {error && (
        <div style={{ background: "#E6394611", border: "1px solid #E6394644", borderRadius: 4, padding: "12px 16px", fontFamily: "monospace", fontSize: 11, color: "#E63946" }}>
          ⚠ {error}
          <button onClick={() => load(keyword)} style={{ marginLeft: 12, background: "none", border: "1px solid #E63946", borderRadius: 2, padding: "2px 10px", color: "#E63946", cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>RETRY</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #2A2A2A", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>
          ◎ FEDERAL CONTRACTS — USASPENDING.GOV {loading ? "(loading…)" : `(${contracts.length} results${keyword ? ` for "${keyword}"` : ""})`}
        </div>

        {loading ? (
          <div style={{ padding: 20 }}><Spinner /></div>
        ) : contracts.length === 0 ? (
          <div style={{ padding: 24, fontFamily: "monospace", fontSize: 12, color: "#444", textAlign: "center" }}>
            No contracts found{keyword ? ` for "${keyword}"` : ""}. Try a different search term.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#111" }}>
                  {["Recipient", "Amount", "Agency", "Date", "Description"].map(h => (
                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: 1, borderBottom: "1px solid #222", whiteSpace: "nowrap" }}>{h.toUpperCase()}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contracts.map((c, i) => {
                  const amt = parseFloat(c["Award Amount"] || 0);
                  return (
                    <tr key={i} style={{ borderBottom: "1px solid #1E1E1E", background: i % 2 === 0 ? "transparent" : "#111" }}>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 11, color: "#F0EDE8", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c["Recipient Name"] || "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: amountColor(amt), whiteSpace: "nowrap" }}>{formatDollar(amt)}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 10, color: "#888", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c["Awarding Agency"] || "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 10, color: "#666", whiteSpace: "nowrap" }}>{c["Award Date"] || "—"}</td>
                      <td style={{ padding: "10px 14px", fontFamily: "monospace", fontSize: 10, color: "#555", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(c["Description"] || "—").slice(0, 80)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Politician Module (Phase 2 — Live FEC Data) ──────────────────────────────

function PoliticianModule() {
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("smith");
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [contributions, setContributions] = useState([]);
  const [totals, setTotals] = useState(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState(null);
  const [officeFilter, setOfficeFilter] = useState("");

  // Load candidates on search
  const loadCandidates = useCallback((name, office) => {
    if (!name.trim()) return;
    setLoadingList(true);
    setError(null);
    setSelectedCandidate(null);
    setContributions([]);
    setTotals(null);
    searchCandidates({ name, office: office || undefined, limit: 15 })
      .then(res => {
        const list = res.data || res || [];
        setCandidates(list);
        if (list.length > 0) loadCandidateDetail(list[0]);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingList(false));
  }, []);

  const loadCandidateDetail = async (candidate) => {
    setSelectedCandidate(candidate);
    setLoadingDetail(true);
    setContributions([]);
    setTotals(null);
    try {
      const [totalsRes, contribRes] = await Promise.all([
        getCandidateTotals(candidate.candidate_id).catch(() => ({ data: null })),
        getCandidateContributions(candidate.candidate_id, 20, 500).catch(() => ({ data: [] })),
      ]);
      setTotals(totalsRes.data || totalsRes);
      setContributions(contribRes.data || contribRes || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  useEffect(() => { loadCandidates("smith", ""); }, []);

  const handleSearch = () => {
    setSearchQuery(searchInput);
    loadCandidates(searchInput, officeFilter);
  };

  const partyLabel = (p) => {
    const up = (p || "").toUpperCase();
    if (up.includes("DEM")) return "D";
    if (up.includes("REP")) return "R";
    if (up.includes("IND") || up.includes("NP")) return "I";
    return p?.slice(0, 1) || "?";
  };

  const partyFullLabel = (p) => {
    const up = (p || "").toUpperCase();
    if (up.includes("DEM")) return "Democrat";
    if (up.includes("REP")) return "Republican";
    if (up.includes("IND")) return "Independent";
    return p || "Unknown";
  };

  const totalRaised = totals?.receipts || totals?.individual_itemized_contributions || 0;
  const cashOnHand = totals?.cash_on_hand_end_period || 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, height: "calc(100vh - 200px)" }}>
      {/* LEFT: search + candidate list */}
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Search */}
        <div style={{ padding: "12px 14px", borderBottom: "1px solid #2A2A2A" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 10 }}>◉ CANDIDATE SEARCH — FEC</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder="Search by name…"
              style={{ flex: 1, background: "#111", border: "1px solid #2A2A2A", borderRadius: 2, padding: "7px 10px", fontFamily: "monospace", fontSize: 11, color: "#F0EDE8", outline: "none" }}
            />
            <button onClick={handleSearch} style={{ background: "#E63946", border: "none", borderRadius: 2, padding: "7px 12px", fontFamily: "monospace", fontSize: 10, color: "#fff", cursor: "pointer", fontWeight: 700 }}>GO</button>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {["", "H", "S", "P"].map(o => (
              <button key={o} onClick={() => { setOfficeFilter(o); loadCandidates(searchInput || searchQuery, o); }}
                style={{ flex: 1, background: officeFilter === o ? "#E6394622" : "#111", border: `1px solid ${officeFilter === o ? "#E63946" : "#2A2A2A"}`, borderRadius: 2, padding: "4px 0", fontFamily: "monospace", fontSize: 9, color: officeFilter === o ? "#E63946" : "#555", cursor: "pointer" }}>
                {o === "" ? "ALL" : o === "H" ? "HOUSE" : o === "S" ? "SENATE" : "PRES"}
              </button>
            ))}
          </div>
        </div>

        {/* Candidate list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loadingList ? (
            <div style={{ padding: 16 }}><Spinner /></div>
          ) : candidates.length === 0 ? (
            <div style={{ padding: 20, fontFamily: "monospace", fontSize: 11, color: "#444", textAlign: "center" }}>No candidates found. Try a different search.</div>
          ) : (
            candidates.map((c, i) => {
              const isSelected = selectedCandidate?.candidate_id === c.candidate_id;
              const party = partyLabel(c.party_full || c.party);
              const pColor = party === "D" ? "#457B9D" : party === "R" ? "#E63946" : "#888";
              return (
                <div key={i} onClick={() => loadCandidateDetail(c)} style={{
                  padding: "12px 14px", borderBottom: "1px solid #1A1A1A", cursor: "pointer",
                  background: isSelected ? "#222" : "transparent",
                  borderLeft: `3px solid ${isSelected ? "#E63946" : "transparent"}`,
                  transition: "all 0.12s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#F0EDE8", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555" }}>{c.office_full || c.office} · {c.state}{c.district ? `-${c.district}` : ""}</div>
                    </div>
                    <span style={{ marginLeft: 8, padding: "1px 5px", background: pColor + "22", border: `1px solid ${pColor}55`, borderRadius: 2, fontFamily: "monospace", fontSize: 9, color: pColor, fontWeight: 700, flexShrink: 0 }}>{party}</span>
                  </div>
                  {c.election_years && (
                    <div style={{ fontFamily: "monospace", fontSize: 8, color: "#3A3A3A", marginTop: 4 }}>Cycle: {c.election_years?.slice(-1)[0]}</div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding: "8px 14px", borderTop: "1px solid #1E1E1E", background: "#111", fontFamily: "monospace", fontSize: 8, color: "#333" }}>
          SOURCE: FEC.GOV CANDIDATE MASTER · LIVE DATA
        </div>
      </div>

      {/* RIGHT: candidate detail */}
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!selectedCandidate ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 12, color: "#333" }}>
            Select a candidate to view donor intelligence
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ padding: "18px 20px", borderBottom: "1px solid #2A2A2A", background: "#111" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#F0EDE8", marginBottom: 4 }}>{selectedCandidate.name}</div>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#666" }}>
                    {partyFullLabel(selectedCandidate.party_full || selectedCandidate.party)} ·{" "}
                    {selectedCandidate.state}{selectedCandidate.district ? `-${selectedCandidate.district}` : ""} ·{" "}
                    {selectedCandidate.office_full || selectedCandidate.office}
                    {selectedCandidate.incumbent_challenge_full ? ` · ${selectedCandidate.incumbent_challenge_full}` : ""}
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: "#3A3A3A", marginTop: 4 }}>ID: {selectedCandidate.candidate_id}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", marginBottom: 4 }}>CYCLE</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: "#F0EDE8" }}>{selectedCandidate.election_years?.slice(-1)[0] || "—"}</div>
                </div>
              </div>
            </div>

            {/* Finance KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, borderBottom: "1px solid #2A2A2A" }}>
              {[
                { label: "Total Raised", value: loadingDetail ? "…" : formatDollar(totalRaised), color: "#F4A261" },
                { label: "Cash on Hand", value: loadingDetail ? "…" : formatDollar(cashOnHand), color: "#2A9D8F" },
                { label: "Top Contributions", value: loadingDetail ? "…" : contributions.length > 0 ? `${contributions.length} found` : "—", color: "#457B9D" },
                { label: "Min. Amount Shown", value: "$500+", color: "#888" },
              ].map((kpi, i) => (
                <div key={i} style={{ background: "#111", padding: "12px 16px" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 9, color: "#444", letterSpacing: 1, marginBottom: 6 }}>{kpi.label.toUpperCase()}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 16, color: kpi.color }}>{kpi.value}</div>
                </div>
              ))}
            </div>

            {/* Contributions list */}
            <div style={{ flex: 1, overflowY: "auto", padding: "0 0 16px" }}>
              <div style={{ padding: "12px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>
                ◆ TOP CONTRIBUTORS — LIVE FROM FEC
              </div>

              {loadingDetail ? (
                <div style={{ padding: "8px 16px" }}><Spinner /></div>
              ) : contributions.length === 0 ? (
                <div style={{ padding: "16px 20px", fontFamily: "monospace", fontSize: 11, color: "#3A3A3A" }}>
                  No itemized contributions found above threshold. This candidate may have limited FEC filings for this cycle.
                </div>
              ) : (
                <>
                  {/* Bar chart of top 8 donors */}
                  {contributions.slice(0, 8).length > 1 && (() => {
                    const maxAmt = Math.max(...contributions.slice(0, 8).map(c => parseFloat(c.contribution_receipt_amount || 0)));
                    return (
                      <div style={{ padding: "0 16px 12px", borderBottom: "1px solid #1E1E1E" }}>
                        {contributions.slice(0, 8).map((c, i) => {
                          const amt = parseFloat(c.contribution_receipt_amount || 0);
                          const pct = maxAmt > 0 ? (amt / maxAmt) * 100 : 0;
                          return (
                            <div key={i} style={{ marginBottom: 6 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#888", maxWidth: "60%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {c.contributor_name || "Anonymous"}
                                  {c.contributor_employer ? <span style={{ color: "#555" }}> · {c.contributor_employer.slice(0, 20)}</span> : ""}
                                </span>
                                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#F4A261" }}>{formatDollar(amt)}</span>
                              </div>
                              <div style={{ background: "#0D0D0D", height: 3, borderRadius: 1 }}>
                                <div style={{ background: "#F4A261", height: "100%", width: `${pct}%`, borderRadius: 1, transition: "width 0.5s ease" }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {/* Full table */}
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#0D0D0D" }}>
                        {["Contributor", "Employer", "Amount", "Date", "State"].map(h => (
                          <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontFamily: "monospace", fontSize: 8, color: "#444", letterSpacing: 1, borderBottom: "1px solid #1A1A1A" }}>{h.toUpperCase()}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {contributions.map((c, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #141414", background: i % 2 === 0 ? "transparent" : "#111" }}>
                          <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 10, color: "#DDD", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.contributor_name || "—"}</td>
                          <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 10, color: "#666", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.contributor_employer || "—"}</td>
                          <td style={{ padding: "8px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#F4A261", whiteSpace: "nowrap" }}>{formatDollar(c.contribution_receipt_amount)}</td>
                          <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#555", whiteSpace: "nowrap" }}>{c.contribution_receipt_date ? new Date(c.contribution_receipt_date).toLocaleDateString() : "—"}</td>
                          <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#444" }}>{c.contributor_state || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: "8px 16px", borderTop: "1px solid #1E1E1E", background: "#111", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: "monospace", fontSize: 8, color: "#2A2A2A" }}>DATA SOURCE: FEC.GOV — LIVE API · NOT A LEGAL CONCLUSION</span>
              {error && <span style={{ fontFamily: "monospace", fontSize: 8, color: "#E63946" }}>⚠ {error}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Donor Intelligence Module (Phase 2) ──────────────────────────────────────

function DonorModule() {
  const [view, setView] = useState("search"); // "search" | "employer" | "industry"
  const [searchInput, setSearchInput] = useState("");
  const [employerInput, setEmployerInput] = useState("");
  const [industryInput, setIndustryInput] = useState("");

  // Committee search state
  const [committees, setCommittees] = useState([]);
  const [selectedCommittee, setSelectedCommittee] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loadingCommittees, setLoadingCommittees] = useState(false);
  const [loadingReceipts, setLoadingReceipts] = useState(false);

  // Employer donor state
  const [employerDonors, setEmployerDonors] = useState([]);
  const [loadingEmployer, setLoadingEmployer] = useState(false);

  // Industry contribution state
  const [industryContribs, setIndustryContribs] = useState([]);
  const [loadingIndustry, setLoadingIndustry] = useState(false);

  const [error, setError] = useState(null);

  const handleCommitteeSearch = async () => {
    if (!searchInput.trim()) return;
    setLoadingCommittees(true);
    setSelectedCommittee(null);
    setReceipts([]);
    setError(null);
    try {
      const res = await searchCommittees(searchInput, 12);
      setCommittees(res.data || res || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingCommittees(false);
    }
  };

  const handleSelectCommittee = async (committee) => {
    setSelectedCommittee(committee);
    setLoadingReceipts(true);
    setReceipts([]);
    try {
      const res = await getCommitteeReceipts(committee.committee_id || committee.id, 25);
      setReceipts(res.data || res || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingReceipts(false);
    }
  };

  const handleEmployerSearch = async () => {
    if (!employerInput.trim()) return;
    setLoadingEmployer(true);
    setError(null);
    try {
      const res = await getTopDonorsByEmployer(employerInput, 20);
      setEmployerDonors(res.data || res || []);
    } catch (e) {
      setError(e.message);
      setEmployerDonors([]);
    } finally {
      setLoadingEmployer(false);
    }
  };

  const handleIndustrySearch = async () => {
    if (!industryInput.trim()) return;
    setLoadingIndustry(true);
    setError(null);
    try {
      const keywords = industryInput.split(",").map(k => k.trim()).filter(Boolean);
      const res = await getIndustryContributions(keywords, 30);
      setIndustryContribs(res.data || res || []);
    } catch (e) {
      setError(e.message);
      setIndustryContribs([]);
    } finally {
      setLoadingIndustry(false);
    }
  };

  const INDUSTRY_PRESETS = ["defense,aerospace", "pharma,healthcare", "finance,banking", "technology,software", "energy,oil,gas", "agriculture,agribusiness"];

  const viewBtn = (id, label) => (
    <button onClick={() => setView(id)} style={{
      background: view === id ? "#E6394622" : "#111",
      border: `1px solid ${view === id ? "#E63946" : "#2A2A2A"}`,
      borderRadius: 2, padding: "7px 14px",
      fontFamily: "monospace", fontSize: 10,
      color: view === id ? "#E63946" : "#555",
      cursor: "pointer", fontWeight: view === id ? 700 : 400,
    }}>{label}</button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* View toggle */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {viewBtn("search", "◆ COMMITTEE SEARCH")}
        {viewBtn("employer", "◎ BY EMPLOYER")}
        {viewBtn("industry", "▲ BY INDUSTRY")}
        {error && <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 10, color: "#E63946" }}>⚠ {error}</span>}
      </div>

      {/* ── Committee Search View ── */}
      {view === "search" && (
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 16 }}>
          {/* Left: search + committee list */}
          <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: "calc(100vh - 260px)" }}>
            <div style={{ padding: "12px 14px", borderBottom: "1px solid #2A2A2A" }}>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 10 }}>PAC / COMMITTEE LOOKUP</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCommitteeSearch()}
                  placeholder="Search committees, PACs…"
                  style={{ flex: 1, background: "#111", border: "1px solid #2A2A2A", borderRadius: 2, padding: "7px 10px", fontFamily: "monospace", fontSize: 11, color: "#F0EDE8", outline: "none" }}
                />
                <button onClick={handleCommitteeSearch} style={{ background: "#E63946", border: "none", borderRadius: 2, padding: "7px 12px", fontFamily: "monospace", fontSize: 10, color: "#fff", cursor: "pointer", fontWeight: 700 }}>FIND</button>
              </div>
              <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                {["defense", "pharma", "tech", "energy", "finance"].map(preset => (
                  <button key={preset} onClick={() => { setSearchInput(preset); }} style={{ background: "#0D0D0D", border: "1px solid #2A2A2A", borderRadius: 2, padding: "3px 7px", fontFamily: "monospace", fontSize: 8, color: "#555", cursor: "pointer" }}>{preset}</button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto" }}>
              {loadingCommittees ? (
                <div style={{ padding: 16 }}><Spinner /></div>
              ) : committees.length === 0 ? (
                <div style={{ padding: 20, fontFamily: "monospace", fontSize: 11, color: "#333", textAlign: "center" }}>Search for a PAC or committee above</div>
              ) : (
                committees.map((c, i) => {
                  const isSelected = selectedCommittee?.committee_id === c.committee_id;
                  return (
                    <div key={i} onClick={() => handleSelectCommittee(c)} style={{
                      padding: "12px 14px", borderBottom: "1px solid #141414", cursor: "pointer",
                      background: isSelected ? "#222" : "transparent",
                      borderLeft: `3px solid ${isSelected ? "#E63946" : "transparent"}`,
                      transition: "all 0.12s",
                    }}>
                      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#F0EDE8", marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", marginBottom: 2 }}>
                        {c.committee_type_full || c.designation || "Committee"} · {c.state || "—"}
                        {c.party_full ? ` · ${c.party_full}` : ""}
                      </div>
                      {c.receipts != null && (
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#F4A261" }}>
                          ↑ {formatDollar(c.receipts)} raised
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div style={{ padding: "6px 14px", borderTop: "1px solid #1E1E1E", background: "#111", fontFamily: "monospace", fontSize: 8, color: "#2A2A2A" }}>FEC.GOV · LIVE DATA</div>
          </div>

          {/* Right: receipts */}
          <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column", overflow: "hidden", maxHeight: "calc(100vh - 260px)" }}>
            {!selectedCommittee ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#2A2A2A" }}>
                <div style={{ fontSize: 32 }}>◆</div>
                <div style={{ fontFamily: "monospace", fontSize: 12 }}>Select a committee to view its receipts</div>
              </div>
            ) : (
              <>
                <div style={{ padding: "14px 16px", borderBottom: "1px solid #2A2A2A", background: "#111", flexShrink: 0 }}>
                  <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, color: "#F0EDE8", marginBottom: 4 }}>{selectedCommittee.name}</div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#555" }}>ID: {selectedCommittee.committee_id}</span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#555" }}>TYPE: {selectedCommittee.committee_type_full || "—"}</span>
                    {selectedCommittee.receipts != null && (
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#F4A261" }}>RAISED: {formatDollar(selectedCommittee.receipts)}</span>
                    )}
                    {selectedCommittee.disbursements != null && (
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9, color: "#E63946" }}>SPENT: {formatDollar(selectedCommittee.disbursements)}</span>
                    )}
                  </div>
                </div>

                <div style={{ padding: "10px 16px 4px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, flexShrink: 0 }}>
                  ◆ CONTRIBUTION RECEIPTS
                </div>

                <div style={{ flex: 1, overflowY: "auto" }}>
                  {loadingReceipts ? (
                    <div style={{ padding: 16 }}><Spinner /></div>
                  ) : receipts.length === 0 ? (
                    <div style={{ padding: "20px 16px", fontFamily: "monospace", fontSize: 11, color: "#333" }}>No receipts found for this committee.</div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#0D0D0D" }}>
                          {["Contributor", "Employer", "Amount", "Date", "State", "Type"].map(h => (
                            <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontFamily: "monospace", fontSize: 8, color: "#444", letterSpacing: 1, borderBottom: "1px solid #1A1A1A" }}>{h.toUpperCase()}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {receipts.map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid #141414", background: i % 2 === 0 ? "transparent" : "#111" }}>
                            <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: 10, color: "#DDD", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.contributor_name || r.entity_type_desc || "—"}</td>
                            <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: 9, color: "#666", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.contributor_employer || "—"}</td>
                            <td style={{ padding: "7px 14px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#F4A261", whiteSpace: "nowrap" }}>{formatDollar(r.contribution_receipt_amount)}</td>
                            <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: 9, color: "#555", whiteSpace: "nowrap" }}>{r.contribution_receipt_date ? new Date(r.contribution_receipt_date).toLocaleDateString() : "—"}</td>
                            <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: 9, color: "#444" }}>{r.contributor_state || "—"}</td>
                            <td style={{ padding: "7px 14px", fontFamily: "monospace", fontSize: 8, color: "#3A3A3A" }}>{r.receipt_type_full || r.line_number_label || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div style={{ padding: "6px 16px", borderTop: "1px solid #1E1E1E", background: "#111", fontFamily: "monospace", fontSize: 8, color: "#2A2A2A", flexShrink: 0 }}>
                  FEC SCHEDULE A RECEIPTS · LIVE DATA · NOT A LEGAL CONCLUSION
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── By Employer View ── */}
      {view === "employer" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={employerInput}
              onChange={e => setEmployerInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleEmployerSearch()}
              placeholder="Enter employer name (e.g. Goldman Sachs, Boeing, Google)…"
              style={{ flex: 1, background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", outline: "none" }}
            />
            <button onClick={handleEmployerSearch} style={{ background: "#E63946", border: "none", borderRadius: 2, padding: "10px 20px", fontFamily: "monospace", fontSize: 12, color: "#fff", cursor: "pointer", fontWeight: 700 }}>SEARCH</button>
          </div>

          {/* Preset employers */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["Boeing", "Goldman Sachs", "Raytheon", "Google", "ExxonMobil", "JPMorgan", "Pfizer", "Lockheed"].map(emp => (
              <button key={emp} onClick={() => { setEmployerInput(emp); }} style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: 2, padding: "5px 10px", fontFamily: "monospace", fontSize: 10, color: "#666", cursor: "pointer" }}>{emp}</button>
            ))}
          </div>

          {loadingEmployer ? (
            <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20 }}><Spinner /></div>
          ) : employerDonors.length > 0 ? (
            <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #2A2A2A", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>
                ◎ DONORS FROM "{employerInput.toUpperCase()}" — {employerDonors.length} FOUND
              </div>
              {/* Top donor bar chart */}
              {employerDonors.slice(0, 8).length > 0 && (() => {
                const maxAmt = Math.max(...employerDonors.slice(0, 8).map(d => parseFloat(d.contribution_receipt_amount || d.total || 0)));
                return (
                  <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E1E1E" }}>
                    {employerDonors.slice(0, 8).map((d, i) => {
                      const amt = parseFloat(d.contribution_receipt_amount || d.total || 0);
                      const pct = maxAmt > 0 ? (amt / maxAmt) * 100 : 0;
                      return (
                        <div key={i} style={{ marginBottom: 8 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#CCC" }}>
                              {d.contributor_name || d.name || "Unknown"}
                              {d.contributor_occupation ? <span style={{ color: "#555", fontSize: 9 }}> · {d.contributor_occupation.slice(0, 25)}</span> : ""}
                            </span>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#F4A261" }}>{formatDollar(amt)}</span>
                          </div>
                          <div style={{ background: "#0D0D0D", height: 4, borderRadius: 1 }}>
                            <div style={{ background: "#F4A261", height: "100%", width: `${pct}%`, borderRadius: 1, transition: "width 0.5s" }} />
                          </div>
                          {(d.candidate?.name || d.committee?.name) && (
                            <div style={{ fontFamily: "monospace", fontSize: 8, color: "#3A3A3A", marginTop: 2 }}>
                              → {d.candidate?.name || d.committee?.name}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0D0D0D" }}>
                    {["Donor Name", "Occupation", "Amount", "Recipient", "Date"].map(h => (
                      <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontFamily: "monospace", fontSize: 8, color: "#444", letterSpacing: 1, borderBottom: "1px solid #1A1A1A" }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employerDonors.map((d, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #141414", background: i % 2 === 0 ? "transparent" : "#111" }}>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 10, color: "#DDD", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.contributor_name || "—"}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#666", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.contributor_occupation || "—"}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#F4A261", whiteSpace: "nowrap" }}>{formatDollar(d.contribution_receipt_amount)}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.candidate?.name || d.committee?.name || "—"}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#555", whiteSpace: "nowrap" }}>{d.contribution_receipt_date ? new Date(d.contribution_receipt_date).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : employerInput && !loadingEmployer ? (
            <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20, fontFamily: "monospace", fontSize: 11, color: "#444" }}>No donors found for "{employerInput}"</div>
          ) : null}
        </div>
      )}

      {/* ── By Industry View ── */}
      {view === "industry" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={industryInput}
              onChange={e => setIndustryInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleIndustrySearch()}
              placeholder="Enter industry keywords separated by commas (e.g. defense, aerospace)…"
              style={{ flex: 1, background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", outline: "none" }}
            />
            <button onClick={handleIndustrySearch} style={{ background: "#E63946", border: "none", borderRadius: 2, padding: "10px 20px", fontFamily: "monospace", fontSize: 12, color: "#fff", cursor: "pointer", fontWeight: 700 }}>SEARCH</button>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {INDUSTRY_PRESETS.map(preset => (
              <button key={preset} onClick={() => { setIndustryInput(preset); }} style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: 2, padding: "5px 10px", fontFamily: "monospace", fontSize: 10, color: "#666", cursor: "pointer" }}>{preset}</button>
            ))}
          </div>

          {loadingIndustry ? (
            <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20 }}><Spinner /></div>
          ) : industryContribs.length > 0 ? (
            <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid #2A2A2A", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>
                ▲ INDUSTRY CONTRIBUTIONS — "{industryInput.toUpperCase()}" — {industryContribs.length} RESULTS
              </div>
              {/* Aggregate totals by recipient */}
              {(() => {
                const byRecipient = {};
                industryContribs.forEach(c => {
                  const key = c.committee?.name || c.candidate?.name || "Unknown";
                  byRecipient[key] = (byRecipient[key] || 0) + parseFloat(c.contribution_receipt_amount || 0);
                });
                const sorted = Object.entries(byRecipient).sort((a, b) => b[1] - a[1]).slice(0, 10);
                const max = sorted[0]?.[1] || 1;
                return sorted.length > 1 ? (
                  <div style={{ padding: "12px 16px 4px", borderBottom: "1px solid #1E1E1E" }}>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: 1, marginBottom: 10 }}>TOP RECIPIENTS BY TOTAL INDUSTRY CONTRIBUTIONS</div>
                    {sorted.map(([name, total], i) => (
                      <div key={i} style={{ marginBottom: 7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#CCC", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{name}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946" }}>{formatDollar(total)}</span>
                        </div>
                        <div style={{ background: "#0D0D0D", height: 4, borderRadius: 1 }}>
                          <div style={{ background: "#E63946", height: "100%", width: `${(total / max) * 100}%`, borderRadius: 1, transition: "width 0.5s" }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#0D0D0D" }}>
                    {["Contributor", "Employer", "Amount", "Recipient", "Date"].map(h => (
                      <th key={h} style={{ padding: "8px 16px", textAlign: "left", fontFamily: "monospace", fontSize: 8, color: "#444", letterSpacing: 1, borderBottom: "1px solid #1A1A1A" }}>{h.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {industryContribs.map((c, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #141414", background: i % 2 === 0 ? "transparent" : "#111" }}>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 10, color: "#DDD", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.contributor_name || "—"}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#666", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.contributor_employer || "—"}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", whiteSpace: "nowrap" }}>{formatDollar(c.contribution_receipt_amount)}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#888", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.committee?.name || c.candidate?.name || "—"}</td>
                      <td style={{ padding: "8px 16px", fontFamily: "monospace", fontSize: 9, color: "#555", whiteSpace: "nowrap" }}>{c.contribution_receipt_date ? new Date(c.contribution_receipt_date).toLocaleDateString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : industryInput && !loadingIndustry ? (
            <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20, fontFamily: "monospace", fontSize: 11, color: "#444" }}>No contributions found for "{industryInput}"</div>
          ) : null}
        </div>
      )}

      {/* Disclaimer */}
      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#2A2A2A" }}>
        DATA SOURCE: FEC.GOV OPEN API · LIVE · ALL AMOUNTS FROM OFFICIAL FILINGS · NOT A LEGAL CONCLUSION
      </div>
    </div>
  );
}

// ── Agent Module ──────────────────────────────────────────────────────────────

const RISK_COLORS = { HIGH: "#E63946", MED: "#F4A261", LOW: "#2A9D8F" };

function AiMessage({ structured }) {
  const [showSources, setShowSources] = useState(false);
  const { summary, findings, sources, inference, riskLevel, flags, policyResults, donorResults } = structured;
  const riskColor = RISK_COLORS[riskLevel] || "#888";

  return (
    <div style={{ maxWidth: "92%" }}>
      {/* Header row: source list + risk level badge */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "#E63946", letterSpacing: 1 }}>
          ◈ UNREDACTED AI{sources?.length ? ` — ${sources.join(" · ")}` : ""}
        </div>
        {riskLevel && (
          <span style={{ padding: "2px 8px", borderRadius: 2, fontSize: 9, fontWeight: 700, background: riskColor + "22", color: riskColor, fontFamily: "monospace", letterSpacing: 1 }}>
            RISK: {riskLevel}
          </span>
        )}
      </div>

      <div style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: "0 4px 4px 4px", padding: 16 }}>
        {/* Summary */}
        <div style={{ fontFamily: "monospace", fontSize: 12, color: "#CCC", marginBottom: 14, lineHeight: 1.6 }}>{summary}</div>

        {/* Findings table */}
        {findings?.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: 1, marginBottom: 4 }}>ENTITY · PATTERN · AMOUNT · FEC LINK · CONFIDENCE</div>
            {findings.map((f, j) => {
              const fColor = f.confidence === "HIGH" ? "#E63946" : f.confidence === "MED" ? "#F4A261" : "#888";
              return (
                <div key={j} style={{ padding: "10px 12px", background: "#1A1A1A", borderRadius: 2, borderLeft: `2px solid ${fColor}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", fontWeight: 600 }}>{f.company}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {f.spendingAmount && <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#F4A261" }}>{f.spendingAmount}</span>}
                      {f.riskScore != null && <span style={{ fontFamily: "monospace", fontSize: 10, color: fColor }}>SCORE: {f.riskScore}</span>}
                      <span style={{ padding: "1px 6px", borderRadius: 2, background: fColor + "22", color: fColor, fontFamily: "monospace", fontSize: 9, fontWeight: 700 }}>{f.confidence}</span>
                    </div>
                  </div>
                  <div style={{ fontFamily: "monospace", fontSize: 10, color: "#AAA", lineHeight: 1.5 }}>{f.pattern}</div>
                  {f.donorLink && <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", marginTop: 4 }}>◆ FEC: {f.donorLink}</div>}
                  {f.policyLink && <div style={{ fontFamily: "monospace", fontSize: 10, color: "#457B9D", marginTop: 2 }}>§ Rule: {f.policyLink}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Red flags */}
        {flags?.length > 0 && (
          <div style={{ background: "#E6394608", border: "1px solid #E6394633", borderRadius: 3, padding: "10px 12px", marginBottom: 14 }}>
            <div style={{ fontFamily: "monospace", fontSize: 9, color: "#E63946", letterSpacing: 1, marginBottom: 6 }}>⚑ RED FLAGS</div>
            {flags.map((flag, k) => (
              <div key={k} style={{ fontFamily: "monospace", fontSize: 10, color: "#CCC", lineHeight: 1.5, paddingLeft: 8, borderLeft: "1px solid #E6394644", marginBottom: 4 }}>{flag}</div>
            ))}
          </div>
        )}

        {/* Inference */}
        {inference && (
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#555", borderTop: "1px solid #222", paddingTop: 10, marginBottom: donorResults || policyResults ? 10 : 0 }}>
            ⚠ {inference}
          </div>
        )}

        {/* Source data toggle */}
        {(policyResults?.length > 0 || donorResults?.committees?.length > 0) && (
          <div style={{ borderTop: "1px solid #222", paddingTop: 10 }}>
            <button onClick={() => setShowSources(s => !s)} style={{ background: "none", border: "1px solid #2A2A2A", borderRadius: 2, padding: "4px 10px", fontFamily: "monospace", fontSize: 9, color: "#555", cursor: "pointer", letterSpacing: 1 }}>
              {showSources ? "▲ HIDE" : "▼ SHOW"} SOURCE DATA ({(policyResults?.length || 0) + (donorResults?.committees?.length || 0)} records)
            </button>

            {showSources && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                {/* Policy rules */}
                {policyResults?.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: "#457B9D", letterSpacing: 1, marginBottom: 6 }}>FEDERAL REGISTER RULES</div>
                    {policyResults.slice(0, 4).map((r, k) => (
                      <div key={k} style={{ padding: "6px 10px", background: "#0D0D0D", borderRadius: 2, marginBottom: 4 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#CCC" }}>{r.title?.slice(0, 80)}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#444", marginTop: 2 }}>{r.agency} · {r.date} · {r.type}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* FEC committees */}
                {donorResults?.committees?.length > 0 && (
                  <div>
                    <div style={{ fontFamily: "monospace", fontSize: 9, color: "#E63946", letterSpacing: 1, marginBottom: 6 }}>FEC COMMITTEES / PACs</div>
                    {donorResults.committees.slice(0, 4).map((c, k) => (
                      <div key={k} style={{ padding: "6px 10px", background: "#0D0D0D", borderRadius: 2, marginBottom: 4 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 10, color: "#CCC" }}>{c.name}</div>
                        <div style={{ fontFamily: "monospace", fontSize: 9, color: "#444", marginTop: 2 }}>
                          {c.type} · {c.party || "—"} · Receipts: {c.totalReceipts ? `$${(c.totalReceipts / 1e6).toFixed(1)}M` : "N/A"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AgentModule() {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [msgs, setMsgs] = useState(CHAT_MESSAGES);
  const chatRef = useRef(null);

  const suggestions = [
    "Which companies donated to SASC chairs then got sole-source contracts?",
    "Show stock trades before pharma committee hearings",
    "Map dark money trail to FTC rulemaking",
    "Agencies overspending appropriations FY2024",
  ];

  const handleQuery = async () => {
    if (!input.trim() || thinking) return;
    const userMsg = { role: "user", text: input };
    setMsgs(m => [...m, userMsg]);
    setInput("");
    setThinking(true);

    try {
      const result = await queryAgent(input);
      const d = result.data;
      const aiMsg = {
        role: "ai",
        text: null,
        structured: {
          summary: d.summary || d.plan?.intent || "Analysis complete.",
          findings: d.findings || [],
          sources: d.sources || ["USASpending.gov", "Federal Register", "FEC"],
          inference: d.inference || "",
          riskLevel: d.riskLevel || null,
          flags: d.flags || [],
          policyResults: d.policyResults || [],
          donorResults: d.donorResults || null,
        },
      };
      setMsgs(m => [...m, aiMsg]);
    } catch (e) {
      setMsgs(m => [...m, {
        role: "ai", text: null,
        structured: {
          summary: `Error: ${e.message}. Please check that the backend is running on port 3001.`,
          findings: [], sources: [], inference: "", riskLevel: null, flags: [], policyResults: [], donorResults: null,
        },
      }]);
    } finally {
      setThinking(false);
      setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, height: "calc(100vh - 200px)" }}>
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2A2A2A", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2A9D8F", boxShadow: "0 0 8px #2A9D8F" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#2A9D8F", letterSpacing: 2 }}>UNREDACTED INTELLIGENCE AGENT — ONLINE</span>
        </div>

        <div ref={chatRef} style={{ flex: 1, padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {msgs.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "user" ? (
                <div style={{ background: "#2A2A2A", border: "1px solid #333", borderRadius: "4px 4px 0 4px", padding: "10px 14px", maxWidth: "80%", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", lineHeight: 1.5 }}>{msg.text}</div>
              ) : (
                <AiMessage structured={msg.structured} />
              )}
            </div>
          ))}
          {thinking && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 10 }}>
              <Spinner />
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#555", marginLeft: 6 }}>Querying FEC, USASpending, Federal Register… analyzing with Claude…</span>
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #2A2A2A" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => setInput(s)} style={{ background: "#111", border: "1px solid #333", borderRadius: 2, padding: "5px 10px", fontFamily: "monospace", fontSize: 10, color: "#888", cursor: "pointer", whiteSpace: "nowrap" }}>{s.slice(0, 34)}…</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleQuery()}
              placeholder="Query the intelligence agent… (press Enter or click QUERY)"
              style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", outline: "none" }}
            />
            <button
              onClick={handleQuery}
              disabled={thinking}
              style={{ background: thinking ? "#444" : "#E63946", border: "none", borderRadius: 2, padding: "10px 20px", fontFamily: "monospace", fontSize: 12, color: "#fff", cursor: thinking ? "not-allowed" : "pointer", fontWeight: 700 }}
            >
              {thinking ? "…" : "QUERY"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 12 }}>SOURCES ACTIVE</div>
          {[
            { label: "FEC Campaign API", live: true },
            { label: "USASpending.gov", live: true },
            { label: "Federal Register", live: true },
            { label: "GovInfo", live: false },
            { label: "OpenSecrets", live: false },
            { label: "Senate Disclosures", live: false },
          ].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, background: s.live ? "#2A9D8F" : "#333", borderRadius: "50%" }} />
              <span style={{ fontFamily: "monospace", fontSize: 10, color: s.live ? "#888" : "#444" }}>{s.label}</span>
              {!s.live && <span style={{ fontFamily: "monospace", fontSize: 8, color: "#333" }}>—</span>}
            </div>
          ))}
        </div>
        <div style={{ background: "#1A1A1A", border: "1px solid #E6394633", borderRadius: 4, padding: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 10 }}>DISCLAIMER</div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#444", lineHeight: 1.6 }}>All data from public federal records. AI inferences are investigative hypotheses, not legal conclusions. Signal ≠ proof.</div>
        </div>
      </div>
    </div>
  );
}

// ── Graph Module ──────────────────────────────────────────────────────────────

function GraphModule() {
  const [hoveredNode, setHoveredNode] = useState(null);
  const typeColors = { COMPANY: "#2A9D8F", POLITICIAN: "#F4A261", COMMITTEE: "#6A4C93", AGENCY: "#457B9D", PAC: "#E63946", CONTRACT: "#E9C46A", PERSON: "#F0EDE8" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: 16, height: "calc(100vh - 200px)" }}>
      <div style={{ background: "#0D0D0D", border: "1px solid #2A2A2A", borderRadius: 4, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 14, left: 16, fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>⬡ ENTITY RELATIONSHIP GRAPH — RAYTHEON DONOR WEB</div>
        <svg width="100%" height="100%" viewBox="0 0 640 480">
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          {GRAPH_EDGES.map((edge, i) => {
            const from = GRAPH_NODES.find(n => n.id === edge.from);
            const to = GRAPH_NODES.find(n => n.id === edge.to);
            const mx = (from.x + to.x) / 2;
            const my = (from.y + to.y) / 2;
            return (
              <g key={i}>
                <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={edge.color} strokeWidth={1.5} strokeOpacity={0.5} strokeDasharray={edge.color === "#888" ? "4,4" : "0"} />
                <text x={mx} y={my - 6} textAnchor="middle" fill={edge.color} fontSize={8} fontFamily="monospace" opacity={0.7}>{edge.label}</text>
              </g>
            );
          })}
          {GRAPH_NODES.map((node) => (
            <g key={node.id} onMouseEnter={() => setHoveredNode(node.id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: "pointer" }}>
              <circle cx={node.x} cy={node.y} r={hoveredNode === node.id ? 28 : 22} fill={typeColors[node.type] + "22"} stroke={typeColors[node.type]} strokeWidth={hoveredNode === node.id ? 2 : 1} filter={hoveredNode === node.id ? "url(#glow)" : ""} />
              {node.label.split("\n").map((line, li) => (
                <text key={li} x={node.x} y={node.y + (li - (node.label.split("\n").length - 1) / 2) * 12 + 4} textAnchor="middle" fill={typeColors[node.type]} fontSize={8.5} fontFamily="monospace" fontWeight={600}>{line}</text>
              ))}
              {node.score && (
                <text x={node.x + 18} y={node.y - 18} fill="#E63946" fontSize={9} fontFamily="monospace" fontWeight={700}>{node.score}</text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 12 }}>NODE LEGEND</div>
          {Object.entries(typeColors).map(([type, color]) => (
            <div key={type} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: color + "44", border: `1px solid ${color}` }} />
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#888" }}>{type}</span>
            </div>
          ))}
        </div>
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 16, flex: 1 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 12 }}>VIEWS</div>
          {["Donor Web", "Dark Money Chain", "Revolving Door", "Follow the Money", "Regulatory Capture"].map((v, i) => (
            <div key={i} style={{ padding: "8px 10px", marginBottom: 4, background: i === 0 ? "#E6394611" : "#111", border: `1px solid ${i === 0 ? "#E6394644" : "#1E1E1E"}`, borderRadius: 2, fontFamily: "monospace", fontSize: 11, color: i === 0 ? "#E63946" : "#666", cursor: "pointer" }}>{v}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── App Shell ─────────────────────────────────────────────────────────────────

export default function App() {
  const [active, setActive] = useState("dashboard");

  const renderContent = () => {
    if (active === "dashboard") return <Dashboard />;
    if (active === "politicians") return <PoliticianModule />;
    if (active === "donors") return <DonorModule />;
    if (active === "agent") return <AgentModule />;
    if (active === "graph") return <GraphModule />;
    if (active === "spending") return <SpendingModule />;
    return null;
  };

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh", color: "#F0EDE8", fontFamily: "monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=IBM+Plex+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #333; }
        @keyframes pulse { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }
        input::placeholder { color: #444; }
        button:hover { opacity: 0.85; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#111", borderBottom: "1px solid #1E1E1E", padding: "0 24px", display: "flex", alignItems: "center", gap: 0, height: 52 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 1, marginRight: 40 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#F0EDE8", letterSpacing: 2 }}>UN</span>
          <div style={{ width: 7, height: 7, background: "#E63946", borderRadius: "50%", marginBottom: 2, marginLeft: 1, marginRight: 1 }} />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#F0EDE8", letterSpacing: 2 }}>REDACTED</span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", background: "#0D0D0D", border: "1px solid #1E1E1E", borderRadius: 2, padding: "0 14px", height: 34, maxWidth: 480, gap: 8 }}>
          <span style={{ color: "#444", fontSize: 12 }}>⌕</span>
          <input placeholder="Search entities, agencies, politicians, companies…" style={{ flex: 1, background: "none", border: "none", fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#F0EDE8", outline: "none" }} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 16, alignItems: "center" }}>
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 1 }}>● LIVE</span>
          <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 2, padding: "5px 12px", fontFamily: "monospace", fontSize: 10, color: "#888" }}>🔔 12</div>
          <div style={{ background: "#E6394622", border: "1px solid #E6394644", borderRadius: 2, padding: "5px 12px", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", cursor: "pointer" }}>ANALYST</div>
        </div>
      </div>

      <Ticker />

      <div style={{ display: "flex" }}>
        {/* Sidebar */}
        <div style={{ width: 56, background: "#111", borderRight: "1px solid #1E1E1E", minHeight: "calc(100vh - 72px)", display: "flex", flexDirection: "column", gap: 2, padding: "12px 0" }}>
          {MODULES.map((mod) => (
            <button key={mod.id} onClick={() => setActive(mod.id)} title={mod.label} style={{
              background: active === mod.id ? "#E6394611" : "transparent",
              border: "none", borderLeft: active === mod.id ? "2px solid #E63946" : "2px solid transparent",
              width: "100%", padding: "12px 0", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ fontSize: 14, color: active === mod.id ? "#E63946" : "#444" }}>{mod.icon}</span>
              <span style={{ fontFamily: "monospace", fontSize: 7, color: active === mod.id ? "#E63946" : "#333", letterSpacing: 0.5 }}>{mod.label.slice(0, 5).toUpperCase()}</span>
            </button>
          ))}
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#E63946", letterSpacing: 2 }}>{MODULES.find(m => m.id === active)?.icon}</span>
            <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: "#F0EDE8", fontWeight: 400 }}>
              {active === "dashboard" ? "National Accountability Dashboard" :
               active === "agent" ? "Policy Intelligence Agent" :
               active === "politicians" ? "Politician Donor Intelligence" :
               active === "graph" ? "Entity Relationship Graph" :
               active === "spending" ? "Federal Spending Audit" :
               active === "donors" ? "Donor Intelligence" :
               MODULES.find(m => m.id === active)?.label}
            </h1>
            <div style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 10, color: "#333" }}>
              Last sync: {new Date().toLocaleTimeString()} · Data: FEC + USASpending + FedReg + GovInfo + OpenSecrets
            </div>
          </div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
