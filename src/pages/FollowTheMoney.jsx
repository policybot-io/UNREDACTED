/**
 * Follow the Money — canonical campaign finance intelligence tab
 *
 * Consolidates all donor/money features:
 * - Donor Intelligence  (top donors, politician profiles) — via DonorIntel prop
 * - Dark Money Tracker  (single canonical location — removed from Corruption Watch)
 * - Donor Web           (entity relationship graph) — via DonorWeb prop
 * - Lobbyist Bundlers   (NEW — FEC Schedule A + LD-203)
 * - Independent Expenditures (NEW — FEC Schedule E 24/48-hr reports)
 *
 * DonorIntel and DonorWeb are passed as component props from App.jsx to avoid
 * circular dependencies (both are defined inline in App.jsx).
 */

import { useState } from "react";
import { useTheme } from "../theme/index.js";
import { ORANGE, FONT_MONO as MF, FONT_SERIF as SF } from "../theme/tokens.js";
import DarkMoneyTracker from "../components/DarkMoneyTracker.jsx";
import LobbyistBundlers from "../components/LobbyistBundlers.jsx";
import IndependentExpenditures from "../components/IndependentExpenditures.jsx";
import EmployerLeaderboard from "../components/EmployerLeaderboard.jsx";
import CorporatePACFlow from "../components/CorporatePACFlow.jsx";
import CashFloodAnomalies from "../components/CashFloodAnomalies.jsx";

const SUBTABS = [
  { id: "flow",      label: "Money Flow",          badge: "NEW" },
  { id: "intel",     label: "Donor Intelligence"               },
  { id: "darkmoney", label: "Dark Money"                       },
  { id: "anomalies", label: "Cash Flood",           badge: "NEW" },
  { id: "web",       label: "Donor Web"                        },
  { id: "bundlers",  label: "Lobbyist Bundlers",   badge: "NEW" },
  { id: "ie",        label: "Indep. Expenditures", badge: "NEW" },
  { id: "corpacs",   label: "Corporate PACs",      badge: "NEW" },
];

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

export default function FollowTheMoney({ DonorIntel, DonorWeb, theme }) {
  const t = useTheme();
  const [sub, setSub] = useState("flow");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Editorial header */}
      <div style={{ borderTop: `3px solid ${ORANGE}`, paddingTop: 16 }}>
        <div style={{ fontFamily: MF, fontSize: 9, color: ORANGE, letterSpacing: 3, marginBottom: 8 }}>
          CAMPAIGN FINANCE · FEC · OPENSECRETS · DARK MONEY · LOBBYIST DISCLOSURE
        </div>
        <h2 style={{ fontFamily: SF, fontSize: 32, color: t.hi, fontWeight: 700, lineHeight: 1.1, marginBottom: 8 }}>
          Follow the Money
        </h2>
        <p style={{ fontFamily: SF, fontSize: 14, fontStyle: "italic", color: t.mid, lineHeight: 1.7, maxWidth: 640 }}>
          The complete campaign finance intelligence layer — from individual donor networks and dark money flows to lobbyist bundlers and last-minute super PAC expenditures.
        </p>
      </div>

      <SubTabBar tabs={SUBTABS} active={sub} onChange={setSub} />

      {sub === "flow"      && <EmployerLeaderboard />}
      {sub === "intel"     && DonorIntel && <DonorIntel />}
      {sub === "darkmoney" && <DarkMoneyTracker />}
      {sub === "anomalies" && <CashFloodAnomalies />}
      {sub === "web"       && DonorWeb && <DonorWeb />}
      {sub === "bundlers"  && <LobbyistBundlers />}
      {sub === "ie"        && <IndependentExpenditures />}
      {sub === "corpacs"   && <CorporatePACFlow />}
    </div>
  );
}
