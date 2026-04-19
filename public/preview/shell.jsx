// Shared UI primitives + app shell (top nav, header, routing)
const { useState, useEffect, useMemo, useRef } = React;

// ---------- helpers ----------
const fmt$ = (n, short=false) => {
  if (n == null) return "—";
  if (short) {
    if (Math.abs(n) >= 1e6) return (n<0?"-":"") + "$" + (Math.abs(n)/1e6).toFixed(n%1e6===0?0:1) + "M";
    if (Math.abs(n) >= 1e3) return (n<0?"-":"") + "$" + Math.round(Math.abs(n)/1e3) + "K";
    return (n<0?"-":"") + "$" + Math.abs(n);
  }
  return (n<0?"-":"") + "$" + Math.abs(n).toLocaleString();
};
const fmtNum = (n) => n == null ? "—" : Number(n).toLocaleString();
const clsx = (...xs) => xs.filter(Boolean).join(" ");

// status color
const STATUS_COLOR = {
  "OK":       { bg:"var(--status-ok-bg)",    text:"var(--status-ok-text)",    bar:"var(--status-ok-bar)",    dot:"var(--brand-green-400)" },
  "Watch":    { bg:"var(--status-watch-bg)", text:"var(--status-watch-text)", bar:"var(--status-watch-bar)", dot:"var(--status-watch-bar)" },
  "At Risk":  { bg:"var(--status-risk-bg)",  text:"var(--status-risk-text)",  bar:"var(--status-risk-bar)",  dot:"var(--status-risk-bar)" },
  "N/S":      { bg:"#ECEFF1",                text:"#455A64",                   bar:"#78909C",                 dot:"#78909C" },
  null:       { bg:"#ECEFF1",                text:"#455A64",                   bar:"#CCD2D9",                 dot:"#CCD2D9" },
};

// ---------- primitives ----------
function Pill({ status, children, tone }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR[null];
  const style = tone ? {} : { background:s.bg, color:s.text };
  return <span className="sbs-pill" style={style} data-tone={tone}>{children || status || "—"}</span>;
}

function BurnBar({ value, tone, tall }) {
  const v = Math.max(0, Math.min(100, value || 0));
  const color = tone === "risk" ? "var(--status-risk-bar)" :
                tone === "watch" ? "var(--status-watch-bar)" :
                tone === "ns" ? "#78909C" :
                v >= 80 ? "var(--burn-high)" : v >= 55 ? "var(--burn-mid)" : "var(--burn-low)";
  return (
    <div className={clsx("sbs-burn", tall && "tall")}>
      <div style={{ width: v+"%", background: color }}/>
    </div>
  );
}

function Dot({ status, size=8 }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR[null];
  return <span style={{display:"inline-block",width:size,height:size,borderRadius:"50%",background:s.dot,flexShrink:0}}/>;
}

function Card({ children, title, meta, action, padded=true, className }) {
  return (
    <div className={clsx("sbs-card", className)}>
      {(title || action) && (
        <div className="sbs-card-head">
          <div>
            {title && <div className="sbs-eyebrow">{title}</div>}
            {meta && <div className="sbs-card-meta">{meta}</div>}
          </div>
          {action}
        </div>
      )}
      <div className={padded?"sbs-card-body":""}>{children}</div>
    </div>
  );
}

function KPI({ label, value, sub, tone, mono=true, accent }) {
  return (
    <div className={clsx("sbs-kpi", accent && "accent")} data-tone={tone}>
      <div className="kpi-label">{label}</div>
      <div className={clsx("kpi-value", mono && "mono")}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function SectionTitle({ children, sub, right }) {
  return (
    <div className="sbs-section-title">
      <div>
        <h2>{children}</h2>
        {sub && <div className="sbs-section-sub">{sub}</div>}
      </div>
      {right}
    </div>
  );
}

// ---------- App shell ----------
const TABS = [
  { id:"dashboard", label:"Dashboard" },
  { id:"live",      label:"Live Field" },
  { id:"portfolio", label:"Portfolio" },
  { id:"schedule",  label:"Schedule" },
  { id:"equipment", label:"Equipment" },
  { id:"fleet",     label:"Fleet" },
  { id:"scorecard", label:"Scorecard" },
  { id:"sales",     label:"Sales" },
  { id:"marketing", label:"Marketing" },
];

function useRoute() {
  const [tab, setTab] = useState(() => {
    const h = (location.hash||"").replace("#","");
    return TABS.find(t=>t.id===h) ? h : (localStorage.getItem("sbs.tab") || "dashboard");
  });
  useEffect(() => {
    localStorage.setItem("sbs.tab", tab);
    if (location.hash.replace("#","") !== tab) history.replaceState(null,"","#"+tab);
  }, [tab]);
  useEffect(() => {
    const on = () => {
      const h = (location.hash||"").replace("#","");
      if (TABS.find(t=>t.id===h)) setTab(h);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [tab, setTab];
}

function TopBar({ tab, setTab, tweaks }) {
  const K = window.SBS_DATA.kpis;
  return (
    <header className="sbs-top">
      <div className="sbs-top-row sbs-top-row-1">
        <div className="sbs-brand">
          <img src="assets/sunbelt-mark-green.png" alt="" className="sbs-mark"/>
          <div className="sbs-brand-text">
            <div className="sbs-wordmark">SUNBELT SPORTS</div>
            <div className="sbs-tagline">Construction Management Portal</div>
          </div>
        </div>
        <div className="sbs-live-strip">
          <span className="sbs-live-dot"/>
          <span className="sbs-live-label">LIVE</span>
          <span className="sbs-live-sep"/>
          <span className="sbs-live-item"><b>{K.activeJobs}</b> active</span>
          <span className="sbs-live-sep"/>
          <span className="sbs-live-item"><b>{K.fleetAtJobsites}</b>/{K.fleetTotal} fleet on-site</span>
          <span className="sbs-live-sep"/>
          <span className="sbs-live-item"><span className="sbs-alert-badge crit">{K.criticalAlerts}</span> critical</span>
          <span className="sbs-live-item"><span className="sbs-alert-badge warn">{K.warnAlerts}</span> warn</span>
        </div>
        <div className="sbs-top-right">
          <div className="sbs-date">
            <div className="sbs-date-d">SUN · APR 19</div>
            <div className="sbs-date-y">2026 · AUBURN, GA</div>
          </div>
          <button className="sbs-btn" onClick={()=>alert("Export WBR")}>Export WBR</button>
          <button className="sbs-btn primary" onClick={()=>alert("New Job")}>+ New Job</button>
          <div className="sbs-avatar">DP</div>
        </div>
      </div>
      <nav className="sbs-nav" role="tablist">
        {TABS.map(t => (
          <button key={t.id}
            role="tab" aria-selected={tab===t.id}
            className={clsx("sbs-nav-btn", tab===t.id && "on")}
            onClick={()=>setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
    </header>
  );
}

// Expose globals for other scripts
Object.assign(window, {
  fmt$, fmtNum, clsx, STATUS_COLOR,
  Pill, BurnBar, Dot, Card, KPI, SectionTitle,
  TopBar, useRoute, TABS,
});
