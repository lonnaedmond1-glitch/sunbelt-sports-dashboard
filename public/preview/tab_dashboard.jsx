// Dashboard tab — hero KPI strip, stylized SE map, risk alerts, job health
const D = window.SBS_DATA;

function StylizedMap({ pins, onPick }) {
  // Schematic Southeast — AL, GA, SC, NC
  // viewBox 0 0 800 500
  return (
    <div className="sbs-map">
      <svg viewBox="0 0 800 500" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="topo" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M0 20 Q20 0 40 20 T80 20" fill="none" stroke="rgba(25,135,84,0.05)" strokeWidth="1"/>
          </pattern>
        </defs>
        <rect width="800" height="500" fill="url(#topo)"/>
        {/* Stylized state shapes */}
        <polygon className="map-state" points="160,180 330,170 340,360 180,370 150,300"/>
        <polygon className="map-state" points="330,170 480,180 490,380 340,360"/>
        <polygon className="map-state" points="480,180 600,160 620,250 540,270 490,260"/>
        <polygon className="map-state" points="480,180 600,160 660,100 720,120 700,220 620,250 600,160"/>
        <text className="map-state-label" x="245" y="290" textAnchor="middle">ALABAMA</text>
        <text className="map-state-label" x="410" y="290" textAnchor="middle">GEORGIA</text>
        <text className="map-state-label" x="545" y="230" textAnchor="middle">S. CAROLINA</text>
        <text className="map-state-label" x="640" y="170" textAnchor="middle">N. CAROLINA</text>

        {/* Auburn HQ */}
        <g transform="translate(260 280)">
          <circle r="4" fill="#14181F"/>
          <circle r="10" fill="none" stroke="#14181F" strokeDasharray="2 3" opacity="0.5"/>
          <text y="-14" textAnchor="middle" fontSize="10" fontFamily="var(--font-display)" letterSpacing="0.1em" fill="#14181F">HQ · AUBURN</text>
        </g>

        {/* Pins */}
        {pins.map(p => {
          const tone = p.status === "critical" ? "#DC3545" :
                       p.status === "warn" ? "#F0A500" :
                       p.status === "watch" ? "#F0A500" :
                       p.status === "ns" ? "#78909C" : "#198754";
          return (
            <g key={p.job} className="map-pin" transform={`translate(${p.x} ${p.y})`} onClick={()=>onPick(p.job)}>
              <circle className="pin-outer" r="14" fill={tone} opacity="0.18"/>
              <circle r="7" fill={tone} stroke="#fff" strokeWidth="2"/>
              <text y="-18" textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fontWeight="700" fill="#14181F">{p.job}</text>
            </g>
          );
        })}

        {/* Legend */}
        <g transform="translate(30 440)">
          <rect x="-10" y="-12" width="370" height="40" fill="rgba(255,255,255,0.85)" rx="6"/>
          <circle cx="8" cy="8" r="5" fill="#198754"/><text x="20" y="12" fontSize="11" fill="#263238">On Track</text>
          <circle cx="100" cy="8" r="5" fill="#F0A500"/><text x="112" y="12" fontSize="11" fill="#263238">Watch/Warn</text>
          <circle cx="210" cy="8" r="5" fill="#DC3545"/><text x="222" y="12" fontSize="11" fill="#263238">Critical</text>
          <circle cx="290" cy="8" r="5" fill="#78909C"/><text x="302" y="12" fontSize="11" fill="#263238">Not Started</text>
        </g>
      </svg>
    </div>
  );
}

