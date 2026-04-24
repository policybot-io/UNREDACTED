/**
 * MoneyFlowSankey — 5-tier "Follow the Money" Sankey driven by the
 * `money_flow_edges` materialized view via /api/donors/money-flow.
 *
 * Tiers (per RESEARCH_BULK_INGEST §6a): 1 employer/industry → 2 individual donor
 * → 3 PAC/committee → 4 party committee → 5 candidate.
 */
import { useEffect, useMemo, useState } from "react";
import { Sankey, Tooltip, ResponsiveContainer, Layer, Rectangle } from "recharts";
import { useTheme } from "../theme/index.js";
import { ORANGE, FONT_MONO as MF } from "../theme/tokens.js";
import { Band, Card, CardTitle, SourceFooter } from "./ui/index.js";
import { donors } from "../api/client.js";

const CYCLES = ["2026", "2024"];
const TIER_COLOR = { 1:"#4A7FFF", 2:"#9966CC", 3:ORANGE, 4:"#FFB84D", 5:"#00AADD" };
const TIER_LABEL = { 1:"Employer", 2:"Donor", 3:"PAC/Committee", 4:"Party", 5:"Candidate" };

function fmt$(v) {
  if (v == null) return "—";
  if (v >= 1e9) return `$${(v/1e9).toFixed(2)}b`;
  if (v >= 1e6) return `$${(v/1e6).toFixed(1)}m`;
  if (v >= 1e3) return `$${(v/1e3).toFixed(0)}k`;
  return `$${v}`;
}

function SankeyNode({ x, y, width, height, payload, theme }) {
  if (!payload || height < 2) return null;
  const tier = payload.tier || 1;
  const color = TIER_COLOR[tier] || ORANGE;
  const label = payload.label || payload.name || "—";
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill={color} fillOpacity={0.85} stroke={color} />
      {height > 14 && (
        <text x={x + width + 6} y={y + height / 2} textAnchor="start" dominantBaseline="middle"
              fontFamily={MF} fontSize={9} fill={theme?.mid || "#BBB"}>
          {label.length > 28 ? label.slice(0, 26) + "…" : label}
        </text>
      )}
    </Layer>
  );
}

export default function MoneyFlowSankey() {
  const t = useTheme();
  const [cycle, setCycle]     = useState("2026");
  const [minAmount, setMin]   = useState(100000);
  const [limit, setLimit]     = useState(150);
  const [edges, setEdges]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setErr(null);
    donors.moneyFlow({ cycle, minAmount, limit })
      .then(r => { if (!cancelled) setEdges(r?.data?.edges || []); })
      .catch(e => { if (!cancelled) setErr(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cycle, minAmount, limit]);

  const chart = useMemo(() => {
    if (!edges.length) return null;
    const nodeKey = (id, type, tier) => `${tier}:${type}:${id}`;
    const idx = new Map();
    const nodes = [];
    const register = (id, type, tier, label) => {
      const k = nodeKey(id, type, tier);
      if (!idx.has(k)) {
        idx.set(k, nodes.length);
        nodes.push({ name: label || id, label: label || id, tier });
      }
      return idx.get(k);
    };
    const links = [];
    for (const e of edges) {
      const s = register(e.source_id, e.source_type, Number(e.source_tier), e.source_label);
      const tgt = register(e.target_id, e.target_type, Number(e.target_tier), e.target_label);
      const v = Number(e.amount) || 0;
      if (v > 0 && s !== tgt) links.push({ source: s, target: tgt, value: v });
    }
    return { nodes, links };
  }, [edges]);

  const selectStyle = {
    background: t.card, color: t.hi, border: `1px solid ${t.border}`,
    padding: "6px 8px", fontFamily: MF, fontSize: 10, minWidth: 72,
  };

  return (
    <div>
      <Band label="Follow the Money — 5-tier flow" right={`${edges.length} EDGES`} />
      <Card>
        <CardTitle
          h="Who funds whom — from employers through PACs to candidates."
          sub="Sankey of the money_flow_edges materialized view (contributions + committee transfers)"
        />

        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:12 }}>
          <label style={{ fontFamily:MF, fontSize:9, color:t.mid, display:"flex", alignItems:"center", gap:6 }}>
            CYCLE
            <select value={cycle} onChange={e => setCycle(e.target.value)} style={selectStyle}>
              {CYCLES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label style={{ fontFamily:MF, fontSize:9, color:t.mid, display:"flex", alignItems:"center", gap:6 }}>
            MIN $
            <select value={minAmount} onChange={e => setMin(Number(e.target.value))} style={selectStyle}>
              {[10000, 50000, 100000, 500000, 1000000].map(v => <option key={v} value={v}>{fmt$(v)}</option>)}
            </select>
          </label>
          <label style={{ fontFamily:MF, fontSize:9, color:t.mid, display:"flex", alignItems:"center", gap:6 }}>
            EDGES
            <select value={limit} onChange={e => setLimit(Number(e.target.value))} style={selectStyle}>
              {[50, 100, 150, 300, 500].map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <div style={{ display:"flex", gap:10, marginLeft:"auto", alignItems:"center" }}>
            {[1,2,3,4,5].map(k => (
              <div key={k} style={{ display:"flex", alignItems:"center", gap:4 }}>
                <div style={{ width:10, height:10, background:TIER_COLOR[k] }} />
                <span style={{ fontFamily:MF, fontSize:8.5, color:t.mid, letterSpacing:1 }}>{TIER_LABEL[k]}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ minHeight: 420, border:`1px solid ${t.border}`, background:t.cardB, padding:"8px 0" }}>
          {loading && <div style={{ padding:40, textAlign:"center", color:t.low, fontFamily:MF, fontSize:10 }}>Loading money flow…</div>}
          {err && <div style={{ padding:40, textAlign:"center", color:ORANGE, fontFamily:MF, fontSize:10 }}>Error: {err}</div>}
          {!loading && !err && !chart && <div style={{ padding:40, textAlign:"center", color:t.low, fontFamily:MF, fontSize:10 }}>No edges in money_flow_edges for this cycle. Run the FEC bulk backfill to populate.</div>}
          {!loading && !err && chart && (
            <ResponsiveContainer width="100%" height={480}>
              <Sankey
                data={chart}
                nodePadding={8}
                nodeWidth={12}
                linkCurvature={0.5}
                iterations={32}
                node={<SankeyNode theme={t} />}
                link={{ stroke: ORANGE, strokeOpacity: 0.25, fill: ORANGE, fillOpacity: 0.18 }}
                margin={{ top: 10, right: 180, bottom: 10, left: 10 }}
              >
                <Tooltip
                  contentStyle={{ background: t.card, border: `1px solid ${t.border}`, fontFamily: MF, fontSize: 10, color: t.hi }}
                  formatter={(v) => [fmt$(v), "amount"]}
                />
              </Sankey>
            </ResponsiveContainer>
          )}
        </div>

        <SourceFooter s="FEC bulk data — pas2 (PAC→candidate), oth (committee transfers), indiv (≥ threshold) · aggregated via money_flow_edges MV" />
      </Card>
    </div>
  );
}
