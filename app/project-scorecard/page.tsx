export const revalidate = 86400; // Daily ISR
import React from 'react';
import Link from 'next/link';
import { getAllScorecards } from '@/lib/csv-parser';
import { fetchLiveJobs, fetchProjectScorecardsEstVsAct, fetchQboFinancials } from '@/lib/sheets-data';

function num(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s"%]/g, ''));
  return isNaN(x) ? 0 : x;
}

function varianceColor(act: number, est: number): string {
  if (est === 0) return 'text-white/30';
  const ratio = act / est;
  if (ratio > 1.05) return 'text-red-400';
  if (ratio > 0.95) return 'text-emerald-400';
  return 'text-blue-400';
}

function progressColor(act: number, est: number): string {
  if (est === 0) return '#444';
  const ratio = act / est;
  if (ratio > 1.05) return '#ef4444';
  if (ratio > 0.90) return '#20BC64';
  return '#60a5fa';
}

export default async function ProjectScorecardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const params = await searchParams;
  const range = (params?.range === 'month' || params?.range === 'lifetime') ? params.range : 'ytd';

  const [liveRows, jobs, qbo] = await Promise.all([
    fetchProjectScorecardsEstVsAct(),
    fetchLiveJobs(),
    fetchQboFinancials(),
  ]);

  // Fall back to CSV if the live sheet tab is empty so we never show a blank page.
  const csvRows = getAllScorecards();
  const source: 'live' | 'csv' = liveRows.length > 0 ? 'live' : 'csv';
  const scorecards = source === 'live'
    ? liveRows.map(r => ({
        Job_Number: r.Job_Number,
        Est_Man_Hours: String(r.Est_Man_Hours),
        Act_Man_Hours: String(r.Act_Man_Hours),
        Est_Stone_Tons: String(r.Est_Stone_Tons),
        Act_Stone_Tons: String(r.Act_Stone_Tons),
        Est_Binder_Tons: String(r.Est_Binder_Tons),
        Act_Binder_Tons: String(r.Act_Binder_Tons),
        Est_Topping_Tons: String(r.Est_Topping_Tons),
        Act_Topping_Tons: String(r.Act_Topping_Tons),
        Est_Days_On_Site: String(r.Est_Days_On_Site),
        Act_Days_On_Site: String(r.Act_Days_On_Site),
        Weather_Days: String(r.Weather_Days),
      }))
    : csvRows;

  const updatedAt = source === 'live' ? (liveRows[0]?.Updated_At || '—') : 'static CSV';

  const jobMap = new Map<string, string>();
  jobs.forEach(j => { if (j?.Job_Number) jobMap.set(j.Job_Number.trim(), j.Job_Name); });

  const qboMap = new Map<string, typeof qbo[number]>();
  qbo.forEach(q => { if (q.Job_Number) qboMap.set(q.Job_Number.trim(), q); });

  const totals = {
    estHours: scorecards.reduce((s, sc) => s + num(sc.Est_Man_Hours), 0),
    actHours: scorecards.reduce((s, sc) => s + num(sc.Act_Man_Hours), 0),
    estStone: scorecards.reduce((s, sc) => s + num(sc.Est_Stone_Tons), 0),
    actStone: scorecards.reduce((s, sc) => s + num(sc.Act_Stone_Tons), 0),
    estBinder: scorecards.reduce((s, sc) => s + num(sc.Est_Binder_Tons), 0),
    actBinder: scorecards.reduce((s, sc) => s + num(sc.Act_Binder_Tons), 0),
    estTopping: scorecards.reduce((s, sc) => s + num(sc.Est_Topping_Tons), 0),
    actTopping: scorecards.reduce((s, sc) => s + num(sc.Act_Topping_Tons), 0),
    estDays: scorecards.reduce((s, sc) => s + num(sc.Est_Days_On_Site), 0),
    actDays: scorecards.reduce((s, sc) => s + num(sc.Act_Days_On_Site), 0),
    weatherDays: scorecards.reduce((s, sc) => s + num(sc.Weather_Days), 0),
  };

  const metrics = [
    { label: 'Man Hours',    est: totals.estHours,   act: totals.actHours,   unit: 'hrs',  color: '#fb923c' },
    { label: 'Stone (GAB)',  est: totals.estStone,   act: totals.actStone,   unit: 'tons', color: '#a78bfa' },
    { label: 'Binder',       est: totals.estBinder,  act: totals.actBinder,  unit: 'tons', color: '#60a5fa' },
    { label: 'Topping',      est: totals.estTopping, act: totals.actTopping, unit: 'tons', color: '#20BC64' },
    { label: 'Days On Site', est: totals.estDays,    act: totals.actDays,    unit: 'days', color: '#f472b6' },
  ];

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-1">Project Scorecard</h1>
        <p className="text-white/40 text-sm">Estimated vs Actual — Man Hours, Materials &amp; Schedule across all projects.</p>
      </header>

      {/* Time range toggle */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Range:</span>
        {(['month', 'ytd', 'lifetime'] as const).map(r => {
          const active = range === r;
          return (
            <Link
              key={r}
              href={r === 'ytd' ? '/project-scorecard' : `/project-scorecard?range=${r}`}
              className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-colors ${active ? 'bg-[#20BC64]/20 text-[#20BC64] border-[#20BC64]/40' : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80 hover:bg-white/10'}`}
            >
              {r === 'month' ? 'Month' : r === 'ytd' ? 'YTD' : 'Lifetime'}
            </Link>
          );
        })}
      </div>

      {/* Live/static banner */}
      {source === 'live' ? (
        <div className="mb-6 flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3">
          <span className="text-emerald-400 text-lg mt-0.5">●</span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-400">Live — Project_Scorecards_Live tab</p>
            <p className="text-xs text-white/40 mt-0.5">Updated {updatedAt}. Pulled from the scorecard hub Google Sheet. Edit the tab directly; changes flow through daily ISR refresh.</p>
          </div>
        </div>
      ) : (
        <div className="mb-6 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-amber-400 text-lg mt-0.5">&#9888;</span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-400">Static fallback — Scorecards CSV</p>
            <p className="text-xs text-white/40 mt-0.5">The <code className="font-mono text-[11px]">Project_Scorecards_Live</code> tab is empty. Add rows with columns <span className="font-mono text-[11px]">Job_Number, Est_Man_Hours, Act_Man_Hours, Est_Stone_Tons, Act_Stone_Tons, Est_Binder_Tons, Act_Binder_Tons, Est_Topping_Tons, Act_Topping_Tons, Est_Days_On_Site, Act_Days_On_Site, Weather_Days, Updated_At</span> to go live.</p>
          </div>
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
        {metrics.map(m => {
          const pct = m.est > 0 ? Math.round((m.act / m.est) * 100) : 0;
          return (
            <div key={m.label} className="bg-white/5 rounded-xl p-4 border border-white/10" style={{ borderColor: `${m.color}33` }}>
              <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: m.color }}>{m.label}</p>
              <div className="flex justify-between items-end gap-2">
                <div>
                  <p className="text-[9px] text-white/40 uppercase">Est</p>
                  <p className="text-lg font-black text-white">{m.est.toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-white/40 uppercase">Act</p>
                  <p className="text-lg font-black" style={{ color: m.color }}>{m.act.toLocaleString()}</p>
                </div>
              </div>
              <div className="mt-2 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: progressColor(m.act, m.est) }} />
              </div>
              <p className="text-[9px] text-white/40 mt-1 text-right">{pct}% of estimate</p>
            </div>
          );
        })}
        <div className="bg-white/5 rounded-xl p-4 border border-white/10" style={{ borderColor: '#f59e0b33' }}>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 text-amber-400">Weather Days</p>
          <p className="text-3xl font-black text-amber-400">{totals.weatherDays}</p>
          <p className="text-[9px] text-white/40 mt-1">total lost days</p>
        </div>
      </div>

      {/* Job-by-job */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <h2 className="text-sm font-black uppercase tracking-widest text-white/70">Job-by-Job Comparison</h2>
          <span className="text-[10px] text-white/40 font-bold uppercase">{source === 'live' ? 'Live' : 'Static CSV'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white/5">
              <tr>
                <th className="text-left px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40">Job</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40" colSpan={2}>Man Hours</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40" colSpan={2}>Stone (tons)</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40" colSpan={2}>Binder (tons)</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40" colSpan={2}>Topping (tons)</th>
                <th className="text-center px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40" colSpan={2}>Days</th>
                <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40">QBO Profit</th>
                <th className="text-right px-3 py-3 text-[10px] font-black uppercase tracking-widest text-white/40">Margin</th>
              </tr>
              <tr className="bg-white/5 border-t border-white/10">
                <th></th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Est</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Act</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Est</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Act</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Est</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Act</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Est</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Act</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Est</th>
                <th className="text-[9px] font-bold uppercase text-white/30 px-2 py-1">Act</th>
                <th></th><th></th>
              </tr>
            </thead>
            <tbody>
              {scorecards.map((sc, i) => {
                const mh = { est: num(sc.Est_Man_Hours), act: num(sc.Act_Man_Hours) };
                const st = { est: num(sc.Est_Stone_Tons), act: num(sc.Act_Stone_Tons) };
                const bd = { est: num(sc.Est_Binder_Tons), act: num(sc.Act_Binder_Tons) };
                const tp = { est: num(sc.Est_Topping_Tons), act: num(sc.Act_Topping_Tons) };
                const dy = { est: num(sc.Est_Days_On_Site), act: num(sc.Act_Days_On_Site) };
                const q = qboMap.get(sc.Job_Number.trim());
                const name = jobMap.get(sc.Job_Number.trim()) || '';
                return (
                  <tr key={i} className="border-t border-white/5 hover:bg-white/5">
                    <td className="px-3 py-2">
                      <Link href={`/jobs/${sc.Job_Number}`} className="text-[#20BC64] font-bold text-xs hover:underline">{sc.Job_Number}</Link>
                      <div className="text-[10px] text-white/40">{name}</div>
                    </td>
                    <td className="text-center px-2 py-2 text-[11px] text-white/50">{mh.est.toLocaleString()}</td>
                    <td className={`text-center px-2 py-2 text-[11px] font-bold ${varianceColor(mh.act, mh.est)}`}>{mh.act.toLocaleString()}</td>
                    <td className="text-center px-2 py-2 text-[11px] text-white/50">{st.est.toLocaleString()}</td>
                    <td className={`text-center px-2 py-2 text-[11px] font-bold ${varianceColor(st.act, st.est)}`}>{st.act.toLocaleString()}</td>
                    <td className="text-center px-2 py-2 text-[11px] text-white/50">{bd.est.toLocaleString()}</td>
                    <td className={`text-center px-2 py-2 text-[11px] font-bold ${varianceColor(bd.act, bd.est)}`}>{bd.act.toLocaleString()}</td>
                    <td className="text-center px-2 py-2 text-[11px] text-white/50">{tp.est.toLocaleString()}</td>
                    <td className={`text-center px-2 py-2 text-[11px] font-bold ${varianceColor(tp.act, tp.est)}`}>{tp.act.toLocaleString()}</td>
                    <td className="text-center px-2 py-2 text-[11px] text-white/50">{dy.est}</td>
                    <td className={`text-center px-2 py-2 text-[11px] font-bold ${varianceColor(dy.act, dy.est)}`}>{dy.act}</td>
                    <td className={`text-right px-3 py-2 text-[11px] font-bold ${q ? (q.Profit >= 0 ? 'text-emerald-400' : 'text-red-400') : 'text-white/30'}`}>
                      {q ? `$${(q.Profit / 1000).toFixed(0)}K` : '—'}
                    </td>
                    <td className={`text-right px-3 py-2 text-[11px] font-bold ${q ? (q.Profit_Margin >= 0.2 ? 'text-emerald-400' : q.Profit_Margin >= 0.1 ? 'text-amber-400' : 'text-red-400') : 'text-white/30'}`}>
                      {q && q.Act_Income > 0 ? `${(q.Profit_Margin * 100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
