import React from 'react';
export const revalidate = 86400; // Daily ISR
import Link from 'next/link';
import { getAllRentals } from '@/lib/csv-parser';
import { fetchLiveJobs, fetchLiveRentals, fetchVisionLinkAssets } from '@/lib/sheets-data';

export default async function EquipmentPage() {
  const csvRentals = getAllRentals();
  const jobs = await fetchLiveJobs();
  const liveRentals = await fetchLiveRentals();
  const vlAssets = await fetchVisionLinkAssets();

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
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">

      {/* CSV fallback warning -- shown when live Gmail rental sync is unavailable */}
      {!isLive && (
        <div className='mb-5 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3'>
          <span className='text-amber-400 text-lg mt-0.5'>&#9888;</span>
          <div>
            <p className='text-xs font-black uppercase tracking-widest text-amber-400'>Showing Static CSV Data</p>
            <p className='text-xs text-white/40 mt-0.5'>Live rental data from Gmail sync is unavailable. Figures below come from Equipment_On_Rent.csv and may not reflect current on-rent status.</p>
          </div>
        </div>
      )}
      {/* API Connection Status Banners */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="flex items-center gap-3 bg-[#1a1a2e] border border-[#F1F3F4]/20 rounded-lg px-4 py-3">
          <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
          <div>
            <p className="text-sm font-bold text-white">Samsara API</p>
            <p className="text-xs text-[#757A7F]">Connected &mdash; Fleet GPS live</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1a2e] border border-yellow-600/40 rounded-lg px-4 py-3">
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
          <div>
            <p className="text-sm font-bold text-white">Sunbelt Rentals API</p>
            <p className="text-xs text-yellow-400">Pending &mdash; awaiting credentials</p>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-[#1a1a2e] border border-yellow-600/40 rounded-lg px-4 py-3">
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
          <div>
            <p className="text-sm font-bold text-white">Sunbelt Sports Fleet</p>
            <p className="text-xs text-yellow-400">Pending &mdash; integration in progress</p>
          </div>
        </div>
      </div>
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-2">Active Rentals</h1>
          <p className="text-[#757A7F] text-sm">On-rent equipment tracking with daily burn rates and vendor breakdown.</p>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4] shadow-lg relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-[#20BC64] mb-1">
            Active Rentals {isLive && <span className="ml-1 text-[8px] px-1 bg-[#20BC64]/20 rounded tracking-normal">LIVE</span>}
          </p>
          <p className="text-4xl font-black">{totalActive}</p>
          <div className="absolute right-[-20px] bottom-[-20px] text-[#20BC64]/10 text-8xl font-black">ð</div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4] shadow-lg relative overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-widest text-[#fb923c] mb-1">Total Daily Burn</p>
          <p className="text-4xl font-black">${totalDailyBurn.toLocaleString()}</p>
          <p className="text-xs text-[#757A7F] mt-1 uppercase font-bold tracking-widest">per day</p>
        </div>

        <div className={`bg-white rounded-xl p-5 border ${overdueCount > 0 ? 'border-red-500/30' : 'border-[#F1F3F4]'} shadow-lg relative overflow-hidden`}>
          <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${overdueCount > 0 ? 'text-[#E04343]' : 'text-blue-600'}`}>Aging Rentals (&gt;30 Days)</p>
          <p className={`text-4xl font-black ${overdueCount > 0 ? 'text-[#E04343]' : 'text-white'}`}>{overdueCount}</p>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden shadow-md">
        <div className="px-6 py-4 border-b border-[#F1F3F4] bg-black/20">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#20BC64]">Active Rentals</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-black/10 border-b border-[#F1F3F4] text-[10px] uppercase font-black tracking-widest text-[#757A7F]">
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
                <tr key={i} className={`border-b border-[#F1F3F4] hover:bg-[#F1F3F4] transition-colors ${r.isOverdue ? 'bg-[#E04343]/5' : ''}`}>
                  <td className="px-6 py-4">
                    <p className="font-bold text-[#3C4043]">{r.Equipment_Type}</p>
                    <p className="text-xs text-[#757A7F] mt-1">{r.Vendor}</p>
                  </td>
                  <td className="px-6 py-4">
                    {r.isLive ? (
                      <p className="font-bold text-white truncate max-w-[150px]">{r.Job_Number}</p>
                    ) : (
                      <Link href={`/jobs/${encodeURIComponent(r.Job_Number.trim())}`} className="font-bold text-[#60a5fa] hover:underline cursor-pointer">
                        {r.Job_Number}
                      </Link>
                    )}
                    <p className="text-xs text-[#3C4043]/70 mt-1 truncate max-w-[150px]">{r.jobName}</p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-block px-3 py-1 rounded border font-black text-xs ${r.isOverdue ? 'bg-[#E04343]/20 text-[#E04343] border-red-500/30' : 'bg-black/20 text-[#3C4043]/70 border-[#3C4043]/15'}`}>
                      {r.days} Days
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-bold text-white/70">
                    ${r.rate.toLocaleString()}/day
                  </td>
                  <td className="px-6 py-4 text-right">
                    <p className={`font-black ${r.isOverdue ? 'text-[#E04343]' : 'text-[#20BC64]'}`}>
                      ${r.totalBurn.toLocaleString()}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center text-xs text-[#757A7F] font-bold">
                    {r.Target_Off_Rent || 'N/A'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {r.isOverdue ? (
                      <span className="text-[10px] font-black tracking-widest uppercase text-[#E04343] flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#E04343]"></span> Overdue</span>
                    ) : r.days > 14 && r.rate === 0 ? (
                      <span className="text-[10px] font-black tracking-widest uppercase text-[#F5A623] flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#F5A623]"></span> INACTIVE</span>
                    ) : (
                      <span className="text-[10px] font-black tracking-widest uppercase text-[#20BC64] flex items-center justify-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#20BC64]"></span> Active</span>
                    )}
                  </td>
                </tr>
              ))}
              {sortedRentals.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-[#757A7F] text-sm">
                    No active equipment on rent.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* ── VisionLink Equipment Health ────────────────────────── */}
      <div className="mt-8 bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">VisionLink Equipment Health</h2>
            <p className="text-xs text-[#757A7F] mt-0.5">Owned heavy equipment — engine hours, last telematics check-in. Service thresholds: yellow at 200h+, red at 500h+ since last report.</p>
          </div>
          <span className="text-[10px] text-[#757A7F]/60 font-bold uppercase">{vlAssets.length > 0 ? `${vlAssets.length} assets` : 'Awaiting VisionLink integration'}</span>
        </div>
        {vlAssets.length === 0 ? (
          <div className="p-5 bg-amber-500/5 border-t border-amber-500/20">
            <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">No Equipment Data</p>
            <p className="text-xs text-[#757A7F]">Drop <code className="font-mono text-[11px]">VisionLink_Assets.csv</code> into the <code className="font-mono text-[11px]">/data</code> folder (columns: Asset_ID, Make, Model, Serial, Hours, Last_Reported) or wire the VisionLink API to populate this table.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F1F3F4]">
                <tr>
                  {['Asset ID', 'Make', 'Model', 'Serial', 'Hours', 'Last Reported', 'Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vlAssets.map((a, i) => {
                  // Compute staleness from Last_Reported
                  const lastReportedDate = a.Last_Reported ? new Date(a.Last_Reported) : null;
                  const daysSince = lastReportedDate && !isNaN(lastReportedDate.getTime())
                    ? Math.floor((Date.now() - lastReportedDate.getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  let status = { label: 'Unknown', color: '#9CA3AF' };
                  if (daysSince == null) status = { label: 'No signal', color: '#9CA3AF' };
                  else if (daysSince > 30) status = { label: `Stale ${daysSince}d`, color: '#E04343' };
                  else if (daysSince > 7) status = { label: `Check (${daysSince}d)`, color: '#F5A623' };
                  else status = { label: `Healthy (${daysSince}d)`, color: '#20BC64' };
                  return (
                    <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                      <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{a.Asset_ID}</td>
                      <td className="px-3 py-2 text-xs text-[#757A7F]">{a.Make}</td>
                      <td className="px-3 py-2 text-xs text-[#757A7F]">{a.Model}</td>
                      <td className="px-3 py-2 text-xs font-mono text-[#757A7F]">{a.Serial || '—'}</td>
                      <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{a.Hours ? a.Hours.toLocaleString() + ' h' : '—'}</td>
                      <td className="px-3 py-2 text-xs text-[#757A7F]">{a.Last_Reported || '—'}</td>
                      <td className="px-3 py-2 text-xs font-black" style={{ color: status.color }}>● {status.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
