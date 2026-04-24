/**
 * Campaign Watch - 2026 Election Map
 * Phase 2F: Legislation panel (in dialog), state reps on click, gradient legend,
 *           error boundaries, D3 lazy loading, bundle splitting.
 */

import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useTheme } from '../theme/index.js';
import { Card, Band, CardTitle } from '../components/ui/index.js';
import ErrorBoundary from '../components/ErrorBoundary';
import LiveNewsPanel from '../components/LiveNewsPanel.jsx';
import LiveFeedPanel from '../components/LiveFeedPanel.jsx';
// WarStats inlined — conflict data fetched directly so the KPI cell shares
// the exact same DOM structure, padding, border, and font tokens as every other column.
import { useMobile } from '../hooks/useMediaQuery.js';
import { DATA_CENTERS } from '../data/geo';
import { campaignWatch as cwApi, fetchContracts } from '../api/client';
import { primeHydrationCache } from '../services/bootstrap.js';
import { loadMapData } from '../services/map-data.js';

// Lazy-load heavy components so D3/recharts/WebGL don't block initial paint
// DeckGLMap (MapLibre + deck.gl) is the primary map; USPoliticalMap kept as SVG fallback
const DeckGLMap       = lazy(() => import('../components/DeckGLMap'));
const USPoliticalMap  = lazy(() => import('../components/USPoliticalMap'));
const CorruptionDialog = lazy(() => import('../components/CorruptionDialog'));

// Shared loading fallback used by Suspense wrappers
const MapFallback = ({ t }) => (
  <div style={{ height: 520, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: t?.mid || '#888' }}>
    Loading map…
  </div>
);

const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',
  CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',
  HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',
  MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',
  MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',
  NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',
  OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',
  SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',
  VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',
  WI:'Wisconsin',WY:'Wyoming',DC:'Washington DC',
};

const fmtM = n => {
  if (!n) return '$0';
  if (n >= 1e9) return `$${(n/1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}K`;
  return `$${n}`;
};

const daysUntil = dateStr => {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.max(0, Math.ceil((d - now) / (1000 * 60 * 60 * 24)));
};

const fmtK = n => {
  if (n == null) return null;
  if (n >= 1e12) return `$${(n/1e12).toFixed(1)}T`;
  if (n >= 1e9)  return `$${(n/1e9).toFixed(1)}bn`;
  if (n >= 1e6)  return `$${(n/1e6).toFixed(0)}m`;
  return `$${n.toFixed(0)}`;
};

