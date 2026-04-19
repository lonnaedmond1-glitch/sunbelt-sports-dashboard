// Portfolio tab — all 35 jobs, filterable/sortable
const PD = window.SBS_DATA;

function PortfolioPage({ onTab }) {
  const [state, setState] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [pm, setPm] = useState("ALL");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({k:"value", dir:-1});

  const filtered = useMemo(() => {
    let rows = PD.jobs.slice();
    if (state !== "ALL") rows = rows.filter(r=>r.state===state);
    if (status !== "ALL") rows = rows.filter(r=>r.status===status);
    if (pm !== "ALL") rows = rows.filter(r=>r.pm===pm);
    if (q) {
      const ql = q.toLowerCase();
      rows = rows.filter(r => (r.name+" "+r.id+" "+r.gc).toLowerCase().includes(ql));
    }
    rows.sort((a,b) => {
      const av = a[sort.k] ?? 0, bv = b[sort.k] ?? 0;
      if (typeof av === "string") return av.localeCompare(bv) * sort.dir;
      return (av - bv) * sort.dir;
    });
    return rows;
  }, [state, status, pm, q, sort]);

  const totalValue = filtered.reduce((s,j)=>s+(j.value||0),0);
  const totalBilled = filtered.reduce((s,j)=>s+(j.billed||0),0);

  const arrow = (k) => sort.k===k ? (sort.dir===1?"▲":"▼") : "▲";
  const toggleSort = (k) => setSort(s => s.k===k ? {k, dir:-s.dir} : {k, dir:-1});

  return (
    <div className="sbs-page">
      <div className="sbs-page-head">
        <div>
          <div className="sbs-page-eyebrow">All Jobs · Live WIP Sheet</div>
          <h1>Portfolio</h1>
          <div className="sbs-page-sub">{PD.jobs.length} jobs · 4 states · ${(13769564).toLocaleString()} total contract value</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="sbs-btn" onClick={()=>alert("CSV")}>Export CSV</button>
          <button className="sbs-btn primary" onClick={()=>alert("New")}>+ New Job</button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="sbs-kpi-strip" style={{gridTemplateColumns:"repeat(5,1fr)"}}>
        <KPI accent label="Filtered Jobs" value={filtered.length}/>
        <KPI accent label="Contract Value" value={fmt$(totalValue, true)}/>
        <KPI accent label="Billed to Date" value={fmt$(totalBilled, true)} sub={`${Math.round(totalBilled/Math.max(totalValue,1)*100)}% collected`}/>
        <KPI accent label="Remaining" value={fmt$(totalValue-totalBilled, true)}/>
        <KPI accent label="Health" value={`${filtered.filter(j=>j.health==="OK").length} OK / ${filtered.filter(j=>j.health==="Watch").length} Watch`} sub={`${filtered.filter(j=>!j.health).length} unstarted`}/>
      </div>

      {/* Filters */}
      <Card padded={true} className="sbs-filters">
        <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"center"}}>
          <div style={{flex:"1 1 240px"}}>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search job # / name / GC..."
              style={{width:"100%",height:36,padding:"0 12px",border:"1px solid var(--border)",borderRadius:6,fontFamily:"var(--font-sans)",fontSize:13}}/>
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--ink-4)",textTransform:"uppercase"}}>State</span>
            {["ALL","GA","NC","SC","AL"].map(s => (
              <button key={s} className={clsx("sbs-chip", state===s && "on")} onClick={()=>setState(s)}>{s} {s!=="ALL" && <span style={{opacity:0.7}}>({PD.jobs.filter(j=>j.state===s).length})</span>}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--ink-4)",textTransform:"uppercase"}}>Status</span>
            {["ALL","Pending","Executed","Signed","Received"].map(s => (
              <button key={s} className={clsx("sbs-chip", status===s && "on")} onClick={()=>setStatus(s)}>{s}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:"0.1em",color:"var(--ink-4)",textTransform:"uppercase"}}>PM</span>
            {["ALL","David","Jeff","Pedro"].map(s => (
              <button key={s} className={clsx("sbs-chip", pm===s && "on")} onClick={()=>setPm(s)}>{s}</button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main table */}
      <Card title={`All Jobs — ${filtered.length} shown`} meta="Click row to open · click column to sort" padded={false} className="sbs-card" >
        <div className="sbs-table-wrap">
          <table className="sbs-table">
            <thead><tr>
              <th className={sort.k==="id"?"active":""} onClick={()=>toggleSort("id")}>Job #<span className="arr">{arrow("id")}</span></th>
              <th className={sort.k==="name"?"active":""} onClick={()=>toggleSort("name")}>Name<span className="arr">{arrow("name")}</span></th>
              <th>GC</th>
              <th>PM</th>
              <th>State</th>
              <th>Status</th>
              <th className={sort.k==="value"?"active":""} onClick={()=>toggleSort("value")} style={{textAlign:"right"}}>Contract<span className="arr">{arrow("value")}</span></th>
              <th className={sort.k==="billedPct"?"active":""} onClick={()=>toggleSort("billedPct")}>Billed<span className="arr">{arrow("billedPct")}</span></th>
              <th className={sort.k==="margin"?"active":""} onClick={()=>toggleSort("margin")} style={{textAlign:"right"}}>Margin<span className="arr">{arrow("margin")}</span></th>
              <th>Health</th>
            </tr></thead>
            <tbody>
              {filtered.map(j => (
                <tr key={j.id} className="sbs-row" onClick={()=>onTab("scorecard")}>
                  <td className="mono">{j.id}</td>
                  <td style={{fontWeight:600,color:"var(--ink)"}}>{j.name}</td>
                  <td style={{color:"var(--ink-3)"}}>{j.gc}</td>
                  <td>{j.pm}</td>
                  <td><span className="sbs-pill" data-tone="outline">{j.state}</span></td>
                  <td><span className="sbs-pill" data-tone={j.status==="Executed"?"dark":"neutral"}>{j.status}</span></td>
                  <td className="num">{j.value?fmt$(j.value):"—"}</td>
                  <td>
                    <div style={{display:"flex",alignItems:"center",gap:8,minWidth:160}}>
                      <BurnBar value={j.billedPct} tone={j.billedPct>=95?"watch":null}/>
                      <span className="mono" style={{fontSize:11,width:32,textAlign:"right"}}>{j.billedPct}%</span>
                    </div>
                  </td>
                  <td className="num" style={{color: j.margin!=null && j.margin<20 ? "var(--status-risk-bar)" : "var(--ink-2)"}}>
                    {j.margin!=null?`${j.margin}%`:"—"}
                  </td>
                  <td>{j.health ? <Pill status={j.health==="OK"?"OK":j.health==="N/S"?"N/S":j.health==="Watch"?"Watch":"At Risk"}/> : <span className="sbs-pill" data-tone="outline">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

Object.assign(window, { PortfolioPage });
