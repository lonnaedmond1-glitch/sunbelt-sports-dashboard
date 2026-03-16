import React from 'react';
import { getAllChangeOrders, getAllJobs } from '@/lib/csv-parser';

function parseAmount(amt: string): number {
  return parseFloat((amt || '0').replace(/[$,\s]/g, '')) || 0;
}

export default async function ChangeOrdersPage() {
  const changeOrders = getAllChangeOrders();
  const jobs = getAllJobs();

  const jobMap = new Map<string, string>();
  jobs.forEach(j => jobMap.set(j.Job_Number.trim(), j.Job_Name));

  const approved = changeOrders.filter(co => co.Status === 'Approved');
  const pending = changeOrders.filter(co => co.Status === 'Pending');
  const rejected = changeOrders.filter(co => co.Status === 'Rejected');

  const totalApproved = approved.reduce((sum, co) => sum + parseAmount(co.Amount), 0);
  const totalPending = pending.reduce((sum, co) => sum + parseAmount(co.Amount), 0);
  const totalRejected = rejected.reduce((sum, co) => sum + parseAmount(co.Amount), 0);

  // Group by job
  const byJob = new Map<string, typeof changeOrders>();
  changeOrders.forEach(co => {
    const key = co.Job_Number.trim();
    if (!byJob.has(key)) byJob.set(key, []);
    byJob.get(key)!.push(co);
  });

  // Group by type
  const byType = new Map<string, number>();
  changeOrders.forEach(co => {
    const type = co.Type || 'Other';
    byType.set(type, (byType.get(type) || 0) + parseAmount(co.Amount));
  });

  const statusColor = (status: string) => {
    if (status === 'Approved') return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (status === 'Pending') return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    return 'bg-red-500/15 text-red-400 border-red-500/30';
  };

  const statusDot = (status: string) => {
    if (status === 'Approved') return 'bg-emerald-500';
    if (status === 'Pending') return 'bg-amber-500 animate-pulse';
    return 'bg-red-500';
  };

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-1">Change Order Log</h1>
        <p className="text-white/40 text-sm">Global change order tracking across all active projects.</p>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <div className="bg-[#1e2023] rounded-xl p-5 border border-white/5 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-1">Total Change Orders</p>
          <p className="text-4xl font-black">{changeOrders.length}</p>
          <p className="text-xs text-white/30 mt-1">{Array.from(byJob.keys()).length} jobs affected</p>
        </div>
        <div className="bg-[#1e2023] rounded-xl p-5 border border-emerald-500/20 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-1">Approved</p>
          <p className="text-4xl font-black text-emerald-400">${totalApproved.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1">{approved.length} change orders</p>
        </div>
        <div className="bg-[#1e2023] rounded-xl p-5 border border-amber-500/20 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-amber-400 mb-1">Pending Approval</p>
          <p className="text-4xl font-black text-amber-400">${totalPending.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1">{pending.length} awaiting decision</p>
        </div>
        <div className="bg-[#1e2023] rounded-xl p-5 border border-red-500/20 shadow-lg">
          <p className="text-xs font-bold uppercase tracking-widest text-red-400 mb-1">Rejected</p>
          <p className="text-4xl font-black text-red-400">${totalRejected.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1">{rejected.length} denied</p>
        </div>
      </div>

      {/* CO Type Breakdown */}
      <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5 mb-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">By Change Order Type</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from(byType.entries()).sort((a, b) => b[1] - a[1]).map(([type, amount]) => (
            <div key={type} className="bg-black/20 rounded-lg p-3 border border-white/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">{type}</p>
              <p className="text-lg font-black text-[#60a5fa]">${amount.toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#1e2023] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 bg-black/20 flex justify-between items-center">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#20BC64]">All Change Orders</h2>
          <span className="text-xs text-white/30 font-bold">{changeOrders.length} total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/10 border-b border-white/5 text-[10px] uppercase font-black tracking-widest text-white/40">
                <th className="px-5 py-3">Job / CO #</th>
                <th className="px-5 py-3">Description</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3">Requested By</th>
                <th className="px-5 py-3 text-center">Date</th>
                <th className="px-5 py-3 text-right">Amount</th>
                <th className="px-5 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {changeOrders.map((co, i) => (
                <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-bold text-[#60a5fa]">{co.Job_Number} — {co.CO_Number}</p>
                    <p className="text-xs text-white/40 mt-0.5">{jobMap.get(co.Job_Number.trim()) || 'Unknown'}</p>
                  </td>
                  <td className="px-5 py-3">
                    <p className="text-white/80 font-medium">{co.Description}</p>
                    {co.Notes && <p className="text-xs text-white/30 mt-0.5 italic">{co.Notes}</p>}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-bold px-2 py-1 rounded bg-white/5 text-white/50 border border-white/10">{co.Type}</span>
                  </td>
                  <td className="px-5 py-3 text-white/60 text-xs font-bold">{co.Requested_By}</td>
                  <td className="px-5 py-3 text-center text-xs text-white/40">{co.Date_Submitted}</td>
                  <td className="px-5 py-3 text-right">
                    <span className="font-black text-white">{co.Amount}</span>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border ${statusColor(co.Status)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot(co.Status)}`}></span>
                      {co.Status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Job Summary */}
      <div className="mt-8">
        <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Change Orders by Job</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from(byJob.entries()).map(([jobNum, cos]) => {
            const jobApproved = cos.filter(c => c.Status === 'Approved').reduce((s, c) => s + parseAmount(c.Amount), 0);
            const jobPending = cos.filter(c => c.Status === 'Pending').reduce((s, c) => s + parseAmount(c.Amount), 0);
            const hasPending = cos.some(c => c.Status === 'Pending');
            return (
              <div key={jobNum} className={`bg-[#1e2023] rounded-xl p-5 border ${hasPending ? 'border-amber-500/20' : 'border-white/5'} shadow-lg`}>
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-black text-[#60a5fa] text-sm">{jobNum}</p>
                    <p className="text-xs text-white/40 mt-0.5">{jobMap.get(jobNum) || 'Unknown'}</p>
                  </div>
                  <span className="text-xs font-black text-white/30">{cos.length} COs</span>
                </div>
                <div className="flex gap-4 mb-3">
                  <div>
                    <p className="text-[10px] text-emerald-400/60 uppercase font-bold">Approved</p>
                    <p className="text-sm font-black text-emerald-400">${jobApproved.toLocaleString()}</p>
                  </div>
                  {jobPending > 0 && (
                    <div>
                      <p className="text-[10px] text-amber-400/60 uppercase font-bold">Pending</p>
                      <p className="text-sm font-black text-amber-400">${jobPending.toLocaleString()}</p>
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  {cos.map((co, j) => (
                    <div key={j} className="flex items-center justify-between text-xs py-1 border-t border-white/5">
                      <span className="text-white/50">{co.CO_Number}: {co.Description.slice(0, 35)}...</span>
                      <span className={`font-bold ${co.Status === 'Approved' ? 'text-emerald-400' : co.Status === 'Pending' ? 'text-amber-400' : 'text-red-400'}`}>{co.Amount}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