const CampaignWatch = () => {
  const t = useTheme();
  const isMobile = useMobile();

  // ── Economic KPIs ─────────────────────────────────────────────────────────
  const [unemploymentData, setUnemploymentData] = useState(null);
  const [inflationData,    setInflationData]    = useState(null);
  const [fearGreedData,    setFearGreedData]    = useState(null);
  const [conflictData,     setConflictData]     = useState(null);

  useEffect(() => {
    // BLS Unemployment + CPI — proxied through backend (cached, avoids BLS rate limits)
    fetch('/api/economic')
      .then(r => r.json())
      .then(d => {
        if (d?.unemployment) setUnemploymentData(d.unemployment);
        if (d?.inflation) setInflationData(d.inflation);
      })
      .catch(() => {});

    // CNN Fear & Greed — proxied through backend to avoid CORS
    fetch('/api/fear-greed')
      .then(r => r.json())
      .then(d => { if (d?.score != null) setFearGreedData(d); })
      .catch(() => {});

    // Conflict / US-Iran War spending
    fetch('/api/conflict')
      .then(r => r.json())
      .then(d => { if (d?.damage) setConflictData(d.damage); })
      .catch(() => {});
  }, []);

  const fmtChange = (val) => {
    if (val == null) return '—';
    const isWorse = val > 0;
    const color = val === 0 ? '#888' : isWorse ? '#ef4444' : '#22c55e';
    const arrow = val > 0 ? '▲' : '▼';
    return <span style={{ color }}>{arrow}{Math.abs(val)}% YoY</span>;
  };

  const fmtSpend = v => {
    if (v == null) return '—';
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}bn`;
    return `$${v}m`;
  };

  const fmtNum = n => (n == null ? '—' : n.toLocaleString());

  const fearGreedColor = rating => {
    if (!rating) return '#888';
    const r = rating.toLowerCase();
    if (r.includes('extreme fear')) return '#ef4444';
    if (r.includes('fear'))         return '#f97316';
    if (r.includes('neutral'))      return '#eab308';
    if (r.includes('extreme greed')) return '#16a34a';
    if (r.includes('greed'))        return '#22c55e';
    return '#888';
  };

  const fearGreedLabel = rating => {
    if (!rating) return '—';
    return rating.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  };

  // ── Live contract data (from Overview KPIs) ───────────────────────────────
  const [liveContracts, setLiveContracts] = useState(null);

  useEffect(() => {
    fetchContracts({ limit: 50 })
      .then(res => { if (res.success) setLiveContracts(res); })
      .catch(() => {});
  }, []);

  const contractsArr = Array.isArray(liveContracts?.data)
    ? liveContracts.data
    : (liveContracts?.data?.results || []);
  const totalSpend = liveContracts
    ? contractsArr.reduce((s, c) => s + parseFloat(c['Award Amount'] || 0), 0)
    : null;
  const flaggedCount = liveContracts
    ? contractsArr.filter(c => parseFloat(c['Award Amount'] || 0) >= 5e8).length
    : null;

  const [selectedState,   setSelectedState]   = useState(null);
  const [dialogPosition,  setDialogPosition]  = useState({ x: 120, y: 120 });
  const [dialogVisible,   setDialogVisible]   = useState(false);

  const [corruptionIndex,   setCorruptionIndex]   = useState([]);
  const [corruptionLoading, setCorruptionLoading] = useState(true);
  const [elections,         setElections]         = useState([]);
  const [electionsLoading,  setElectionsLoading]  = useState(true);

  // ── State delegation (fetched on map click) ────────────────────────────────
  const [stateReps,        setStateReps]        = useState(null);
  const [stateRepsLoading, setStateRepsLoading] = useState(false);

  // ── Phase 2: Dynamic map data (fed via Redis bootstrap pipeline) ──────────
  const [gasPriceByState,  setGasPriceByState]  = useState({});
  const [newsLocations,    setNewsLocations]     = useState([]);
  const [contributions,    setContributions]     = useState([]);
  const [electionRaces,    setElectionRaces]     = useState([]);
  const [darkMoneyFlows,   setDarkMoneyFlows]    = useState([]);
  const [spendingFlows,    setSpendingFlows]     = useState([]);
  const [stockActTrades,   setStockActTrades]    = useState([]);

  // Prime the hydration cache on page mount, then load all map data.
  // The bootstrap fetch (fast + slow tiers) runs in parallel with a 800ms timeout;
  // if it misses the cache, loadMapData falls through to individual API calls.
  useEffect(() => {
    primeHydrationCache().then(() => {
      loadMapData({
        setCorruptionScores: (scores) => {
          // Merge bootstrap corruption scores into corruptionIndex state shape
          // so the existing choropleth + KPIs still work from the same source.
          if (scores && typeof scores === 'object') {
            setCorruptionIndex(prev => {
              // Only replace if we got more data from bootstrap than from API
              const bootstrapCount = Object.keys(scores).length;
              if (bootstrapCount > prev.length) {
                // Preserve totalRaised from API data already in prev — bootstrap doesn't carry it
                const prevRaised = {};
                prev.forEach(s => { if (s.stateCode) prevRaised[s.stateCode] = s.totalRaised || 0; });
                return Object.entries(scores).map(([stateCode, corruptionIndex]) => ({
                  stateCode,
                  corruptionIndex,
                  totalRaised: prevRaised[stateCode] || 0,
                }));
              }
              return prev;
            });
          }
        },
        setGasPriceByState,
        setContributions,
        setElectionRaces,
        setDarkMoneyFlows,
        setSpendingFlows,
        setStockActTrades,
        setNewsLocations,
      });
    }).catch(() => {
      // Bootstrap failed entirely — loadMapData will use individual fallbacks
      loadMapData({
        setGasPriceByState,
        setContributions,
        setElectionRaces,
        setDarkMoneyFlows,
        setSpendingFlows,
        setStockActTrades,
        setNewsLocations,
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCorruptionLoading(true);
    cwApi.corruptionIndex()
      .then(res => setCorruptionIndex(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setCorruptionIndex([]))
      .finally(() => setCorruptionLoading(false));
  }, []);

  useEffect(() => {
    setElectionsLoading(true);
    cwApi.elections()
      .then(res => setElections(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setElections([]))
      .finally(() => setElectionsLoading(false));
  }, []);

  const corruptionScores = useMemo(() => {
    const map = {};
    corruptionIndex.forEach(s => {
      if (s.stateCode) map[s.stateCode] = s.corruptionIndex ?? 55;
    });
    return map;
  }, [corruptionIndex]);

  const kpiStats = useMemo(() => {
    if (!corruptionIndex.length) return { total: 0, count: 0, avg: '—', centers: DATA_CENTERS.length };
    const totalRaised = corruptionIndex.reduce((s, x) => s + (x.totalRaised || 0), 0);
    const avgCorruption = Math.round(
      corruptionIndex.reduce((s, x) => s + (x.corruptionIndex || 55), 0) / corruptionIndex.length
    );
    return { total: totalRaised, count: corruptionIndex.length, avg: avgCorruption, centers: DATA_CENTERS.length };
  }, [corruptionIndex]);

  const sortedStates = useMemo(() => (
    [...corruptionIndex].sort((a, b) => a.corruptionIndex - b.corruptionIndex)
  ), [corruptionIndex]);

  const handleStateClick = (stateCode) => {
    setSelectedState(stateCode);
    setDialogVisible(true);
    setDialogPosition({
      x: Math.min(window.innerWidth  - 420, 120 + Math.random() * 180),
      y: Math.min(window.innerHeight - 620, 120 + Math.random() * 180),
    });
    // Fetch state delegation for the side panel
    setStateReps(null);
    setStateRepsLoading(true);
    cwApi.representatives(stateCode)
      .then(res => setStateReps(res?.data || null))
      .catch(() => setStateReps(null))
      .finally(() => setStateRepsLoading(false));
  };
  const handleCloseDialog = () => setDialogVisible(false);
  const stateName = selectedState ? (STATE_NAMES[selectedState] || selectedState) : '';

  const corruptionColor = score =>
    score < 30 ? t.warn :
    score < 50 ? t.accent :
    score < 70 ? t.ok : t.blue;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>

      {/* ── KPI row (10 columns: national debt + 4 map KPIs + 4 overview KPIs + WarStats) ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(10, 1fr)',
        borderTop: `1px solid ${t.border}`,
        borderBottom: `1px solid ${t.border}`,
      }}>
        {/* National Debt — always first */}
        <div style={{ padding: isMobile ? '12px 10px' : '18px 14px', borderRight: `1px solid ${t.border}`, borderBottom: isMobile ? `1px solid ${t.border}` : 'none' }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: isMobile ? 22 : 28, color: t.kpiNum, lineHeight: 1, marginBottom: 4 }}>$39.0T</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: t.hi, marginBottom: 2 }}>US national debt</div>
          <a href="https://www.pgpf.org/national-debt-clock/" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.blue, textDecoration: 'none' }}>pgpf.org · live clock</a>
        </div>
        {/* US-Iran War spending */}
        <div style={{ padding: isMobile ? '12px 10px' : '18px 14px', borderRight: `1px solid ${t.border}`, borderBottom: isMobile ? `1px solid ${t.border}` : 'none' }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: isMobile ? 22 : 28, color: t.kpiNum, lineHeight: 1, marginBottom: 4 }}>{conflictData ? fmtSpend(conflictData.spending?.value) : '…'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: t.hi, marginBottom: 2 }}>US-Iran War spending</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.low }}>Strikes: {conflictData ? fmtNum(conflictData.strikes?.value) : '—'} · Deaths: {conflictData ? fmtNum(conflictData.deaths?.value) : '—'} · <a href="https://meta-trials.vercel.app/us-iran-conflict" target="_blank" rel="noopener noreferrer" style={{ color: t.blue, textDecoration: 'none' }}>tracker</a></div>
        </div>
        {[
          { v: corruptionLoading ? '…' : fmtM(kpiStats.total),                                      d: '2026 total raised',           s: 'FEC · current cycle' },
          { v: fmtK(totalSpend) || '$157bn',                                                          d: totalSpend != null ? 'Contract obligations' : 'Overspent vs. appropriations', s: liveContracts?.fiscalYear ? `FY${liveContracts.fiscalYear} · live` : 'FY2024 federal agencies' },
          { v: flaggedCount != null ? String(flaggedCount) : '1,847',                                d: flaggedCount != null ? 'Contracts ≥ $500M flagged' : 'Contracts flagged anomalous', s: flaggedCount != null ? `From ${liveContracts?.data?.length} loaded` : 'Across 23 federal agencies' },
          { v: '34',                                                                                   d: 'STOCK Act potential violations', s: 'Current congressional session' },
          { v: '$18bn',                                                                                d: 'PAC donations to Congress',   s: '2023–24 election cycle' },
        ].map((k, i) => (
          <div key={i} style={{ padding: isMobile ? '12px 10px' : '18px 14px', borderRight: `1px solid ${t.border}`, borderBottom: isMobile ? `1px solid ${t.border}` : 'none' }}>
            <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: isMobile ? 22 : 28, color: t.kpiNum, lineHeight: 1, marginBottom: 4 }}>{k.v}</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: t.hi, marginBottom: 2 }}>{k.d}</div>
            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.low }}>{k.s}</div>
          </div>
        ))}
        {/* Unemployment Rate */}
        <div style={{ padding: isMobile ? '12px 10px' : '18px 14px', borderRight: `1px solid ${t.border}`, borderBottom: isMobile ? `1px solid ${t.border}` : 'none' }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: isMobile ? 22 : 28, color: t.kpiNum, lineHeight: 1, marginBottom: 4 }}>{unemploymentData ? `${unemploymentData.rate}%` : '…'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: t.hi, marginBottom: 2 }}>Unemployment · {unemploymentData?.period || '—'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.low }}>{unemploymentData ? fmtChange(unemploymentData.change) : '—'} · <a href="https://www.bls.gov/cps/" target="_blank" rel="noopener noreferrer" style={{ color: t.blue, textDecoration: 'none' }}>BLS</a></div>
        </div>

        {/* Inflation (CPI) */}
        <div style={{ padding: isMobile ? '12px 10px' : '18px 14px', borderRight: `1px solid ${t.border}`, borderBottom: isMobile ? `1px solid ${t.border}` : 'none' }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: isMobile ? 22 : 28, color: t.kpiNum, lineHeight: 1, marginBottom: 4 }}>{inflationData ? `${inflationData.rate}%` : '…'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: t.hi, marginBottom: 2 }}>CPI inflation YoY · {inflationData?.period || '—'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.low }}>{inflationData ? fmtChange(inflationData.change) : '—'} · <a href="https://www.bls.gov/cpi/" target="_blank" rel="noopener noreferrer" style={{ color: t.blue, textDecoration: 'none' }}>BLS</a></div>
        </div>

        {/* CNN Fear & Greed */}
        <div style={{ padding: isMobile ? '12px 10px' : '18px 14px', borderBottom: isMobile ? `1px solid ${t.border}` : 'none' }}>
          <div style={{ fontFamily: "'Playfair Display',Georgia,serif", fontSize: isMobile ? 22 : 28, color: fearGreedData ? fearGreedColor(fearGreedData.rating) : t.kpiNum, lineHeight: 1, marginBottom: 4 }}>{fearGreedData ? `${fearGreedData.score}%` : '…'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9.5, color: fearGreedData ? fearGreedColor(fearGreedData.rating) : t.hi, marginBottom: 2 }}>{fearGreedData ? `Market is in ${fearGreedLabel(fearGreedData.rating)}` : 'Market sentiment'}</div>
          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.low }}><a href="https://www.cnn.com/markets/fear-and-greed" target="_blank" rel="noopener noreferrer" style={{ color: t.blue, textDecoration: 'none' }}>CNN · Fear & Greed</a></div>
        </div>

      </div>

      {/* ── Top row: Live News + Live Intelligence Feeds grouped ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gridTemplateRows: '1fr',
        alignItems: 'stretch',
        height: isMobile ? 'auto' : 620,
        border: `1px solid ${t.border}`,
        borderTop: `3px solid ${t.accent}`,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <LiveNewsPanel />
        </div>
        <div style={{ borderLeft: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
          <LiveFeedPanel />
        </div>
      </div>

      {/* ── Map (full width, below both panels) ─────────────────────── */}
      <div>
        <Band label="US Geoeconomic Map" right="CLICK ANY STATE FOR PROFILE" />
        <ErrorBoundary label="Map" theme={t}>
          <Card>
            <CardTitle
              h="Infrastructure, economics, and legislation — all in one view."
              sub="Click any state to open its detailed profile and recent legislation."
            />
            <Suspense fallback={<MapFallback t={t} />}>
              {/*
               * DeckGLMap — MapLibre GL + deck.gl WebGL map (Phase 1)
               * Falls through to USPoliticalMap (SVG) only if the ErrorBoundary catches
               * a WebGL init failure at the component level.
               *
               * Props:
               *   corruptionScores  — { stateCode: 0-100 } from FEC/corruption API
               *   gasPriceByState   — { stateCode: USD/gal } from EIA API
               *   onStateClick      — opens CorruptionDialog + fetches delegation
               *   theme             — UNREDACTED theme tokens (passed for future use)
               */}
              <DeckGLMap
                /* Phase 1 — static + choropleth */
                corruptionScores={corruptionScores}
                gasPriceByState={gasPriceByState}
                onStateClick={handleStateClick}
                theme={t}
                mapTheme="dark"
                /* Phase 2 — dynamic pipeline data (populated after bootstrap) */
                newsLocations={newsLocations}
                contributions={contributions}
                electionRaces={electionRaces}
                darkMoneyFlows={darkMoneyFlows}
                spendingFlows={spendingFlows}
                stockActTrades={stockActTrades}
              />
            </Suspense>
          </Card>
        </ErrorBoundary>
      </div>

      {/* ── State Delegation Panel (appears after a state is clicked) ─── */}
      {(selectedState || stateRepsLoading) && (
        <div>
          <Band
            label={selectedState ? `${STATE_NAMES[selectedState] || selectedState} Congressional Delegation` : 'State Delegation'}
            right="CONGRESS.GOV"
          />
          <ErrorBoundary label="Delegation" theme={t}>
            <Card>
              {stateRepsLoading ? (
                <div style={{ padding: '16px 0', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: t.mid }}>
                  Loading delegation…
                </div>
              ) : !stateReps || (stateReps.officials || []).length === 0 ? (
                <div style={{ padding: '16px 0', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: t.low }}>
                  No delegation data available for {STATE_NAMES[selectedState] || selectedState}.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
                  {(stateReps.officials || []).map((rep, i) => {
                    const party = rep.party || rep.partyName || '';
                    const partyLower = party.toLowerCase();
                    const partyColor = partyLower.includes('republican') ? '#ef4444'
                                     : partyLower.includes('democrat')   ? '#3b82f6'
                                     : t.mid;
                    const office = rep.office || rep.chamber
                      ? (rep.chamber === 'Senate'
                          ? `U.S. Senator · ${selectedState}`
                          : rep.chamber === 'House'
                          ? `U.S. Representative · ${selectedState}`
                          : rep.office || '')
                      : '';
                    return (
                      <div key={i} style={{
                        padding: 14,
                        background: t.cardB, border: `1px solid ${t.border}`,
                        borderTop: `3px solid ${partyColor}`, borderRadius: 4,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                          {rep.photoUrl && (
                            <img src={rep.photoUrl} alt={rep.name}
                              style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${partyColor}` }}
                              onError={e => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <div>
                            <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: t.hi, fontWeight: 700 }}>
                              {rep.name || `${rep.lastName}, ${rep.firstName}`}
                            </div>
                            {office && (
                              <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.mid, marginTop: 2 }}>{office}</div>
                            )}
                          </div>
                        </div>
                        {party && (
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 9, color: partyColor, marginBottom: 5 }}>{party}</div>
                        )}
                        {(rep.urls?.length > 0 || rep.officialUrl) && (
                          <a
                            href={rep.urls?.[0] || rep.officialUrl}
                            target="_blank" rel="noopener noreferrer"
                            style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 8, color: t.blue, textDecoration: 'none' }}
                          >
                            🌐 Official website
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </ErrorBoundary>
        </div>
      )}

      {/* ── Floating corruption dialog ─────────────────────────────── */}
      {dialogVisible && selectedState && (
        <ErrorBoundary label="Corruption Dialog" theme={t}>
          <Suspense fallback={null}>
            <CorruptionDialog
              stateCode={selectedState}
              stateName={stateName}
              position={dialogPosition}
              onClose={handleCloseDialog}
              theme={t}
            />
          </Suspense>
        </ErrorBoundary>
      )}
    </div>
  );
};

export default CampaignWatch;
