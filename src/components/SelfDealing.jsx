/**
 * Story A — Self-Dealing & Insider Enrichment
 * "Is this candidate paying vendors they own?"
 *
 * Searches disbursements_detail for a candidate's principal committee,
 * flags rows where the recipient surname matches the candidate's.
 */
import { useState } from "react";
import { useTheme } from "../theme/index.js";
import { ORANGE, FONT_MONO as MF, FONT_SERIF as SF } from "../theme/tokens.js";

const fmt = (n) => {
  if (!n) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};

function isSuspect(recipientName, candidateName) {
  if (!recipientName || !candidateName) return false;
  const lastName = candidateName.split(",")[0].trim().toLowerCase();
  return recipientName.toLowerCase().includes(lastName);
}

export default function SelfDealing() {
  const t = useTheme();
  const [query, setQuery]         = useState("");
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected]   = useState(null);
  const [results, setResults]     = useState([]);
  const [loading, setLoading]     = useState(false);
  const [step, setStep]           = useState("search"); // "search" | "pick" | "results"
  const [error, setError]         = useState(null);

  const searchCandidates = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/donors/candidates?name=${encodeURIComponent(query)}&limit=10&source=supabase`);
      const json = await res.json();
      const list = json.data?.results || json.results || [];
      setCandidates(list);
      setStep("pick");
    } catch {
      setError("Failed to search candidates.");
    }
    setLoading(false);
  };

  const loadDisbursements = async (candidate) => {
    setSelected(candidate);
    setLoading(true); setError(null); setStep("results");
    const committeeId = candidate.totals?.committee_id || candidate.fec_candidate_id;
    try {
      const params = new URLSearchParams({
        committee_id: committeeId,
        ...(candidate.cycle ? { cycle: candidate.cycle } : {}),
        limit: 100,
        min_amount: 0,
      });
      const res  = await fetch(`/api/spending/disbursements?${params}`);
      const json = await res.json();
      setResults(json.results || []);
    } catch {
      setError("Failed to load disbursements.");
    }
    setLoading(false);
  };

  const flagged = results.filter(r => isSuspect(r.recipient_name, selected?.name));
  const clean   = results.filter(r => !isSuspect(r.recipient_name, selected?.name));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>
          SELF-DEALING · FEC SCHEDULE B · DISBURSEMENTS
        </div>
        <h2 style={{ fontFamily: SF, fontSize: 28, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>
          Self-Dealing Detector
        </h2>
        <p style={{ fontFamily: SF, fontSize: 13, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          Search a candidate's campaign disbursements and flag payments to vendors
          whose name matches the candidate's — a pattern associated with insider enrichment.
        </p>
      </div>

      {/* Search bar */}
      <div style={{ display: "flex", gap: 0 }}>
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setStep("search"); }}
          onKeyDown={e => e.key === "Enter" && searchCandidates()}
          placeholder="Search candidate name (e.g. Trump, Biden, Harris)…"
          style={{
            flex: 1, background: t.inputBg || t.card, border: `1px solid ${t.border}`,
            borderLeft: `2px solid ${ORANGE}`, borderRight: "none",
            padding: "9px 12px", fontFamily: MF, fontSize: 11, color: t.hi, outline: "none",
          }}
        />
        <button
          onClick={searchCandidates}
          style={{ background: ORANGE, border: "none", padding: "0 20px", fontFamily: MF, fontSize: 10.5, color: "#fff", fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}
        >
          SEARCH
        </button>
      </div>

      {error && (
        <div style={{ background: t.card, border: `1px solid ${ORANGE}`, borderLeft: `3px solid ${ORANGE}`, padding: "10px 14px", fontFamily: MF, fontSize: 10, color: ORANGE }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{ fontFamily: MF, fontSize: 11, color: t.low, textAlign: "center", padding: 20 }}>
          Loading…
        </div>
      )}

      {/* Pick candidate */}
      {step === "pick" && !loading && (
        <div style={{ background: t.card, border: `1px solid ${t.border}` }}>
          <div style={{ padding: "7px 14px", borderBottom: `1px solid ${t.border}`, fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>
            SELECT CANDIDATE
          </div>
          {candidates.length === 0 && (
            <div style={{ padding: "14px", fontFamily: MF, fontSize: 10, color: t.mid }}>No candidates found for "{query}".</div>
          )}
          {candidates.map((c, i) => (
            <div
              key={i}
              onClick={() => loadDisbursements(c)}
              style={{
                padding: "10px 14px", borderBottom: `1px solid ${t.border}`,
                cursor: "pointer", display: "flex", gap: 12, alignItems: "center",
                background: i % 2 === 0 ? t.card : (t.tableAlt || t.card),
              }}
            >
              <span style={{ fontFamily: MF, fontSize: 11, color: t.hi, flex: 1 }}>{c.name}</span>
              <span style={{ fontFamily: MF, fontSize: 9, color: t.mid, width: 40 }}>{c.party}</span>
              <span style={{ fontFamily: MF, fontSize: 9, color: t.mid, width: 30 }}>{c.state}</span>
              <span style={{ fontFamily: MF, fontSize: 9, color: t.low }}>{c.office}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {step === "results" && !loading && selected && (
        <>
          {/* Summary banner */}
          <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: "12px 16px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, marginBottom: 3 }}>CANDIDATE</div>
              <div style={{ fontFamily: MF, fontSize: 12, color: t.hi }}>{selected.name}</div>
            </div>
            <div>
              <div style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, marginBottom: 3 }}>DISBURSEMENTS</div>
              <div style={{ fontFamily: MF, fontSize: 12, color: t.hi }}>{results.length}</div>
            </div>
            <div>
              <div style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, marginBottom: 3 }}>FLAGGED</div>
              <div style={{ fontFamily: MF, fontSize: 12, color: flagged.length > 0 ? ORANGE : (t.ok || "#4A7FFF"), fontWeight: 700 }}>
                {flagged.length}
              </div>
            </div>
            <div>
              <div style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, marginBottom: 3 }}>FLAGGED $</div>
              <div style={{ fontFamily: MF, fontSize: 12, color: flagged.length > 0 ? ORANGE : t.mid }}>
                {fmt(flagged.reduce((s, r) => s + (r.disbursement_amount || 0), 0))}
              </div>
            </div>
            <button
              onClick={() => { setStep("search"); setResults([]); setSelected(null); }}
              style={{ marginLeft: "auto", background: "none", border: `1px solid ${t.border}`, padding: "4px 12px", fontFamily: MF, fontSize: 9, color: t.mid, cursor: "pointer" }}
            >
              ← NEW SEARCH
            </button>
          </div>

          {results.length === 0 && (
            <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: 16, fontFamily: MF, fontSize: 10, color: t.mid }}>
              No disbursements found. The backfill may still be running, or this committee has no Schedule B data yet.
            </div>
          )}

          {/* Flagged rows first */}
          {flagged.length > 0 && (
            <DisbursementTable rows={flagged} title="FLAGGED — POTENTIAL SELF-DEALING" accent={ORANGE} t={t} />
          )}
          {clean.length > 0 && (
            <DisbursementTable rows={clean} title="ALL OTHER DISBURSEMENTS" accent={t.border} t={t} />
          )}
        </>
      )}
    </div>
  );
}

function DisbursementTable({ rows, title, accent, t }) {
  return (
    <div style={{ background: t.card, border: `1px solid ${t.border}` }}>
      <div style={{ background: t.cardB || t.card, borderTop: `3px solid ${accent}`, padding: "7px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>{title}</span>
        <span style={{ fontFamily: MF, fontSize: 8, color: t.low }}>{rows.length} rows</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 160px 100px 90px", gap: 0 }}>
        <div style={{ padding: "6px 14px", borderBottom: `2px solid ${t.border}`, fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>RECIPIENT</div>
        <div style={{ padding: "6px 14px", borderBottom: `2px solid ${t.border}`, fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>DESCRIPTION</div>
        <div style={{ padding: "6px 14px", borderBottom: `2px solid ${t.border}`, fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2, textAlign: "right" }}>AMOUNT</div>
        <div style={{ padding: "6px 14px", borderBottom: `2px solid ${t.border}`, fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 2 }}>DATE</div>
      </div>
      {rows.slice(0, 50).map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 160px 100px 90px", borderBottom: `1px solid ${t.border}`, background: i % 2 === 0 ? t.card : (t.tableAlt || t.card) }}>
          <div style={{ padding: "9px 14px", fontFamily: MF, fontSize: 10.5, color: accent === ORANGE ? ORANGE : t.hi }}>{r.recipient_name || "—"}</div>
          <div style={{ padding: "9px 14px", fontFamily: MF, fontSize: 9, color: t.mid }}>{r.disbursement_description || r.purpose_category || "—"}</div>
          <div style={{ padding: "9px 14px", fontFamily: MF, fontSize: 11, color: accent === ORANGE ? ORANGE : t.hi, fontWeight: 700, textAlign: "right" }}>{fmt(r.disbursement_amount)}</div>
          <div style={{ padding: "9px 14px", fontFamily: MF, fontSize: 9, color: t.mid }}>{r.disbursement_date?.slice(0, 10) || "—"}</div>
        </div>
      ))}
      {rows.length > 50 && (
        <div style={{ padding: "8px 14px", fontFamily: MF, fontSize: 9, color: t.low }}>
          Showing 50 of {rows.length} rows
        </div>
      )}
    </div>
  );
}
