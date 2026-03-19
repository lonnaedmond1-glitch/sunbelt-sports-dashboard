import React from 'react';
import Link from 'next/link';
import { fetchLiveJobs, fetchLiveFieldReports } from '@/lib/sheets-data';

export const revalidate = 120;

function getJobHealth(job: any, report: any): 'green' | 'amber' | 'red' {
  const pct = job.Pct_Complete || 0;
  const hasReport = !!report;
  if (pct === 0 && !hasReport) return 'red';
  if (pct > 0 && pct < 30 && !hasReport) return 'amber';
  return 'green';
}

const healthColor: Record<string, string> = { green: '#20BC64', amber: '#fb923c', red: '#ef4444' };

export default async function PortfolioPage() {
  const [jobs, fieldReports] = await Promise.all([
    fetchLiveJobs(),
    fetchLiveFieldReports(),
  ]);

  // Build report map
  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) {
    if (r.Job_Number && (!reportMap[r.Job_Number] || r.Date > reportMap[r.Job_Number].Date)) {
      reportMap[r.Job_Number] = r;
    }
  }

  // Stats
  const totalValue = jobs.reduce((s: number, j: any) => s + (j.Contract_Amount || 0), 0);
  const totalBilled = jobs.reduce((s: number, j: any) => s + (j.Billed_To_Date || 0), 0);
  const statusCounts: Record<string, number> = {};
  const stateCounts: Record<string, number> = {};
  jobs.forEach((j: any) => {
    statusCounts[j.Status] = (statusCounts[j.Status] || 0) + 1;
    stateCounts[j.State] = (stateCounts[j.State] || 0) + 1;
  });

  const healthCounts = { green: 0, amber: 0, red: 0 };
  jobs.forEach((j: any) => { healthCounts[getJobHealth(j, reportMap[j.Job_Number])]++; });

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Full Portfolio</h1>
          <p className="text-[#757A7F] text-sm">{jobs.length} jobs across {Object.keys(stateCounts).length} states — ${totalValue.toLocaleString()} total contract value</p>
        </div>
        <Link href="/dashboard" className="text-xs text-[#20BC64] font-bold uppercase hover:text-white transition-colors">← Dashboard</Link>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Total Jobs</p>
          <p className="text-3xl font-black text-[#20BC64]">{jobs.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Contract Value</p>
          <p className="text-3xl font-black">${(totalValue / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Billed to Date</p>
          <p className="text-3xl font-black text-[#60a5fa]">${(totalBilled / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Remaining</p>
          <p className="text-3xl font-black text-[#F5A623]">${((totalValue - totalBilled) / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Health</p>
          <div className="flex gap-3 mt-1">
            {(['green', 'amber', 'red'] as const).map(h => (
              <span key={h} className="text-sm font-black" style={{ color: healthColor[h] }}>
                ● {healthCounts[h]}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Status + State breakdown */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-3">By Status</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
              const color = status === 'Executed' ? '#20BC64' : status === 'Signed' ? '#60a5fa' : status === 'Received' ? '#fb923c' : '#9ca3af';
              return (
                <span key={status} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}30` }}>
                  {status} ({count})
                </span>
              );
            })}
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-3">By State</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stateCounts).sort((a, b) => b[1] - a[1]).map(([state, count]) => (
              <span key={state} className="text-xs font-bold px-3 py-1.5 rounded-full bg-[#F1F3F4] text-[#3C4043]/70 border border-[#3C4043]/15">
                {state} ({count})
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden shadow-md">
        <div className="px-6 py-4 border-b border-[#F1F3F4] bg-black/20 flex justify-between items-center">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">All Jobs — {jobs.length}</h2>
          <span className="text-xs text-[#757A7F]/60 font-bold uppercase">Live Data Feed</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-[#F1F3F4]">
                {['Job #', 'Name', 'General Contractor', 'PM', 'State', 'Status', 'Contract Value', 'Billed', 'Billed %', 'Health'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest text-[#757A7F] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job: any, i: number) => {
                const pct = Math.round(job.Pct_Complete || 0);
                const health = getJobHealth(job, reportMap[job.Job_Number]);
                const statusColor = job.Status === 'Executed' ? '#20BC64' : job.Status === 'Signed' ? '#60a5fa' : job.Status === 'Received' ? '#fb923c' : '#9ca3af';
                return (
                  <tr key={job.Job_Number} className={`border-b border-[#F1F3F4] hover:bg-[#F1F3F4] transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-[#F1F3F4]/50'}`}>
                    <td className="px-4 py-3">
                      <Link href={`/jobs/${job.Job_Number}`} className="text-[#20BC64] font-bold hover:text-white transition-colors text-xs">{job.Job_Number}</Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-[#3C4043] max-w-[200px] truncate text-xs">{job.Job_Name}</td>
                    <td className="px-4 py-3 text-[#757A7F] text-xs truncate max-w-[140px]">{job.General_Contractor}</td>
                    <td className="px-4 py-3 text-[#757A7F] text-xs">{job.Project_Manager}</td>
                    <td className="px-4 py-3"><span className="text-xs bg-[#F1F3F4] rounded px-2 py-0.5 text-[#757A7F]">{job.State}</span></td>
                    <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>{job.Status}</span></td>
                    <td className="px-4 py-3 text-[#3C4043]/70 text-xs font-mono whitespace-nowrap">${(job.Contract_Amount || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-[#3C4043]/70 text-xs font-mono whitespace-nowrap">${(job.Billed_To_Date || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 bg-[#F1F3F4] rounded-full h-1.5 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: healthColor[health] }} />
                        </div>
                        <span className="text-xs text-[#757A7F]">{pct}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-black" style={{ color: healthColor[health] }}>
                        {health === 'green' ? '● OK' : health === 'amber' ? '● Watch' : '● Risk'}
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
  );
}
