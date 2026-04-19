// Alternate Dashboard organizational models.
// A = Executive Briefing (default — see tab_dashboard.jsx)
// B = DISPATCH — driver/HOS/vehicle-centric; operational "who's where / who's legal to drive"
// C = EXCEPTION QUEUE — triage-only; shows items that need action, ordered by urgency

const DV = window.SBS_DATA;
const _drivers = DV.drivers || [];
const _ifta = DV.iftaByState || [];
const _safety = DV.safetyEvents || [];

// ============== SHARED BITS ==============
function HosBar({ val, limit, tone }) {
  const pct = Math.min(100, (val/limit)*100);
  const color = tone === "crit" ? "var(--status-risk-bar)" :
                tone === "warn" ? "var(--status-watch-bar)" :
                "var(--brand-green)";
  return (
    <div style={{position:"relative",height:6,background:"var(--border-soft)",borderRadius:3,overflow:"hidden"}}>
      <div style={{position:"absolute",inset:0,width:pct+"%",background:color}}/>
    </div>
  );
}

function DutyChip({ status }) {
  const map = {
    "DRIVING":    { bg:"#198754", fg:"#fff" },
    "ON-DUTY":    { bg:"#F0A500", fg:"#1a0e00" },
    "OFF-DUTY":   { bg:"#CCD2D9", fg:"#14181F" },
    "SLEEPER":    { bg:"#455A64", fg:"#fff" },
    "VIOLATION":  { bg:"#DC3545", fg:"#fff" },
  };
  const c = map[status] || map["OFF-DUTY"];
  return (
    <span style={{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 8px",borderRadius:3,fontSize:10,fontWeight:700,letterSpacing:"0.1em",background:c.bg,color:c.fg,fontFamily:"var(--font-mono)"}}>
      {status === "DRIVING" && <span style={{width:6,height:6,borderRadius:3,background:c.fg,animation:"sbsPulse 1.2s infinite"}}/>}
      {status}
    </span>
  );
}

// ============== VARIANT B: DISPATCH ==============
// Question it answers: "Who's working right now, where are they, are they legal to drive?"
// Layout: Live crew/driver ribbon ↔ dispatch board (today's moves + who's on site)
//         ↔ HOS compliance wall ↔ DOT / cert watchlist ↔ lowboy routing
function DashboardVariantB({ onTab }) {
  const drivers = _drivers;
  const onDuty = drivers.filter(d => d.status !== "OFF-DUTY");
  const violations = drivers.filter(d => d.status === "VIOLATION" || d.hos.driveToday >= d.hos.driveLimit);
  const near = drivers.filter(d => d.hos.driveToday/d.hos.driveLimit > 0.75 && d.status !== "VIOLATION" && d.status !== "OFF-DUTY");
  const certAlerts = drivers.filter(d => d.medical.flag || d.cdlFlag);

  return (
    <div className="sbs-page">
      {/* Header — dispatch rail */}
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Dispatch Board · Sun Apr 19 · 06:14 EDT</div>
          <h1>Who's working, where, and legal to drive</h1>
          <div className="sbs-page-sub">Live driver status · HOS compliance · today's lowboy moves</div>
        </div>
        <div style={{display:"flex",gap:10}}>
          <div className="sbs-chip crit" style={{fontSize:11}}>● {violations.length} HOS VIOLATION{violations.length!==1?"S":""}</div>
          <div className="sbs-chip warn" style={{fontSize:11}}>⚠ {near.length} APPROACHING LIMIT</div>
          <div className="sbs-chip" style={{fontSize:11}}>{certAlerts.length} CERT WATCH</div>
        </div>
      </div>

      {/* Driver status wall — the primary organizing lens */}
      <Card title="Driver Status · Live" meta={`${onDuty.length} on-duty · ${drivers.length} total roster`} padded={false}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",borderTop:"1px solid var(--border-soft)"}}>
          {drivers.map((d,i) => {
            const driveTone = d.hos.driveToday >= d.hos.driveLimit ? "crit" :
                              d.hos.driveToday/d.hos.driveLimit > 0.75 ? "warn" : "ok";
            const cycleTone = d.hos.cycle/d.hos.cycleLimit > 0.9 ? "crit" :
                              d.hos.cycle/d.hos.cycleLimit > 0.75 ? "warn" : "ok";
            const right = (i+1) % 4 !== 0;
            const bot = i < drivers.length - 4;
            return (
              <div key={d.id} style={{padding:18,borderRight: right?"1px solid var(--border-soft)":"",borderBottom: bot?"1px solid var(--border-soft)":"",position:"relative"}}>
                {d.status === "VIOLATION" && <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"var(--status-risk-bar)"}}/>}
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{width:40,height:40,borderRadius:20,background:"var(--ink)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"var(--font-display)",fontSize:15,letterSpacing:"0.05em"}}>{d.photo}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{d.name}</div>
                    <div style={{fontSize:11,color:"var(--ink-4)",fontFamily:"var(--font-mono)"}}>{d.cdl} · {d.vehicle}</div>
                  </div>
                  <DutyChip status={d.status}/>
                </div>

                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-4)",marginBottom:3,letterSpacing:"0.08em"}}>
                      <span>DRIVE TODAY</span>
                      <span style={{color: driveTone==="crit"?"var(--status-risk-bar)":driveTone==="warn"?"var(--status-watch-bar)":"var(--ink-2)",fontWeight:700}}>
                        {d.hos.driveToday}h / {d.hos.driveLimit}h
                      </span>
                    </div>
                    <HosBar val={d.hos.driveToday} limit={d.hos.driveLimit} tone={driveTone}/>
                  </div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-4)",marginBottom:3,letterSpacing:"0.08em"}}>
                      <span>8-DAY CYCLE</span>
                      <span style={{color: cycleTone==="crit"?"var(--status-risk-bar)":cycleTone==="warn"?"var(--status-watch-bar)":"var(--ink-2)",fontWeight:700}}>
                        {d.hos.cycle}h / {d.hos.cycleLimit}h
                      </span>
                    </div>
                    <HosBar val={d.hos.cycle} limit={d.hos.cycleLimit} tone={cycleTone}/>
                  </div>
                </div>

                <div style={{marginTop:12,paddingTop:10,borderTop:"1px dotted var(--border)",display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-4)",letterSpacing:"0.05em"}}>
                  <div>DVIR: <span style={{color:d.dvir.result==="OK"?"var(--brand-green-700)":"var(--status-risk-bar)",fontWeight:700}}>{d.dvir.result.split(" ")[0]}</span></div>
                  <div>MED: <span style={{color:d.medical.flag?"var(--status-risk-bar)":d.medical.daysLeft<90?"var(--status-watch-bar)":"var(--ink-2)",fontWeight:700}}>{d.medical.daysLeft}d</span></div>
                  <div>MPG: <span style={{color:"var(--ink-2)",fontWeight:700}}>{d.mpg || "—"}</span></div>
                  <div>WK MI: <span style={{color:"var(--ink-2)",fontWeight:700}}>{d.milesWk}</span></div>
                </div>

                {/* 7-day recap mini-bars */}
                <div style={{marginTop:10,display:"flex",gap:2,alignItems:"flex-end",height:20}}>
                  {d.recap.map((h,idx)=>(
                    <div key={idx} style={{flex:1,height: Math.max(2,(h/14)*20)+"px",background: h>=14?"var(--status-risk-bar)":h>=11?"var(--status-watch-bar)":h>0?"var(--brand-green-400)":"var(--border)",borderRadius:1}} title={`Day -${6-idx}: ${h}h`}/>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Two-column: Dispatch board + Today's moves */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginTop:24}}>
        <Card title="On the Road · Today" meta="Active vehicles in motion" padded={false}>
          <table className="sbs-table">
            <thead><tr><th>Unit</th><th>Driver</th><th>Route</th><th className="num">Fuel</th><th>DVIR</th><th>Status</th></tr></thead>
            <tbody>
              {DV.fleet.filter(f=>f.status!=="yard").map(f=>(
                <tr key={f.id} className="sbs-row" onClick={()=>onTab("fleet")}>
                  <td className="mono" style={{fontWeight:700}}>{f.id}</td>
                  <td>{f.driver}</td>
                  <td style={{fontSize:12,color:"var(--ink-3)"}}>{f.from} → <b style={{color:"var(--ink)"}}>{f.to}</b></td>
                  <td className="num"><span style={{color:f.fuelPct<40?"var(--status-risk-bar)":f.fuelPct<60?"var(--status-watch-bar)":"var(--ink-2)"}}>{f.fuelPct}%</span></td>
                  <td><span className="sbs-chip" style={{fontSize:10,padding:"2px 6px",background:f.dvir==="ok"?"var(--brand-green-50)":f.dvir==="defect"?"#fde2e4":"#fef3e2",color:f.dvir==="ok"?"var(--brand-green-700)":f.dvir==="defect"?"var(--status-risk-bar)":"var(--status-watch-bar)"}}>{f.dvir.toUpperCase()}</span></td>
                  <td style={{fontSize:11,color:"var(--ink-3)",textTransform:"capitalize"}}>{f.status.replace("-"," ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Lowboy Routing · This Week" meta="Driver: David Hudson · 5 moves" padded={false}>
          <div>
            {DV.lowboyMoves.filter(m=>m.label).map((m,i)=>(
              <div key={i} style={{display:"grid",gridTemplateColumns:"60px 1fr auto",gap:16,padding:"14px 18px",borderBottom:i<4?"1px solid var(--border-soft)":"",alignItems:"center"}}>
                <div>
                  <div style={{fontFamily:"var(--font-display)",fontSize:20,letterSpacing:"0.05em"}}>{m.day}</div>
                  <div style={{fontSize:10,color:"var(--ink-4)",fontFamily:"var(--font-mono)"}}>{m.date}</div>
                </div>
                <div>
                  <div style={{fontSize:13,color:"var(--ink-2)",lineHeight:1.4,textWrap:"pretty"}}>{m.label}</div>
                  {m.job && <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--brand-green-700)",marginTop:3,letterSpacing:"0.08em"}}>#{m.job}</div>}
                </div>
                <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-4)",letterSpacing:"0.08em",textAlign:"right"}}>
                  ~3.5h<br/>
                  <span style={{color:"var(--brand-green-700)",fontWeight:700}}>HOS OK</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Compliance strip */}
      <SectionTitle sub="Items requiring action in next 30 days">DOT & Cert Watchlist</SectionTitle>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,marginBottom:24}}>
        <Card padded={false}>
          <div style={{padding:"16px 18px",background:"var(--bg-sunken)",borderBottom:"1px solid var(--border-soft)"}}>
            <div className="sbs-eyebrow" style={{color:"var(--status-risk-bar)"}}>CRITICAL · Expiring ≤ 30d</div>
          </div>
          {[
            {who:"Ron Nelson", what:"DOT Medical Card", when:"13 days", tone:"crit"},
            {who:"Ron Nelson", what:"CDL Class A", when:"61 days", tone:"warn"},
          ].map((x,i)=>(
            <div key={i} style={{padding:"14px 18px",borderBottom:i<1?"1px solid var(--border-soft)":""}}>
              <div style={{fontSize:13,fontWeight:600}}>{x.who}</div>
              <div style={{fontSize:11,color:"var(--ink-3)",marginTop:2}}>{x.what}</div>
              <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:x.tone==="crit"?"var(--status-risk-bar)":"var(--status-watch-bar)",fontWeight:700,marginTop:4,letterSpacing:"0.08em"}}>EXPIRES IN {x.when.toUpperCase()}</div>
            </div>
          ))}
        </Card>
        <Card padded={false}>
          <div style={{padding:"16px 18px",background:"var(--bg-sunken)",borderBottom:"1px solid var(--border-soft)"}}>
            <div className="sbs-eyebrow" style={{color:"var(--status-watch-bar)"}}>WATCH · Expiring ≤ 90d</div>
          </div>
          {[
            {who:"Juan Perez", what:"DOT Medical Card", when:"57 days"},
            {who:"Martin Lopez", what:"DOT Medical Card", when:"74 days"},
          ].map((x,i)=>(
            <div key={i} style={{padding:"14px 18px",borderBottom:i<1?"1px solid var(--border-soft)":""}}>
              <div style={{fontSize:13,fontWeight:600}}>{x.who}</div>
              <div style={{fontSize:11,color:"var(--ink-3)",marginTop:2}}>{x.what}</div>
              <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--status-watch-bar)",fontWeight:700,marginTop:4,letterSpacing:"0.08em"}}>EXPIRES IN {x.when.toUpperCase()}</div>
            </div>
          ))}
        </Card>
        <Card padded={false}>
          <div style={{padding:"16px 18px",background:"var(--bg-sunken)",borderBottom:"1px solid var(--border-soft)"}}>
            <div className="sbs-eyebrow">SAFETY · Last 90 days</div>
          </div>
          {_safety.map((e,i)=>(
            <div key={i} style={{padding:"14px 18px",borderBottom:i<_safety.length-1?"1px solid var(--border-soft)":""}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                <div style={{fontSize:13,fontWeight:600}}>{e.driver}</div>
                <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-5)"}}>{e.date.toUpperCase()}</div>
              </div>
              <div style={{fontSize:11,color:"var(--ink-3)",marginTop:2}}>{e.type}</div>
              <div style={{fontSize:10,fontFamily:"var(--font-mono)",marginTop:4,letterSpacing:"0.08em",color:e.resolved?"var(--brand-green-700)":"var(--status-risk-bar)",fontWeight:700}}>{e.resolved?"RESOLVED":"OPEN"}</div>
            </div>
          ))}
        </Card>
      </div>

      {/* Small kpi strip at bottom */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:14}}>
        {[
          {l:"Fleet On Duty",v:`${DV.fleet.filter(f=>f.status!=="yard"&&f.status!=="idle").length}/${DV.fleet.length}`},
          {l:"Avg MPG (wk)",v:"7.8"},
          {l:"Idle hrs (wk)",v:DV.fleet.reduce((s,f)=>s+f.idleHrsWk,0).toFixed(1)},
          {l:"IFTA mi (30d)",v:(_ifta.reduce((s,x)=>s+x.miles,0)/1000).toFixed(1)+"k"},
          {l:"Open DVIRs",v:DV.fleet.filter(f=>f.dvir!=="ok").length},
        ].map(x=>(
          <div key={x.l} style={{background:"#fff",border:"1px solid var(--border)",padding:"14px 16px",borderRadius:6}}>
            <div className="sbs-eyebrow">{x.l}</div>
            <div style={{fontFamily:"var(--font-mono)",fontSize:24,fontWeight:700,marginTop:4}}>{x.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============== VARIANT C: EXCEPTION QUEUE ==============
// Question it answers: "What needs a decision from me RIGHT NOW, and in what order?"
// Layout: numbered triage queue — items ranked by $ impact × time sensitivity.
// Everything that's fine is hidden. Only exceptions surface.
function DashboardVariantC({ onTab }) {
  // Build unified exception queue
  const queue = [
    { id:"E-001", urgency:"NOW", impact:"OPS", title:"Missing field report · Camden County HS",
      detail:"Juan / B3 did not submit yesterday's report. PM David notified 06:14. Base crew confirmed on-site via GPS.",
      job:"25-141", dollars:null, who:"David (PM)", action:"Call Juan · collect report by 09:00", ageHrs:14, sla:"4h overdue" },
    { id:"E-002", urgency:"NOW", impact:"SAFETY", title:"HOS 14-hour violation · Ron Nelson",
      detail:"Drove 10.8h / 14h on-duty 13.5h. Air-brake defect on DVIR. Medical card expires in 13 days.",
      job:"25-141", dollars:null, who:"Dispatch", action:"Stand down · reassign Camden run", ageHrs:2, sla:"immediate" },
    { id:"E-003", urgency:"TODAY", impact:"$$$", title:"AR 91+ days · $618K outstanding",
      detail:"23% of total A/R. Camden County SD invoice 61-90d, two unanswered follow-ups.",
      job:"portfolio", dollars:618000, who:"Finance", action:"Escalate to superintendent · 2nd demand letter", ageHrs:72, sla:"today EOD" },
    { id:"E-004", urgency:"TODAY", impact:"$$$", title:"Material overrun · Lakewood HS",
      detail:"1,717.57t used / 1,520t budgeted (13% over). $38K above plan at current pricing.",
      job:"25-254", dollars:38000, who:"David (PM)", action:"Change order w/ Baseline · next draw", ageHrs:4, sla:"this week" },
    { id:"E-005", urgency:"TODAY", impact:"OPS", title:"Weather · Camden County HS",
      detail:"Drizzle, 31% rain, 21mph wind. Base crew on-site — decide: work / hold / remobilize.",
      job:"25-141", dollars:null, who:"David (PM)", action:"Call by 07:30 · GC sync", ageHrs:1, sla:"within 2h" },
    { id:"E-006", urgency:"WEEK", impact:"$$$", title:"Losing job · 25-897 New Sports Office",
      detail:"Internal build-out at -$51K. 0% margin. Likely write-off.",
      job:"25-897", dollars:-51000, who:"Pedro / David", action:"Scope review + write-off memo Fri", ageHrs:168, sla:"Fri EOD" },
    { id:"E-007", urgency:"WEEK", impact:"$$$", title:"Budget burn · Lake Wylie HS",
      detail:"Cost 75% of $899K contract · 84% billed. Monitor closeout.",
      job:"25-201", dollars:null, who:"Jeff (PM)", action:"Closeout checklist w/ Southern Builders", ageHrs:48, sla:"this week" },
    { id:"E-008", urgency:"WEEK", impact:"COMPLIANCE", title:"Expiring certs · Ron Nelson",
      detail:"DOT medical 13d · CDL 61d. Risk of grounding unit TRK-03.",
      job:null, dollars:null, who:"HR / Safety", action:"Schedule DOT physical this week", ageHrs:24, sla:"13 days" },
    { id:"E-009", urgency:"WEEK", impact:"OPS", title:"PM overdue · Roller ROL-01",
      detail:"Service overdue 12h on Hamm HD12 (Lake Wylie). Still in production.",
      job:"25-201", dollars:null, who:"Shop", action:"Schedule swap on off-day", ageHrs:36, sla:"this week" },
  ];

  const urgencyMeta = {
    "NOW":    { label:"NOW · DO IT BEFORE LUNCH", color:"var(--status-risk-bar)", bg:"#FDE2E4" },
    "TODAY":  { label:"TODAY · EOD", color:"var(--status-watch-bar)", bg:"#FEF3E2" },
    "WEEK":   { label:"THIS WEEK", color:"var(--ink)", bg:"var(--bg-sunken)" },
  };
  const impactMeta = {
    "$$$":        { label:"REVENUE / COST", color:"var(--brand-green-700)" },
    "SAFETY":     { label:"SAFETY",   color:"var(--status-risk-bar)" },
    "OPS":        { label:"OPS",      color:"var(--ink-2)" },
    "COMPLIANCE": { label:"COMPLIANCE", color:"#553399" },
  };

  const groups = ["NOW","TODAY","WEEK"];

  return (
    <div className="sbs-page">
      {/* Top bar: the count that matters */}
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Exception Queue · Triage View</div>
          <h1>{queue.length} things need a decision today</h1>
          <div className="sbs-page-sub">Only items requiring action shown · ranked by urgency × impact</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",maxWidth:440,justifyContent:"flex-end"}}>
          {groups.map(g => {
            const n = queue.filter(q=>q.urgency===g).length;
            return (
              <div key={g} style={{padding:"10px 14px",borderRadius:6,background:urgencyMeta[g].bg,color:urgencyMeta[g].color,display:"flex",alignItems:"center",gap:8}}>
                <div style={{fontFamily:"var(--font-mono)",fontSize:22,fontWeight:700}}>{n}</div>
                <div style={{fontSize:10,letterSpacing:"0.1em",fontWeight:700,lineHeight:1.1}}>{urgencyMeta[g].label.split(" · ")[0]}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The queue itself. Numbered. Each item says clearly who must do what. */}
      {groups.map((g,gi) => {
        const items = queue.filter(q => q.urgency === g);
        const meta = urgencyMeta[g];
        return (
          <div key={g} style={{marginBottom:32}}>
            <div style={{display:"flex",alignItems:"baseline",gap:14,marginBottom:14,paddingBottom:10,borderBottom:`2px solid ${meta.color}`}}>
              <div style={{fontFamily:"var(--font-display)",fontSize:26,letterSpacing:"0.04em",color:meta.color}}>{meta.label}</div>
              <div style={{fontSize:11,color:"var(--ink-4)",fontFamily:"var(--font-mono)",letterSpacing:"0.08em"}}>{items.length} ITEM{items.length!==1?"S":""}</div>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {items.map((item, i) => {
                const impact = impactMeta[item.impact];
                const idx = queue.indexOf(item) + 1;
                return (
                  <div key={item.id} style={{background:"#fff",border:"1px solid var(--border)",borderLeft:`4px solid ${meta.color}`,borderRadius:6,padding:"16px 20px",display:"grid",gridTemplateColumns:"48px 1fr auto",gap:20,alignItems:"start",cursor:"pointer"}}
                       onClick={()=>item.job&&item.job!=="portfolio"&&onTab("portfolio")}
                       onMouseEnter={e=>e.currentTarget.style.boxShadow="var(--shadow-card-hover)"}
                       onMouseLeave={e=>e.currentTarget.style.boxShadow=""}>
                    <div style={{fontFamily:"var(--font-display)",fontSize:36,color:"var(--ink-4)",lineHeight:1,letterSpacing:"0.02em"}}>
                      {String(idx).padStart(2,"0")}
                    </div>
                    <div>
                      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4,flexWrap:"wrap"}}>
                        <span style={{fontSize:10,fontFamily:"var(--font-mono)",letterSpacing:"0.12em",fontWeight:700,color:impact.color,padding:"2px 6px",border:`1px solid ${impact.color}`,borderRadius:3}}>{impact.label}</span>
                        {item.job && item.job !== "portfolio" && <span style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-4)",letterSpacing:"0.08em"}}>#{item.job}</span>}
                        {item.dollars && <span style={{fontSize:12,fontFamily:"var(--font-mono)",color:item.dollars<0?"var(--status-risk-bar)":"var(--ink)",fontWeight:700}}>{item.dollars<0?"-":""}${Math.abs(item.dollars/1000).toFixed(0)}K</span>}
                      </div>
                      <div style={{fontSize:16,fontWeight:700,marginBottom:4,color:"var(--ink)"}}>{item.title}</div>
                      <div style={{fontSize:13,color:"var(--ink-2)",lineHeight:1.5,textWrap:"pretty",marginBottom:10,maxWidth:720}}>{item.detail}</div>
                      <div style={{display:"flex",alignItems:"center",gap:16,fontSize:11,color:"var(--ink-3)"}}>
                        <span><b style={{color:"var(--ink)"}}>→</b> {item.action}</span>
                        <span style={{color:"var(--ink-5)"}}>·</span>
                        <span style={{fontFamily:"var(--font-mono)",letterSpacing:"0.06em"}}>OWNER: <b style={{color:"var(--ink)"}}>{item.who.toUpperCase()}</b></span>
                      </div>
                    </div>
                    <div style={{textAlign:"right",minWidth:120}}>
                      <div style={{fontSize:10,fontFamily:"var(--font-mono)",color:"var(--ink-5)",letterSpacing:"0.08em"}}>SLA</div>
                      <div style={{fontSize:14,fontWeight:700,color:meta.color,marginTop:2,fontFamily:"var(--font-mono)"}}>{item.sla}</div>
                      <div style={{fontSize:10,color:"var(--ink-5)",marginTop:6,fontFamily:"var(--font-mono)"}}>aged {item.ageHrs}h</div>
                      <div style={{display:"flex",gap:6,marginTop:10,justifyContent:"flex-end"}}>
                        <button className="sbs-btn primary" style={{padding:"4px 10px",fontSize:11,height:26}}>Take</button>
                        <button className="sbs-btn ghost" style={{padding:"4px 10px",fontSize:11,height:26}}>Snooze</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Bottom: what we're NOT worried about */}
      <div style={{marginTop:20,padding:"20px 24px",background:"var(--bg-sunken)",borderRadius:8,display:"grid",gridTemplateColumns:"auto 1fr",gap:20,alignItems:"center"}}>
        <div style={{fontFamily:"var(--font-display)",fontSize:42,color:"var(--brand-green-700)",letterSpacing:"0.02em"}}>✓ {DV.jobs.filter(j=>j.health==="OK").length}</div>
        <div>
          <div style={{fontSize:11,letterSpacing:"0.16em",textTransform:"uppercase",color:"var(--brand-green-700)",fontWeight:700}}>JOBS ON TRACK — NO ACTION NEEDED</div>
          <div style={{fontSize:13,color:"var(--ink-2)",marginTop:4,textWrap:"pretty",lineHeight:1.5}}>
            {DV.jobs.filter(j=>j.health==="OK").map(j=>j.id).join(" · ")}
            <span style={{color:"var(--ink-4)"}}> — total value ${(DV.jobs.filter(j=>j.health==="OK").reduce((s,j)=>s+j.value,0)/1_000_000).toFixed(2)}M · avg margin {Math.round(DV.jobs.filter(j=>j.health==="OK").reduce((s,j)=>s+(j.margin||0),0)/DV.jobs.filter(j=>j.health==="OK").length)}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { DashboardVariantB, DashboardVariantC });
