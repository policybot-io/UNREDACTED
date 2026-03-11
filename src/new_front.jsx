import { useState, useEffect, useRef, createContext, useContext } from "react";
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, ScatterChart, Scatter, ZAxis, ComposedChart,
} from "recharts";

// ─── THEME SYSTEM ─────────────────────────────────────────────────────────────
const ORANGE = "#FF8000";
const BLUE   = "#0028AA";
const WHITE  = "#FFFFFF";

const DARK_THEME = {
  bg:       "#0D0D0D",
  page:     "#111111",
  card:     "#161616",
  cardB:    "#1D1D1D",
  border:   "#272727",
  hi:       "#FFFFFF",
  mid:      "#888888",
  low:      "#484848",
  ink:      "#080808",
  accent:   ORANGE,
  blue:     "#4A7FFF",   // lightened blue for dark bg readability
  trueBlue: BLUE,
  band:     "#001A7A",   // dark navy for chart bands
  bandText: "#FFFFFF",
  navBg:    "#0A0A0A",
  tickerBg: "#060606",
  tickerTx: ORANGE,
  risk:     ORANGE,
  ok:       "#4A7FFF",
  warn:     "#FFB84D",
  grid:     "#1E1E1E",
  shadow:   "rgba(255,128,0,0.15)",
  kpiNum:   ORANGE,
  tableAlt: "#111111",
  inputBg:  "#0A0A0A",
  sigBg:    "#0F0B06",
  findBg:   "#0F0F0F",
  redactBg: "#0D0D0D",
  redactSt: "#222 0,#222 7px,#181818 7px,#181818 9px",
  scatterOk: "#4A7FFF",
};

const LIGHT_THEME = {
  bg:       "#FFFFFF",
  page:     "#F7F7F7",
  card:     "#FAFAFA",
  cardB:    "#F0F0F0",
  border:   "#DEDEDE",
  hi:       BLUE,
  mid:      "#555555",
  low:      "#AAAAAA",
  ink:      "#F2F2F2",
  accent:   ORANGE,
  blue:     BLUE,
  trueBlue: BLUE,
  band:     BLUE,
  bandText: "#FFFFFF",
  navBg:    "#FFFFFF",
  tickerBg: "#FFF3E0",
  tickerTx: ORANGE,
  risk:     ORANGE,
  ok:       BLUE,
  warn:     "#E06000",
  grid:     "#EBEBEB",
  shadow:   "rgba(0,40,170,0.08)",
  kpiNum:   ORANGE,
  tableAlt: "#F5F5F5",
  inputBg:  "#F8F8F8",
  sigBg:    "#FFF8F0",
  findBg:   "#F8F8F8",
  redactBg: "#FFFFFF",
  redactSt: "#DDD 0,#DDD 7px,#EBEBEB 7px,#EBEBEB 9px",
  scatterOk: BLUE,
};

const ThemeCtx = createContext(DARK_THEME);
const useT = () => useContext(ThemeCtx);

const MF = "'IBM Plex Mono','Courier New',monospace";
const SF = "'Playfair Display',Georgia,serif";

// ─── DATA ─────────────────────────────────────────────────────────────────────
const SPEND = [
  { a:"Defense",   b:886,  v:921,  p:104 }, { a:"HHS",       b:1741, v:1698, p:98  },
  { a:"SSA",       b:1310, v:1289, p:98  }, { a:"Treasury",  b:847,  v:912,  p:108 },
  { a:"Education", b:79,   v:71,   p:90  }, { a:"Veterans",  b:301,  v:318,  p:106 },
  { a:"Homeland",  b:98,   v:94,   p:96  }, { a:"Justice",   b:37,   v:42,   p:114 },
];
const TREND = [
  { y:"2016", d:680,  ph:310, f:920,  e:420 }, { y:"2017", d:710,  ph:340, f:880,  e:390 },
  { y:"2018", d:760,  ph:390, f:940,  e:440 }, { y:"2019", d:800,  ph:420, f:1010, e:400 },
  { y:"2020", d:910,  ph:510, f:1240, e:360 }, { y:"2021", d:870,  ph:580, f:1100, e:320 },
  { y:"2022", d:920,  ph:620, f:1050, e:480 }, { y:"2023", d:980,  ph:590, f:1180, e:510 },
  { y:"2024", d:1040, ph:640, f:1220, e:530 },
];
const STOCK = [
  { q:"Q1'22",v:4 },{ q:"Q2'22",v:6 },{ q:"Q3'22",v:3 },{ q:"Q4'22",v:8 },
  { q:"Q1'23",v:5 },{ q:"Q2'23",v:11},{ q:"Q3'23",v:7 },{ q:"Q4'23",v:9 },
  { q:"Q1'24",v:14},{ q:"Q2'24",v:12},
];
const DONORS = [
  { n:"Lockheed Martin",  pac:168, ind:42, s:"Defence" }, { n:"Northrop Grumman", pac:112, ind:28, s:"Defence" },
  { n:"Raytheon Tech.",   pac:142, ind:31, s:"Defence" }, { n:"Boeing",           pac:95,  ind:22, s:"Defence" },
  { n:"JPMorgan Chase",   pac:88,  ind:44, s:"Finance" }, { n:"PhRMA",            pac:89,  ind:19, s:"Pharma"  },
  { n:"UnitedHealth",     pac:71,  ind:18, s:"Health"  }, { n:"Pfizer",           pac:64,  ind:14, s:"Pharma"  },
];
const CORPS = [
  { n:"Lockheed Martin",   pac:168, con:7800, sc:28, s:"Defence" }, { n:"Northrop Grumman",  pac:112, con:6100, sc:29, s:"Defence" },
  { n:"Boeing",            pac:95,  con:4200, sc:31, s:"Defence" }, { n:"Raytheon Tech.",    pac:142, con:5100, sc:34, s:"Defence" },
  { n:"UnitedHealth Grp.", pac:71,  con:2100, sc:41, s:"Health"  }, { n:"Pfizer",            pac:64,  con:890,  sc:48, s:"Pharma"  },
  { n:"JPMorgan Chase",    pac:88,  con:120,  sc:52, s:"Finance" }, { n:"Amazon",            pac:44,  con:7200, sc:58, s:"Tech"    },
  { n:"Chevron",           pac:58,  con:340,  sc:61, s:"Energy"  }, { n:"CVS Health",        pac:39,  con:890,  sc:69, s:"Health"  },
];
const POLICY_MONTHLY = [
  { m:"Jan",eo:3,ru:8 },{ m:"Feb",eo:1,ru:12},{ m:"Mar",eo:4,ru:9 },{ m:"Apr",eo:2,ru:14},
  { m:"May",eo:5,ru:11},{ m:"Jun",eo:3,ru:16},{ m:"Jul",eo:6,ru:10},{ m:"Aug",eo:2,ru:8 },
  { m:"Sep",eo:4,ru:13},{ m:"Oct",eo:7,ru:17},{ m:"Nov",eo:3,ru:11},{ m:"Dec",eo:2,ru:9 },
];
const GN_NODES = [
  { id:1, x:310, y:195, lbl:"Raytheon",           type:"COMPANY",   sc:34 },
  { id:2, x:130, y:110, lbl:"Sen. Hughes",         type:"POLITICIAN",sc:28 },
  { id:3, x:130, y:310, lbl:"Armed Services\nCmte",type:"COMMITTEE", sc:null },
  { id:4, x:310, y:355, lbl:"DoD / Air Force",    type:"AGENCY",    sc:null },
  { id:5, x:490, y:110, lbl:"Raytheon PAC",        type:"PAC",       sc:null },
  { id:6, x:490, y:355, lbl:"F-35 Contract\n$5.1B",type:"CONTRACT", sc:null },
  { id:7, x:310, y:55,  lbl:"Gen. Park → RTX VP", type:"PERSON",    sc:null },
];
const GN_EDGES = [
  { f:5, t:2, lbl:"$2.8M",      c:ORANGE          },
  { f:2, t:3, lbl:"Sits on",    c:"#555"           },
  { f:3, t:4, lbl:"Oversees",   c:"#555"           },
  { f:4, t:6, lbl:"Awarded",    c:"#FFB84D"        },
  { f:6, t:1, lbl:"Recipient",  c:"#4A7FFF"        },
  { f:1, t:5, lbl:"Controls",   c:"#9966CC"        },
  { f:7, t:4, lbl:"Fmr. role",  c:"#555"           },
  { f:7, t:1, lbl:"Now at RTX", c:ORANGE           },
];
const NODE_COL = { COMPANY:"#4A7FFF", POLITICIAN:ORANGE, COMMITTEE:"#9966CC", AGENCY:"#00AADD", PAC:ORANGE, CONTRACT:"#FFB84D", PERSON:"#AAAAAA" };

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────

function Band({ label, right, color }) {
  const t = useT();
  return (
    <div style={{ background: color || t.band, padding:"7px 14px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ fontFamily:MF, fontSize:9, color:t.bandText, letterSpacing:2 }}>{label.toUpperCase()}</span>
      {right && <span style={{ fontFamily:MF, fontSize:8, color:"rgba(255,255,255,.45)", letterSpacing:1 }}>{right}</span>}
    </div>
  );
}

function Card({ children, p, style: sx }) {
  const t = useT();
  return (
    <div style={{ background:t.card, border:`1px solid ${t.border}`, borderTop:"none", padding:p||"18px 18px 14px", ...(sx||{}) }}>
      {children}
    </div>
  );
}

function CT({ h, sub }) {
  const t = useT();
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontFamily:SF, fontSize:14.5, color:t.hi, lineHeight:1.35, marginBottom:4 }}>{h}</div>
      {sub && <div style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{sub}</div>}
    </div>
  );
}

