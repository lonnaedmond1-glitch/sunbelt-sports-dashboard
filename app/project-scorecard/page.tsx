export const revalidate = 86400;
import React from 'react';
import Link from 'next/link';
import { fetchLiveJobs, fetchProjectScorecardsEstVsAct, fetchQboFinancials } from '@/lib/sheets-data';

function num(v: string | number | undefined | null): number {
  if (v == null) return 0;
  const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s"%]/g, ''));
  return isNaN(x) ? 0 : x;
}

// Status: compare actual to estimate. BUT: actual=0 with estimate>0 means "not reported", not "-100% miss".
type Status = 'on' | 'over' | 'under' | 'not-reported' | 'none';

function statusFor(act: number, est: number): Status {
  if (est === 0 && act === 0) return 'none';
  if (est > 0 && act === 0) return 'not-reported';
  if (est === 0) return 'none';
  const ratio = act / est;
  if (ratio >= 1.05) return 'over';
  if (ratio >= 0.95) return 'on';
  return 'under';
}

function statusColor(s: Status): string {
  switch (s) {
    case 'on': return '#198754';
    case 'over': return '#D8392B';
    case 'under': return '#2563EB';
    case 'not-reported': return '#6B7278';
    default: return '#6B7278';
  }
}

function variancePct(act: number, est: number): string {
  if (est === 0) return '—';
  if (act === 0) return 'not reported';
  const diff = ((act - est) / est) * 100;
  const sign = diff >= 0 ? '+' : '';
  return `${sign}${diff.toFixed(0)}%`;
}

