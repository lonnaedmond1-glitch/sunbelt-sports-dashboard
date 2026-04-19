// Live Field tab — real-time operational dashboard for active jobsites
// Purpose: leadership sees what's happening on every job RIGHT NOW without being there.
// Designed to surface trouble visibly before it becomes a loss.
const LV = window.SBS_DATA;

// Per-active-jobsite live signal model. Each card shows the 6 things
// that actually matter minute-to-minute: crew, time on site, last report,
// weather, material burn vs plan, equipment health.
const LIVE_SITES = [
  {
    job:"25-141", name:"Camden County HS", state:"NC", pm:"David", gc:"Heartland Construction", phase:"Base · Day 21 of 41",
    crew:{ lead:"Juan / B3", onSite:4, expected:4, checkedIn:"05:42", gpsConfirmed:true },
    lastReport:{ hoursAgo:28, status:"MISSING", expected:"Yesterday 17:00" },
    weather:{ cond:"Drizzle", temp:68, rainPct:31, wind:21, impact:"risk" },
    material:{ label:"Stone base", used:842, planned:900, unit:"t", status:"ok" },
    equipment:[
      { id:"GRD-01", name:"Cat 140M", state:"running", hours:2.1 },
      { id:"PVR-03", name:"Cat AP600F", state:"idle", hours:0 },
    ],
    photo:{ ago:"9:41 AM", caption:"Base prep – NE corner" },
    billed:37, budget:62, margin:38, contract:693082,
    signals:["no-report","weather"],
    severity:"CRITICAL"
  },
  {
    job:"25-254", name:"Lakewood HS", state:"SC", pm:"David", gc:"Baseline Sports", phase:"Grinding · Day 27 of 27 (today)",
    crew:{ lead:"Cesar", onSite:2, expected:2, checkedIn:"06:12", gpsConfirmed:true },
    lastReport:{ hoursAgo:3, status:"OK", expected:"Today 06:15" },
    weather:{ cond:"Clear", temp:72, rainPct:1, wind:8, impact:"ok" },
    material:{ label:"Stone", used:1717.57, planned:1520, unit:"t", status:"overrun", over:13 },
    equipment:[
      { id:"GRN-B", name:"Grinding Set", state:"running", hours:1.8 },
    ],
    photo:{ ago:"10:14 AM", caption:"Grinding pass 3" },
    billed:100, budget:71, margin:28, contract:428110,
    signals:["material-overrun"],
    severity:"WATCH"
  },
  {
    job:"25-201", name:"Lake Wylie HS", state:"SC", pm:"Jeff", gc:"Southern Builders", phase:"Final punch · Day 27 of 27",
    crew:{ lead:"Rosendo / P1", onSite:6, expected:6, checkedIn:"06:05", gpsConfirmed:true },
    lastReport:{ hoursAgo:4, status:"OK", expected:"Today 06:10" },
    weather:{ cond:"Clear", temp:74, rainPct:0, wind:12, impact:"ok" },
    material:{ label:"Asphalt", used:1111.94, planned:1150, unit:"t", status:"ok" },
    equipment:[
      { id:"ROL-01", name:"Hamm HD12", state:"running", hours:2.4 },
    ],
    photo:{ ago:"9:55 AM", caption:"Final stripe layout" },
    billed:84, budget:75, margin:25, contract:898758,
    signals:["budget-burn"],
    severity:"WATCH"
  },
  {
    job:"25-135", name:"Veterans MS", state:"GA", pm:"Jeff", gc:"Parish Construction", phase:"Base · Day 3 of 42",
    crew:{ lead:"Martin / B2", onSite:5, expected:5, checkedIn:"05:58", gpsConfirmed:true },
    lastReport:{ hoursAgo:2, status:"OK", expected:"Today 07:00" },
    weather:{ cond:"Partly cloudy", temp:78, rainPct:10, wind:9, impact:"ok" },
    material:{ label:"Stone base", used:210, planned:680, unit:"t", status:"ok" },
    equipment:[
      { id:"MEC-01", name:"Mecalac 8MCR", state:"running", hours:1.9 },
    ],
    photo:{ ago:"10:02 AM", caption:"Cut to grade – SW corner" },
    billed:12, budget:18, margin:31, contract:777753,
    signals:[],
    severity:"OK"
  },
  {
    job:"26-040", name:"Chateau Elan", state:"GA", pm:"David", gc:"Sunbelt Asphalt", phase:"Punch list",
    crew:{ lead:"Rosendo / P1", onSite:2, expected:2, checkedIn:"06:20", gpsConfirmed:true },
    lastReport:{ hoursAgo:3, status:"OK", expected:"Today 06:30" },
    weather:{ cond:"Clear", temp:81, rainPct:1, wind:6, impact:"ok" },
    material:{ label:"Asphalt", used:384, planned:400, unit:"t", status:"ok" },
    equipment:[
      { id:"GRN-01", name:"Grinding Set A", state:"running", hours:1.2 },
    ],
    photo:{ ago:"9:48 AM", caption:"Punch – speed tables" },
    billed:100, budget:78, margin:22, contract:756170,
    signals:[],
    severity:"OK"
  },
  {
    job:"25-093", name:"Rome Middle School", state:"GA", pm:"Jeff", gc:"Field Turf", phase:"Closeout",
    crew:{ lead:"—", onSite:0, expected:0, checkedIn:"—", gpsConfirmed:null },
    lastReport:{ hoursAgo:24, status:"OK", expected:"Yesterday 16:00" },
    weather:{ cond:"Clear", temp:79, rainPct:0, wind:7, impact:"ok" },
    material:{ label:"Asphalt", used:474.49, planned:480, unit:"t", status:"ok" },
    equipment:[],
    photo:{ ago:"Yesterday", caption:"8-lane final" },
    billed:100, budget:68, margin:50, contract:406955,
    signals:[],
    severity:"OK"
  },
];