function Src({ s }) {
  const t = useT();
  return <div style={{ marginTop:10, paddingTop:8, borderTop:`1px solid ${t.border}`, fontFamily:MF, fontSize:8.5, color:t.low }}>Sources: {s}</div>;
}

function Leg({ items }) {
  const t = useT();
  return (
    <div style={{ display:"flex", gap:16, flexWrap:"wrap", marginTop:9 }}>
      {items.map(([l,c,d]) => (
        <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
          <svg width={20} height={5}><line x1={0} y1={2.5} x2={20} y2={2.5} stroke={c} strokeWidth={d?1.5:2.5} strokeDasharray={d?"5 3":"none"}/></svg>
          <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{l}</span>
        </div>
      ))}
    </div>
  );
}

function ETip({ active, payload, label, fmt }) {
  const t = useT();
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:t.ink, border:`1px solid ${t.border}`, borderLeft:`3px solid ${t.accent}`, padding:"8px 12px", fontFamily:MF }}>
      <div style={{ fontSize:9, color:t.mid, letterSpacing:1, marginBottom:5 }}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{ fontSize:11, color:t.hi, marginBottom:2 }}>
          <span style={{ color:p.color||t.mid, marginRight:5, fontSize:8 }}>■</span>
          {p.name}:&ensp;<span style={{ color:t.accent }}>{fmt ? fmt(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Score({ v }) {
  const t = useT();
  const c = v < 35 ? t.risk : v < 55 ? t.warn : t.ok;
  const l = v < 35 ? "CRITICAL" : v < 55 ? "HIGH" : v < 70 ? "MED" : "CLEAN";
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
      <div style={{ width:40, height:40, borderRadius:"50%", border:`2px solid ${c}`, background:c+"18", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:MF, fontSize:11, color:c, fontWeight:700, boxShadow:`0 0 10px ${c}28` }}>{v}</div>
      <span style={{ fontFamily:MF, fontSize:7.5, color:c, letterSpacing:1.5 }}>{l}</span>
    </div>
  );
}

function Blk({ children, w }) {
  const t = useT();
  const [on, setOn] = useState(false);
  return (
    <span onMouseEnter={() => setOn(true)} onMouseLeave={() => setOn(false)} title="hover to reveal"
      style={{ position:"relative", display:"inline-block", minWidth:w||"80px", cursor:"pointer" }}>
      <span style={{ opacity:on?1:0, transition:"opacity .18s", userSelect:on?"text":"none" }}>{children}</span>
      {!on && (
        <span style={{ position:"absolute", inset:"0 0 -1px 0", background:t.redactBg, border:`1px solid ${t.border}`, display:"flex", alignItems:"center", padding:"0 3px" }}>
          <span style={{ display:"block", width:"100%", height:8, background:`repeating-linear-gradient(90deg,${t.redactSt})` }}/>
        </span>
      )}
    </span>
  );
}

// Axis props factory (needs theme at call site)
function ap(t) {
  return { axisLine:{ stroke:t.border }, tickLine:false, tick:{ fontFamily:MF, fontSize:9.5, fill:t.mid } };
}
function hg(t) {
  return { stroke:t.grid, vertical:false };
}

// ─── TICKER ───────────────────────────────────────────────────────────────────
function Ticker() {
  const t = useT();
  const [x, setX] = useState(0);
  const txt = "● FEC FILING — $12M DARK MONEY Q1 2025          ● STOCK ACT — 3 NEW FLAGS DETECTED          ● CONTRACT — $4.2BN DOD SOLE-SOURCE AWARD          ● FTC ANTITRUST COMMENT: 4 DAYS REMAINING          ● TOP 5 DEFENCE PACS: $18BN THIS CYCLE          ● FORMER FDA HEAD JOINS PFIZER BOARD          ● GAO: DOD AUDIT FAILURE — 6TH CONSECUTIVE YEAR";
  useEffect(() => {
    const id = setInterval(() => setX(v => v + 0.55), 24);
    return () => clearInterval(id);
  }, []);
  const W = txt.length * 7;
  return (
    <div style={{ height:26, background:t.tickerBg, borderBottom:`1px solid ${t.border}`, display:"flex", alignItems:"center", overflow:"hidden", position:"relative" }}>
      <div style={{ background:ORANGE, height:"100%", display:"flex", alignItems:"center", padding:"0 13px", flexShrink:0, zIndex:2 }}>
        <span style={{ fontFamily:MF, fontSize:8.5, color:WHITE, letterSpacing:2 }}>LIVE</span>
      </div>
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{ whiteSpace:"nowrap", fontFamily:MF, fontSize:9.5, color:t.tickerTx, letterSpacing:0.6, transform:`translateX(-${x % W}px)` }}>
          &nbsp;&nbsp;&nbsp;{txt}&nbsp;&nbsp;&nbsp;{txt}
        </div>
      </div>
      <div style={{ position:"absolute", right:0, top:0, bottom:0, width:60, background:`linear-gradient(90deg,transparent,${t.tickerBg})`, pointerEvents:"none" }}/>
    </div>
  );
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────
function Overview() {
  const t = useT();
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ borderTop:`3px solid ${ORANGE}`, paddingTop:16 }}>
        <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:3, marginBottom:8 }}>SPECIAL REPORT · FISCAL YEAR 2024</div>
        <h2 style={{ fontFamily:SF, fontSize:36, color:t.hi, fontWeight:700, lineHeight:1.1, marginBottom:10, maxWidth:680 }}>The price of influence</h2>
        <p style={{ fontFamily:SF, fontSize:14, fontStyle:"italic", color:t.mid, lineHeight:1.75, maxWidth:640 }}>
          American companies that donate most generously to congressional campaigns receive disproportionate federal contracts. A cross-source analysis of FEC, USASpending and procurement data reveals the pattern in stark relief.
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", borderTop:`1px solid ${t.border}`, borderBottom:`1px solid ${t.border}` }}>
        {[
          { v:"$157bn", d:"Overspent vs. appropriations",  s:"FY2024 federal agencies"      },
          { v:"1,847",  d:"Contracts flagged anomalous",   s:"Across 23 federal agencies"   },
          { v:"34",     d:"STOCK Act potential violations",s:"Current congressional session" },
          { v:"$18bn",  d:"PAC donations to Congress",     s:"2023–24 election cycle"        },
        ].map((k,i) => (
          <div key={i} style={{ padding:"18px 20px", borderRight:i<3?`1px solid ${t.border}`:"none" }}>
            <div style={{ fontFamily:SF, fontSize:34, color:t.kpiNum, lineHeight:1, marginBottom:5 }}>{k.v}</div>
            <div style={{ fontFamily:MF, fontSize:10.5, color:t.hi, marginBottom:3 }}>{k.d}</div>
            <div style={{ fontFamily:MF, fontSize:9, color:t.low }}>{k.s}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div>
          <Band label="Federal spending deviation" right="USASPENDING.GOV"/>
          <Card>
            <CT h="Most agencies exceeded their appropriation in FY2024. Defence and Justice were the worst offenders." sub="Actual spending as % of appropriation · FY2024 · 100 = on budget"/>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={SPEND} layout="vertical" margin={{ left:4, right:46, top:0, bottom:0 }} barCategoryGap="28%">
                <CartesianGrid horizontal={false} stroke={t.grid}/>
                <XAxis type="number" domain={[82,118]} {...ap(t)} tickFormatter={v=>`${v}%`} ticks={[85,90,95,100,105,110,115]}/>
                <YAxis type="category" dataKey="a" {...ap(t)} width={66}/>
                <Tooltip content={<ETip fmt={v=>`${v}%`}/>}/>
                <ReferenceLine x={100} stroke={t.mid} strokeWidth={1} strokeDasharray="4 2"
                  label={{ value:"100%", position:"top", style:{ fontFamily:MF, fontSize:8, fill:t.mid } }}/>
                <Bar dataKey="p" name="% of budget" radius={0} barSize={13}>
                  {SPEND.map((d,i) => <Cell key={i} fill={d.p>100?ORANGE:t.ok}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", gap:16, marginTop:8 }}>
              {[["Over budget",ORANGE],["Under budget",t.ok]].map(([l,c]) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, background:c }}/>
                  <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{l}</span>
                </div>
              ))}
            </div>
            <Src s="USASpending.gov; GovInfo budget justifications"/>
          </Card>
        </div>

        <div>
          <Band label="PAC contribution trends" right="FEC · OPENSECRETS"/>
          <Card>
            <CT h="Pharmaceutical PAC spending has nearly doubled since 2016, outpacing all other industries." sub="Annual PAC contributions by sector · $m · 2016–2024"/>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={TREND} margin={{ left:0, right:52, top:12, bottom:0 }}>
                <CartesianGrid {...hg(t)}/>
                <XAxis dataKey="y" {...ap(t)}/>
                <YAxis {...ap(t)} tickFormatter={v=>`$${v}m`} width={52}/>
                <Tooltip content={<ETip fmt={v=>`$${v}m`}/>}/>
                <ReferenceLine x="2020" stroke={t.border} strokeDasharray="3 3"
                  label={{ value:"Covid-19", position:"insideTopRight", style:{ fontFamily:MF, fontSize:8, fill:t.low } }}/>
                <Line type="monotone" dataKey="d"  name="Defence" stroke={t.mid}  strokeWidth={2}   dot={false}/>
                <Line type="monotone" dataKey="ph" name="Pharma"  stroke={ORANGE} strokeWidth={2.5} dot={false}/>
                <Line type="monotone" dataKey="f"  name="Finance" stroke={t.blue} strokeWidth={2}   dot={false}/>
                <Line type="monotone" dataKey="e"  name="Energy"  stroke={t.warn} strokeWidth={1.5} dot={false} strokeDasharray="5 3"/>
              </LineChart>
            </ResponsiveContainer>
            <Leg items={[["Defence",t.mid],["Pharma",ORANGE],["Finance",t.blue],["Energy",t.warn,true]]}/>
            <Src s="FEC schedule B; OpenSecrets; 2016–2024 election cycles"/>
          </Card>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16 }}>
        {[
          { c:ORANGE, t2:"Defence dominates",        b:"Four of the five lowest accountability scores belong to defence contractors. Sole-source contracts account for 68% of total awards." },
          { c:t.blue, t2:"Pharma's rising footprint",b:"Pharmaceutical PAC spending rose 106% from 2016–2024 — faster than any sector — while drug-pricing legislation stalled in committee." },
          { c:t.warn, t2:"No STOCK Act prosecution", b:"Despite 34 flagged potential violations in the current session, no member of Congress has faced criminal prosecution since 2012." },
        ].map((f,i) => (
          <div key={i} style={{ background:t.card, border:`1px solid ${t.border}`, borderTop:`3px solid ${f.c}`, padding:"18px 18px 16px" }}>
            <div style={{ fontFamily:MF, fontSize:8.5, color:f.c, letterSpacing:2, marginBottom:8 }}>▸ KEY FINDING</div>
            <div style={{ fontFamily:SF, fontSize:14, color:t.hi, lineHeight:1.3, fontWeight:700, marginBottom:8 }}>{f.t2}</div>
            <div style={{ fontFamily:SF, fontStyle:"italic", fontSize:12, color:t.mid, lineHeight:1.65 }}>{f.b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── DONOR INTEL ─────────────────────────────────────────────────────────────
function DonorIntel() {
  const t = useT();
  const [sel, setSel] = useState(0);
  const POLS = [
    { n:"Sen. Robert Hughes (R-TX)",  sc:28, raised:"$4.2m", flags:3 },
    { n:"Rep. Diana Marsh (D-CA)",    sc:71, raised:"$1.8m", flags:0 },
    { n:"Sen. Craig Whitfield (R-FL)",sc:19, raised:"$6.1m", flags:7 },
    { n:"Rep. Sandra Torres (D-NY)",  sc:84, raised:"$920k", flags:0 },
    { n:"Sen. Michael Pratt (I-VT)",  sc:91, raised:"$340k", flags:0 },
  ];
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ borderTop:`3px solid ${ORANGE}`, paddingTop:16 }}>
        <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:3, marginBottom:8 }}>DONOR INTELLIGENCE · FEC · OPENSECRETS</div>
        <h2 style={{ fontFamily:SF, fontSize:32, color:t.hi, fontWeight:700, lineHeight:1.1, marginBottom:8 }}>Who is funding American politics?</h2>
        <p style={{ fontFamily:SF, fontSize:14, fontStyle:"italic", color:t.mid, lineHeight:1.7, maxWidth:640 }}>A systematic analysis of PAC contributions, individual donations and independent expenditures across the 2023–24 federal election cycle.</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.15fr 1fr", gap:20 }}>
        <div>
          <Band label="Top corporate donors — PAC + individual ($m)" right="FEC · FY2024"/>
          <Card>
            <CT h="Defence contractors collectively outspend every other sector. Lockheed Martin led at $210m total." sub="Combined PAC and individual contributions · top 8 entities · $m"/>
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={DONORS} layout="vertical" margin={{ left:4, right:52, top:0, bottom:0 }} barCategoryGap="22%">
                <CartesianGrid horizontal={false} stroke={t.grid}/>
                <XAxis type="number" {...ap(t)} tickFormatter={v=>`$${v}m`}/>
                <YAxis type="category" dataKey="n" {...ap(t)} width={114}/>
                <Tooltip content={<ETip fmt={v=>`$${v}m`}/>}/>
                <Bar dataKey="pac" name="PAC"        stackId="a" radius={0} barSize={13} fill={ORANGE}/>
                <Bar dataKey="ind" name="Individual" stackId="a" radius={0} barSize={13} fill={t.blue}/>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", gap:16, marginTop:8 }}>
              {[["PAC contributions",ORANGE],["Individual donations",t.blue]].map(([l,c]) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, background:c }}/>
                  <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{l}</span>
                </div>
              ))}
            </div>
            <Src s="FEC schedule B; FPDS; 2024 election cycle"/>
          </Card>
        </div>

        <div>
          <Band label="Politician donor profiles" right="CLICK TO EXPLORE"/>
          <Card p="0">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr" }}>
              <div style={{ borderRight:`1px solid ${t.border}` }}>
                {POLS.map((p,i) => {
                  const c = p.sc<35?ORANGE:p.sc<55?t.warn:t.ok;
                  return (
                    <div key={i} onClick={() => setSel(i)} style={{ padding:"11px 14px", borderBottom:`1px solid ${t.border}`, borderLeft:`3px solid ${sel===i?c:"transparent"}`, background:sel===i?c+"12":"transparent", cursor:"pointer", transition:"all .13s" }}>
                      <div style={{ fontFamily:MF, fontSize:10.5, color:sel===i?t.hi:t.mid, marginBottom:3 }}>{p.n}</div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ fontFamily:MF, fontSize:9, color:t.low }}>{p.raised} raised</span>
                        {p.flags>0 && <span style={{ fontFamily:MF, fontSize:8, color:ORANGE, border:`1px solid ${ORANGE}55`, padding:"1px 5px" }}>{p.flags} FLAG{p.flags>1?"S":""}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ padding:"14px 16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontFamily:SF, fontSize:13, color:t.hi, lineHeight:1.3, marginBottom:3 }}>{POLS[sel].n}</div>
                    <div style={{ fontFamily:MF, fontSize:8.5, color:t.low, letterSpacing:1 }}>U.S. CONGRESS</div>
                  </div>
                  <Score v={POLS[sel].sc}/>
                </div>
                <div style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:2, marginBottom:8 }}>TOP DONOR INDUSTRIES</div>
                {[["Defence",72],[	"Finance",51],["Health",38],["Pharma",29]].map(([l,pct],i) => (
                  <div key={l} style={{ marginBottom:7 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:3 }}>
                      <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{l}</span>
                      <span style={{ fontFamily:MF, fontSize:9, color:ORANGE }}>{Math.round(pct*(1-sel*0.07))}%</span>
                    </div>
                    <div style={{ background:t.border, height:4 }}>
                      <div style={{ width:`${pct*(1-sel*0.07)}%`, height:"100%", background:[ORANGE,t.blue,t.warn,t.ok][i%4] }}/>
                    </div>
                  </div>
                ))}
                {POLS[sel].flags>0 && (
                  <div style={{ marginTop:12, background:t.sigBg, border:`1px solid ${ORANGE}33`, padding:"10px 12px" }}>
                    <div style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:1.5, marginBottom:6 }}>⚠ CONFLICT SIGNALS</div>
                    <div style={{ fontFamily:SF, fontSize:11, fontStyle:"italic", color:t.mid, lineHeight:1.6 }}>
                      {POLS[sel].flags} potential conflict{POLS[sel].flags>1?"s":""} detected: stock trades near committee hearings; PAC donors receiving sole-source contracts from overseen agencies.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding:"6px 14px", borderTop:`1px solid ${t.border}`, fontFamily:MF, fontSize:8.5, color:t.low }}>
              Sources: FEC · OpenSecrets · Senate/House financial disclosures
            </div>
          </Card>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1.3fr 1fr", gap:20 }}>
        <div>
          <Band label="Industry PAC spending — stacked share" right="2016–2024"/>
          <Card>
            <CT h="Finance and defence dominate PAC giving; pharma has grown fastest since 2020." sub="Stacked share of annual PAC contributions by sector"/>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={TREND} margin={{ left:0, right:8, top:10, bottom:0 }} stackOffset="expand">
                <defs>
                  {[[t.mid,"g1"],[ORANGE,"g2"],[t.blue,"g3"],[t.warn,"g4"]].map(([c,id]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={c} stopOpacity={0.85}/>
                      <stop offset="100%" stopColor={c} stopOpacity={0.55}/>
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid {...hg(t)}/>
                <XAxis dataKey="y" {...ap(t)}/>
                <YAxis {...ap(t)} tickFormatter={v=>`${(v*100).toFixed(0)}%`}/>
                <Tooltip content={<ETip fmt={v=>`$${v}m`}/>}/>
                <Area type="monotone" dataKey="d"  name="Defence" stackId="1" stroke="none" fill="url(#g1)"/>
                <Area type="monotone" dataKey="ph" name="Pharma"  stackId="1" stroke="none" fill="url(#g2)"/>
                <Area type="monotone" dataKey="f"  name="Finance" stackId="1" stroke="none" fill="url(#g3)"/>
                <Area type="monotone" dataKey="e"  name="Energy"  stackId="1" stroke="none" fill="url(#g4)"/>
              </AreaChart>
            </ResponsiveContainer>
            <Leg items={[["Defence",t.mid],["Pharma",ORANGE],["Finance",t.blue],["Energy",t.warn]]}/>
            <Src s="FEC schedule B; OpenSecrets"/>
          </Card>
        </div>
        <div>
          <Band label="STOCK Act violations quarterly" color={ORANGE} right="HOUSE/SENATE"/>
          <Card>
            <CT h="Q1 2024 saw a record 14 potential violations — the highest since tracking began." sub="Congressional stock trades within 30 days of committee activity"/>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={STOCK} margin={{ left:0, right:22, top:12, bottom:0 }} barCategoryGap="26%">
                <CartesianGrid {...hg(t)}/>
                <XAxis dataKey="q" {...ap(t)}/>
                <YAxis {...ap(t)}/>
                <Tooltip content={<ETip/>}/>
                <ReferenceLine y={7} stroke={t.warn} strokeDasharray="4 3"
                  label={{ value:"avg  7", position:"right", style:{ fontFamily:MF, fontSize:8.5, fill:t.warn } }}/>
                <Bar dataKey="v" name="Violations" radius={0}>
                  {STOCK.map((d,i) => <Cell key={i} fill={d.v>=10?ORANGE:d.v>=7?t.warn:t.border}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Src s="Senate/House financial disclosures; UN*REDACTED pattern engine"/>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── POLICY INTEL ─────────────────────────────────────────────────────────────
function PolicyIntel() {
  const t = useT();
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const bottom = useRef(null);
  const [msgs, setMsgs] = useState([
    { role:"user", text:"Which executive orders since Jan 2025 have materially affected EPA rulemaking budgets?" },
    { role:"ai", findings:[
        { id:"EO 14177", title:"Unleashing American Energy",      date:"Jan 20 2025", detail:"Directed EPA to pause all pending climate rules; estimated $4.2bn budget reallocation.", risk:"HIGH" },
        { id:"EO 14192", title:"Regulatory Freeze Pending Review",date:"Jan 20 2025", detail:"Halted 47 EPA rules in final stages; $1.1bn in enforcement funding frozen.", risk:"HIGH" },
        { id:"EO 14204", title:"DOE Permitting Acceleration",     date:"Feb 2 2025",  detail:"Redirected $890m from EPA clean-air programmes to fossil-fuel permitting.", risk:"MED" },
      ],
      signal:"Pattern: EOs directionally favour fossil-fuel interests — top donor industry (energy PAC: $530m/yr)",
      sources:["FederalRegister.gov","GovInfo","EPA Budget Justifications"],
    },
  ]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior:"smooth" }); }, [msgs, thinking]);

  const send = () => {
    if (!input.trim()) return;
    const q = input; setInput(""); setThinking(true);
    setMsgs(m => [...m, { role:"user", text:q }]);
    setTimeout(() => {
      setThinking(false);
      setMsgs(m => [...m, { role:"ai",
        findings:[{ id:"Analysis", title:`Results for: "${q}"`, date:new Date().toLocaleDateString(), detail:"9 entities matched across 4 data sources. Cross-source correlation: 0.91. See Spending Audit tab for breakdown.", risk:"MED" }],
        signal:"Analytical inference only — not a legal conclusion.",
        sources:["FEC","USASpending","FedReg","GovInfo"],
      }]);
    }, 2400);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ borderTop:`3px solid ${ORANGE}`, paddingTop:16 }}>
        <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:3, marginBottom:8 }}>POLICY INTELLIGENCE · FEDREGISTER · GOVINFO · REGULATIONS.GOV</div>
        <h2 style={{ fontFamily:SF, fontSize:32, color:t.hi, fontWeight:700, lineHeight:1.1, marginBottom:8 }}>AI policy agent</h2>
        <p style={{ fontFamily:SF, fontSize:14, fontStyle:"italic", color:t.mid, lineHeight:1.7, maxWidth:640 }}>Query federal regulations, executive orders, budget justifications and spending data. Every response is grounded in primary federal records.</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 260px", gap:20 }}>
        <div style={{ background:t.card, border:`1px solid ${t.border}`, display:"flex", flexDirection:"column" }}>
          <div style={{ background:t.band, padding:"7px 14px", display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:"#00FF88", boxShadow:"0 0 6px #00FF88" }}/>
            <span style={{ fontFamily:MF, fontSize:9, color:WHITE, letterSpacing:2 }}>UN*REDACTED INTELLIGENCE AGENT — ONLINE</span>
          </div>
          <div style={{ flex:1, padding:18, display:"flex", flexDirection:"column", gap:14, overflowY:"auto", minHeight:320, maxHeight:420 }}>
            {msgs.map((m,i) => (
              <div key={i} style={{ display:"flex", flexDirection:"column", alignItems:m.role==="user"?"flex-end":"flex-start" }}>
                {m.role==="user" ? (
                  <div style={{ background:t.cardB, border:`1px solid ${t.border}`, padding:"10px 14px", maxWidth:"82%", fontFamily:MF, fontSize:11, color:t.hi, lineHeight:1.6 }}>{m.text}</div>
                ) : (
                  <div style={{ maxWidth:"95%" }}>
                    <div style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, marginBottom:7, letterSpacing:1.5 }}>◈ UN*REDACTED AI · {m.sources?.join(" · ")}</div>
                    <div style={{ background:t.findBg, border:`1px solid ${t.border}`, padding:14 }}>
                      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
                        {m.findings?.map((f,j) => {
                          const fc = f.risk==="HIGH"?ORANGE:f.risk==="MED"?t.warn:t.ok;
                          return (
                            <div key={j} style={{ background:t.card, borderLeft:`3px solid ${fc}`, padding:"9px 12px", display:"grid", gridTemplateColumns:"80px 1fr auto", gap:8, alignItems:"start" }}>
                              <div>
                                <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:1 }}>{f.id}</div>
                                <div style={{ fontFamily:MF, fontSize:8, color:t.low, marginTop:2 }}>{f.date}</div>
                              </div>
                              <div>
                                <div style={{ fontFamily:MF, fontSize:10.5, color:t.hi, marginBottom:3 }}>{f.title}</div>
                                <div style={{ fontFamily:SF, fontStyle:"italic", fontSize:11, color:t.mid, lineHeight:1.5 }}>{f.detail}</div>
                              </div>
                              <span style={{ fontFamily:MF, fontSize:8, color:fc, border:`1px solid ${fc}44`, padding:"2px 6px", whiteSpace:"nowrap" }}>{f.risk}</span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, borderTop:`1px solid ${t.border}`, paddingTop:8 }}>⚠ {m.signal}</div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                {[0,1,2].map(i => <div key={i} style={{ width:5, height:5, borderRadius:"50%", background:ORANGE, animation:`dot ${0.7+i*0.2}s ${i*0.15}s infinite alternate` }}/>)}
                <span style={{ fontFamily:MF, fontSize:9, color:t.low, marginLeft:8 }}>Querying FedReg · GovInfo · USASpending…</span>
              </div>
            )}
            <div ref={bottom}/>
          </div>
          <div style={{ borderTop:`1px solid ${t.border}`, padding:"12px 14px 14px", flexShrink:0 }}>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:10 }}>
              {["EOs affecting EPA 2025","Bills correlated with defence donors","Rules weakened post-lobbying","Agencies over appropriation"].map((s,i) => (
                <button key={i} onClick={() => setInput(s)} style={{ background:t.cardB, border:`1px solid ${t.border}`, padding:"4px 9px", fontFamily:MF, fontSize:9, color:t.mid, cursor:"pointer" }}>{s}</button>
              ))}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&send()}
                placeholder="Query regulations, executive orders, spending patterns…"
                style={{ flex:1, background:t.inputBg, border:`1px solid ${t.border}`, borderLeft:`2px solid ${ORANGE}`, padding:"9px 12px", fontFamily:MF, fontSize:11, color:t.hi, outline:"none" }}/>
              <button onClick={send} style={{ background:ORANGE, border:"none", padding:"0 20px", fontFamily:MF, fontSize:10.5, color:WHITE, fontWeight:700, letterSpacing:1 }}>QUERY</button>
            </div>
          </div>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <Band label="Policy activity FY2024" right="FED. REGISTER"/>
            <Card>
              <CT h="Executive orders and rules by month" sub="Count · 2024"/>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={POLICY_MONTHLY} margin={{ left:0, right:4, top:8, bottom:0 }} barCategoryGap="20%">
                  <CartesianGrid {...hg(t)}/>
                  <XAxis dataKey="m" {...ap(t)}/>
                  <YAxis {...ap(t)} width={24}/>
                  <Tooltip content={<ETip/>}/>
                  <Bar dataKey="eo" name="Exec. Orders" stackId="a" radius={0} fill={ORANGE} barSize={14}/>
                  <Bar dataKey="ru" name="Rules"         stackId="a" radius={0} fill={t.blue}  barSize={14}/>
                </BarChart>
              </ResponsiveContainer>
              <Leg items={[["Exec. Orders",ORANGE],["Rules",t.blue]]}/>
              <Src s="FederalRegister.gov"/>
            </Card>
          </div>
          <div style={{ background:t.card, border:`1px solid ${t.border}`, borderTop:`3px solid ${ORANGE}`, padding:"14px 16px" }}>
            <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:2, marginBottom:10 }}>ACTIVE DATA SOURCES</div>
            {["FederalRegister.gov","GovInfo","Regulations.gov","USASpending.gov","OpenSecrets","FEC Campaign API","GAO Reports"].map((s,i) => (
              <div key={i} style={{ display:"flex", gap:7, alignItems:"center", marginBottom:7 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"#00FF88", flexShrink:0 }}/>
                <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DONOR WEB ────────────────────────────────────────────────────────────────
function DonorWeb() {
  const t = useT();
  const [hov, setHov] = useState(null);
  const [view, setView] = useState(0);
  const VIEWS = ["Donor Web","Revolving Door","Dark Money Chain","Regulatory Capture","Follow the Money"];

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ borderTop:`3px solid ${ORANGE}`, paddingTop:16 }}>
        <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:3, marginBottom:8 }}>ENTITY RELATIONSHIP GRAPH · NEO4J · LIVE</div>
        <h2 style={{ fontFamily:SF, fontSize:32, color:t.hi, fontWeight:700, lineHeight:1.1, marginBottom:8 }}>Donor web explorer</h2>
        <p style={{ fontFamily:SF, fontSize:14, fontStyle:"italic", color:t.mid, lineHeight:1.7, maxWidth:640 }}>Visualise the money and influence networks connecting corporations, PACs, elected officials and the agencies they oversee.</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 200px", gap:16 }}>
        <div style={{ background:"#090909", border:`2px solid ${t.border}`, position:"relative", minHeight:480, overflow:"hidden" }}>
          <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle,rgba(255,128,0,0.06) 1px,transparent 1px)", backgroundSize:"28px 28px", pointerEvents:"none" }}/>
          <div style={{ position:"absolute", inset:0, backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,.06) 2px,rgba(0,0,0,.06) 4px)", pointerEvents:"none", zIndex:1 }}/>
          <div style={{ position:"absolute", top:12, left:14, fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:2, zIndex:3 }}>
            {VIEWS[view].toUpperCase()} — RAYTHEON / HUGHES NETWORK
          </div>
          <svg width="100%" height="100%" viewBox="0 0 640 460" style={{ position:"relative", zIndex:2 }}>
            <defs>
              <filter id="glow2">
                <feGaussianBlur stdDeviation="3.5" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
              <marker id="arr2" markerWidth="5" markerHeight="5" refX="4.5" refY="2.5" orient="auto">
                <path d="M0,0 L5,2.5 L0,5 z" fill="#555"/>
              </marker>
            </defs>
            {GN_EDGES.map((e,i) => {
              const f = GN_NODES.find(n => n.id===e.f);
              const to = GN_NODES.find(n => n.id===e.t);
              const mx = (f.x+to.x)/2, my = (f.y+to.y)/2;
              const grey = e.c==="#555";
              return (
                <g key={i}>
                  <line x1={f.x} y1={f.y} x2={to.x} y2={to.y} stroke={e.c} strokeWidth={grey?1:1.8} strokeOpacity={grey?.2:.6} strokeDasharray={grey?"5 4":"none"} markerEnd="url(#arr2)"/>
                  <text x={mx} y={my-7} textAnchor="middle" fill={e.c} fontSize={7.5} fontFamily={MF} opacity={0.8}>{e.lbl}</text>
                </g>
              );
            })}
            {GN_NODES.map(nd => {
              const col = NODE_COL[nd.type]; const on = hov===nd.id;
              const lines = nd.lbl.split("\n");
              return (
                <g key={nd.id} onMouseEnter={() => setHov(nd.id)} onMouseLeave={() => setHov(null)} style={{ cursor:"pointer" }}>
                  <circle cx={nd.x} cy={nd.y} r={on?28:19} fill={col+(on?"22":"0E")} stroke={col} strokeWidth={on?2:1} filter={on?"url(#glow2)":""} style={{ transition:"r .18s" }}/>
                  {lines.map((ln,li) => (
                    <text key={li} x={nd.x} y={nd.y+(li-(lines.length-1)/2)*11+4} textAnchor="middle" fill={on?col:"#888"} fontSize={8.5} fontFamily={MF} fontWeight={on?700:400} style={{ transition:"fill .18s" }}>{ln}</text>
                  ))}
                  {nd.sc!=null && <text x={nd.x+20} y={nd.y-19} fill={ORANGE} fontSize={9} fontFamily={MF} fontWeight={700}>{nd.sc}</text>}
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <Band label="Graph views"/>
            <Card p="6px 0">
              {VIEWS.map((v,i) => (
                <div key={i} onClick={() => setView(i)} style={{ padding:"9px 14px", cursor:"pointer", transition:"all .13s", background:view===i?ORANGE+"14":"transparent", borderLeft:`3px solid ${view===i?ORANGE:"transparent"}`, fontFamily:MF, fontSize:9.5, color:view===i?ORANGE:t.mid }}>
                  {v}
                </div>
              ))}
            </Card>
          </div>
          <div>
            <Band label="Node types" color={t.band}/>
            <Card>
              {Object.entries(NODE_COL).map(([tp,c]) => (
                <div key={tp} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                  <div style={{ width:9, height:9, borderRadius:"50%", background:c+"33", border:`1px solid ${c}`, flexShrink:0 }}/>
                  <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{tp}</span>
                </div>
              ))}
            </Card>
          </div>
          <div style={{ background:t.card, border:`1px solid ${t.border}`, borderTop:`3px solid ${ORANGE}`, padding:"12px 14px" }}>
            <div style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:1.5, marginBottom:8 }}>⚠ CLOSED LOOP DETECTED</div>
            <div style={{ fontFamily:SF, fontStyle:"italic", fontSize:11, color:t.mid, lineHeight:1.65 }}>Raytheon PAC → Sen. Hughes → Armed Services Cmte → DoD → F-35 $5.1B → Raytheon</div>
            <div style={{ fontFamily:MF, fontSize:8.5, color:t.warn, marginTop:8 }}>Avg. loop closure: 11 months</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SPENDING AUDIT ───────────────────────────────────────────────────────────
function SpendingAudit() {
  const t = useT();
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ borderTop:`3px solid ${ORANGE}`, paddingTop:16 }}>
        <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:3, marginBottom:8 }}>SPENDING AUDIT · USASPENDING.GOV · FPDS-NG</div>
        <h2 style={{ fontFamily:SF, fontSize:32, color:t.hi, fontWeight:700, lineHeight:1.1, marginBottom:8 }}>Federal spending audit</h2>
        <p style={{ fontFamily:SF, fontSize:14, fontStyle:"italic", color:t.mid, lineHeight:1.7, maxWidth:640 }}>Actual obligations versus congressional appropriations — anomaly detection across contract awards and agency-level budget variance analysis.</p>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div>
          <Band label="Agency budget variance" right="FY2024"/>
          <Card>
            <CT h="Treasury and Justice show the largest absolute overruns; Education alone came in under budget." sub="Appropriated vs. actual · $B · FY2024"/>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={SPEND} layout="vertical" margin={{ left:4, right:50, top:0, bottom:0 }} barCategoryGap="22%">
                <CartesianGrid horizontal={false} stroke={t.grid}/>
                <XAxis type="number" {...ap(t)} tickFormatter={v=>`$${v}B`}/>
                <YAxis type="category" dataKey="a" {...ap(t)} width={66}/>
                <Tooltip content={<ETip fmt={v=>`$${v}B`}/>}/>
                <Bar dataKey="b" name="Appropriated" radius={0} barSize={10} fill={t.border}/>
                <Bar dataKey="v" name="Actual"       radius={0} barSize={10}>
                  {SPEND.map((d,i) => <Cell key={i} fill={d.v>d.b?ORANGE:t.ok}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", gap:16, marginTop:8 }}>
              {[["Appropriated",t.border],["Over budget",ORANGE],["Under budget",t.ok]].map(([l,c]) => (
                <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, background:c, border:`1px solid ${t.low}` }}/>
                  <span style={{ fontFamily:MF, fontSize:9, color:t.mid }}>{l}</span>
                </div>
              ))}
            </div>
            <Src s="USASpending.gov; GovInfo budget justifications"/>
          </Card>
        </div>

        <div>
          <Band label="PAC donations vs contracts — scatter" right="FY2024"/>
          <Card>
            <CT h="A strong positive correlation between PAC donations and federal contract awards exists across all major sectors." sub="PAC donations ($m) vs. contracts won · bubble = accountability score"/>
            <ResponsiveContainer width="100%" height={250}>
              <ScatterChart margin={{ left:0, right:16, top:10, bottom:14 }}>
                <CartesianGrid {...hg(t)} vertical/>
                <XAxis type="number" dataKey="pac" name="PAC ($m)" {...ap(t)} tickFormatter={v=>`$${v}m`}
                  label={{ value:"PAC donations ($m)", position:"insideBottom", offset:-4, style:{ fontFamily:MF, fontSize:8.5, fill:t.low } }}/>
                <YAxis type="number" dataKey="con" name="Contracts ($m)" {...ap(t)} tickFormatter={v=>`$${(v/1000).toFixed(0)}bn`}/>
                <ZAxis dataKey="sc" range={[40,340]}/>
                <Tooltip content={({ active, payload }) => {
                  if (!active||!payload?.length) return null;
                  const d = payload[0]?.payload;
                  return (
                    <div style={{ background:t.ink, border:`1px solid ${t.border}`, borderLeft:`3px solid ${ORANGE}`, padding:"8px 12px", fontFamily:MF }}>
                      <div style={{ fontFamily:SF, fontSize:12, color:t.hi, marginBottom:4 }}>{d.n}</div>
                      <div style={{ fontSize:10, color:ORANGE }}>${d.pac}m PAC · ${(d.con/1000).toFixed(1)}bn contracts</div>
                      <div style={{ fontSize:10, color:d.sc<40?ORANGE:t.ok, marginTop:2 }}>Score: {d.sc}</div>
                    </div>
                  );
                }}/>
                <Scatter data={CORPS}>
                  {CORPS.map((d,i) => <Cell key={i} fill={d.sc<40?ORANGE:d.sc<55?t.warn:t.ok} fillOpacity={0.8}/>)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            <Src s="FEC; USASpending.gov; UN*REDACTED accountability score; FY2024"/>
          </Card>
        </div>
      </div>

      <div>
        <Band label="Defence and pharma PAC spending vs. contract awards" right="2016–2024"/>
        <Card>
          <CT h="PAC investment and contract returns have grown in lockstep across all major sectors." sub="PAC contributions ($m, bars) and contracts ($bn, lines) · annual"/>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={TREND} margin={{ left:0, right:60, top:12, bottom:0 }}>
              <CartesianGrid {...hg(t)}/>
              <XAxis dataKey="y" {...ap(t)}/>
              <YAxis yAxisId="L" {...ap(t)} tickFormatter={v=>`$${v}m`} width={52}/>
              <YAxis yAxisId="R" {...ap(t)} orientation="right" tickFormatter={v=>`$${v}m`} width={46}/>
              <Tooltip content={<ETip fmt={v=>`$${v}m`}/>}/>
              <Bar    yAxisId="L" dataKey="d"  name="Defence PAC" fill={ORANGE}  radius={0} barSize={7} opacity={0.8}/>
              <Bar    yAxisId="L" dataKey="ph" name="Pharma PAC"  fill={t.warn}  radius={0} barSize={7} opacity={0.8}/>
              <Line  yAxisId="R" dataKey="f"  name="Finance"     stroke={t.blue} strokeWidth={2} dot={false} type="monotone"/>
              <Line  yAxisId="R" dataKey="e"  name="Energy"      stroke={t.mid}  strokeWidth={1.5} dot={false} type="monotone" strokeDasharray="5 3"/>
            </ComposedChart>
          </ResponsiveContainer>
          <Leg items={[["Defence PAC",ORANGE],["Pharma PAC",t.warn],["Finance",t.blue],["Energy",t.mid,true]]}/>
          <Src s="FEC schedule B; USASpending.gov; OpenSecrets"/>
        </Card>
      </div>
    </div>
  );
}

