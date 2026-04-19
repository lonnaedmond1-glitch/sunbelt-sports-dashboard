// Schedule tab — crew grid, lowboy moves, active timeline
const SD = window.SBS_DATA;

const CREWS = ["Rosendo / P1","Julio / B1","Martin / B2","Juan / B3","Cesar"];
const DAYS = [
  { d:"MON", date:"Apr 13" },
  { d:"TUE", date:"Apr 14" },
  { d:"WED", date:"Apr 15" },
  { d:"THU", date:"Apr 16" },
  { d:"FRI", date:"Apr 17" },
  { d:"SAT", date:"Apr 18" },
  { d:"SUN", date:"Apr 19" },
];

// Week of Apr 13 assignments
const WEEK1 = {
  "Rosendo / P1": [null, null, {name:"Wilson's Mill",meta:"sand pit · PM: David",job:"25-333 · track paving"}, {name:"Wilson's Mill",meta:"Paving · NC · PM: David",job:"25-333 · track paving"}, {name:"New South MS",meta:"Paving · SC · PM: David",job:"25-001 · paving"}, null, null],
  "Julio / B1":   [{name:"GW Carver",meta:"Clean Up · AL · PM: Jeff",job:"25-444 · Mill & Cap"}, {name:"Available",avail:true}, {name:"Ridgeview",meta:"Drains · PM: Jeff",job:"25-324 · Track Paving"}, {name:"New South",meta:"Check Base · PM: Jeff",job:"25-001 · paving"}, {name:"Chateau Elan",meta:"Punch List · PM: Jeff",job:"26-040 · Road paving"}, null, null],
  "Martin / B2":  Array(7).fill(0).map((_,i)=> i<5?{name:"Veterans MS",meta:"Base · GA · PM: Jeff",job:"25-135 · TURN KEY",weather:i===2?"72°/45° · 2%":null}:null),
  "Juan / B3":    [null, ...Array(5).fill(0).map((_,i)=>({name:"Camden HS",meta:"Base · NC · PM: David",job:"25-141 · TURN KEY",weather:i===0?"76°/44°":null})), null],
  "Cesar":        [{name:"Warner Robins MS",meta:"Sprinkler heads"},{name:"Mossy Creek",meta:"Fence",job:"25-300"},{name:"Greer",meta:"Clean Up / Drains"},{name:"Shop",meta:"Swap Grinding Teeth"},{name:"Butler",meta:"Radius Pins",job:"25-175 · soil stab"},null,null],
};