export default async function ProjectScorecardPage() {
  const [scorecards, jobs, qbo] = await Promise.all([
    fetchProjectScorecardsEstVsAct(),
    fetchLiveJobs(),
    fetchQboFinancials(),
  ]);

  const jobMap = new Map<string, string>();
  jobs.forEach((j: any) => { if (j?.Job_Number) jobMap.set(j.Job_Number.trim(), j.Job_Name); });

  const qboMap = new Map<string, any>();
  qbo.forEach((q: any) => { if (q.Job_Number) qboMap.set(q.Job_Number.trim(), q); });

  // Jobs with complete reporting only (both est and act present)
  const withData = scorecards.filter(sc =>
    (num(sc.Est_Man_Hours) + num(sc.Est_Stone_Tons) + num(sc.Est_Binder_Tons) + num(sc.Est_Topping_Tons)) > 0
  );

  const reporting = withData.filter(sc => num(sc.Act_Man_Hours) > 0 || num(sc.Act_Stone_Tons) > 0 || num(sc.Act_Binder_Tons) > 0 || num(sc.Act_Topping_Tons) > 0);
  const notReportedCount = withData.length - reporting.length;

  const totals = {
    estHours:  reporting.reduce((s, sc) => s + num(sc.Est_Man_Hours), 0),
    actHours:  reporting.reduce((s, sc) => s + num(sc.Act_Man_Hours), 0),
    estStone:  reporting.reduce((s, sc) => s + num(sc.Est_Stone_Tons), 0),
    actStone:  reporting.reduce((s, sc) => s + num(sc.Act_Stone_Tons), 0),
    estBinder: reporting.reduce((s, sc) => s + num(sc.Est_Binder_Tons), 0),
    actBinder: reporting.reduce((s, sc) => s + num(sc.Act_Binder_Tons), 0),
    estTop:    reporting.reduce((s, sc) => s + num(sc.Est_Topping_Tons), 0),
    actTop:    reporting.reduce((s, sc) => s + num(sc.Act_Topping_Tons), 0),
    estDays:   reporting.reduce((s, sc) => s + num(sc.Est_Days_On_Site), 0),
    actDays:   reporting.reduce((s, sc) => s + num(sc.Act_Days_On_Site), 0),
    weatherDays: withData.reduce((s, sc) => s + num(sc.Weather_Days), 0),
  };

  const metrics = [
    { label: 'Man Hours',   est: totals.estHours,  act: totals.actHours,  unit: 'hrs' },
    { label: 'Stone (GAB)', est: totals.estStone,  act: totals.actStone,  unit: 'tons' },
    { label: 'Binder',      est: totals.estBinder, act: totals.actBinder, unit: 'tons' },
    { label: 'Topping',     est: totals.estTop,    act: totals.actTop,    unit: 'tons' },
    { label: 'Days Onsite', est: totals.estDays,   act: totals.actDays,   unit: 'days' },
  ];

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Project Scorecard</span>
            <h1 className="text-4xl font-display mt-2">Estimate vs Actual</h1>
            <p className="text-steel-grey text-sm mt-1">
              Source: Scorecard Hub → Project_Scorecards_Live tab. {reporting.length} of {withData.length} active jobs reporting.
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        {withData.length === 0 && (
          <div className="card card-padded mb-8 border-l-4" style={{ borderLeftColor: '#E8892B' }}>
            <p className="font-display text-lg">No Estimates Loaded Yet</p>
            <p className="text-steel-grey text-sm mt-1">
              Fill in the Project_Scorecards_Live tab (columns: Job_Number, Est_Man_Hours, Act_Man_Hours, Est_Stone_Tons, Act_Stone_Tons, Est_Binder_Tons, Act_Binder_Tons, Est_Topping_Tons, Act_Topping_Tons, Est_Days_On_Site, Act_Days_On_Site, Weather_Days, Updated_At). The page refreshes daily.
            </p>
          </div>
        )}

        {notReportedCount > 0 && (
          <div className="card card-padded mb-6 border-l-4" style={{ borderLeftColor: '#E8892B' }}>
            <p className="font-display text-lg">{notReportedCount} job{notReportedCount > 1 ? 's' : ''} with no actuals yet</p>
            <p className="text-steel-grey text-sm mt-1">
              These jobs have estimates but no field data entered. They show as "not reported" below — NOT as -100% variance. Field reports are pending.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
          {metrics.map(m => {
            const pct = m.est > 0 ? Math.round((m.act / m.est) * 100) : 0;
            const s = statusFor(m.act, m.est);
            return (
              <div key={m.label} className="card card-padded">
                <p className="stat-label">{m.label}</p>
                <div className="flex justify-between items-end gap-2 mt-2">
                  <div>
                    <p className="text-xs text-steel-grey">Est</p>
                    <p className="font-mono text-lg">{m.est.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-steel-grey">Act</p>
                    <p className="font-mono text-lg" style={{ color: statusColor(s) }}>{m.act.toLocaleString()}</p>
                  </div>
                </div>
                <div className="mt-3 h-1.5 bg-mist-grey rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: statusColor(s) }} />
                </div>
                <p className="stat-sub mt-1 text-right">{pct}% of est.</p>
              </div>
            );
          })}
          <div className="card card-padded">
            <p className="stat-label">Weather Days</p>
            <p className="stat-value font-mono" style={{ color: '#E8892B' }}>{totals.weatherDays}</p>
            <p className="stat-sub">total lost</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-line-grey flex justify-between items-center">
            <p className="eyebrow">Job-by-Job</p>
            <span className="text-xs text-steel-grey font-mono">{scorecards.length} rows</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-header text-left px-3 py-3">Job</th>
                  <th className="table-header text-center px-3 py-3" colSpan={3}>Man Hours</th>
                  <th className="table-header text-center px-3 py-3" colSpan={3}>Stone</th>
                  <th className="table-header text-center px-3 py-3" colSpan={3}>Binder</th>
                  <th className="table-header text-center px-3 py-3" colSpan={3}>Topping</th>
                  <th className="table-header text-center px-3 py-3" colSpan={3}>Days</th>
                  <th className="table-header text-right px-3 py-3">QBO Profit</th>
                  <th className="table-header text-right px-3 py-3">Margin</th>
                </tr>
                <tr className="bg-mist-grey border-t border-line-grey text-[10px]">
                  <th></th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Est</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Act</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Var</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Est</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Act</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Var</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Est</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Act</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Var</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Est</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Act</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Var</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Est</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Act</th>
                  <th className="px-2 py-1 text-steel-grey uppercase">Var</th>
                  <th></th><th></th>
                </tr>
              </thead>
              <tbody>
                {scorecards.map((sc: any, i: number) => {
                  const mh = { est: num(sc.Est_Man_Hours),  act: num(sc.Act_Man_Hours) };
                  const st = { est: num(sc.Est_Stone_Tons), act: num(sc.Act_Stone_Tons) };
                  const bd = { est: num(sc.Est_Binder_Tons),act: num(sc.Act_Binder_Tons) };
                  const tp = { est: num(sc.Est_Topping_Tons), act: num(sc.Act_Topping_Tons) };
                  const dy = { est: num(sc.Est_Days_On_Site), act: num(sc.Act_Days_On_Site) };
                  const q = qboMap.get(sc.Job_Number.trim());
                  const name = jobMap.get(sc.Job_Number.trim()) || '';
                  // Honest margin: Profit ÷ Act_Income (billed), not Contract.
                  const honestMargin = q && q.Act_Income > 0 ? (q.Profit / q.Act_Income) * 100 : null;
                  return (
                    <tr key={i} className="table-row-zebra border-b border-line-grey">
                      <td className="px-3 py-2">
                        <Link href={`/jobs/${sc.Job_Number}`} className="text-sunbelt-green font-display tracking-wider">{sc.Job_Number}</Link>
                        <div className="text-[11px] text-steel-grey">{name}</div>
                      </td>
                      {[mh, st, bd, tp, dy].map((m, idx) => {
                        const s = statusFor(m.act, m.est);
                        return (
                          <React.Fragment key={idx}>
                            <td className="text-center px-2 py-2 text-[11px] font-mono text-steel-grey">{m.est.toLocaleString()}</td>
                            <td className="text-center px-2 py-2 text-[11px] font-mono" style={{ color: statusColor(s) }}>
                              {s === 'not-reported' ? '—' : m.act.toLocaleString()}
                            </td>
                            <td className="text-center px-2 py-2 text-[11px] font-mono" style={{ color: statusColor(s) }}>
                              {variancePct(m.act, m.est)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                      <td className="text-right px-3 py-2 text-xs font-mono" style={{ color: q ? (q.Profit >= 0 ? '#198754' : '#D8392B') : '#6B7278' }}>
                        {q ? `$${(q.Profit / 1000).toFixed(0)}K` : '—'}
                      </td>
                      <td className="text-right px-3 py-2 text-xs font-mono" style={{ color: honestMargin == null ? '#6B7278' : honestMargin >= 20 ? '#198754' : honestMargin >= 10 ? '#E8892B' : '#D8392B' }}>
                        {honestMargin == null ? '—' : `${honestMargin.toFixed(0)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-steel-grey mt-4">
          Margin shown = Profit ÷ Billed (honest margin-to-date). Jobs with no billings show "—" rather than an inflated number from contract value.
        </p>
      </div>
    </div>
  );
}