function SevBadge({ sev }) {
  const map = {
    "CRITICAL": { bg:"var(--status-risk-bar)", fg:"#fff", label:"● CRITICAL" },
    "WATCH":    { bg:"var(--status-watch-bar)", fg:"#1a0e00", label:"⚠ WATCH" },
    "OK":       { bg:"var(--brand-green-50)", fg:"var(--brand-green-700)", label:"✓ ON TRACK" },
  };
  const m = map[sev] || map.OK;
  return <span style={{display:"inline-flex",alignItems:"center",padding:"3px 9px",borderRadius:3,fontSize:10,fontWeight:700,letterSpacing:"0.12em",background:m.bg,color:m.fg,fontFamily:"var(--font-mono)"}}>{m.label}</span>;
}

function SignalRow({ icon, label, value, tone, detail }) {
  const color = tone === "risk" ? "var(--status-risk-bar)" :
                tone === "warn" ? "var(--status-watch-bar)" :
                tone === "ok" ? "var(--brand-green-700)" : "var(--ink-2)";
  return (
    <div style={{display:"grid",gridTemplateColumns:"28px 1fr auto",gap:10,padding:"10px 0",borderBottom:"1px dotted var(--border)",alignItems:"center"}}>
      <div style={{fontSize:14,color:"var(--ink-4)",textAlign:"center"}}>{icon}</div>
      <div>
        <div style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--ink-4)",fontWeight:700}}>{label}</div>
        <div style={{fontSize:13,color:"var(--ink)",marginTop:2,fontWeight:600}}>{value}</div>
        {detail && <div style={{fontSize:11,color:"var(--ink-3)",marginTop:1}}>{detail}</div>}
      </div>
      {tone && tone !== "ok" && <div style={{width:8,height:8,borderRadius:4,background:color}}/>}
    </div>
  );
}

