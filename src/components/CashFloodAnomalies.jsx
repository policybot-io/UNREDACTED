/**
 * Story J — Cash Flood Anomalies
 * "This candidate raised $5M in one week — where from?"
 *
 * Detects candidates with unusual fundraising spikes by comparing
 * the most recent 30-day window against the prior 30-day window.
 */
import { useState, useEffect } from "react";
import { useTheme } from "../theme/index.js";
import { ORANGE, FONT_MONO as MF, FONT_SERIF as SF } from "../theme/tokens.js";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const fmt = (n) => {
  if (!n) return "$0";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n}`;
};

const PARTY_COLOR = { D: "#4A7FFF", R: ORANGE, I: "#00CC66" };

export default function CashFloodAnomalies() {
  const t = useTheme();
  const [alerts, setAlerts]   = useState([]);
  const [meta, setMeta]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res  = await fetch("/api/donors/cash-flood?topN=20");
        const json = await res.json();
        if (!json.success) throw new Error(json.error);
        setAlerts(json.alerts || []);
        setMeta({ asOf: json.asOf, windowDays: json.windowDays || 30 });
      } catch (e) {
        setError(e.message || "Failed to load anomalies.");
      }
      setLoading(false);
    })();
  }, []);

  const spikeColor = (ratio) => {
    if (ratio >= 10)  return ORANGE;
    if (ratio >= 3)   return t.warn || "#FFB84D";
    return t.ok || "#4A7FFF";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>
          CASH FLOOD · FEC CONTRIBUTIONS · ANOMALY DETECTION
        </div>
        <h2 style={{ fontFamily: SF, fontSize: 28, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 6 }}>
          Cash Flood Anomalies
        </h2>
        <p style={{ fontFamily: SF, fontSize: 13, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          Candidates whose fundraising surged ≥ 1.5× in the last 30 days
          compared to the prior 30 days. Sudden cash floods can signal coordinated donor networks,
          viral moments, or undisclosed coordination.
        </p>
        {meta && (
          <div style={{ fontFamily: MF, fontSize: 9, color: t.low, marginTop: 6 }}>
            As of {meta.asOf} · {meta.windowDays}-day comparison windows · $200+ contributions
          </div>
        )}
      </div>

      {loading && (
        <div style={{ fontFamily: MF, fontSize: 11, color: t.low, textAlign: "center", padding: 32 }}>
          Scanning contributions database…
        </div>
      )}

      {error && (
        <div style={{ background: t.card, border: `1px solid ${ORANGE}`, borderLeft: `3px solid ${ORANGE}`, padding: "10px 14px", fontFamily: MF, fontSize: 10, color: ORANGE }}>
          {error}
        </div>
      )}

      {!loading && !error && alerts.length === 0 && (
        <div style={{ background: t.card, border: `1px solid ${t.border}`, padding: 20 }}>
          <div style={{ fontFamily: MF, fontSize: 9, color: t.low, letterSpacing: 2, marginBottom: 6 }}>NO ANOMALIES DETECTED</div>
          <div style={{ fontFamily: MF, fontSize: 10, color: t.mid }}>
            No significant fundraising spikes found in the last 60 days.
            This requires the FEC individual contributions backfill (fec-indiv) to be complete.
          </div>
        </div>
      )}

      {/* Alert cards */}
      {alerts.length > 0 && (
        <>
          <div style={{ fontFamily: MF, fontSize: 9, color: t.low }}>
            {alerts.length} candidates with anomalous fundraising activity
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {alerts.map((a, i) => {
              const sc = spikeColor(a.spikeRatio);
              const partyC = PARTY_COLOR[a.party] || t.mid;
              const chartData = [
                { window: "Prior 30d", amount: a.priorAmount || 0 },
                { window: "Recent 30d", amount: a.recentAmount },
              ];

              return (
                <div key={i} style={{ background: t.card, border: `1px solid ${t.border}`, borderLeft: `3px solid ${sc}` }}>
                  <div style={{ padding: "12px 16px", display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    {/* Rank */}
                    <div style={{ fontFamily: MF, fontSize: 22, color: t.border, fontWeight: 700, minWidth: 28, lineHeight: 1 }}>
                      {i + 1}
                    </div>

                    {/* Identity */}
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        <span style={{ fontFamily: MF, fontSize: 13, color: t.hi, fontWeight: 700 }}>
                          {a.name || a.candidateId}
                        </span>
                        {a.party && (
                          <span style={{ fontFamily: MF, fontSize: 8, color: partyC, border: `1px solid ${partyC}44`, padding: "1px 5px" }}>
                            {a.party}
                          </span>
                        )}
                        {a.state && (
                          <span style={{ fontFamily: MF, fontSize: 9, color: t.mid }}>{a.state}</span>
                        )}
                      </div>
                      <div style={{ fontFamily: MF, fontSize: 9, color: t.low }}>{a.candidateId}</div>
                    </div>

                    {/* Spike ratio */}
                    <div style={{ textAlign: "center", minWidth: 80 }}>
                      <div style={{ fontFamily: MF, fontSize: 28, color: sc, fontWeight: 700, lineHeight: 1 }}>
                        {a.priorAmount > 0 ? `${a.spikeRatio}×` : "NEW"}
                      </div>
                      <div style={{ fontFamily: MF, fontSize: 8, color: t.low, letterSpacing: 1 }}>SPIKE</div>
                    </div>

                    {/* Amounts */}
                    <div style={{ minWidth: 130 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontFamily: MF, fontSize: 8, color: t.low }}>RECENT 30D</span>
                        <span style={{ fontFamily: MF, fontSize: 11, color: sc, fontWeight: 700 }}>{fmt(a.recentAmount)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontFamily: MF, fontSize: 8, color: t.low }}>PRIOR 30D</span>
                        <span style={{ fontFamily: MF, fontSize: 11, color: t.mid }}>{fmt(a.priorAmount)}</span>
                      </div>
                    </div>

                    {/* Mini bar chart */}
                    <div style={{ width: 120, height: 50 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} barCategoryGap="30%">
                          <XAxis dataKey="window" tick={{ fontFamily: MF, fontSize: 7, fill: t.low }} axisLine={false} tickLine={false} />
                          <YAxis hide />
                          <Tooltip
                            contentStyle={{ background: t.card, border: `1px solid ${t.border}`, fontFamily: MF, fontSize: 9 }}
                            formatter={v => [fmt(v), ""]}
                          />
                          <Bar dataKey="amount" fill={sc} radius={0} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div style={{ fontFamily: MF, fontSize: 8.5, color: t.low, borderTop: `1px solid ${t.border}`, paddingTop: 12 }}>
        Sources: FEC individual contributions (Schedule A). Spike = recent 30d ÷ prior 30d ≥ 1.5×, minimum $100K recent.
        All findings are analytical — not legal conclusions.
      </div>
    </div>
  );
}
