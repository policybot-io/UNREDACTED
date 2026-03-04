import { useState, useEffect } from "react";

const MODULES = [
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { id: "agent", label: "AI Intel", icon: "◈" },
  { id: "spending", label: "Spending", icon: "◎" },
  { id: "donors", label: "Donor Intel", icon: "◆" },
  { id: "politicians", label: "Politicians", icon: "◉" },
  { id: "graph", label: "Entity Graph", icon: "⬡" },
  { id: "corps", label: "Corporate", icon: "▣" },
  { id: "dark", label: "Dark Money", icon: "◍" },
  { id: "index", label: "Index", icon: "≡" },
  { id: "alerts", label: "Alerts", icon: "◈" },
];

const FEED_ITEMS = [
  { type: "CONTRACT", text: "Lockheed Martin awarded $2.1B sole-source contract — DoD", time: "4m ago", risk: "HIGH" },
  { type: "DONATION", text: "Defense PACs donated $4.2M to Armed Services Committee chairs — FEC", time: "12m ago", risk: "MED" },
  { type: "TRADE", text: "Sen. Johnson traded $250K in Pfizer — 18 days before FDA vote", time: "31m ago", risk: "HIGH" },
  { type: "RULE", text: "EPA proposed rule weakened after 847 industry comments — FedReg", time: "1h ago", risk: "HIGH" },
  { type: "REVOLVE", text: "Former HHS Deputy joins PhRMA lobbying arm — OpenSecrets", time: "2h ago", risk: "MED" },
  { type: "GRANT", text: "DOE $890M clean energy grants — 67% to states with Senate Energy votes", time: "3h ago", risk: "LOW" },
];

const KPI_DATA = [
  { label: "FY2025 Federal Spend", value: "$4.87T", change: "+3.2%", up: true, sub: "vs. $4.72T appropriated" },
  { label: "Active Flagged Contracts", value: "1,847", change: "+214 this month", up: true, sub: "across 23 agencies" },
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
        { company: "Northrop Grumman", donation: "$3.2M PAC", contract: "$8.7B sole-source", committee: "3 members", cycle: "FY2024" },
        { company: "Raytheon Technologies", donation: "$2.8M PAC", contract: "$5.1B sole-source", committee: "5 members", cycle: "FY2023" },
        { company: "L3Harris Technologies", donation: "$1.4M PAC", contract: "$2.3B sole-source", committee: "2 members", cycle: "FY2024" },
      ],
      sources: ["USASpending.gov", "FEC Schedule B", "OpenSecrets", "DoD Procurement Records"],
      inference: "Pattern detected: donation → committee oversight → contract award within 11 months avg",
    },
  },
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
      background: colors[level] + "22", color: colors[level],
      fontFamily: "monospace", letterSpacing: 1,
    }}>{level}</span>
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

