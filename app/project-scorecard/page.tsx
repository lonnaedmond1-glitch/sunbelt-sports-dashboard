import React from 'react';
import Link from 'next/link';
import { getAllScorecards } from '@/lib/csv-parser';
import { fetchLiveJobs } from '@/lib/sheets-data';

function num(v: string): number { return parseFloat(v) || 0; }
function pct(act: number, est: number): number { return est > 0 ? Math.round((act / est) * 100) : 0; }
function variance(act: number, est: number): string {
  const diff = act - est;
  if (diff === 0) return '—';
  return diff > 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString();
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

export default async function ProjectScorecardPage() {
  const scorecards = getAllScorecards();
  const jobs = await fetchLiveJobs();

  const jobMap = new Map<string, string>();
  jobs.forEach(j => {
    if (j?.Job_Number) {
      jobMap.set(j.Job_Number.trim(), j.Job_Name);
    }
  });

  // Portfolio Totals
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
    { label: 'Man Hours', est: totals.estHours, act: totals.actHours, unit: 'hrs', color: '#fb923c' },
    { label: 'Stone (GAB)', est: totals.estStone, act: totals.actStone, unit: 'tons', color: '#a78bfa' },
    { label: 'Binder', est: totals.estBinder, act: totals.actBinder, unit: 'tons', color: '#60a5fa' },
    { label: 'Topping', est: totals.estTopping, act: totals.actTopping, unit: 'tons', color: '#20BC64' },
    { label: 'Days On Site', est: totals.estDays, act: totals.actDays, unit: 'days', color: '#f472b6' },
  ];

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-1">Project Scorecard</h1>
        <p className="text-white/40 text-sm">Estimated vs Actual — Man Hours, Materials &amp; Schedule across all projects.</p>
      </header>
      {/* Static data warning */}
      <div className='mb-6 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3'>
        <span className='text-amber-400 text-lg mt-0.5'>&#9888;</span>
        <div>
          <p className='text-xs font-black uppercase tracking-widest text-amber-400'>Static Data — Scorecards CSV</p>
          <p className='text-xs text-white/40 mt-0.5'>Actuals on this page come from Project_Scorecards.csv and are not updated in real time. For live production data, see individual job field reports.</p>
        </div>
      </div>

      {/* Portfolio Totals */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        {metrics.map(m => (
          <div key={m.label} className="bg-[#1e2023] rounded-xl p-4 border border-white/5 shadow-lg">
            <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: m.color }}>{m.label}</p>
            <div className="flex justify-between items-end mb-2">
              <div>
                <p className="text-[10px] text-white/30 uppercase">Est</p>
                <p className="text-lg font-black text-white/60">{m.est.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/30 uppercase">Act</p>
                <p className="text-lg font-black" style={{ color: m.color }}>{m.act.toLocaleString()}</p>
              </div>
            </div>
            <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct(m.act, m.est))}%`, backgroundColor: progressColor(m.act, m.est) }} />
            </div>
            <p className="text-xs text-white/30 mt-1 text-right">{pct(m.act, m.est)}% of estimate</p>
          </div>
        ))}
        <div className="bg-[#1e2023] rounded-xl p-4 border border-amber-500/20 shadow-lg">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">Weather Days</p>
          <p className="text-4xl font-black text-amber-400">{totals.weatherDays}</p>
          <p className="text-xs text-white/30 mt-1">total lost days</p>
        </div>
      </div>

      {/* Per-Job Table */}
      <div className="bg-[#1e2023] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 bg-black/20">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#20BC64]">Job-by-Job Comparison</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/10 border-b border-white/5 text-[10px] uppercase font-black tracking-widest text-white/40">
                <th className="px-4 py-3 sticky left-0 bg-[#1e2023] z-10">Job</th>
                <th className="px-3 py-3 text-center" colSpan={2}>Man Hours</th>
                <th className="px-3 py-3 text-center" colSpan={2}>Stone (Tons)</th>
                <th className="px-3 py-3 text-center" colSpan={2}>Binder (Tons)</th>
                <th className="px-3 py-3 text-center" colSpan={2}>Topping (Tons)</th>
                <th className="px-3 py-3 text-center" colSpan={2}>Days On Site</th>
                <th className="px-3 py-3 text-center">☁️</th>
              </tr>
              <tr className="bg-black/5 border-b border-white/5 text-[9px] uppercase font-bold tracking-widest text-white/25">
                <th className="px-4 py-1 sticky left-0 bg-[#1e2023] z-10"></th>
                <th className="px-3 py-1 text-center">Est</th><th className="px-3 py-1 text-center">Act</th>
                <th className="px-3 py-1 text-center">Est</th><th className="px-3 py-1 text-center">Act</th>
                <th className="px-3 py-1 text-center">Est</th><th className="px-3 py-1 text-center">Act</th>
                <th className="px-3 py-1 text-center">Est</th><th className="px-3 py-1 text-center">Act</th>
                <th className="px-3 py-1 text-center">Est</th><th className="px-3 py-1 text-center">Act</th>
                <th className="px-3 py-1 text-center">Lost</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {scorecards.map((sc, i) => {
                const mh = { est: num(sc.Est_Man_Hours), act: num(sc.Act_Man_Hours) };
                const st = { est: num(sc.Est_Stone_Tons), act: num(sc.Act_Stone_Tons) };
                const bi = { est: num(sc.Est_Binder_Tons), act: num(sc.Act_Binder_Tons) };
                const tp = { est: num(sc.Est_Topping_Tons), act: num(sc.Act_Topping_Tons) };
                const dy = { est: num(sc.Est_Days_On_Site), act: num(sc.Act_Days_On_Site) };
                const wd = num(sc.Weather_Days);

                return (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 sticky left-0 bg-[#1e2023] z-10">
                      <Link href={`/jobs/${encodeURIComponent(sc.Job_Number.trim())}`} className="font-bold text-[#60a5fa] hover:underline cursor-pointer">
                        {sc.Job_Number}
                      </Link>
                      <p className="text-[10px] text-white/30 mt-0.5 max-w-[140px] truncate">{jobMap.get(sc.Job_Number.trim()) || '—'}</p>
                    </td>
                    {/* Man Hours */}
                    <td className="px-3 py-3 text-center text-white/50">{mh.est.toLocaleString()}</td>
                    <td className={`px-3 py-3 text-center font-bold ${varianceColor(mh.act, mh.est)}`}>{mh.act.toLocaleString()}</td>
                    {/* Stone */}
                    <td className="px-3 py-3 text-center text-white/50">{st.est.toLocaleString()}</td>
                    <td className={`px-3 py-3 text-center font-bold ${varianceColor(st.act, st.est)}`}>{st.act.toLocaleString()}</td>
                    {/* Binder */}
                    <td className="px-3 py-3 text-center text-white/50">{bi.est.toLocaleString()}</td>
                    <td className={`px-3 py-3 text-center font-bold ${varianceColor(bi.act, bi.est)}`}>{bi.act.toLocaleString()}</td>
                    {/* Topping */}
                    <td className="px-3 py-3 text-center text-white/50">{tp.est.toLocaleString()}</td>
                    <td className={`px-3 py-3 text-center font-bold ${varianceColor(tp.act, tp.est)}`}>{tp.act.toLocaleString()}</td>
                    {/* Days */}
                    <td className="px-3 py-3 text-center text-white/50">{dy.est}</td>
                    <td className={`px-3 py-3 text-center font-bold ${varianceColor(dy.act, dy.est)}`}>{dy.act}</td>
                    {/* Weather */}
                    <td className="px-3 py-3 text-center">
                      {wd > 0 ? (
                        <span className={`font-black ${wd >= 5 ? 'text-red-400' : 'text-amber-400'}`}>{wd}</span>
                      ) : (
                        <span className="text-white/20">0</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-black/20 border-t border-white/10 text-xs font-black">
                <td className="px-4 py-3 sticky left-0 bg-[#1a1c1f] z-10 text-white/40 uppercase tracking-widest">Totals</td>
                <td className="px-3 py-3 text-center text-white/50">{totals.estHours.toLocaleString()}</td>
                <td className={`px-3 py-3 text-center ${varianceColor(totals.actHours, totals.estHours)}`}>{totals.actHours.toLocaleString()}</td>
                <td className="px-3 py-3 text-center text-white/50">{totals.estStone.toLocaleString()}</td>
                <td className={`px-3 py-3 text-center ${varianceColor(totals.actStone, totals.estStone)}`}>{totals.actStone.toLocaleString()}</td>
                <td className="px-3 py-3 text-center text-white/50">{totals.estBinder.toLocaleString()}</td>
                <td className={`px-3 py-3 text-center ${varianceColor(totals.actBinder, totals.estBinder)}`}>{totals.actBinder.toLocaleString()}</td>
                <td className="px-3 py-3 text-center text-white/50">{totals.estTopping.toLocaleString()}</td>
                <td className={`px-3 py-3 text-center ${varianceColor(totals.actTopping, totals.estTopping)}`}>{totals.actTopping.toLocaleString()}</td>
                <td className="px-3 py-3 text-center text-white/50">{totals.estDays}</td>
                <td className={`px-3 py-3 text-center ${varianceColor(totals.actDays, totals.estDays)}`}>{totals.actDays}</td>
                <td className="px-3 py-3 text-center text-amber-400 font-black">{totals.weatherDays}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Variance Legend */}
      <div className="mt-4 flex gap-6 text-[10px] font-bold uppercase tracking-widest text-white/30">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400"></span> On Track (within 5%)</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Under Estimate</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400"></span> Over Estimate</span>
      </div>
    </div>
  );
}