function LiveSiteCard({ site, onPick }) {
  const r = site.lastReport;
  const reportTone = r.status === "MISSING" ? "risk" : r.hoursAgo > 20 ? "warn" : "ok";
  const wxTone = site.weather.impact;
  const matTone = site.material.status === "overrun" ? "risk" : "ok";
  const burnTone = site.budget >= 85 ? "risk" : site.budget >= 70 ? "warn" : "ok";
  const crewTone = site.crew.onSite < site.crew.expected ? "risk" : "ok";

  const borderColor = site.severity === "CRITICAL" ? "var(--status-risk-bar)" :
                      site.severity === "WATCH" ? "var(--status-watch-bar)" :
                      "var(--border)";

  return (
    <div style={{background:"#fff",borderRadius:8,border:"1px solid var(--border)",borderLeft:`4px solid ${borderColor}`,overflow:"hidden",cursor:"pointer"}}
         onClick={()=>onPick&&onPick(site.job)}
         onMouseEnter={e=>e.currentTarget.style.boxShadow="var(--shadow-card-hover)"}
         onMouseLeave={e=>e.currentTarget.style.boxShadow=""}>

      {/* Head */}
      <div style={{padding:"14px 16px 12px",borderBottom:"1px solid var(--border-soft)",display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
            <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-4)",fontWeight:700,letterSpacing:"0.06em"}}>#{site.job}</span>
            <span style={{fontSize:10,color:"var(--ink-5)"}}>·</span>
            <span style={{fontSize:10,color:"var(--ink-4)",fontFamily:"var(--font-mono)",letterSpacing:"0.08em"}}>{site.state}</span>
            <span style={{fontSize:10,color:"var(--ink-5)"}}>·</span>
            <span style={{fontSize:10,color:"var(--ink-4)"}}>PM {site.pm}</span>
          </div>
          <div style={{fontSize:16,fontWeight:700,lineHeight:1.2}}>{site.name}</div>
          <div style={{fontSize:11,color:"var(--ink-3)",marginTop:3}}>{site.phase}</div>
        </div>
        <SevBadge sev={site.severity}/>
      </div>

      {/* Live signals */}
      <div style={{padding:"4px 16px 12px"}}>
        <SignalRow icon="👷" label="CREW" tone={crewTone}
          value={`${site.crew.onSite}/${site.crew.expected} on-site · ${site.crew.lead}`}
          detail={site.crew.checkedIn !== "—" ? `Checked in ${site.crew.checkedIn}${site.crew.gpsConfirmed?" · GPS ✓":""}` : "No crew scheduled today"}/>

        <SignalRow icon="📋" label="LAST FIELD REPORT" tone={reportTone}
          value={r.status === "MISSING" ? `MISSING · ${r.hoursAgo}h ago` : `${r.hoursAgo}h ago · ${r.status}`}
          detail={r.status === "MISSING" ? `Expected ${r.expected} · call PM` : `Expected ${r.expected}`}/>

        <SignalRow icon="⛅" label="WEATHER ON-SITE" tone={wxTone}
          value={`${site.weather.cond} · ${site.weather.temp}°`}
          detail={`${site.weather.rainPct}% rain · ${site.weather.wind} mph wind`}/>

        <SignalRow icon="📦" label={site.material.label.toUpperCase()} tone={matTone}
          value={`${site.material.used.toLocaleString()}${site.material.unit} / ${site.material.planned.toLocaleString()}${site.material.unit}`}
          detail={site.material.status === "overrun" ? `${site.material.over}% over budget — escalate draw` : `${Math.round((site.material.used/site.material.planned)*100)}% of plan`}/>

        <SignalRow icon="🚜" label="EQUIPMENT ON-SITE"
          value={site.equipment.length > 0 ? site.equipment.map(e=>e.name).join(" · ") : "None"}
          detail={site.equipment.filter(e=>e.state==="running").length + " running · " + site.equipment.filter(e=>e.state==="idle").length + " idle"}/>
      </div>

      {/* Footer: money bar */}
      <div style={{padding:"12px 16px",background:"var(--bg-sunken)",borderTop:"1px solid var(--border-soft)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:6}}>
          <div style={{fontSize:10,letterSpacing:"0.12em",fontWeight:700,color:"var(--ink-4)"}}>BILLED vs COST</div>
          <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-3)"}}>
            <span style={{color:"var(--brand-green-700)",fontWeight:700}}>B {site.billed}%</span>
            <span style={{color:"var(--ink-5)"}}> · </span>
            <span style={{color:burnTone==="risk"?"var(--status-risk-bar)":burnTone==="warn"?"var(--status-watch-bar)":"var(--ink-2)",fontWeight:700}}>C {site.budget}%</span>
            <span style={{color:"var(--ink-5)"}}> · </span>
            <span style={{color:"var(--ink-2)",fontWeight:700}}>{site.margin}% mgn</span>
          </div>
        </div>
        <div style={{position:"relative",height:8,background:"var(--border-soft)",borderRadius:4,overflow:"hidden"}}>
          <div style={{position:"absolute",inset:0,width:site.billed+"%",background:"var(--brand-green-400)",opacity:0.4}}/>
          <div style={{position:"absolute",inset:0,width:site.budget+"%",background:burnTone==="risk"?"var(--status-risk-bar)":burnTone==="warn"?"var(--status-watch-bar)":"var(--brand-green-700)",mixBlendMode:"multiply",opacity:0.7}}/>
        </div>
        <div style={{fontSize:10,color:"var(--ink-5)",fontFamily:"var(--font-mono)",marginTop:6,letterSpacing:"0.06em"}}>
          CONTRACT {fmt$(site.contract, true)} · {site.photo.ago} · {site.photo.caption}
        </div>
      </div>
    </div>
  );
}

function LivePage({ onTab }) {
  const [filter, setFilter] = React.useState("all");
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const t = setInterval(()=>setNow(new Date()), 30000);
    return ()=>clearInterval(t);
  }, []);

  const sites = filter === "all" ? LIVE_SITES :
                filter === "action" ? LIVE_SITES.filter(s=>s.severity!=="OK") :
                LIVE_SITES.filter(s=>s.severity===filter.toUpperCase());

  const counts = {
    CRITICAL: LIVE_SITES.filter(s=>s.severity==="CRITICAL").length,
    WATCH:    LIVE_SITES.filter(s=>s.severity==="WATCH").length,
    OK:       LIVE_SITES.filter(s=>s.severity==="OK").length,
  };

  const nowStr = now.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});

  return (
    <div className="sbs-page">
      {/* Header */}
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow" style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{display:"inline-block",width:8,height:8,borderRadius:4,background:"var(--brand-green-400)",animation:"sbsPulse 1.6s infinite"}}/>
            LIVE FIELD · AUTO-REFRESH · LAST {nowStr} EDT
          </div>
          <h1>What's happening on every job, right now</h1>
          <div className="sbs-page-sub">Real-time field signals from {LIVE_SITES.length} active sites · see trouble before it costs money</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className={clsx("sbs-btn", filter==="all" && "primary")} onClick={()=>setFilter("all")}>All {LIVE_SITES.length}</button>
          <button className={clsx("sbs-btn", filter==="action" && "primary")} onClick={()=>setFilter("action")}>Need Action {counts.CRITICAL + counts.WATCH}</button>
          <button className={clsx("sbs-btn", filter==="critical" && "primary")} onClick={()=>setFilter("critical")} style={filter==="critical"?{}:{color:"var(--status-risk-bar)"}}>● {counts.CRITICAL} Critical</button>
          <button className={clsx("sbs-btn", filter==="watch" && "primary")} onClick={()=>setFilter("watch")} style={filter==="watch"?{}:{color:"var(--status-watch-bar)"}}>⚠ {counts.WATCH} Watch</button>
        </div>
      </div>

      {/* Prevention strip — "what we saved this week" */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr) 1.2fr",gap:14,marginBottom:24}}>
        {[
          {l:"CREWS ON-SITE",v:LIVE_SITES.reduce((s,x)=>s+x.crew.onSite,0)+"/"+LIVE_SITES.reduce((s,x)=>s+x.crew.expected,0),sub:"live GPS confirmed",tone:"ok"},
          {l:"REPORTS OVERDUE",v:LIVE_SITES.filter(s=>s.lastReport.status==="MISSING").length,sub:"trigger at 18h",tone:LIVE_SITES.filter(s=>s.lastReport.status==="MISSING").length>0?"risk":"ok"},
          {l:"WEATHER HOLDS",v:LIVE_SITES.filter(s=>s.weather.impact==="risk").length,sub:"any site with >25% rain",tone:"warn"},
          {l:"MATERIAL ALERTS",v:LIVE_SITES.filter(s=>s.material.status==="overrun").length,sub:">10% over plan",tone:"risk"},
        ].map(x => (
          <div key={x.l} style={{background:"#fff",border:"1px solid var(--border)",borderRadius:6,padding:"14px 16px",borderTop:`3px solid ${x.tone==="risk"?"var(--status-risk-bar)":x.tone==="warn"?"var(--status-watch-bar)":"var(--brand-green-400)"}`}}>
            <div className="sbs-eyebrow">{x.l}</div>
            <div style={{fontFamily:"var(--font-mono)",fontSize:28,fontWeight:700,marginTop:4,lineHeight:1,color:x.tone==="risk"?"var(--status-risk-bar)":x.tone==="warn"?"var(--status-watch-bar)":"var(--ink)"}}>{x.v}</div>
            <div style={{fontSize:11,color:"var(--ink-4)",marginTop:4}}>{x.sub}</div>
          </div>
        ))}
        <div style={{background:"var(--ink)",color:"#fff",borderRadius:6,padding:"14px 16px",display:"flex",flexDirection:"column",justifyContent:"center"}}>
          <div style={{fontSize:10,letterSpacing:"0.14em",textTransform:"uppercase",color:"var(--brand-green-400)",fontWeight:700}}>PREVENTED THIS WEEK</div>
          <div style={{fontFamily:"var(--font-display)",fontSize:36,letterSpacing:"0.03em",marginTop:2,lineHeight:1}}>$84K</div>
          <div style={{fontSize:11,color:"rgba(255,255,255,0.7)",marginTop:4,textWrap:"pretty",lineHeight:1.4}}>3 change orders caught early · 1 weather hold avoided rework · 1 equipment swap before breakdown</div>
        </div>
      </div>

      {/* Site grid */}
      <SectionTitle sub={`${sites.length} jobsites · click any card to drill in`}>Active Jobsites · Live Feed</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
        {sites.map(s => <LiveSiteCard key={s.job} site={s} onPick={()=>onTab("portfolio")}/>)}
      </div>

      {/* Recent activity feed */}
      <SectionTitle sub="Field events in the last 4 hours · newest first" right={<button className="sbs-btn ghost">View all →</button>}>Live Activity Feed</SectionTitle>
      <Card padded={false}>
        {[
          {t:"10:14", src:"25-254 · Cesar", ev:"Field report submitted", tone:"ok"},
          {t:"10:02", src:"25-135 · Martin / B2", ev:"Photo uploaded — cut to grade SW corner", tone:"ok"},
          {t:"09:55", src:"25-201 · Rosendo", ev:"Photo uploaded — stripe layout", tone:"ok"},
          {t:"09:41", src:"25-141 · System", ev:"ALERT — field report 28h overdue (Juan / B3)", tone:"risk"},
          {t:"09:22", src:"25-141 · Weather", ev:"Rain forecast raised to 31% — impact possible", tone:"warn"},
          {t:"09:05", src:"25-254 · System", ev:"Material usage crossed 110% of plan (1,652t / 1,520t)", tone:"warn"},
          {t:"08:48", src:"25-201 · Jeff", ev:"Closeout checklist updated — 17/22 items ✓", tone:"ok"},
          {t:"08:30", src:"TRK-03 · Ron Nelson", ev:"DVIR flagged — air brake warning (Camden run)", tone:"risk"},
          {t:"08:12", src:"25-135 · Martin", ev:"Crew check-in (5/5) · GPS confirmed Veterans MS", tone:"ok"},
          {t:"07:48", src:"26-040 · Rosendo", ev:"Punch-list item 12/14 complete", tone:"ok"},
        ].map((e,i)=>(
          <div key={i} style={{display:"grid",gridTemplateColumns:"64px 1fr 12px",gap:16,padding:"11px 18px",borderBottom:i<9?"1px solid var(--border-soft)":"",alignItems:"center"}}>
            <div style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-4)",fontWeight:700,letterSpacing:"0.05em"}}>{e.t} AM</div>
            <div>
              <span style={{fontSize:11,color:"var(--ink-3)",marginRight:10,fontFamily:"var(--font-mono)"}}>{e.src}</span>
              <span style={{fontSize:13,color:"var(--ink)",fontWeight:e.tone==="risk"||e.tone==="warn"?600:400}}>{e.ev}</span>
            </div>
            <div style={{width:8,height:8,borderRadius:4,background:e.tone==="risk"?"var(--status-risk-bar)":e.tone==="warn"?"var(--status-watch-bar)":"var(--brand-green-400)"}}/>
          </div>
        ))}
      </Card>
    </div>
  );
}

Object.assign(window, { LivePage });