function DashboardPage({ heroVariant, onTab }) {
  const K = D.kpis;
  const activeJobs = D.jobs.filter(j => ["Executed","Signed"].includes(j.status) && j.billed > 0 || j.health==="Watch" || j.health==="N/S");
  const needsAttention = D.jobs.filter(j => j.health==="Watch" || (j.flags && j.flags.length)).slice(0,3);

  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Operations Overview · Week 16</div>
          <h1>Command Center</h1>
          <div className="sbs-page-sub">Live WIP · 35 jobs · 4 states · $13.77M portfolio · last QBO sync 06:12 EDT</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="sbs-chip on">Today</button>
          <button className="sbs-chip">Week</button>
          <button className="sbs-chip">MTD</button>
          <button className="sbs-chip">YTD</button>
        </div>
      </div>

      {/* Hero KPI */}
      {heroVariant === "hero" && (
        <div className="sbs-hero-kpi">
          <div className="hero-headline">
            <div>
              <div className="kpi-label">Portfolio Value · FYTD</div>
              <div className="kpi-value">$13.77M</div>
            </div>
            <div className="kpi-sub">35 active · $4.27M billed · $9.50M remaining · target margin 25% · actual 46.2%</div>
          </div>
          <div><div className="kpi-label">Active Jobs</div><div className="kpi-value">9</div><div className="kpi-sub">Generating revenue (QBO)</div></div>
          <div><div className="kpi-label">At-Risk $</div><div className="kpi-value">$688K</div><div className="kpi-sub">$70K margin · $618K AR 91+ d</div></div>
          <div><div className="kpi-label">Critical Alerts</div><div className="kpi-value">2</div><div className="kpi-sub">1 no-report · 1 weather · escalated</div></div>
        </div>
      )}

      {heroVariant === "strip" && (
        <div className="sbs-kpi-strip">
          <KPI accent label="Portfolio Value" value="$13.77M" sub="+$320K QoQ"/>
          <KPI accent label="Total Jobs" value="35" sub="Live — WIP sheet"/>
          <KPI accent label="Active Jobs" value="9" sub="Generating revenue"/>
          <KPI accent label="Billed To Date" value="$4.27M" sub="31% collected"/>
          <KPI accent label="AR Overdue 91+" value="$618K" tone="risk" sub="23% of total AR"/>
          <KPI accent label="Avg Margin" value="46.2%" sub="Target 25%"/>
        </div>
      )}

      {heroVariant === "mixed" && (
        <>
          <div className="sbs-hero-kpi" style={{gridTemplateColumns:"1.4fr 1fr 1fr"}}>
            <div className="hero-headline">
              <div>
                <div className="kpi-label">Portfolio Value · FYTD</div>
                <div className="kpi-value">$13.77M</div>
              </div>
              <div className="kpi-sub">35 active · 4 states · $9.50M backlog</div>
            </div>
            <div><div className="kpi-label">Avg Job Margin</div><div className="kpi-value">46.2%</div><div className="kpi-sub">9 active · target 25%</div></div>
            <div><div className="kpi-label">Alerts</div><div className="kpi-value">3</div><div className="kpi-sub">2 critical · 1 warn</div></div>
          </div>
          <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(5, 1fr)"}}>
            <KPI label="Active Jobs" value="9"/>
            <KPI label="Scheduled" value="10"/>
            <KPI label="Billed MTD" value="$680K" sub="76% of target"/>
            <KPI label="Fleet On-Site" value="2/8" sub="6 in transit/yard"/>
            <KPI label="AR 91+" value="$618K" tone="risk"/>
          </div>
        </>
      )}

      {/* Map + alerts */}
      <div className="sbs-grid sbs-grid-sidebar">
        <Card title="Live Operations Map" meta="9 pinned · 8 vehicles tracking · real-time GPS"
          action={<div style={{display:"flex",gap:6}}>
            <button className="sbs-chip on">Jobs</button>
            <button className="sbs-chip">Fleet</button>
            <button className="sbs-chip">Both</button>
          </div>} padded={false}>
          <div style={{padding:20}}>
            <StylizedMap pins={D.mapPins} onPick={(j)=>alert(`Open ${j}`)}/>
          </div>
        </Card>

        <Card title="Risk & Alerts" meta={`${K.criticalAlerts} critical · ${K.warnAlerts} warn`} padded={false}>
          {D.alerts.map(a => (
            <div key={a.id} className="sbs-alert" onClick={()=>onTab("portfolio")}>
              <div className={clsx("sbs-alert-icon", a.level==="critical"?"crit":"warn")}>!</div>
              <div className="sbs-alert-body">
                <div className={clsx("sbs-alert-tag", a.level==="critical"?"crit":"warn")}>{a.tag}</div>
                <div className="sbs-alert-title">{a.job} · {a.name}</div>
                <div className="sbs-alert-msg">{a.msg}</div>
                <div className="sbs-alert-time">PM: {a.pm} · {a.time}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Financials */}
      <SectionTitle sub="Live job P&L, margin & receivables · QBO daily sync">Portfolio Health — Financials</SectionTitle>
      <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(6,1fr)"}}>
        <KPI label="Margin at Risk" value="$70K" tone="risk" sub="2 jobs losing money"/>
        <KPI label="Top Money Loser" value="-$51K" tone="risk" sub="25-897 · 0% margin"/>
        <KPI label="Change Orders FYTD" value="+$0K" sub="From WIP sheet"/>
        <KPI label="A/R Outstanding" value="$2.69M" sub="$1.31M current"/>
        <KPI label="A/R Overdue 91+" value="$618K" tone="risk" sub="23% of total AR"/>
        <KPI label="Avg Job Margin" value="46.2%" sub="Target 25%"/>
      </div>

      <div className="sbs-grid sbs-grid-sidebar" style={{marginTop:20}}>
        <Card title="Worst Offenders — Active Jobs at Financial Risk" meta="Loss, or cost ≥ 75% of contract" padded={false}>
          <div className="sbs-table-wrap">
            <table className="sbs-table">
              <thead><tr>
                <th>Job</th><th>Name</th><th>PM</th><th>Issue</th><th className="num">Loss</th><th className="num">Margin</th><th>Status</th>
              </tr></thead>
              <tbody>
                <tr className="sbs-row" onClick={()=>alert("25-897")}>
                  <td className="mono">25-897</td><td>New Sports Office</td><td>—</td><td><span className="sbs-pill" style={{background:"#F8D7DA",color:"#721C24"}}>LOSS</span> Losing money</td>
                  <td className="num" style={{color:"var(--status-risk-bar)"}}>-$51K</td><td className="num">0%</td><td><Pill status="At Risk"/></td>
                </tr>
                <tr className="sbs-row" onClick={()=>alert("30-001")}>
                  <td className="mono">30-001</td><td>Scruggs Work (labor only)</td><td>Pedro</td><td><span className="sbs-pill" style={{background:"#F8D7DA",color:"#721C24"}}>LOSS</span> Negative margin</td>
                  <td className="num" style={{color:"var(--status-risk-bar)"}}>-$20K</td><td className="num">-13%</td><td><Pill status="At Risk"/></td>
                </tr>
                <tr className="sbs-row" onClick={()=>alert("25-201")}>
                  <td className="mono">25-201</td><td>Lake Wylie HS</td><td>Jeff</td><td><span className="sbs-pill" style={{background:"#FFF3CD",color:"#856404"}}>BURN</span> Cost 75% of $899K · 84% billed</td>
                  <td className="num">—</td><td className="num">25%</td><td><Pill status="Watch"/></td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="A/R Aging" meta="Oldest receivable: 127 days">
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            <div>
              <div className="sbs-ar-row"><span>0–30 days</span><b>$1,312,000</b></div>
              <BurnBar value={48} tall/>
            </div>
            <div>
              <div className="sbs-ar-row"><span>31–60 days</span><b>$485,000</b></div>
              <BurnBar value={18} tone="watch" tall/>
            </div>
            <div>
              <div className="sbs-ar-row"><span>61–90 days</span><b>$275,000</b></div>
              <BurnBar value={10} tone="watch" tall/>
            </div>
            <div>
              <div className="sbs-ar-row"><span style={{color:"var(--status-risk-bar)"}}>91+ days</span><b style={{color:"var(--status-risk-bar)"}}>$618,000</b></div>
              <BurnBar value={23} tone="risk" tall/>
            </div>
            <div style={{fontSize:11,color:"var(--ink-4)",lineHeight:1.5,paddingTop:8,borderTop:"1px solid var(--border-soft)"}}>
              <b style={{color:"var(--status-risk-text)"}}>ESCALATE:</b> Camden County SD has not responded to last 2 invoices. Route to legal if no action by Fri.
            </div>
          </div>
        </Card>
      </div>

      {/* Quick job health */}
      <SectionTitle sub="Click a card for details · color-coded to activity status" right={
        <div style={{display:"flex",gap:16,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",color:"var(--ink-4)"}}>
          <span><Dot status="OK"/> On Track</span>
          <span><Dot status="Watch"/> Watch</span>
          <span><Dot status="At Risk"/> At Risk</span>
          <span><Dot status="N/S"/> Not Started</span>
        </div>
      }>Quick Job Health — This Week</SectionTitle>

      <div className="sbs-grid sbs-grid-4" style={{gap:12}}>
        {D.jobs.filter(j => j.health).slice(0,12).map(j => (
          <div key={j.id} className="sbs-job-card" onClick={()=>onTab("scorecard")}>
            <div className="jc-top">
              <span className="jc-id">{j.id}</span>
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                <Dot status={j.health}/>
                <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--ink-3)"}}>{j.health==="OK"?"ON TRACK":j.health==="N/S"?"NOT STARTED":j.health.toUpperCase()}</span>
              </span>
            </div>
            <div className="jc-name">{j.name}</div>
            <div className="jc-meta">Billed {j.billedPct}% · {j.gc !== "—" ? j.gc : "—"}</div>
            <BurnBar value={j.billedPct} tone={j.billedPct>=95?"watch":null}/>
          </div>
        ))}
      </div>

      {/* Throughput */}
      <SectionTitle sub="Paving days vs. base/site days · required ratio ≥ 1.20x">Throughput Bottleneck Tracker</SectionTitle>
      <div className="sbs-grid sbs-grid-4">
        <Card padded={true}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--ink-4)",marginBottom:8}}>Base / Site Work</div>
          <div style={{fontFamily:"var(--font-mono)",fontSize:36,fontWeight:700}}>182<span style={{fontSize:14,color:"var(--ink-4)",marginLeft:4}}>days</span></div>
          <div style={{fontSize:11,color:"var(--ink-4)",marginTop:6}}>Stone 80 · Mill 42 · Curb 60</div>
          <BurnBar value={72}/>
        </Card>
        <Card padded={true}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--ink-4)",marginBottom:8}}>Paving Capacity</div>
          <div style={{fontFamily:"var(--font-mono)",fontSize:36,fontWeight:700}}>146<span style={{fontSize:14,color:"var(--ink-4)",marginLeft:4}}>days</span></div>
          <div style={{fontSize:11,color:"var(--ink-4)",marginTop:6}}>9 jobs · avg 16.2 d/job</div>
          <BurnBar value={58}/>
        </Card>
        <Card padded={true}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--ink-4)",marginBottom:8}}>Ratio</div>
          <div style={{fontFamily:"var(--font-mono)",fontSize:36,fontWeight:700,color:"var(--brand-green-700)"}}>1.25x</div>
          <div style={{fontSize:11,color:"var(--ink-4)",marginTop:6}}>Required ≥ 1.20x · OK</div>
          <Pill status="OK">Healthy</Pill>
        </Card>
        <Card padded={true}>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",color:"var(--ink-4)",marginBottom:8}}>Contract Value Sold</div>
          <div style={{fontFamily:"var(--font-mono)",fontSize:36,fontWeight:700}}>$13.77M</div>
          <div style={{fontSize:11,color:"var(--ink-4)",marginTop:6}}>$9.50M left to bill</div>
          <BurnBar value={31}/>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardPage });
