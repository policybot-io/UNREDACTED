/**
 * Budget & Contracts — consolidated federal spending intelligence tab
 *
 * Merges Spending Audit + Company Profiles into one coherent tab:
 * - Agency Spending   (budget variance — canonical SPEND data location)
 * - Contract Awards   (USASpending search — enhanced)
 * - Corporate Index   (accountability table — canonical CORPS location)
 * - Company Profile   (searchable deep-dive)
 * - Energy            (EIA state energy mix — new)
 *
 * The PAC-vs-contracts scatter plot from Spending Audit is retired here
 * since it duplicated the Corporate Index data in a less readable form.
 */

import { useState } from "react";
import { useTheme } from "../theme/index.js";
import { ORANGE, FONT_MONO as MF, FONT_SERIF as SF } from "../theme/tokens.js";
import CompanyProfile from "../components/CompanyProfile.jsx";
import EnergyIntelligence from "../components/EnergyIntelligence.jsx";
import SelfDealing from "../components/SelfDealing.jsx";
import PayToPlay from "../components/PayToPlay.jsx";

const SUBTABS = [
  { id: "spending",     label: "Agency Spending"             },
  { id: "contracts",    label: "Contract Awards"             },
  { id: "selfdealing",  label: "Self-Dealing",  badge: "NEW" },
  { id: "paytoplay",    label: "Pay-to-Play",   badge: "NEW" },
  { id: "index",        label: "Corporate Index"             },
  { id: "profile",      label: "Company Profile"             },
  { id: "energy",       label: "Energy Intel",  badge: "NEW" },
];

// ─── Shared data (moved from App.jsx) ─────────────────────────────────────────
const SPEND = [
  { a:"Defense",   b:886,  v:921,  p:104 }, { a:"HHS",       b:1741, v:1698, p:98  },
  { a:"SSA",       b:1310, v:1289, p:98  }, { a:"Treasury",  b:847,  v:912,  p:108 },
  { a:"Education", b:79,   v:71,   p:90  }, { a:"Veterans",  b:301,  v:318,  p:106 },
  { a:"Homeland",  b:98,   v:94,   p:96  }, { a:"Justice",   b:37,   v:42,   p:114 },
];
const CORPS = [
  { n:"Lockheed Martin",   pac:168, con:7800, sc:28, s:"Defence" }, { n:"Northrop Grumman",  pac:112, con:6100, sc:29, s:"Defence" },
  { n:"Boeing",            pac:95,  con:4200, sc:31, s:"Defence" }, { n:"Raytheon Tech.",    pac:142, con:5100, sc:34, s:"Defence" },
  { n:"UnitedHealth Grp.", pac:71,  con:2100, sc:41, s:"Health"  }, { n:"Pfizer",            pac:64,  con:890,  sc:48, s:"Pharma"  },
  { n:"JPMorgan Chase",    pac:88,  con:120,  sc:52, s:"Finance" }, { n:"Amazon",            pac:44,  con:7200, sc:58, s:"Tech"    },
  { n:"Chevron",           pac:58,  con:340,  sc:61, s:"Energy"  }, { n:"CVS Health",        pac:39,  con:890,  sc:69, s:"Health"  },
];

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

