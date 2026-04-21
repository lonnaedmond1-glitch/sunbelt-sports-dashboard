export const revalidate = 300;
import React from 'react';
import Link from 'next/link';
import { fetchProjectScorecardsEstVsAct } from '@/lib/sheets-data';

// Status based on actual vs estimate asphalt tons
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
    case 'on':           return '#198754';
    case 'over':         return '#D8392B';
    case 'under':        return '#2563EB';
    case 'not-reported': return '#6B7278';
    default:             return '#6B7278';
  }
}

export default async function ProjectScorecardPage() {
  const scorecards = await fetchProjectScorecardsEstVsAct();

  const withEst     = scorecards.filter(sc => sc.Est_Asphalt_Tons > 0);
  const reporting   = withEst.filter(sc => sc.Act_Asphalt_Tons > 0 || sc.Man_Hours > 0);
  const notReported = withEst.length - reporting.length;

  const totals = {
    estTons: reporting.reduce((s, sc) => s + sc.Est_Asphalt_Tons, 0),
    actTons: reporting.reduce((s, sc) => s + sc.Act_Asphalt_Tons, 0),
    manHrs:  reporting.reduce((s, sc) => s + sc.Man_Hours, 0),
    avgEff:  reporting.length > 0
      ? reporting.reduce((s, sc) => s + sc.Efficiency, 0) / reporting.length
      : 0,
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">

        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Project Scorecard</span>
            <h1 className="text-4xl font-display mt-2">Estimate vs Actual</h1>
            <p className="text-steel-grey text-sm mt-1">
              Source: SCORECARD DASHBOARD tab · {reporting.length} of {withEst.length} jobs reporting
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        {scorecards.length === 0 && (
          <div className="card card-padded mb-8 border-l-4" style={{ borderLeftColor: '#E8892B' }}>
            <p className="font-display text-lg">No Scorecard Data Yet</p>
            <p className="text-steel-grey text-sm mt-1">
              Populate the SCORECARD DASHBOARD tab with: Job # | Job Name | PM | Status |
              Estimated Asphalt Tons | Actual Asphalt Tons | Variance Tons | Variance % | Man Hours | Efficiency
            </p>
          </div>
        )}

        {notReported > 0 && (
          <div className="card card-padded mb-6 border-l-4" style={{ borderLeftColor: '#E8892B' }}>
            <p className="font-display text-lg">{notReported} job{notReported > 1 ? 's' : ''} with no actuals yet</p>
            <p className="text-steel-grey text-sm mt-1">
              These jobs have estimates but no actual tons or hours entered. Shown as "—" below.
            </p>
          </div>
        )}

        {/* Summary metrics */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Asphalt Tons', est: totals.estTons, act: totals.actTons, unit: 'tons' },
          ].map(m => {
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
            <p className="stat-label">Man Hours</p>
            <p className="stat-value font-mono mt-2">{totals.manHrs.toLocaleString()}</p>
            <p className="stat-sub">across {reporting.length} reporting jobs</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Avg Efficiency</p>
            <p className="stat-value font-mono mt-2"
              style={{ color: totals.avgEff >= 1 ? '#198754' : totals.avgEff > 0 ? '#E8892B' : '#6B7278' }}>
              {totals.avgEff > 0 ? `${(totals.avgEff * 100).toFixed(0)}%` : '—'}
            </p>
            <p className="stat-sub">tons / estimated</p>
          </div>
        </div>

        {/* Job-by-Job table */}
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
                  <th className="table-header text-left px-3 py-3">PM</th>
                  <th className="table-header text-left px-3 py-3">Status</th>
                  <th className="table-header text-right px-3 py-3">Est Tons</th>
                  <th className="table-header text-right px-3 py-3">Act Tons</th>
                  <th className="table-header text-right px-3 py-3">Variance</th>
                  <th className="table-header text-right px-3 py-3">Man Hrs</th>
                  <th className="table-header text-right px-3 py-3">Efficiency</th>
                </tr>
              </thead>
              <tbody>
                {scorecards.map((sc, i) => {
                  const s = statusFor(sc.Act_Asphalt_Tons, sc.Est_Asphalt_Tons);
                  const varDisplay = sc.Variance_Pct !== 0
                    ? `${sc.Variance_Pct > 0 ? '+' : ''}${sc.Variance_Pct.toFixed(0)}%`
                    : sc.Act_Asphalt_Tons === 0 ? '—' : '0%';
                  return (
                    <tr key={i} className="table-row-zebra border-b border-line-grey">
                      <td className="px-3 py-2">
                        <Link href={`/jobs/${sc.Job_Number}`} className="text-sunbelt-green font-display tracking-wider">
                          {sc.Job_Number}
                        </Link>
                        <div className="text-[11px] text-steel-grey">{sc.Job_Name}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-steel-grey">{sc.PM || '—'}</td>
                      <td className="px-3 py-2 text-xs text-steel-grey">{sc.Status || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-steel-grey">
                        {sc.Est_Asphalt_Tons > 0 ? sc.Est_Asphalt_Tons.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: statusColor(s) }}>
                        {s === 'not-reported' ? '—' : sc.Act_Asphalt_Tons.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs" style={{ color: statusColor(s) }}>
                        {varDisplay}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-iron-charcoal">
                        {sc.Man_Hours > 0 ? sc.Man_Hours.toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs"
                        style={{ color: sc.Efficiency >= 1 ? '#198754' : sc.Efficiency > 0 ? '#E8892B' : '#6B7278' }}>
                        {sc.Efficiency > 0 ? `${(sc.Efficiency * 100).toFixed(0)}%` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
