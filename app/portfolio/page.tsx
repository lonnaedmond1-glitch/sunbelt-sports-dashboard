import React from 'react';
import Link from 'next/link';
import { fetchLiveJobs, fetchLiveFieldReports } from '@/lib/sheets-data';
import { formatDollars, formatDollarsCompact } from '@/lib/format';

export const revalidate = 86400;

type Health = 'green' | 'amber' | 'red' | 'gray';

function getJobHealth(job: any, report: any): Health {
  const pct = job.Pct_Complete || 0;
  const hasReport = !!report;
  if (pct === 0 && !hasReport) return 'gray';
  if (pct > 0 && pct < 30 && !hasReport) return 'amber';
  return 'green';
}

const healthColor: Record<Health, string> = {
  green: '#198754',
  amber: '#E8892B',
  red: '#D8392B',
  gray: '#6B7278',
};

const healthLabel: Record<Health, string> = {
  green: 'On Track',
  amber: 'Watch',
  red: 'At Risk',
  gray: 'Not Started',
};

function isJobClosed(job: any): boolean {
  const s = String(job?.Status || '').trim().toLowerCase();
  return s === 'complete' || s === 'closed';
}

function statusPill(status: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'executed') return 'pill pill-success';
  if (s === 'signed') return 'pill pill-info';
  if (s === 'received' || s === 'pending') return 'pill pill-warning';
  return 'pill pill-neutral';
}

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<{ status?: string; state?: string; showClosed?: string }> }) {
  const params = await searchParams;
  const filterStatus = params?.status || '';
  const filterState = params?.state || '';
  const showClosed = params?.showClosed === '1';

  const [allJobs, fieldReports] = await Promise.all([
    fetchLiveJobs(),
    fetchLiveFieldReports(),
  ]);

  const jobs = showClosed ? allJobs : allJobs.filter((j: any) => !isJobClosed(j));

  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) {
    if (r.Job_Number && (!reportMap[r.Job_Number] || r.Date > reportMap[r.Job_Number].Date)) {
      reportMap[r.Job_Number] = r;
    }
  }

  const totalValue = jobs.reduce((s: number, j: any) => s + (j.Contract_Amount || 0), 0);
  const totalBilled = jobs.reduce((s: number, j: any) => s + (j.Billed_To_Date || 0), 0);
  const statusCounts: Record<string, number> = {};
  const stateCounts: Record<string, number> = {};
  jobs.forEach((j: any) => {
    statusCounts[j.Status] = (statusCounts[j.Status] || 0) + 1;
    if (j.State) stateCounts[j.State] = (stateCounts[j.State] || 0) + 1;
  });

  const healthCounts: Record<Health, number> = { green: 0, amber: 0, red: 0, gray: 0 };
  jobs.forEach((j: any) => { healthCounts[getJobHealth(j, reportMap[j.Job_Number])]++; });

  const filtered = jobs.filter((j: any) => (!filterStatus || j.Status === filterStatus) && (!filterState || j.State === filterState));

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Portfolio</span>
            <h1 className="text-4xl font-display mt-2">Every Active Job</h1>
            <p className="text-steel-grey text-sm mt-1">
              {jobs.length} jobs across {Object.keys(stateCounts).length} states — source: Master Job Index (Sports Level 10)
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="card card-padded">
            <p className="stat-label">Open Jobs</p>
            <p className="stat-value text-sunbelt-green">{jobs.length}</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Contract Value</p>
            <p className="stat-value font-mono">{formatDollarsCompact(totalValue)}</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Billed To Date</p>
            <p className="stat-value font-mono">{formatDollarsCompact(totalBilled)}</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Remaining</p>
            <p className="stat-value font-mono" style={{ color: '#E8892B' }}>{formatDollarsCompact(totalValue - totalBilled)}</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Health</p>
            <div className="flex flex-wrap gap-3 mt-2">
              {(['green', 'amber', 'red', 'gray'] as Health[]).map(h => (
                <span key={h} className="font-mono text-sm" style={{ color: healthColor[h] }} title={healthLabel[h]}>
                  ● {healthCounts[h]}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="card card-padded">
            <p className="eyebrow">By Status {filterStatus && <a href="/portfolio" className="text-xs text-steel-grey ml-2 normal-case tracking-normal">(clear)</a>}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                <a href={`/portfolio?status=${encodeURIComponent(status)}`} key={status}
                   className={`${statusPill(status)} ${filterStatus === status ? 'ring-2 ring-offset-1 ring-sunbelt-green' : ''}`}>
                  {status} · {count}
                </a>
              ))}
            </div>
          </div>
          <div className="card card-padded">
            <p className="eyebrow">By State {filterState && <a href="/portfolio" className="text-xs text-steel-grey ml-2 normal-case tracking-normal">(clear)</a>}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).map(([state, count]) => (
                <a href={`/portfolio?state=${encodeURIComponent(state)}`} key={state}
                   className={`pill pill-neutral ${filterState === state ? 'ring-2 ring-offset-1 ring-sunbelt-green' : ''}`}>
                  {state} · {count}
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-6 py-4 border-b border-line-grey flex justify-between items-center">
            <p className="eyebrow">All Jobs · {filtered.length}{showClosed ? '' : ` (${allJobs.length - jobs.length} closed hidden)`}</p>
            <a href={showClosed ? '/portfolio' : '/portfolio?showClosed=1'} className="text-xs font-display tracking-widest uppercase text-sunbelt-green hover:underline">
              {showClosed ? 'Hide closed' : 'Show closed'}
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Job #', 'Name', 'GC', 'PM', 'State', 'Status', 'Contract', 'Billed', 'Billed %', 'Health'].map(h => (
                    <th key={h} className="table-header text-left px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((job: any, i: number) => {
                  const pct = Math.round(job.Pct_Complete || 0);
                  const isActiveFlow = !['Signed', 'Pending', 'Bid'].includes(job.Status);
                  const health: Health = isActiveFlow ? getJobHealth(job, reportMap[job.Job_Number]) : 'gray';
                  return (
                    <tr key={`${job.Job_Number}-${i}`} className="table-row-zebra border-b border-line-grey hover:bg-sunbelt-green-light/40 transition-athletic">
                      <td className="px-4 py-3">
                        <Link href={`/jobs/${job.Job_Number}`} className="text-sunbelt-green font-display tracking-wider hover:underline">{job.Job_Number}</Link>
                      </td>
                      <td className="px-4 py-3 font-medium max-w-[260px] truncate">{job.Job_Name}</td>
                      <td className="px-4 py-3 text-steel-grey text-xs truncate max-w-[160px]">{job.General_Contractor}</td>
                      <td className="px-4 py-3 text-steel-grey text-xs">{job.Project_Manager}</td>
                      <td className="px-4 py-3"><span className="pill pill-neutral">{job.State || '—'}</span></td>
                      <td className="px-4 py-3"><span className={statusPill(job.Status)}>{job.Status}</span></td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{formatDollars(job.Contract_Amount)}</td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{formatDollars(job.Billed_To_Date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-mist-grey rounded-full h-1.5 overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: healthColor[health] }} />
                          </div>
                          <span className="font-mono text-xs text-steel-grey">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-display text-xs tracking-wider" style={{ color: healthColor[health] }}>
                          ● {isActiveFlow ? healthLabel[health] : 'N/A'}
                        </span>
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