// ─── Shared helpers ────────────────────────────────────────────────────────────
function SubTabBar({ tabs, active, onChange }) {
  const t = useTheme();
  return (
    <div style={{ display: "flex", borderBottom: `1px solid ${t.border}`, flexWrap: "wrap" }}>
      {tabs.map(st => (
        <button key={st.id} onClick={() => onChange(st.id)} style={{
          background: "none", border: "none", cursor: "pointer",
          padding: "10px 18px", fontFamily: MF, fontSize: 10.5, letterSpacing: 0.5,
          color: active === st.id ? ORANGE : t.mid,
          borderBottom: `3px solid ${active === st.id ? ORANGE : "transparent"}`,
          marginBottom: -1, transition: "all .14s", whiteSpace: "nowrap",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {st.label}
          {st.badge && (
            <span style={{ background: "#00CC6622", border: "1px solid #00CC6644", color: "#00CC66", fontSize: 7, padding: "1px 4px", borderRadius: 2, fontWeight: 700 }}>
              {st.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Agency Spending ──────────────────────────────────────────────────────────
function AgencySpending() {
  const t = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>SPENDING AUDIT · USASPENDING.GOV · FPDS-NG</div>
        <h2 style={{ fontFamily: SF, fontSize: 28, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>Agency Budget Variance</h2>
        <p style={{ fontFamily: SF, fontSize: 13, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>Actual obligations versus congressional appropriations — agencies that overspent or underspent their FY2024 budget by the largest margin.</p>
      </div>

      <div style={{ background: t.card, border: `1px solid ${t.border}` }}>
        <div style={{ background: t.cardB || t.card, borderTop: `3px solid ${ORANGE}`, padding: "7px 14px", fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>
          AGENCY BUDGET VARIANCE · APPROPRIATED VS. ACTUAL · $B · FY2024
        </div>
        <div style={{ padding: "14px 18px 10px" }}>
          <div style={{ fontFamily: SF, fontStyle: "italic", fontSize: 12, color: t.mid, marginBottom: 14 }}>
            Treasury and Justice show the largest absolute overruns; Education alone came in under budget.
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={SPEND} layout="vertical" margin={{ left: 4, right: 60, top: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid horizontal={false} stroke={t.grid || "#1E1E1E"}/>
              <XAxis type="number" tick={{ fontFamily: MF, fontSize: 9, fill: t.mid }} axisLine={{ stroke: t.border }} tickLine={false} tickFormatter={v => `$${v}B`}/>
              <YAxis type="category" dataKey="a" tick={{ fontFamily: MF, fontSize: 9, fill: t.mid }} axisLine={{ stroke: t.border }} tickLine={false} width={72}/>
              <Tooltip contentStyle={{ background: t.card, border: `1px solid ${t.border}`, fontFamily: MF, fontSize: 11 }}/>
              <Bar dataKey="b" name="Appropriated" radius={0} barSize={10} fill={t.border || "#272727"}/>
              <Bar dataKey="v" name="Actual" radius={0} barSize={10}>
                {SPEND.map((d, i) => <Cell key={i} fill={d.v > d.b ? ORANGE : (t.ok || "#4A7FFF")}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {[["Appropriated", t.border || "#333"], ["Over budget", ORANGE], ["Under budget", t.ok || "#4A7FFF"]].map(([l, c]) => (
              <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <div style={{ width: 10, height: 10, background: c, border: `1px solid ${t.low || "#484848"}` }}/>
                <span style={{ fontFamily: MF, fontSize: 9, color: t.mid }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "6px 14px", borderTop: `1px solid ${t.border}`, fontFamily: MF, fontSize: 8.5, color: t.low }}>
          Sources: USASpending.gov · GovInfo budget justifications · FY2024
        </div>
      </div>
    </div>
  );
}

// ─── Contract Awards ──────────────────────────────────────────────────────────
function ContractAwards({ theme }) {
  const t = useTheme();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const res = await fetch(`/api/spending/contracts?keyword=${encodeURIComponent(query)}&limit=15`);
      const data = await res.json();
      setResults(data.data || data.results || []);
    } catch {
      setResults([]);
    }
    setLoading(false);
  };

  const fmt = (n) => {
    if (!n) return "—";
    if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
    return `$${(n / 1e3).toFixed(0)}K`;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>CONTRACT AWARDS · USASPENDING.GOV · FPDS-NG</div>
        <h2 style={{ fontFamily: SF, fontSize: 28, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>Contract Awards</h2>
        <p style={{ fontFamily: SF, fontSize: 13, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          Search federal contract awards from USASpending.gov. Track which companies are winning contracts, from which agencies, and in which fiscal year.
        </p>
      </div>

      <div style={{ display: "flex", gap: 0 }}>
        <input
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
          placeholder="Search company, agency, or keyword…"
          style={{ flex: 1, background: t.inputBg || t.card, border: `1px solid ${t.border}`, borderLeft: `2px solid ${ORANGE}`, borderRight: "none", padding: "9px 12px", fontFamily: MF, fontSize: 11, color: t.hi, outline: "none" }}
        />
        <button onClick={search} style={{ background: ORANGE, border: "none", padding: "0 20px", fontFamily: MF, fontSize: 10.5, color: "#fff", fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}>SEARCH</button>
      </div>

      {loading && <div style={{ fontFamily: MF, fontSize: 11, color: t.low, textAlign: "center", padding: 20 }}>Searching USASpending.gov…</div>}

      {searched && !loading && results.length === 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${ORANGE}`, padding: 16 }}>
          <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 1, marginBottom: 5 }}>NO RESULTS</div>
          <div style={{ fontFamily: MF, fontSize: 10, color: t.mid }}>No contracts found for "{query}". Try a company name like "Lockheed Martin" or agency like "Department of Defense".</div>
        </div>
      )}

      {results.length > 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <div style={{ background: t.cardB || t.card, padding: "7px 14px", borderBottom: `2px solid ${t.border}`, display: "grid", gridTemplateColumns: "1fr 160px 120px 100px", gap: 12 }}>
            {["RECIPIENT", "AWARDING AGENCY", "AMOUNT", "FISCAL YEAR"].map(h => (
              <div key={h} style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>{h}</div>
            ))}
          </div>
          {results.map((r, i) => (
            <div key={i} style={{ padding: "11px 14px", borderBottom: `1px solid ${t.border}`, background: i % 2 === 0 ? t.card : t.tableAlt, display: "grid", gridTemplateColumns: "1fr 160px 120px 100px", gap: 12, alignItems: "center" }}>
              <div style={{ fontFamily: MF, fontSize: 10.5, color: t.hi }}>{r.recipient_name || r.Recipient || "—"}</div>
              <div style={{ fontFamily: MF, fontSize: 9, color: t.mid }}>{r.awarding_agency_name || r.Agency || "—"}</div>
              <div style={{ fontFamily: MF, fontSize: 12, color: ORANGE, fontWeight: 700 }}>{fmt(r.award_amount || r.amount || 0)}</div>
              <div style={{ fontFamily: MF, fontSize: 9, color: t.mid }}>{r.fiscal_year || r.Year || "—"}</div>
            </div>
          ))}
        </div>
      )}

      {!searched && (
        <div style={{ fontFamily: MF, fontSize: 9, color: t.low, padding: "10px 0" }}>
          Try: "Lockheed Martin", "Raytheon", "Boeing", "Department of Defense", "Veterans Affairs"
        </div>
      )}
    </div>
  );
}

// ─── Corporate Index ──────────────────────────────────────────────────────────
function CorporateIndex() {
  const t = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>CORPORATE ACCOUNTABILITY · FEC · USASPENDING · UN*REDACTED SCORE</div>
        <h2 style={{ fontFamily: SF, fontSize: 28, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>Corporate Accountability Index</h2>
        <p style={{ fontFamily: SF, fontSize: 13, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          Companies ranked by the UN*REDACTED Accountability Score — a composite of donation-to-contract correlation, regulatory capture signals, disclosure compliance and revolving-door exposure.
        </p>
      </div>
      <div style={{ background: t.card, border: `1px solid ${t.border}`, borderTop: "none" }}>
        <div style={{ background: t.cardB || t.card, borderTop: `3px solid ${ORANGE}`, padding: "7px 14px", fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>
          ACCOUNTABILITY INDEX — TOP FEDERAL CONTRACTORS · FY2024 · LOWER SCORE = MORE RISK
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: t.cardB || t.card, borderBottom: `2px solid ${t.border}` }}>
              {[["COMPANY","170px"],["SECTOR","88px"],["PAC ($M)","88px"],["CONTRACTS","100px"],["ROI","70px"],["SCORE","140px"],["RISK","90px"]].map(([h,w]) => (
                <th key={h} style={{ padding:"8px 14px", width:w, textAlign:"left", fontFamily:MF, fontSize:8, color:t.low, letterSpacing:2, fontWeight:400, borderRight:`1px solid ${t.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CORPS.map((d,i) => {
              const rc = d.sc<35?ORANGE:d.sc<55?(t.warn||"#FFB84D"):(t.ok||"#4A7FFF");
              const rl = d.sc<35?"CRITICAL":d.sc<55?"HIGH":d.sc<70?"MEDIUM":"CLEAN";
              const roi = ((d.con/d.pac)*10).toFixed(1);
              return (
                <tr key={i} style={{ borderBottom:`1px solid ${t.border}`, background:i%2===0?t.card:t.tableAlt }}>
                  <td style={{ padding:"10px 14px", borderRight:`1px solid ${t.border}`, fontFamily:MF, fontSize:11, color:t.hi }}>{d.n}</td>
                  <td style={{ padding:"10px 14px", fontFamily:MF, fontSize:9.5, color:t.mid, borderRight:`1px solid ${t.border}` }}>{d.s}</td>
                  <td style={{ padding:"10px 14px", fontFamily:MF, fontSize:11, color:ORANGE, fontWeight:700, textAlign:"right", borderRight:`1px solid ${t.border}` }}>${d.pac}m</td>
                  <td style={{ padding:"10px 14px", textAlign:"right", fontFamily:MF, fontSize:11, color:ORANGE, fontWeight:700, borderRight:`1px solid ${t.border}` }}>${(d.con/1000).toFixed(1)}bn</td>
                  <td style={{ padding:"10px 14px", fontFamily:MF, fontSize:11, color:t.hi, textAlign:"right", borderRight:`1px solid ${t.border}` }}>{roi}×</td>
                  <td style={{ padding:"10px 14px", borderRight:`1px solid ${t.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <div style={{ width:70, height:5, background:t.border }}>
                        <div style={{ width:`${d.sc}%`, height:"100%", background:rc }}/>
                      </div>
                      <span style={{ fontFamily:MF, fontSize:10.5, color:rc, fontWeight:700, minWidth:22 }}>{d.sc}</span>
                    </div>
                  </td>
                  <td style={{ padding:"10px 14px" }}>
                    <span style={{ fontFamily:MF, fontSize:8, letterSpacing:1, color:rc, border:`1px solid ${rc}44`, padding:"2px 8px", background:`${rc}12` }}>{rl}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ padding:"7px 14px", background:t.cardB||t.card, borderTop:`1px solid ${t.border}` }}>
          <span style={{ fontFamily:MF, fontSize:8.5, color:t.low }}>Sources: FEC; USASpending.gov; UN*REDACTED accountability score. All inferences are analytical — not legal conclusions.</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function BudgetContracts({ theme }) {
  const [sub, setSub] = useState("spending");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <SubTabBar tabs={SUBTABS} active={sub} onChange={setSub} />
      {sub === "spending"    && <AgencySpending />}
      {sub === "contracts"   && <ContractAwards theme={theme} />}
      {sub === "selfdealing" && <SelfDealing />}
      {sub === "paytoplay"   && <PayToPlay />}
      {sub === "index"       && <CorporateIndex />}
      {sub === "profile"     && <CompanyProfile theme={theme} />}
      {sub === "energy"      && <EnergyIntelligence />}
    </div>
  );
}