function Cell({ a }) {
  if (!a) return <div className="sbs-schedule-cell empty"/>;
  if (a.avail) return <div className="sbs-schedule-cell avail">Available</div>;
  return (
    <div className="sbs-schedule-cell filled">
      <div className="cell-name">{a.name}</div>
      {a.meta && <div className="cell-meta">{a.meta}</div>}
      {a.weather && <div className="cell-weather">🌤 {a.weather}</div>}
      {a.job && <span className="cell-job">#{a.job}</span>}
    </div>
  );
}

function SchedulePage({ onTab }) {
  const activeJobs = SD.jobs.filter(j => j.start && j.end);
  const today = new Date("2026-04-19");
  const daysLeft = (d) => Math.ceil((new Date(d)-today)/(1000*60*60*24));

  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">Weekly Schedule · Live</div>
          <h1>Schedule</h1>
          <div className="sbs-page-sub">Crew assignments · project timelines · 30 active jobs · 8 weather alerts today</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="sbs-chip on">Week 16</button>
          <button className="sbs-chip">Week 17</button>
          <button className="sbs-chip">Month</button>
          <button className="sbs-btn">Print Run Sheet</button>
        </div>
      </div>

      {/* Timeline rail */}
      <Card title="Active Projects — Timeline" meta={`${activeJobs.length} jobs in flight · ${activeJobs.filter(j=>daysLeft(j.end)<=0).length} wrapping this week`} padded={true}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {activeJobs.slice(0,9).map(j => {
            const dl = daysLeft(j.end);
            const tone = dl <= 0 ? "risk" : dl <= 5 ? "watch" : "ok";
            const toneColor = tone==="risk"?"var(--status-risk-bar)":tone==="watch"?"var(--status-watch-bar)":"var(--brand-green)";
            const start = new Date(j.start), end = new Date(j.end);
            const total = Math.max(1, (end-start)/(1000*60*60*24));
            const elapsed = Math.max(0, Math.min(total, (today-start)/(1000*60*60*24)));
            const pct = Math.round(elapsed/total*100);
            return (
              <div key={j.id} style={{padding:14,border:"1px solid var(--border-soft)",borderRadius:10,background:"#fff",cursor:"pointer"}}
                   onClick={()=>onTab("scorecard")}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                  <span className="mono" style={{fontSize:11,fontWeight:700,color:"var(--ink-4)"}}>{j.id}</span>
                  <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:toneColor,textTransform:"uppercase"}}>
                    {dl<=0?"DUE TODAY": dl+"d left"}
                  </span>
                </div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--ink)",marginBottom:4,lineHeight:1.3}}>{j.name}</div>
                <div style={{fontSize:11,color:"var(--ink-4)",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>{j.type}</div>
                <BurnBar value={pct} tone={tone==="ok"?null:tone}/>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"var(--ink-4)",marginTop:6,fontFamily:"var(--font-mono)"}}>
                  <span>{j.start.slice(5)}</span>
                  <span>{pct}% elapsed</span>
                  <span>{j.end.slice(5)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Lowboy moves */}
      <SectionTitle sub="Driver: David Hudson · 5 moves this week">Upcoming Lowboy Moves</SectionTitle>
      <Card padded={false}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)"}}>
          {SD.lowboyMoves.map((m,i) => (
            <div key={i} style={{padding:"14px 12px",borderRight:i<6?"1px solid var(--border-soft)":"none",minHeight:110}}>
              <div style={{fontFamily:"var(--font-display)",fontSize:13,letterSpacing:"0.1em",color:"var(--ink)"}}>{m.day}</div>
              <div style={{fontFamily:"var(--font-mono)",fontSize:10,color:"var(--ink-4)",marginBottom:8}}>{m.date}</div>
              {m.label ? (
                <>
                  <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.08em",color:"var(--brand-green-700)",textTransform:"uppercase",marginBottom:3}}>David · Lowboy</div>
                  <div style={{fontSize:11,color:"var(--ink-2)",lineHeight:1.4}}>{m.label}</div>
                </>
              ) : (
                <div style={{fontSize:11,color:"var(--ink-5)",fontStyle:"italic"}}>No moves</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* Main crew grid */}
      <SectionTitle sub="THIS WEEK · click a cell to expand">Week of Apr 13 · Crew Assignments</SectionTitle>
      <div className="sbs-schedule">
        <div className="sbs-schedule-head">
          <div>CREW</div>
          {DAYS.map(d => (<div key={d.d}><div className="dow-d">{d.d}</div><div className="dow-date">{d.date}</div></div>))}
        </div>
        {CREWS.map(c => (
          <div key={c} className="sbs-schedule-row">
            <div className="crew-cell">
              <div className="crew-type">{c.includes("P")?"Paving":c.includes("B")?"Base":"Floater"}</div>
              {c}
              <div className="crew-pm">{SD.crews.find(cr=>cr.name===c)?.headcount ?? 2}-person · PM: {SD.crews.find(cr=>cr.name===c)?.pm ?? "—"}</div>
            </div>
            {WEEK1[c].map((a,i) => <Cell key={i} a={a}/>)}
          </div>
        ))}
      </div>

      <SectionTitle sub="Planning week · less firm">Week of Apr 20 · Planned</SectionTitle>
      <div className="sbs-schedule">
        <div className="sbs-schedule-head">
          <div>CREW</div>
          {["MON Apr 20","TUE Apr 21","WED Apr 22","THU Apr 23","FRI Apr 24","SAT Apr 25","SUN Apr 26"].map(d=>(
            <div key={d}><div className="dow-d">{d.split(" ")[0]}</div><div className="dow-date">{d.split(" ").slice(1).join(" ")}</div></div>
          ))}
        </div>
        <div className="sbs-schedule-row">
          <div className="crew-cell"><div className="crew-type">Paving</div>Rosendo / P1<div className="crew-pm">6-person · PM: David</div></div>
          <Cell a={{name:"New South MS",meta:"Paving · SC",job:"25-001 · paving"}}/>
          <Cell a={{name:"New South MS",meta:"Paving · SC",job:"25-001 · paving"}}/>
          <Cell a={{name:"Chateau Elan",meta:"Speed Tables",job:"26-040",weather:"81°/51° · 1%"}}/>
          <Cell a={{name:"Scruggs",job:"30-001",meta:"PM: Pedro"}}/>
          <Cell a={{name:"Scruggs",job:"30-001",meta:"PM: Pedro"}}/>
          <Cell a={null}/><Cell a={null}/>
        </div>
        <div className="sbs-schedule-row">
          <div className="crew-cell"><div className="crew-type">Base</div>Julio / B1<div className="crew-pm">5-person · PM: Jeff</div></div>
          <Cell a={{name:"Greer",meta:"Clean Up / Shot Ring"}}/>
          <Cell a={{avail:true}}/>
          <Cell a={{name:"Brewer HS",meta:"Base · AL",job:"25-177 · TRACK PAVING",weather:"80°/52° · 1%"}}/>
          <Cell a={{name:"Brewer HS",meta:"Base · AL",job:"25-177 · TRACK PAVING",weather:"81°/56° · 2%"}}/>
          <Cell a={{name:"Brewer HS",meta:"Base · AL",job:"25-177 · TRACK PAVING",weather:"82°/60° · 45%"}}/>
          <Cell a={null}/><Cell a={null}/>
        </div>
        <div className="sbs-schedule-row">
          <div className="crew-cell"><div className="crew-type">Base</div>Martin / B2<div className="crew-pm">5-person · PM: Jeff</div></div>
          {Array(5).fill(0).map((_,i)=><Cell key={i} a={{name:"Veterans MS",meta:"Base · GA",job:"25-135 · TURN KEY"}}/>)}
          <Cell a={null}/><Cell a={null}/>
        </div>
        <div className="sbs-schedule-row">
          <div className="crew-cell"><div className="crew-type">Base</div>Juan / B3<div className="crew-pm">4-person · PM: David</div></div>
          {["76°/44°","73°/44°","84°/50°","85°/55°","88°/60°"].map((w,i)=>(
            <Cell key={i} a={{name:"Camden HS",meta:"Base · NC",job:"25-141 · TURN KEY",weather:w}}/>
          ))}
          <Cell a={null}/><Cell a={null}/>
        </div>
        <div className="sbs-schedule-row">
          <div className="crew-cell"><div className="crew-type">Floater</div>Cesar<div className="crew-pm">2-person · PM: Jeff</div></div>
          <Cell a={{name:"Lakewood",meta:"Grinding",job:"25-254",weather:"72°/44°"}}/>
          <Cell a={{avail:true}}/>
          <Cell a={{name:"Brookwood",meta:"Discus Relocation",job:"25-093"}}/>
          <Cell a={{name:"Butler",meta:"Radius Pins",job:"25-175"}}/>
          <Cell a={{avail:true}}/>
          <Cell a={null}/><Cell a={null}/>
        </div>
      </div>

      <SectionTitle sub="Live from the Schedule tab">Tie Up Loose Ends</SectionTitle>
      <Card padded={true}>
        <div style={{textAlign:"center",padding:"30px 0",color:"var(--ink-4)",fontSize:13}}>
          ✓ No loose ends this week. <span style={{fontSize:11,color:"var(--ink-5)"}}>Great work.</span>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { SchedulePage });