// ─── CORPORATE ────────────────────────────────────────────────────────────────
function Corporate() {
  const t = useT();
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:22 }}>
      <div style={{ borderTop:`3px solid ${ORANGE}`, paddingTop:16 }}>
        <div style={{ fontFamily:MF, fontSize:9, color:ORANGE, letterSpacing:3, marginBottom:8 }}>CORPORATE ACCOUNTABILITY · FEC · USASPENDING · UN*REDACTED SCORE</div>
        <h2 style={{ fontFamily:SF, fontSize:32, color:t.hi, fontWeight:700, lineHeight:1.1, marginBottom:8 }}>Corporate accountability index</h2>
        <p style={{ fontFamily:SF, fontSize:14, fontStyle:"italic", color:t.mid, lineHeight:1.7, maxWidth:640 }}>Companies ranked by the UN*REDACTED Accountability Score — a composite of donation-to-contract correlation, regulatory capture signals, disclosure compliance and revolving-door exposure.</p>
      </div>

      <div>
        <Band label="Accountability index — top federal contractors" right="FY2024 · LOWER SCORE = MORE RISK"/>
        <div style={{ background:t.card, border:`1px solid ${t.border}`, borderTop:"none" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ background:t.cardB, borderBottom:`2px solid ${t.border}` }}>
                {[["COMPANY","170px"],["SECTOR","88px"],["PAC ($M)","88px"],["CONTRACTS","100px"],["ROI","70px"],["SCORE","140px"],["RISK","90px"]].map(([h,w]) => (
                  <th key={h} style={{ padding:"8px 14px", width:w, textAlign:"left", fontFamily:MF, fontSize:8, color:t.low, letterSpacing:2, fontWeight:400, borderRight:`1px solid ${t.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CORPS.map((d,i) => {
                const rc = d.sc<35?ORANGE:d.sc<55?t.warn:t.ok;
                const rl = d.sc<35?"CRITICAL":d.sc<55?"HIGH":d.sc<70?"MEDIUM":"CLEAN";
                const roi = ((d.con/d.pac)*10).toFixed(1);
                return (
                  <tr key={i} style={{ borderBottom:`1px solid ${t.border}`, background:i%2===0?t.card:t.tableAlt, transition:"background .12s" }}>
                    <td style={{ padding:"10px 14px", borderRight:`1px solid ${t.border}`, fontFamily:MF, fontSize:11, color:t.hi }}>{d.n}</td>
                    <td style={{ padding:"10px 14px", fontFamily:MF, fontSize:9.5, color:t.mid, borderRight:`1px solid ${t.border}` }}>{d.s}</td>
                    <td style={{ padding:"10px 14px", fontFamily:MF, fontSize:11, color:ORANGE, fontWeight:700, textAlign:"right", borderRight:`1px solid ${t.border}` }}>${d.pac}m</td>
                    <td style={{ padding:"10px 14px", textAlign:"right", borderRight:`1px solid ${t.border}` }}>
                      {d.sc<40
                        ? <Blk w="72px"><span style={{ fontFamily:MF, fontSize:11, color:ORANGE, fontWeight:700 }}>${(d.con/1000).toFixed(1)}bn</span></Blk>
                        : <span style={{ fontFamily:MF, fontSize:11, color:ORANGE, fontWeight:700 }}>${(d.con/1000).toFixed(1)}bn</span>}
                    </td>
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
                      <span style={{ fontFamily:MF, fontSize:8, letterSpacing:1, color:rc, border:`1px solid ${rc}44`, padding:"2px 8px", background:rc+"12" }}>{rl}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding:"7px 14px", background:t.cardB, borderTop:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between" }}>
            <span style={{ fontFamily:MF, fontSize:8.5, color:t.low }}>Sources: FEC; USASpending.gov; UN*REDACTED accountability score. All inferences are analytical — not legal conclusions.</span>
            <span style={{ fontFamily:MF, fontSize:8.5, color:t.low }}>{new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase()}</span>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div>
          <Band label="STOCK Act violations quarterly" color={ORANGE} right="HOUSE/SENATE DISCLOSURES"/>
          <Card>
            <CT h="Q1 2024 recorded the most potential violations since tracking began — 14 trades of concern." sub="Congressional stock trades within 30 days of committee activity · quarterly"/>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={STOCK} margin={{ left:0, right:24, top:12, bottom:0 }} barCategoryGap="26%">
                <CartesianGrid {...hg(t)}/>
                <XAxis dataKey="q" {...ap(t)}/>
                <YAxis {...ap(t)}/>
                <Tooltip content={<ETip/>}/>
                <ReferenceLine y={7} stroke={t.warn} strokeDasharray="4 3"
                  label={{ value:"avg  7", position:"right", style:{ fontFamily:MF, fontSize:8.5, fill:t.warn } }}/>
                <Bar dataKey="v" name="Violations" radius={0}>
                  {STOCK.map((d,i) => <Cell key={i} fill={d.v>=10?ORANGE:d.v>=7?t.warn:t.border}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Src s="Senate/House financial disclosures; UN*REDACTED STOCK Act engine"/>
          </Card>
        </div>
        <div>
          <Band label="Accountability score by company"/>
          <Card>
            <CT h="Defence sector scores cluster in the critical range. Tech and health score considerably better on average." sub="UN*REDACTED Accountability Score · lower = more risk"/>
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={CORPS} margin={{ left:0, right:16, top:12, bottom:0 }} barCategoryGap="26%">
                <CartesianGrid {...hg(t)}/>
                <XAxis dataKey="n" tick={{ fontFamily:MF, fontSize:8, fill:t.mid }} angle={-18} textAnchor="end" height={42} axisLine={{ stroke:t.border }} tickLine={false}/>
                <YAxis {...ap(t)} domain={[0,100]}/>
                <Tooltip content={<ETip/>}/>
                <ReferenceLine y={55} stroke={t.low} strokeDasharray="3 3"
                  label={{ value:"risk threshold", position:"right", style:{ fontFamily:MF, fontSize:8, fill:t.low } }}/>
                <Bar dataKey="sc" name="Score" radius={0}>
                  {CORPS.map((d,i) => <Cell key={i} fill={d.sc<35?ORANGE:d.sc<55?t.warn:t.ok}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <Src s="UN*REDACTED accountability score methodology · unredacted.fyi/methodology"/>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id:"overview",  label:"Overview"            },
  { id:"donors",    label:"Donor Intelligence"  },
  { id:"policy",    label:"Policy Intelligence" },
  { id:"donorweb",  label:"Donor Web"           },
  { id:"spending",  label:"Spending Audit"      },
  { id:"corporate", label:"Corporate"           },
];

// ─── ANALYST PANEL ────────────────────────────────────────────────────────────

const AGENT_META = {
  orchestrator: { label:"Orchestrator",   color:ORANGE,    icon:"◈" },
  policy:       { label:"PolicyAgent",    color:"#4A7FFF", icon:"⚖" },
  spending:     { label:"SpendingAgent",  color:"#FFB84D", icon:"$" },
  donor:        { label:"DonorAgent",     color:"#FF8000", icon:"◉" },
  corruption:   { label:"CorruptionAgent",color:"#CC44AA", icon:"⚠" },
};

const SYSTEM_PROMPT = `You are the UN*REDACTED Orchestration AI — a senior intelligence analyst for a US government accountability platform.

You route queries to specialized sub-agents and synthesize their findings:
• PolicyAgent     — Federal regulations, executive orders, bills, rulemaking (FederalRegister, GovInfo, Regulations.gov)
• SpendingAgent   — Federal contracts, grants, budget variances (USASpending.gov, FPDS-NG)
• DonorAgent      — PAC contributions, individual donations, STOCK Act (FEC, OpenSecrets, Congressional disclosures)
• CorruptionAgent — Cross-source correlation: donation→contract→oversight loops, revolving door, regulatory capture

RESPONSE FORMAT — Always structure your response as JSON with this exact schema:
{
  "routing": [
    { "agent": "policy|spending|donor|corruption|orchestrator", "reason": "one sentence why" }
  ],
  "findings": [
    {
      "agent": "policy|spending|donor|corruption|orchestrator",
      "headline": "bold single-sentence finding",
      "detail": "2-3 sentence elaboration with specific figures where available",
      "risk": "CRITICAL|HIGH|MED|LOW|INFO",
      "sources": ["source1", "source2"]
    }
  ],
  "signal": "1-2 sentence cross-source synthesis or pattern alert",
  "disclaimer": "Analytical inference only — not a legal conclusion."
}

Always use real-sounding but clearly illustrative figures. Be direct and use the editorial voice of a senior investigative analyst. Reference specific agency names, dollar amounts, and dates.`;

function AnalystPanel({ onClose, dark }) {
  const t = useT();
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [routing, setRouting] = useState(null);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const STARTERS = [
    "Which defence contractors donate most to Armed Services Committee members?",
    "Show me correlation between EPA donor PACs and rollback of clean-air rules",
    "Flag STOCK Act violations linked to pharmaceutical hearings Q1 2024",
    "Trace Lockheed Martin's political influence network end-to-end",
    "Which agencies are most over-appropriation and who benefits?",
    "Map revolving door between DoD and top 5 defence contractors",
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [msgs, loading]);

  const parseResponse = (raw) => {
    try {
      const clean = raw.replace(/```json|```/g,"").trim();
      return JSON.parse(clean);
    } catch {
      return {
        routing:[{ agent:"orchestrator", reason:"Direct response" }],
        findings:[{ agent:"orchestrator", headline:"Response received", detail:raw, risk:"INFO", sources:[] }],
        signal:"",
        disclaimer:"Analytical inference only."
      };
    }
  };

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    setMsgs(m => [...m, { role:"user", content:q }]);
    setLoading(true);
    setRouting(null);

    // Show routing animation
    setTimeout(() => setRouting("analyzing"), 200);
    setTimeout(() => setRouting("routing"), 900);

    const history = msgs.map(m => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.role === "user" ? m.content : JSON.stringify(m.data)
    }));

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:1000,
          system: SYSTEM_PROMPT,
          messages:[...history, { role:"user", content:q }]
        })
      });
      const data = await res.json();
      const raw = data.content?.find(b => b.type==="text")?.text || "";
      const parsed = parseResponse(raw);
      setMsgs(m => [...m, { role:"assistant", data:parsed }]);
    } catch(e) {
      setMsgs(m => [...m, { role:"assistant", data:{
        routing:[{ agent:"orchestrator", reason:"Error routing query" }],
        findings:[{ agent:"orchestrator", headline:"Connection error", detail:"Unable to reach the intelligence API. Please try again.", risk:"INFO", sources:[] }],
        signal:"", disclaimer:""
      }}]);
    }
    setLoading(false);
    setRouting(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const RISK_COLOR = { CRITICAL:ORANGE, HIGH:"#FFB84D", MED:t.blue, LOW:t.mid, INFO:t.low };

  return (
    <div style={{
      display:"flex", flexDirection:"column",
      height:"100%",
      background: dark ? "#0A0A0A" : "#FAFAFA",
      borderLeft:`1px solid ${t.border}`,
      fontFamily:MF,
    }}>
      {/* Panel header */}
      <div style={{
        background: dark ? "#111" : WHITE,
        borderBottom:`1px solid ${t.border}`,
        padding:"0 18px",
        height:52,
        display:"flex", alignItems:"center", justifyContent:"space-between",
        flexShrink:0,
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:ORANGE+"22", border:`1.5px solid ${ORANGE}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ fontSize:13, color:ORANGE }}>◈</span>
          </div>
          <div>
            <div style={{ fontFamily:MF, fontSize:11, color:t.hi, letterSpacing:0.5 }}>Analyst Agent</div>
            <div style={{ fontFamily:MF, fontSize:8.5, color:t.low, letterSpacing:1.5 }}>ORCHESTRATION LAYER · 4 SUB-AGENTS</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {/* Agent status pills */}
          <div style={{ display:"flex", gap:5 }}>
            {Object.entries(AGENT_META).filter(([k])=>k!=="orchestrator").map(([k,v]) => (
              <div key={k} style={{ fontFamily:MF, fontSize:7.5, color:v.color, border:`1px solid ${v.color}44`, background:v.color+"0F", padding:"2px 7px", letterSpacing:0.5 }}>
                {v.icon} {v.label}
              </div>
            ))}
          </div>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${t.border}`, color:t.mid, width:28, height:28, fontSize:16, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 18px", display:"flex", flexDirection:"column", gap:20 }}>

        {/* Welcome state */}
        {msgs.length === 0 && (
          <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
            <div style={{ textAlign:"center", padding:"28px 0 12px" }}>
              <div style={{ width:52, height:52, borderRadius:"50%", background:ORANGE+"18", border:`2px solid ${ORANGE}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", boxShadow:`0 0 24px ${ORANGE}28` }}>
                <span style={{ fontSize:22, color:ORANGE }}>◈</span>
              </div>
              <div style={{ fontFamily:SF, fontSize:18, color:t.hi, fontWeight:700, marginBottom:6 }}>Analyst Agent</div>
              <div style={{ fontFamily:MF, fontSize:10, color:t.mid, lineHeight:1.7, maxWidth:320, margin:"0 auto" }}>
                Ask anything about government spending, donor networks, policy changes, or corruption signals. I'll route your query to the right agents.
              </div>
            </div>

            {/* Agent cards */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {Object.entries(AGENT_META).filter(([k])=>k!=="orchestrator").map(([k,v]) => (
                <div key={k} style={{ background:t.card, border:`1px solid ${t.border}`, borderTop:`2px solid ${v.color}`, padding:"10px 12px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
                    <span style={{ color:v.color, fontSize:12 }}>{v.icon}</span>
                    <span style={{ fontFamily:MF, fontSize:9, color:v.color, letterSpacing:1 }}>{v.label}</span>
                  </div>
                  <div style={{ fontFamily:MF, fontSize:8.5, color:t.low, lineHeight:1.5 }}>
                    {k==="policy"    && "FederalRegister · GovInfo · Regulations.gov"}
                    {k==="spending"  && "USASpending.gov · FPDS-NG · GAO"}
                    {k==="donor"     && "FEC · OpenSecrets · Disclosures"}
                    {k==="corruption"&& "Cross-source correlation engine"}
                  </div>
                </div>
              ))}
            </div>

            {/* Starter questions */}
            <div>
              <div style={{ fontFamily:MF, fontSize:8.5, color:t.low, letterSpacing:2, marginBottom:10 }}>SUGGESTED QUERIES</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {STARTERS.map((s,i) => (
                  <button key={i} onClick={() => send(s)} style={{
                    background:t.card, border:`1px solid ${t.border}`,
                    borderLeft:`3px solid ${ORANGE}33`,
                    padding:"9px 12px", textAlign:"left",
                    fontFamily:MF, fontSize:10, color:t.mid,
                    lineHeight:1.5, transition:"all .14s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderLeftColor=ORANGE; e.currentTarget.style.color=t.hi; }}
                  onMouseLeave={e => { e.currentTarget.style.borderLeftColor=ORANGE+"33"; e.currentTarget.style.color=t.mid; }}
                  >{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conversation */}
        {msgs.map((m,i) => (
          <div key={i}>
            {m.role==="user" ? (
              <div style={{ display:"flex", justifyContent:"flex-end" }}>
                <div style={{
                  background: dark ? "#1E1E1E" : "#F0F0F0",
                  border:`1px solid ${t.border}`,
                  borderBottomRightRadius:0,
                  padding:"11px 14px",
                  maxWidth:"82%",
                  fontFamily:MF, fontSize:11.5, color:t.hi, lineHeight:1.65,
                }}>
                  {m.content}
                </div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {/* Agent ID bar */}
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", background:ORANGE+"20", border:`1px solid ${ORANGE}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:ORANGE, flexShrink:0 }}>◈</div>
                  <span style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:2 }}>ANALYST AGENT</span>
                  {/* Routing badges */}
                  {m.data?.routing?.map((r,ri) => {
                    const meta = AGENT_META[r.agent] || AGENT_META.orchestrator;
                    return (
                      <div key={ri} style={{ fontFamily:MF, fontSize:7.5, color:meta.color, border:`1px solid ${meta.color}44`, background:meta.color+"0F", padding:"2px 7px", letterSpacing:0.5 }}>
                        {meta.icon} {meta.label}
                      </div>
                    );
                  })}
                </div>

                {/* Findings */}
                {m.data?.findings?.map((f,fi) => {
                  const meta = AGENT_META[f.agent] || AGENT_META.orchestrator;
                  const rc = RISK_COLOR[f.risk] || t.mid;
                  return (
                    <div key={fi} style={{ background: dark ? "#0F0F0F" : WHITE, border:`1px solid ${t.border}`, borderLeft:`3px solid ${meta.color}` }}>
                      <div style={{ padding:"10px 14px 8px", borderBottom:`1px solid ${t.border}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                          <span style={{ color:meta.color, fontSize:11 }}>{meta.icon}</span>
                          <span style={{ fontFamily:MF, fontSize:8.5, color:meta.color, letterSpacing:1.5 }}>{meta.label.toUpperCase()}</span>
                        </div>
                        <span style={{ fontFamily:MF, fontSize:8, color:rc, border:`1px solid ${rc}44`, background:rc+"10", padding:"2px 8px" }}>{f.risk}</span>
                      </div>
                      <div style={{ padding:"12px 14px" }}>
                        <div style={{ fontFamily:MF, fontSize:12, color:t.hi, fontWeight:500, lineHeight:1.4, marginBottom:8 }}>{f.headline}</div>
                        <div style={{ fontFamily:SF, fontStyle:"italic", fontSize:12, color:t.mid, lineHeight:1.7, marginBottom:f.sources?.length?10:0 }}>{f.detail}</div>
                        {f.sources?.length>0 && (
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {f.sources.map((s,si) => (
                              <span key={si} style={{ fontFamily:MF, fontSize:8, color:t.low, background:t.border+"55", padding:"2px 7px" }}>{s}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Signal */}
                {m.data?.signal && (
                  <div style={{ background:ORANGE+"0C", border:`1px solid ${ORANGE}33`, borderLeft:`3px solid ${ORANGE}`, padding:"10px 14px" }}>
                    <div style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:2, marginBottom:5 }}>⚠ CROSS-SOURCE SIGNAL</div>
                    <div style={{ fontFamily:SF, fontStyle:"italic", fontSize:12, color:t.mid, lineHeight:1.65 }}>{m.data.signal}</div>
                  </div>
                )}

                {/* Disclaimer */}
                {m.data?.disclaimer && (
                  <div style={{ fontFamily:MF, fontSize:8, color:t.low, paddingLeft:4 }}>{m.data.disclaimer}</div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Loading state */}
        {loading && (
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:"50%", background:ORANGE+"20", border:`1px solid ${ORANGE}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:ORANGE }}>◈</div>
              <span style={{ fontFamily:MF, fontSize:8.5, color:ORANGE, letterSpacing:2 }}>ANALYST AGENT</span>
              <div style={{ fontFamily:MF, fontSize:9, color:t.low, display:"flex", alignItems:"center", gap:5 }}>
                {routing==="analyzing" && "Analysing query…"}
                {routing==="routing"   && "Routing to agents…"}
                <span style={{ display:"flex", gap:3, marginLeft:4 }}>
                  {[0,1,2].map(i => <span key={i} style={{ display:"inline-block", width:4, height:4, borderRadius:"50%", background:ORANGE, animation:`dot ${0.6+i*0.15}s ${i*0.13}s infinite alternate` }}/>)}
                </span>
              </div>
            </div>

            {/* Simulated routing display */}
            {routing==="routing" && (
              <div style={{ display:"flex", flexDirection:"column", gap:5, paddingLeft:30 }}>
                {Object.entries(AGENT_META).filter(([k])=>k!=="orchestrator").map(([k,v],i) => (
                  <div key={k} style={{ display:"flex", alignItems:"center", gap:8, animation:`dot ${0.4+i*0.1}s ease` }}>
                    <span style={{ fontFamily:MF, fontSize:9, color:v.color }}>{v.icon}</span>
                    <span style={{ fontFamily:MF, fontSize:8.5, color:t.low }}>{v.label}</span>
                    <div style={{ flex:1, height:1, background:`linear-gradient(90deg,${v.color}66,transparent)` }}/>
                    <span style={{ fontFamily:MF, fontSize:8, color:t.low }}>scanning…</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div ref={bottomRef}/>
      </div>

      {/* Input bar */}
      <div style={{
        borderTop:`1px solid ${t.border}`,
        padding:"14px 18px",
        background: dark ? "#0F0F0F" : WHITE,
        flexShrink:0,
      }}>
        <div style={{ display:"flex", gap:9, alignItems:"flex-end" }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send(); }}}
            placeholder="Ask about donors, contracts, policy, or corruption signals…"
            rows={2}
            style={{
              flex:1, background:t.inputBg,
              border:`1px solid ${t.border}`,
              borderBottom:`2px solid ${ORANGE}`,
              padding:"10px 12px",
              fontFamily:MF, fontSize:11, color:t.hi,
              outline:"none", resize:"none",
              lineHeight:1.6,
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? ORANGE : t.border,
              border:"none",
              width:40, height:40,
              display:"flex", alignItems:"center", justifyContent:"center",
              color: WHITE, fontSize:16,
              transition:"background .15s",
              flexShrink:0,
            }}
          >↑</button>
        </div>
        <div style={{ marginTop:7, fontFamily:MF, fontSize:8, color:t.low, letterSpacing:0.5 }}>
          SHIFT+ENTER for new line · Powered by FastAPI + LangGraph · All data from public federal sources
        </div>
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]       = useState("overview");
  const [dark, setDark]     = useState(true);
  const [analyst, setAnalyst] = useState(false);
  const theme = dark ? DARK_THEME : LIGHT_THEME;

  const renderTab = () => {
    if (tab==="overview")  return <Overview/>;
    if (tab==="donors")    return <DonorIntel/>;
    if (tab==="policy")    return <PolicyIntel/>;
    if (tab==="donorweb")  return <DonorWeb/>;
    if (tab==="spending")  return <SpendingAudit/>;
    if (tab==="corporate") return <Corporate/>;
  };

  return (
    <ThemeCtx.Provider value={theme}>
      <div style={{ background:theme.bg, minHeight:"100vh", transition:"background .25s", display:"flex", flexDirection:"column" }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=IBM+Plex+Mono:wght@300;400;500;700&display=swap');
          *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
          ::-webkit-scrollbar{width:3px;height:3px}
          ::-webkit-scrollbar-track{background:transparent}
          ::-webkit-scrollbar-thumb{background:${ORANGE}55}
          button{cursor:pointer}
          input,textarea{color-scheme:${dark?"dark":"light"}}
          @keyframes dot{from{opacity:.2;transform:scale(.7)}to{opacity:1;transform:scale(1.3)}}
          @keyframes pulse{from{opacity:.5;box-shadow:0 0 4px #00FF88}to{opacity:1;box-shadow:0 0 10px #00FF88}}
        `}</style>

        {/* ── MASTHEAD ─────────────────────────────────────────── */}
        <div style={{ background:ORANGE, height:52, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 32px", flexShrink:0 }}>
          <div style={{ fontFamily:SF, fontSize:24, color:WHITE, fontWeight:700, letterSpacing:1.5 }}>
            UN<span style={{ opacity:0.7 }}>*</span>REDACTED
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:20 }}>
            <div style={{ display:"flex", alignItems:"center", gap:7 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:"#00FF88", animation:"pulse 2s infinite alternate" }}/>
              <span style={{ fontFamily:MF, fontSize:9, color:"rgba(255,255,255,.8)", letterSpacing:2 }}>LIVE</span>
            </div>
            <span style={{ fontFamily:MF, fontSize:9, color:"rgba(255,255,255,.55)", letterSpacing:1.5 }}>
              GOVERNMENT ACCOUNTABILITY INTELLIGENCE
            </span>
            <span style={{ fontFamily:MF, fontSize:9, color:"rgba(255,255,255,.4)" }}>
              {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"}).toUpperCase()}
            </span>
          </div>
        </div>

        <Ticker/>

        {/* ── NAV ──────────────────────────────────────────────── */}
        <div style={{ background:theme.navBg, borderBottom:`1px solid ${theme.border}`, display:"flex", alignItems:"stretch", padding:"0 20px 0 32px", transition:"background .25s", flexShrink:0 }}>
          {TABS.map(tb => {
            const on = tab===tb.id;
            return (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{
                background:"transparent",
                color: on ? ORANGE : theme.mid,
                border:"none",
                borderBottom:`3px solid ${on?ORANGE:"transparent"}`,
                padding:"12px 16px",
                fontFamily:MF, fontSize:10.5, letterSpacing:0.5,
                whiteSpace:"nowrap", transition:"color .14s, border-color .14s",
              }}>{tb.label}</button>
            );
          })}

          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:9 }}>
            <div style={{ display:"flex", alignItems:"center", background:theme.inputBg, border:`1px solid ${theme.border}`, padding:"0 11px", height:30, gap:6, width:210 }}>
              <span style={{ color:theme.low, fontSize:13 }}>⌕</span>
              <input placeholder="Search entities…" style={{ flex:1, background:"none", border:"none", fontFamily:MF, fontSize:10, color:theme.hi, outline:"none" }}/>
            </div>
            <div style={{ fontFamily:MF, fontSize:8.5, color:theme.low, border:`1px solid ${theme.border}`, padding:"4px 10px" }}>🔔 12</div>

            <button onClick={() => setDark(d => !d)} style={{
              display:"flex", alignItems:"center", gap:6,
              background:theme.cardB, border:`1px solid ${theme.border}`, borderRadius:20,
              padding:"5px 11px", fontFamily:MF, fontSize:9, color:theme.mid, transition:"all .2s",
            }}>
              <span style={{ fontSize:12 }}>{dark?"☀":"🌙"}</span>
              <span style={{ letterSpacing:1 }}>{dark?"LIGHT":"DARK"}</span>
            </button>

            {/* ANALYST BUTTON */}
            <button
              onClick={() => setAnalyst(a => !a)}
              style={{
                display:"flex", alignItems:"center", gap:7,
                background: analyst ? ORANGE : ORANGE+"18",
                border:`1.5px solid ${ORANGE}`,
                padding:"5px 14px",
                fontFamily:MF, fontSize:9, letterSpacing:1,
                color: analyst ? WHITE : ORANGE,
                transition:"all .2s",
                boxShadow: analyst ? `0 0 16px ${ORANGE}44` : "none",
              }}
            >
              <span style={{ fontSize:12 }}>◈</span>
              ANALYST {analyst ? "▾" : "▸"}
            </button>
          </div>
        </div>

        {/* ── SPLIT BODY ───────────────────────────────────────── */}
        <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

          {/* Main content — shrinks when panel open */}
          <div style={{
            flex:1, overflowY:"auto",
            transition:"all .3s cubic-bezier(.4,0,.2,1)",
            minWidth:0,
          }}>
            <div style={{ maxWidth: analyst ? "none" : 1200, margin:"0 auto", padding:"28px 28px 52px" }} key={tab}>
              {renderTab()}
              <div style={{ marginTop:32, borderTop:`1px solid ${theme.border}`, paddingTop:14, display:"flex", justifyContent:"space-between" }}>
                <span style={{ fontFamily:MF, fontSize:8.5, color:theme.low }}>UN*REDACTED · Public record intelligence · All data from public federal sources</span>
                <span style={{ fontFamily:MF, fontSize:8.5, color:theme.low }}>Analytical inferences are not legal conclusions · unredacted.fyi</span>
              </div>
            </div>
          </div>

          {/* Analyst panel — slides in from right */}
          <div style={{
            width: analyst ? "420px" : "0px",
            minWidth: analyst ? "420px" : "0px",
            overflow:"hidden",
            transition:"all .3s cubic-bezier(.4,0,.2,1)",
            flexShrink:0,
            display:"flex", flexDirection:"column",
          }}>
            {analyst && (
              <AnalystPanel onClose={() => setAnalyst(false)} dark={dark}/>
            )}
          </div>

        </div>
      </div>
    </ThemeCtx.Provider>
  );
}
