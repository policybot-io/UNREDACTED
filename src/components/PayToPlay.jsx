/**
 * Story B — Pay-to-Play / Contractor Donations
 * "Did this contractor donate to the committee that approved their contract?"
 *
 * Cross-references FEC contributor_employer with USASpending recipient_name,
 * surfaces cases where a donation preceded a contract award within 12 months.
 */
import { useState } from "react";
import { useTheme } from "../theme/index.js";
import { ORANGE, FONT_MONO as MF, FONT_SERIF as SF } from "../theme/tokens.js";

const fmt = (n) => {
  if (!n) return "—";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};

const EXAMPLES = ["Lockheed Martin", "Raytheon", "Boeing", "Northrop Grumman", "Pfizer", "Amazon"];

export default function PayToPlay() {
  const t = useTheme();
  const [query, setQuery]     = useState("");
  const [matches, setMatches] = useState([]);
  const [meta, setMeta]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]     = useState(null);

  const search = async (company = query) => {
    if (!company.trim()) return;
    setLoading(true); setSearched(true); setError(null);
    try {
      const res  = await fetch(`/api/spending/pay-to-play?company=${encodeURIComponent(company)}&limit=25`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setMatches(json.matches || []);
      setMeta({ contractCount: json.contractCount, donationCount: json.donationCount });
      setQuery(company);
    } catch (e) {
      setError(e.message || "Search failed.");
      setMatches([]);
    }
    setLoading(false);
  };

  const riskColor = (days) => {
    if (days <= 90)  return ORANGE;
    if (days <= 180) return t.warn || "#FFB84D";
    return t.ok || "#4A7FFF";
  };

  const riskLabel = (days) => {
    if (days <= 90)  return "HIGH";
    if (days <= 180) return "MEDIUM";
    return "LOW";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>
          PAY-TO-PLAY · FEC × USASPENDING · CONTRACTOR DONATIONS
        </div>
        <h2 style={{ fontFamily: SF, fontSize: 28, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>
          Pay-to-Play Index
        </h2>
        <p style={{ fontFamily: SF, fontSize: 13, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          Cross-references federal contractor donations against contract awards.
          Highlights cases where a company donated to a politician's committee
          within 12 months before receiving a contract from their agency.
        </p>
      </div>

      {/* Search */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 0 }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Search by company name (e.g. Lockheed Martin, Boeing)…"
            style={{
              flex: 1, background: t.inputBg || t.card, border: `1px solid ${t.border}`,
              borderLeft: `2px solid ${ORANGE}`, borderRight: "none",
              padding: "9px 12px", fontFamily: MF, fontSize: 11, color: t.hi, outline: "none",
            }}
          />
          <button
            onClick={() => search()}
            style={{ background: ORANGE, border: "none", padding: "0 20px", fontFamily: MF, fontSize: 10.5, color: "#fff", fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}
          >
            SEARCH
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {EXAMPLES.map(ex => (
            <button
              key={ex}
              onClick={() => search(ex)}
              style={{ background: "none", border: `1px solid ${t.border}`, padding: "3px 10px", fontFamily: MF, fontSize: 9, color: t.mid, cursor: "pointer" }}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: t.card, border: `1px solid ${ORANGE}`, borderLeft: `3px solid ${ORANGE}`, padding: "10px 14px", fontFamily: MF, fontSize: 10, color: ORANGE }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ fontFamily: MF, fontSize: 11, color: t.low, textAlign: "center", padding: 20 }}>Searching FEC + USASpending…</div>
      )}

      {/* Meta */}
      {searched && !loading && meta && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            ["CONTRACTS FOUND", meta.contractCount],
            ["DONATIONS FOUND", meta.donationCount],
            ["TIMELINE MATCHES", matches.length],
          ].map(([label, val]) => (
            <div key={label} style={{ background: t.card, border: `1px solid ${t.border}`, padding: "10px 16px", minWidth: 120 }}>
              <div style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, marginBottom: 4 }}>{label}</div>
              <div style={{ fontFamily: MF, fontSize: 20, color: label === "TIMELINE MATCHES" && val > 0 ? ORANGE : t.hi, fontWeight: 700 }}>{val}</div>
            </div>
          ))}
        </div>
      )}

      {/* No matches */}
      {searched && !loading && matches.length === 0 && meta && (
        <div style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${t.border}`, padding: 16 }}>
          <div style={{ fontFamily: MF, fontSize: 9, color: t.low, letterSpacing: 1, marginBottom: 5 }}>NO TIMELINE MATCHES</div>
          <div style={{ fontFamily: MF, fontSize: 10, color: t.mid }}>
            {meta.contractCount === 0 && meta.donationCount === 0
              ? `No contracts or donations found for "${query}". Try a major federal contractor name.`
              : `Found ${meta.contractCount} contract(s) and ${meta.donationCount} donation(s) but no overlap within 12 months.`}
          </div>
        </div>
      )}

      {/* Results table */}
      {matches.length > 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <div style={{ background: t.cardB || t.card, borderTop: `3px solid ${ORANGE}`, padding: "7px 14px", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>PAY-TO-PLAY TIMELINE MATCHES · {query.toUpperCase()}</span>
            <span style={{ fontFamily: MF, fontSize: 8, color: t.low }}>{matches.length} matches</span>
          </div>

          {/* Column headers */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 80px 70px 70px", borderBottom: `2px solid ${t.border}` }}>
            {[["COMPANY / AGENCY", ""], ["DONATION", "right"], ["CONTRACT", "right"], ["DAYS BEFORE", "right"], ["RISK", ""], ["", ""]].map(([h, align], i) => (
              <div key={i} style={{ padding: "6px 10px", fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, textAlign: align || "left" }}>{h}</div>
            ))}
          </div>

          {matches.map((m, i) => {
            const rc = riskColor(m.daysBefore);
            return (
              <div key={i} style={{ borderBottom: `1px solid ${t.border}`, background: i % 2 === 0 ? t.card : (t.tableAlt || t.card) }}>
                {/* Main row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 110px 110px 80px 70px 70px" }}>
                  <div style={{ padding: "9px 10px" }}>
                    <div style={{ fontFamily: MF, fontSize: 10.5, color: t.hi }}>{m.company}</div>
                    <div style={{ fontFamily: MF, fontSize: 9, color: t.mid, marginTop: 2 }}>{m.agency}</div>
                  </div>
                  <div style={{ padding: "9px 10px", textAlign: "right" }}>
                    <div style={{ fontFamily: MF, fontSize: 11, color: ORANGE, fontWeight: 700 }}>{fmt(m.donationAmount)}</div>
                    <div style={{ fontFamily: MF, fontSize: 8, color: t.low }}>{m.donationDate?.slice(0, 10)}</div>
                  </div>
                  <div style={{ padding: "9px 10px", textAlign: "right" }}>
                    <div style={{ fontFamily: MF, fontSize: 11, color: t.hi, fontWeight: 700 }}>{fmt(m.contractAmount)}</div>
                    <div style={{ fontFamily: MF, fontSize: 8, color: t.low }}>{m.contractDate?.slice(0, 10)}</div>
                  </div>
                  <div style={{ padding: "9px 10px", fontFamily: MF, fontSize: 12, color: rc, fontWeight: 700, textAlign: "right" }}>
                    {m.daysBefore}d
                  </div>
                  <div style={{ padding: "9px 10px", display: "flex", alignItems: "center" }}>
                    <span style={{ fontFamily: MF, fontSize: 8, letterSpacing: 1, color: rc, border: `1px solid ${rc}44`, padding: "2px 6px", background: `${rc}12` }}>
                      {riskLabel(m.daysBefore)}
                    </span>
                  </div>
                  <div style={{ padding: "9px 10px" }} />
                </div>
                {/* Donor detail */}
                <div style={{ padding: "0 10px 8px", fontFamily: MF, fontSize: 8.5, color: t.low }}>
                  Donor: {m.donorName || "—"} · {m.donorEmployer || "—"}
                  {m.candidateName
                    ? <span> · Candidate: {m.candidateName} ({m.candidateParty}-{m.candidateState})</span>
                    : m.candidateId && <span> · Candidate: {m.candidateId}</span>}
                </div>
              </div>
            );
          })}

          <div style={{ padding: "7px 14px", background: t.cardB || t.card, borderTop: `1px solid ${t.border}`, fontFamily: MF, fontSize: 8.5, color: t.low }}>
            Sources: FEC Schedule A (contributions) × USASpending.gov (contracts). Risk based on days between donation and contract award. All findings are analytical — not legal conclusions.
          </div>
        </div>
      )}
    </div>
  );
}
