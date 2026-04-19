// Equipment + Fleet + Scorecard + Sales + Marketing tabs
const XD = window.SBS_DATA;

// ============ EQUIPMENT ============
function EquipmentPage({ onTab }) {
  const [filter, setFilter] = useState("all");
  const eq = XD.equipment;
  const shown = filter==="all"?eq:eq.filter(e=>e.status===filter);
  const byType = {};
  eq.forEach(e=>{ byType[e.type]=(byType[e.type]||0)+1; });

  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Heavy Equipment · Live Telematics</div>
          <h1>Equipment</h1>
          <div className="sbs-page-sub">{eq.length} units tracked · {eq.filter(e=>e.status==="on-job").length} deployed · {eq.filter(e=>e.service.includes("overdue")||e.service.includes("now")).length} need service</div>
        </div>
        <button className="sbs-btn primary" onClick={()=>alert("Add")}>+ Add Unit</button>
      </div>

      <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <KPI accent label="Total Units" value={eq.length}/>
        <KPI accent label="On Job" value={eq.filter(e=>e.status==="on-job").length} sub="Active on sites"/>
        <KPI accent label="In Transit" value={eq.filter(e=>e.status==="transit").length} tone="watch"/>
        <KPI accent label="Yard" value={eq.filter(e=>e.status==="yard").length} sub="Idle at Auburn"/>
        <KPI accent label="Service Due" value={eq.filter(e=>e.service.includes("overdue")||e.service.includes("now")).length} tone="risk"/>
      </div>

      <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
        {["all","on-job","transit","yard"].map(f=>(
          <button key={f} className={clsx("sbs-chip",filter===f&&"on")} onClick={()=>setFilter(f)}>{f==="all"?"All":f.replace("-"," ").toUpperCase()}</button>
        ))}
        <span style={{flex:1}}/>
        {Object.entries(byType).map(([t,c])=>(
          <span key={t} className="sbs-pill" data-tone="outline">{t} · {c}</span>
        ))}
      </div>

      <div className="sbs-grid sbs-grid-2">
        <Card title="Fleet Roster" meta={`${shown.length} units`} padded={false}>
          {shown.map(e=>(
            <div key={e.id} className="sbs-row-item" onClick={()=>alert(e.id)}>
              <div className={clsx("ri-icon",e.status)}>{e.type.slice(0,3).toUpperCase()}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                  <span className="mono" style={{fontSize:12,fontWeight:700,color:"var(--ink-4)"}}>{e.id}</span>
                  <span style={{fontSize:13,fontWeight:600,color:"var(--ink)"}}>{e.name}</span>
                </div>
                <div style={{fontSize:11,color:"var(--ink-4)"}}>
                  📍 {e.location} {e.job && <> · <span className="mono" style={{color:"var(--brand-green-700)"}}>{e.job}</span></>} · {fmtNum(e.hours)} hrs · svc {e.service}
                </div>
              </div>
              <Pill status={e.status==="on-job"?"OK":e.status==="transit"?"Watch":null}>
                {e.status.replace("-"," ")}
              </Pill>
            </div>
          ))}
        </Card>

        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <Card title="Service & Maintenance" meta="Next 30 days" padded={false}>
            {eq.filter(e=>!e.service.includes(" in ") || parseInt(e.service.replace(/[^0-9]/g,""))<=300).slice(0,6).map(e=>(
              <div key={e.id} className="sbs-row-item">
                <div className={clsx("ri-icon",e.service.includes("overdue")||e.service.includes("now")?"transit":"yard")}>!</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600}}>{e.name}</div>
                  <div style={{fontSize:11,color:"var(--ink-4)"}}>{e.id} · {fmtNum(e.hours)} hrs</div>
                </div>
                <span className="mono" style={{fontSize:12,fontWeight:700,color:e.service.includes("overdue")||e.service.includes("now")?"var(--status-risk-bar)":"var(--ink-2)"}}>{e.service}</span>
              </div>
            ))}
          </Card>

          <Card title="Utilization · Last 30 Days" padded={true}>
            {["Paver","Roller","Grader","Excavator","Grinder"].map(t=>{
              const pct = {"Paver":82,"Roller":74,"Grader":68,"Excavator":91,"Grinder":52}[t];
              return (
                <div key={t} style={{marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                    <span style={{fontWeight:600}}>{t}</span>
                    <span className="mono" style={{fontWeight:700}}>{pct}%</span>
                  </div>
                  <BurnBar value={pct} tone={pct<60?"watch":null}/>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============ FLEET ============
function FleetPage({ onTab }) {
  const f = XD.fleet;
  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Live GPS · 30-sec refresh</div>
          <h1>Fleet</h1>
          <div className="sbs-page-sub">{f.length} vehicles tracked · {f.filter(v=>v.status==="on-site").length} on-site · {f.filter(v=>v.status==="in-transit"||v.status==="returning").length} moving · 1 idle</div>
        </div>
      </div>

      <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <KPI accent label="Total Vehicles" value={f.length}/>
        <KPI accent label="On Site" value={f.filter(v=>v.status==="on-site").length}/>
        <KPI accent label="In Transit" value={f.filter(v=>v.status==="in-transit"||v.status==="returning").length} tone="watch"/>
        <KPI accent label="Idle / Yard" value={f.filter(v=>v.status==="idle"||v.status==="yard").length}/>
        <KPI accent label="Miles This Week" value="14,820" sub="Target: 16,000"/>
      </div>

      <div className="sbs-grid sbs-grid-sidebar">
        <Card title="Live Map" meta="All vehicles · real-time" padded={true}>
          <div className="sbs-map">
            <svg viewBox="0 0 800 500">
              <polygon className="map-state" points="160,180 330,170 340,360 180,370 150,300"/>
              <polygon className="map-state" points="330,170 480,180 490,380 340,360"/>
              <polygon className="map-state" points="480,180 600,160 620,250 540,270 490,260"/>
              <polygon className="map-state" points="480,180 600,160 660,100 720,120 700,220 620,250 600,160"/>
              <text className="map-state-label" x="245" y="290" textAnchor="middle">ALABAMA</text>
              <text className="map-state-label" x="410" y="290" textAnchor="middle">GEORGIA</text>
              <text className="map-state-label" x="545" y="230" textAnchor="middle">S. CAROLINA</text>
              <text className="map-state-label" x="640" y="170" textAnchor="middle">N. CAROLINA</text>
              {f.map((v,i)=>{
                const x = 180 + ((v.loc[1]+87)*40);
                const y = 400 - ((v.loc[0]-32)*40);
                const tone = v.status==="on-site"?"#198754":v.status==="in-transit"||v.status==="returning"?"#F0A500":"#78909C";
                return (
                  <g key={v.id} transform={`translate(${x} ${y})`}>
                    <rect x="-10" y="-7" width="20" height="14" rx="2" fill={tone} stroke="#fff" strokeWidth="2"/>
                    <text y="3" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fontWeight="700" fill="#fff">{v.id.slice(-2)}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Card>

        <Card title="Vehicle Roster" padded={false}>
          {f.map(v=>(
            <div key={v.id} className="sbs-row-item">
              <div className={clsx("ri-icon",v.status==="on-site"?"on-job":v.status==="in-transit"||v.status==="returning"?"transit":"yard")}>
                {v.type.slice(0,3).toUpperCase()}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span className="mono" style={{fontSize:12,fontWeight:700,color:"var(--ink-4)"}}>{v.id}</span>
                  <span style={{fontSize:12,fontWeight:600}}>{v.driver}</span>
                </div>
                <div style={{fontSize:11,color:"var(--ink-4)",marginTop:2}}>
                  {v.from} → {v.to} {v.job && <> · <span className="mono">{v.job}</span></>}
                </div>
              </div>
              <div style={{textAlign:"right"}}>
                <Pill status={v.status==="on-site"?"OK":v.status==="idle"?"N/S":"Watch"}>{v.status}</Pill>
                <div className="mono" style={{fontSize:10,color:"var(--ink-5)",marginTop:3}}>{fmtNum(v.miles)} mi</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ============ SCORECARD ============
function ScorecardPage({ onTab }) {
  const [sel, setSel] = useState(XD.scorecard[0]?.id);
  const job = XD.scorecard.find(j=>j.id===sel) || XD.scorecard[0];

  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Project Report Cards · Auto-graded</div>
          <h1>Scorecard</h1>
          <div className="sbs-page-sub">{XD.scorecard.length} active jobs graded on margin, schedule, safety, quality</div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"320px 1fr",gap:20}}>
        <Card title="Active Jobs" meta="Click to grade" padded={false}>
          <div style={{maxHeight:720,overflowY:"auto"}}>
            {XD.scorecard.map(j=>(
              <div key={j.id} onClick={()=>setSel(j.id)}
                style={{padding:"12px 16px",borderBottom:"1px solid var(--border-soft)",cursor:"pointer",
                  background:sel===j.id?"var(--brand-green-25)":"transparent",
                  borderLeft:sel===j.id?"3px solid var(--brand-green)":"3px solid transparent",
                  display:"flex",alignItems:"center",gap:10}}>
                <div className="sbs-grade" data-g={j.grades.overall} style={{width:36,height:36,fontSize:20,borderRadius:8}}>{j.grades.overall}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="mono" style={{fontSize:11,color:"var(--ink-4)"}}>{j.id}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"var(--ink)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{j.name}</div>
                  <div style={{fontSize:10,color:"var(--ink-5)",marginTop:2}}>PM: {j.pm} · {j.state}</div>
                </div>
                <span className="mono" style={{fontSize:11,fontWeight:700,color:"var(--ink-3)"}}>{j.scores.overall}</span>
              </div>
            ))}
          </div>
        </Card>

        {job && (
          <div style={{display:"flex",flexDirection:"column",gap:20}}>
            <Card padded={true}>
              <div style={{display:"grid",gridTemplateColumns:"auto 1fr auto",gap:24,alignItems:"center"}}>
                <div className="sbs-grade" data-g={job.grades.overall} style={{width:110,height:110,fontSize:68,borderRadius:16}}>{job.grades.overall}</div>
                <div>
                  <div className="mono" style={{fontSize:13,color:"var(--ink-4)",fontWeight:700}}>{job.id} · {job.type}</div>
                  <h2 style={{fontFamily:"var(--font-display)",fontSize:32,letterSpacing:"0.04em",margin:"4px 0",color:"var(--ink)"}}>{job.name}</h2>
                  <div style={{display:"flex",gap:20,fontSize:12,color:"var(--ink-3)"}}>
                    <span>GC: <b style={{color:"var(--ink)"}}>{job.gc}</b></span>
                    <span>PM: <b style={{color:"var(--ink)"}}>{job.pm}</b></span>
                    <span>State: <b style={{color:"var(--ink)"}}>{job.state}</b></span>
                    <span>Crew: <b style={{color:"var(--ink)"}}>{job.crew||"—"}</b></span>
                  </div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,letterSpacing:"0.12em",textTransform:"uppercase",color:"var(--ink-4)",fontWeight:700}}>Overall Score</div>
                  <div className="mono" style={{fontSize:48,fontWeight:700,color:"var(--ink)",lineHeight:1}}>{job.scores.overall}<span style={{fontSize:20,color:"var(--ink-4)"}}>/100</span></div>
                </div>
              </div>
            </Card>

            <div className="sbs-grid sbs-grid-4">
              {[
                {k:"margin",l:"Margin",s:job.scores.margin,g:job.grades.margin,sub:`${job.margin??"—"}% vs 25% target`},
                {k:"schedule",l:"Schedule",s:job.scores.schedule,g:job.grades.schedule,sub:`${job.health||"—"} · on plan`},
                {k:"safety",l:"Safety",s:job.scores.safety,g:job.grades.safety,sub:"0 incidents this qtr"},
                {k:"quality",l:"Quality",s:job.scores.quality,g:job.grades.quality,sub:job.flags?.length?`${job.flags.length} flag(s)`:"Punch list clear"},
              ].map(x=>(
                <Card key={x.k} padded={true}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                    <div className="sbs-eyebrow">{x.l}</div>
                    <div className="sbs-grade" data-g={x.g}>{x.g}</div>
                  </div>
                  <div className="mono" style={{fontSize:28,fontWeight:700,lineHeight:1}}>{x.s}<span style={{fontSize:14,color:"var(--ink-4)"}}>/100</span></div>
                  <div style={{fontSize:11,color:"var(--ink-4)",marginTop:8,minHeight:16}}>{x.sub}</div>
                  <div style={{marginTop:10}}><BurnBar value={x.s} tone={x.s<70?"risk":x.s<80?"watch":null}/></div>
                </Card>
              ))}
            </div>

            <div className="sbs-grid sbs-grid-2">
              <Card title="Financials" padded={true}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div><div className="sbs-eyebrow">Contract</div><div className="mono" style={{fontSize:22,fontWeight:700,marginTop:4}}>{fmt$(job.value)}</div></div>
                  <div><div className="sbs-eyebrow">Billed</div><div className="mono" style={{fontSize:22,fontWeight:700,marginTop:4}}>{fmt$(job.billed)}</div></div>
                  <div><div className="sbs-eyebrow">% Billed</div><div className="mono" style={{fontSize:22,fontWeight:700,marginTop:4}}>{job.billedPct}%</div></div>
                  <div><div className="sbs-eyebrow">Margin</div><div className="mono" style={{fontSize:22,fontWeight:700,marginTop:4,color:job.margin<20?"var(--status-risk-bar)":"var(--ink)"}}>{job.margin??"—"}%</div></div>
                </div>
              </Card>
              <Card title="Notes & Flags" padded={true}>
                {(job.flags?.length?job.flags:["no-flags"]).map((f,i)=>(
                  <div key={i} style={{padding:"10px 12px",background:"#F8FAF9",borderLeft:"3px solid var(--brand-green)",borderRadius:4,fontSize:12,marginBottom:8}}>
                    {f==="no-flags"?"✓ No active flags. Performance within target.":
                     f==="no-report"?"⚠ No field report submitted yesterday. Escalated to PM.":
                     f==="weather"?"⛈ Weather watch: drizzle & wind today.":
                     f==="material-overrun"?"⚠ Material overrun: 13% over budgeted tonnage.":
                     f==="budget-burn"?"⚠ Cost ≥ 75% of contract · monitor.":f}
                  </div>
                ))}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ SALES ============
function SalesPage({ onTab }) {
  const P = XD.pipeline;
  const total = P.reduce((s,x)=>s+x.value,0);
  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Revenue Pipeline · FY2026</div>
          <h1>Sales</h1>
          <div className="sbs-page-sub">45 open opportunities · ${(total/1e6).toFixed(1)}M weighted pipeline · 11 won YTD</div>
        </div>
        <button className="sbs-btn primary">+ New Opportunity</button>
      </div>

      <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <KPI accent label="Pipeline Value" value={fmt$(total,true)} sub="All stages"/>
        <KPI accent label="Weighted" value="$5.9M" sub="× prob. of close"/>
        <KPI accent label="Won YTD" value="$4.7M" sub="11 closed"/>
        <KPI accent label="Win Rate" value="38%" sub="3-month avg"/>
        <KPI accent label="Avg Deal Size" value="$427K"/>
      </div>

      <Card title="Pipeline — Funnel" meta="Drag to re-stage" padded={true}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:0}}>
          {P.map((s,i)=>{
            const wscale = 1 - (i*0.04);
            return (
              <div key={s.stage} style={{padding:"18px 16px",clipPath:`polygon(0 0, 100% 0, ${100-i*4}% 100%, ${i*4}% 100%)`,
                background:`hsl(${145-i*10} ${50-i*4}% ${96-i*10}%)`,borderRight:i<4?"1px solid #fff":"none",minHeight:140}}>
                <div className="sbs-eyebrow" style={{color:i>=3?"var(--brand-green-700)":"var(--ink-3)"}}>{s.stage}</div>
                <div className="mono" style={{fontSize:28,fontWeight:700,marginTop:6}}>{s.count}</div>
                <div style={{fontSize:11,color:"var(--ink-3)",marginTop:2}}>deals</div>
                <div className="mono" style={{fontSize:14,fontWeight:700,marginTop:12,color:"var(--ink)"}}>{fmt$(s.value,true)}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="sbs-grid sbs-grid-sidebar" style={{marginTop:20}}>
        <Card title="Open Opportunities" meta={`${XD.deals.length} · sorted by close date`} padded={false}>
          <div className="sbs-table-wrap">
            <table className="sbs-table">
              <thead><tr><th>ID</th><th>Client</th><th>Type</th><th>Stage</th><th className="num">Value</th><th>Prob</th><th>Close</th><th>Owner</th></tr></thead>
              <tbody>
                {XD.deals.map(d=>(
                  <tr key={d.id} className="sbs-row" onClick={()=>alert(d.id)}>
                    <td className="mono">{d.id}</td>
                    <td style={{fontWeight:600}}>{d.client}</td>
                    <td style={{color:"var(--ink-3)"}}>{d.type}</td>
                    <td><span className="sbs-pill" style={{background:d.stage==="Won"?"#D4EDDA":d.stage==="Negotiation"?"#E3F2FD":d.stage==="Proposal"?"#FFF3CD":"#ECEFF1",color:"var(--ink-2)"}}>{d.stage}</span></td>
                    <td className="num">{fmt$(d.value,true)}</td>
                    <td>
                      <div style={{display:"flex",alignItems:"center",gap:8,minWidth:100}}>
                        <BurnBar value={d.prob} tone={d.prob<30?"risk":d.prob<60?"watch":null}/>
                        <span className="mono" style={{fontSize:11,width:28,textAlign:"right"}}>{d.prob}%</span>
                      </div>
                    </td>
                    <td className="mono" style={{fontSize:11}}>{d.close}</td>
                    <td>{d.owner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Activity This Week" padded={false}>
          {[
            {who:"Jeff M.",what:"Proposal sent — Covenant Day School",when:"2h ago",tone:"ok"},
            {who:"David PM",what:"Site visit — Pine Lake Prep",when:"yesterday",tone:"ok"},
            {who:"Jeff M.",what:"RFP received — Madison County HS",when:"Mon",tone:"watch"},
            {who:"David PM",what:"Lost: Chesapeake HS (-$240K)",when:"Apr 11",tone:"risk"},
            {who:"Pedro",what:"Qualified — North Garner MS",when:"Apr 10",tone:"ok"},
          ].map((a,i)=>(
            <div key={i} className="sbs-alert">
              <div className={clsx("sbs-alert-icon",a.tone==="risk"?"crit":a.tone==="watch"?"warn":"")}
                   style={a.tone==="ok"?{background:"#E8F5E9",color:"var(--brand-green-700)"}:{}}>
                {a.tone==="risk"?"✗":a.tone==="watch"?"!":"✓"}
              </div>
              <div className="sbs-alert-body">
                <div className="sbs-alert-title">{a.what}</div>
                <div className="sbs-alert-msg">{a.who} · {a.when}</div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

// ============ MARKETING ============
function MarketingPage({ onTab }) {
  const M = XD.marketing;
  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Brand · Campaigns · Pipeline</div>
          <h1>Marketing</h1>
          <div className="sbs-page-sub">{M.pipeline.leads} leads · {M.campaigns.filter(c=>c.status==="active").length} active campaigns · 4 case studies</div>
        </div>
      </div>

      <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <KPI accent label="Leads MTD" value={M.pipeline.leads} sub="+12% vs last month"/>
        <KPI accent label="MQL → SQL" value={`${Math.round(M.pipeline.sql/M.pipeline.mql*100)}%`}/>
        <KPI accent label="Cost Per Lead" value="$178" sub="Blended avg"/>
        <KPI accent label="Website Visits" value="14.2K" sub="Last 30d"/>
        <KPI accent label="Campaign Spend" value="$23.5K" sub="Of $43K budget"/>
      </div>

      <div className="sbs-grid sbs-grid-sidebar">
        <Card title="Funnel" meta="Lead → Won (last 90d)" padded={true}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {[
              {k:"leads",l:"Leads",v:M.pipeline.leads},
              {k:"mql",l:"MQL",v:M.pipeline.mql},
              {k:"sql",l:"SQL",v:M.pipeline.sql},
              {k:"proposals",l:"Proposals",v:M.pipeline.proposals},
              {k:"won",l:"Closed Won",v:M.pipeline.won},
            ].map((s,i)=>(
              <div key={s.k}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:6}}>
                  <span style={{fontWeight:600}}>{s.l}</span>
                  <span className="mono" style={{fontWeight:700}}>{s.v}</span>
                </div>
                <div style={{height:26,background:"#ECEFF1",borderRadius:4,overflow:"hidden"}}>
                  <div style={{width:`${(s.v/M.pipeline.leads)*100}%`,height:"100%",background:`hsl(${145-i*6} 55% ${40+i*4}%)`}}/>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Lead Sources" padded={true}>
          {M.channels.map(c=>(
            <div key={c.name} style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                <span style={{fontWeight:600}}>{c.name}</span>
                <span className="mono" style={{fontWeight:700}}>{c.leads}</span>
              </div>
              <BurnBar value={c.share*2}/>
              <div style={{fontSize:10,color:"var(--ink-4)",marginTop:3}}>
                CPL: <b className="mono">${c.cpl}</b> · Spend: <b className="mono">${c.cost}</b>
              </div>
            </div>
          ))}
        </Card>
      </div>

      <SectionTitle sub="Active campaigns · paused shown dimmed">Campaign Tracker</SectionTitle>
      <div className="sbs-grid sbs-grid-2">
        {M.campaigns.map(c=>(
          <Card key={c.name} padded={true} className={c.status==="paused"?"paused":""}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
              <div className="sbs-eyebrow">{c.name}</div>
              <Pill status={c.status==="active"?"OK":null}>{c.status.toUpperCase()}</Pill>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:12}}>
              <div><div style={{fontSize:10,color:"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Budget</div><div className="mono" style={{fontSize:18,fontWeight:700}}>{fmt$(c.budget,true)}</div></div>
              <div><div style={{fontSize:10,color:"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Spent</div><div className="mono" style={{fontSize:18,fontWeight:700}}>{fmt$(c.spent,true)}</div></div>
              <div><div style={{fontSize:10,color:"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Leads</div><div className="mono" style={{fontSize:18,fontWeight:700}}>{c.leads}</div></div>
              <div><div style={{fontSize:10,color:"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Impr.</div><div className="mono" style={{fontSize:18,fontWeight:700}}>{c.impressions>=1000?(c.impressions/1000).toFixed(0)+"K":c.impressions}</div></div>
            </div>
            <div style={{marginTop:12}}><BurnBar value={Math.round(c.spent/c.budget*100)}/></div>
            <div style={{fontSize:10,color:"var(--ink-4)",marginTop:6}}>
              {Math.round(c.spent/c.budget*100)}% of budget · {c.leads?`CPL $${Math.round(c.spent/c.leads)}`:"—"}
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle>Social & Web</SectionTitle>
      <div className="sbs-grid sbs-grid-4">
        {M.social.map(s=>(
          <Card key={s.channel} padded={true}>
            <div className="sbs-eyebrow">{s.channel}</div>
            <div className="mono" style={{fontSize:28,fontWeight:700,marginTop:6}}>{fmtNum(s.followers)}</div>
            <div style={{fontSize:11,color:"var(--ink-4)"}}>followers</div>
            <div style={{display:"flex",justifyContent:"space-between",marginTop:12,fontSize:11}}>
              <span>Growth: <b className="mono" style={{color:s.growth>0?"var(--brand-green-700)":"var(--status-risk-bar)"}}>+{s.growth}%</b></span>
              <span>Eng: <b className="mono">{s.engagement}%</b></span>
            </div>
          </Card>
        ))}
      </div>

      <SectionTitle sub="Completed work · drives referrals">Case Studies</SectionTitle>
      <div className="sbs-grid sbs-grid-4">
        {M.caseStudies.map(cs=>(
          <Card key={cs.id} padded={false}>
            <div style={{height:120,background:"var(--brand-gradient)",position:"relative",display:"grid",placeItems:"center"}}>
              <div style={{fontFamily:"var(--font-display)",fontSize:32,letterSpacing:"0.1em",color:"rgba(255,255,255,0.95)",textShadow:"0 2px 4px rgba(0,0,0,0.2)"}}>{cs.title.split("—")[0].trim().slice(0,16)}</div>
              <div style={{position:"absolute",inset:0,background:"repeating-linear-gradient(135deg,rgba(255,255,255,0) 0 12px,rgba(255,255,255,0.04) 12px 13px)"}}/>
              <div style={{position:"absolute",top:10,right:10}}><Pill status={cs.status==="Featured"?"OK":cs.status==="Published"?null:"Watch"} tone={cs.status==="Featured"?null:"dark"}>{cs.status}</Pill></div>
            </div>
            <div style={{padding:"14px 16px"}}>
              <div style={{fontSize:13,fontWeight:700,marginBottom:6}}>{cs.title}</div>
              <div style={{fontSize:11,color:"var(--ink-4)",lineHeight:1.5}}>{cs.copy}</div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { EquipmentPage, FleetPage, ScorecardPage, SalesPage, MarketingPage });
