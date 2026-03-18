import React from 'react';
import Link from 'next/link';
import { getAllRentals } from '@/lib/csv-parser';
import { fetchLiveJobs, fetchLiveRentals } from '@/lib/sheets-data';

export default async function EquipmentPage() {
  const csvRentals = getAllRentals();
  const jobs = await fetchLiveJobs();
  const liveRentals = await fetchLiveRentals();

  const isLive = liveRentals.length > 0;
  const rentals = isLive ? liveRentals.map(r => ({
    Job_Number: r.jobName || 'Unknown',
    Equipment_Type: r.equipmentType,
    Vendor: r.vendor,
    Days_On_Site: r.daysOnRent.toString(),
    Target_Off_Rent: r.pickupDate || '',
    Daily_Rate: r.dayRate.toString(),
    Contract_Number: r.contractNumber,
    isLive: true
  })) : csvRentals.map(r => ({ ...r, isLive: false }));

  // Create lookup for Job Names
  const jobMap = new Map();
  jobs.forEach(j => {
    if (j && j.Job_Number) {
      jobMap.set(j.Job_Number.trim(), j.Job_Name);
    }
  });

  // Calculate top-level stats
  const totalActive = rentals.length;
  let totalDailyBurn = 0;
  let overdueCount = 0;

  const enrichedRentals = rentals.map(r => {
    const days = parseInt(r.Days_On_Site) || 0;
    const rate = parseFloat(r.Daily_Rate) || 0;
    const isOverdue = days > 30; // flagging anything over 30 days as overdue
    
    totalDailyBurn += rate;
    if (isOverdue) overdueCount++;

    return {
      ...r,
      days,
      rate,
      totalBurn: days * rate,
      isOverdue,
      jobName: jobMap.get(r.Job_Number.trim()) || 'Unknown Job',
    };
  });

  // Sort by highest current burn cost
  const sortedRentals = enrichedRentals.sort((a, b) => b.totalBurn - a.totalBurn);

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white mb-2">Active Rentals</h1>
          <p className="text-white/40 text-sm">On-rent equipment tracking with daily burn rates and vendor breakdown.</p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-[#1e2023] rounded-xl p-5 border border-white/5 shadow-lg relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-[#20BC64] mb-1">
            Active Rentals {isLive && <span className="ml-1 text-[8px] px-1 bg-[#20BC64]/20 rounded tracking-normal">LIVE</span>}
          </p>
          <p className="text-4xl font-black">{totalActive}</p>
          <div className="absolute right-[-20px] bottom-[-20px] text-[#20BC64]/10 text-8xl font-black">🚜</div>
        </div>

        <div className="bg-[#1e2023] rounded-xl p-5 border border-white/5 shadow-lg relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-[#fb923c] mb-1">Total Daily Burn</p>
          <p className="text-4xl font-black">${totalDailyBurn.toLocaleString()}</p>
          <p className="text-xs text-white/30 mt-1 uppercase font-bold tracking-widest">per day</p>
        </div>

        <div className={`bg-[#1e2023] rounded-xl p-5 border ${overdueCount > 0 ? 'border-red-500/30' : 'border-white/5'} shadow-lg relative overflow-hidden`}>
          <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${overdueCount > 0 ? 'text-red-400' : 'text-blue-400'}`}>Aging Rentals (&gt;30 Days)</p>
          <p className={`text-4xl font-black ${overdueCount > 0 ? 'text-red-500' : 'text-white'}`}>{overdueCount}</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-[#1e2023] rounded-xl border border-white/5 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-white/5 bg-black/20">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#20BC64]">Active Rentals</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/10 border-b border-white/5 text-[10px] uppercase font-black tracking-widest text-white/40">
                <th className="px-6 py-4">Equipment / Vendor</th>
                <th className="px-6 py-4">Job Assigned</th>
                <th className="px-6 py-4 text-center">Days Active</th>
                <th className="px-6 py-4 text-right">Daily Rate</th>
                <th className="px-6 py-4 text-right">Total Burn To Date</th>
                <th className="px-6 py-4 text-center">Target Off-Rent</th>
                <th className="px-6 py-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sortedRentals.map((r, i) => (
                <tr key={i} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${r.isOverdue ? 'bg-red-500/5' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-white">{r.Equipment_Type}</p>
                    <p className="text-xs text-white/40 mt-1">{r.Vendor}</p>
                  </td>
                  <td className="px-6 py-4">
                    {r.isLive ? (
                      <p className="font-bold text-white truncate max-w-[150px]">{r.Job_Number}</p>
                    ) : (
                      <Link href={`/jobs/${encodeURIComponent(r.Job_Number.trim())}`} className="font-bold text-[#60a5fa] hover:underline cursor-pointer">
                        {r.Job_Number}
                      </Link>
                    )}
                    <p className="text-xs text-white/60 mt-1 truncate max-w-[150px]">{r.jobName}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded border font-black text-xs ${r.isOverdue ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-black/20 text-white/60 border-white/10'}`}>
                      {r.days} Days
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-white/70">
                    ${r.rate.toLocaleString()}/day
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className={`font-black ${r.isOverdue ? 'text-red-400' : 'text-[#20BC64]'}`}>
                      ${r.totalBurn.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center text-xs text-white/50 font-bold">
                    {r.Target_Off_Rent || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {r.isOverdue ? (
                      <span className="text-[10px] font-black tracking-widest uppercase text-red-500 flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> Overdue</span>
                    ) : r.days > 14 && r.rate === 0 ? (
                      <span className="text-[10px] font-black tracking-widest uppercase text-amber-400 flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> INACTIVE</span>
                    ) : (
                      <span className="text-[10px] font-black tracking-widest uppercase text-[#20BC64] flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#20BC64]"></span> Active</span>
                    )}
                  </td>
                </tr>
              ))}
              {sortedRentals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-white/30 text-sm">
                    No active equipment on rent.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