function Dashboard() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {KPI_DATA.map((kpi, i) => (
          <div key={i} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: "16px 18px" }}>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#555", letterSpacing: 2, marginBottom: 8 }}>{kpi.label.toUpperCase()}</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, color: "#F0EDE8", marginBottom: 4 }}>{kpi.value}</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: kpi.up ? "#E63946" : "#2A9D8F" }}>{kpi.change}</div>
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#444", marginTop: 4 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16 }}>
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

        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 20, overflow: "hidden" }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 16 }}>◈ LIVE INTELLIGENCE FEED</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {FEED_ITEMS.map((item, i) => (
              <div key={i} style={{ borderLeft: `2px solid ${item.risk === "HIGH" ? "#E63946" : item.risk === "MED" ? "#F4A261" : "#2A9D8F"}`, paddingLeft: 10 }}>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#CCC", lineHeight: 1.4 }}>{item.text}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, alignItems: "center" }}>
                  <span style={{ fontFamily: "monospace", fontSize: 9, color: "#444" }}>{item.time}</span>
                  <RiskBadge level={item.risk} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PoliticianModule() {
  const [selected, setSelected] = useState(0);
  const pol = POLITICIANS[selected];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16, height: "100%" }}>
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #2A2A2A", fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#E63946", letterSpacing: 2 }}>◉ POLITICIANS</div>
        {POLITICIANS.map((p, i) => (
          <div key={i} onClick={() => setSelected(i)} style={{
            padding: "14px 16px", borderBottom: "1px solid #1E1E1E", cursor: "pointer",
            background: selected === i ? "#222" : "transparent",
            borderLeft: selected === i ? "3px solid #E63946" : "3px solid transparent",
            transition: "all 0.15s",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", marginBottom: 2 }}>{p.name}</div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>{p.party} · {p.state}</div>
              </div>
              <ScoreBadge score={p.score} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#F0EDE8" }}>{pol.name}</div>
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#666", marginTop: 4 }}>{pol.party === "R" ? "Republican" : pol.party === "D" ? "Democrat" : "Independent"} · {pol.state} · U.S. Senate</div>
          </div>
          <ScoreBadge score={pol.score} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Donations", value: pol.donors },
            { label: "Top Industry", value: pol.topIndustry },
            { label: "Stock Trades", value: pol.trades },
            { label: "Conflicts Found", value: pol.conflicts },
          ].map((s, i) => (
            <div key={i} style={{ background: "#111", borderRadius: 3, padding: "12px 14px" }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#555", letterSpacing: 1, marginBottom: 6 }}>{s.label.toUpperCase()}</div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 18, color: i === 3 && pol.conflicts > 0 ? "#E63946" : "#F0EDE8" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#111", borderRadius: 3, padding: 16, marginBottom: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 12 }}>◆ TOP DONOR INDUSTRIES (FY2024 CYCLE)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {DONOR_INDUSTRIES.slice(0, 4).map((ind, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 100, fontFamily: "monospace", fontSize: 10, color: "#888" }}>{ind.name.split(" ")[0]}</div>
                <div style={{ flex: 1, background: "#1A1A1A", height: 5, borderRadius: 1 }}>
                  <div style={{ background: ind.color, height: "100%", width: `${ind.pct * (0.4 + Math.random() * 0.5)}%`, borderRadius: 1 }} />
                </div>
                <div style={{ fontFamily: "monospace", fontSize: 10, color: ind.color, width: 60, textAlign: "right" }}>${(ind.amount * 0.04 * (0.5 + Math.random())).toFixed(1)}M</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: "#0D0D0D", border: "1px solid #E6394633", borderRadius: 3, padding: 14 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 10 }}>⚠ AI-DETECTED CONFLICT SIGNALS</div>
          {pol.conflicts > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#CCC", lineHeight: 1.5, borderLeft: "2px solid #E63946", paddingLeft: 10 }}>
                Traded {pol.topIndustry} sector stocks 18 days before committee vote. Pattern matches 3 prior cycles. Confidence: 87%
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#CCC", lineHeight: 1.5, borderLeft: "2px solid #F4A261", paddingLeft: 10 }}>
                Top PAC donors received $1.2B in sole-source contracts from oversight committee agencies (FY2023–24)
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: "monospace", fontSize: 11, color: "#2A9D8F" }}>✓ No significant conflict signals detected in current cycle</div>
          )}
          <div style={{ fontFamily: "monospace", fontSize: 9, color: "#333", marginTop: 10 }}>Inference only — not a legal conclusion. Sources: FEC, USASpending, Senate Disclosure</div>
        </div>
      </div>
    </div>
  );
}

function AgentModule() {
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [msgs, setMsgs] = useState(CHAT_MESSAGES);

  const suggestions = [
    "Which companies donated to SASC chairs then got sole-source contracts?",
    "Show stock trades before pharma committee hearings",
    "Map dark money trail to FTC rulemaking",
    "Agencies overspending appropriations FY2024",
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: 16, height: "calc(100vh - 200px)" }}>
      <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid #2A2A2A", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#2A9D8F", boxShadow: "0 0 8px #2A9D8F" }} />
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: "#2A9D8F", letterSpacing: 2 }}>RECEIPTS INTELLIGENCE AGENT — ONLINE</span>
        </div>

        <div style={{ flex: 1, padding: 20, overflow: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {msgs.map((msg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
              {msg.role === "user" ? (
                <div style={{ background: "#2A2A2A", border: "1px solid #333", borderRadius: "4px 4px 0 4px", padding: "10px 14px", maxWidth: "80%", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", lineHeight: 1.5 }}>{msg.text}</div>
              ) : (
                <div style={{ maxWidth: "90%" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 11, color: "#E63946", marginBottom: 8, letterSpacing: 1 }}>◈ RECEIPTS AI — {msg.structured.sources.join(" · ")}</div>
                  <div style={{ background: "#111", border: "1px solid #2A2A2A", borderRadius: "0 4px 4px 4px", padding: 16 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 12, color: "#CCC", marginBottom: 14, lineHeight: 1.5 }}>{msg.structured.summary}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                      {msg.structured.findings.map((f, j) => (
                        <div key={j} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 80px", gap: 8, padding: "8px 12px", background: "#1A1A1A", borderRadius: 2, borderLeft: "2px solid #E63946" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#F0EDE8" }}>{f.company}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#E63946" }}>{f.donation}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: "#F4A261" }}>{f.contract}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#555" }}>{f.cycle}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#555", borderTop: "1px solid #222", paddingTop: 10 }}>⚠ {msg.structured.inference}</div>
                  </div>
                </div>
              )}
            </div>
          ))}
          {thinking && (
            <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 10 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 6, height: 6, background: "#E63946", borderRadius: "50%", animation: `pulse ${0.8 + i * 0.15}s infinite alternate` }} />
              ))}
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#555", marginLeft: 6 }}>Querying FEC, USASpending, Neo4j graph…</span>
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
            <input value={input} onChange={e => setInput(e.target.value)} placeholder="Query the intelligence agent…" style={{ flex: 1, background: "#111", border: "1px solid #333", borderRadius: 2, padding: "10px 14px", fontFamily: "monospace", fontSize: 12, color: "#F0EDE8", outline: "none" }} />
            <button onClick={() => { if (input.trim()) { setMsgs(m => [...m, { role: "user", text: input }]); setInput(""); setThinking(true); setTimeout(() => setThinking(false), 2000); } }} style={{ background: "#E63946", border: "none", borderRadius: 2, padding: "10px 20px", fontFamily: "monospace", fontSize: 12, color: "#fff", cursor: "pointer", fontWeight: 700 }}>QUERY</button>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", borderRadius: 4, padding: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "#E63946", letterSpacing: 2, marginBottom: 12 }}>SOURCES ACTIVE</div>
          {["FEC Campaign API", "USASpending.gov", "FederalRegister", "GovInfo", "OpenSecrets", "Senate Disclosures"].map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ width: 6, height: 6, background: "#2A9D8F", borderRadius: "50%" }} />
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#888" }}>{s}</span>
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

export default function App() {
  const [active, setActive] = useState("dashboard");

  const renderContent = () => {
    if (active === "dashboard") return <Dashboard />;
    if (active === "politicians") return <PoliticianModule />;
    if (active === "agent") return <AgentModule />;
    if (active === "graph") return <GraphModule />;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400, color: "#333", fontFamily: "monospace", fontSize: 14 }}>
        [{active.toUpperCase()} MODULE — COMING IN NEXT BUILD]
      </div>
    );
  };

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh", color: "#F0EDE8", fontFamily: "monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=IBM+Plex+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #333; }
        @keyframes pulse { from { opacity: 0.3; transform: scale(0.8); } to { opacity: 1; transform: scale(1.2); } }
        input::placeholder { color: #444; }
      `}</style>

      {/* Header */}
      <div style={{ background: "#111", borderBottom: "1px solid #1E1E1E", padding: "0 24px", display: "flex", alignItems: "center", gap: 0, height: 52 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 1, marginRight: 40 }}>
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#F0EDE8", letterSpacing: 2 }}>R</span>
          <div style={{ width: 7, height: 7, background: "#E63946", borderRadius: "50%", marginBottom: 2, marginLeft: 1, marginRight: 1 }} />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#F0EDE8", letterSpacing: 2 }}>CEIPTS</span>
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
