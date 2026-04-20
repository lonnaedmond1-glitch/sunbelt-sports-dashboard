import React from 'react';
export const revalidate = 86400;
import Link from 'next/link';
import { fetchLiveJobs, fetchLiveRentals, fetchVisionLinkAssets } from '@/lib/sheets-data';
import { formatDollars, formatDollarsCompact } from '@/lib/format';

export default async function EquipmentPage() {
  const [jobs, liveRentals, vlAssets] = await Promise.all([
    fetchLiveJobs(),
    fetchLiveRentals(),
    fetchVisionLinkAssets(),
  ]);

  const jobNumToName = new Map<string, string>();
  for (const j of jobs as any[]) {
    if (j?.Job_Number) jobNumToName.set(j.Job_Number.trim(), j.Job_Name);
  }

  // ── RENTALS (live only — the rental fetcher now attaches Job_Number via the new join)
  const seen = new Set<string>();
  const rentals = (liveRentals as any[])
    .map(r => {
      const jobNum = (r.Job_Number || '').toString().trim();
      const jobName = jobNum && jobNumToName.get(jobNum) ? jobNumToName.get(jobNum)! : (r.jobName || '').trim();
      const days = parseInt(String(r.daysOnRent ?? '0')) || 0;
      const rate = parseFloat(String(r.dayRate ?? '0')) || 0;
      return {
        Job_Number: jobNum,
        Job_Name: jobName,
        Equipment_Type: r.equipmentType || '',
        Vendor: r.vendor || '',
        Contract_Number: r.contractNumber || '',
        days,
        rate,
        rateMissing: rate <= 0,
        totalBurn: days * rate,
        isOverdue: days > 30,
        pickupDate: r.pickupDate || '',
      };
    })
    .filter(r => {
      const k = [r.Job_Number, r.Job_Name.toLowerCase(), r.Equipment_Type.toLowerCase(), r.Vendor.toLowerCase(), r.Contract_Number.toLowerCase()].join('|');
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.totalBurn - a.totalBurn);

  const totalDailyBurn = rentals.reduce((s, r) => s + r.rate, 0);
  const overdueCount = rentals.filter(r => r.isOverdue).length;
  const missingRateCount = rentals.filter(r => r.rateMissing).length;
  const unmappedCount = rentals.filter(r => !r.Job_Number).length;

  // ── VISIONLINK OWNED ASSETS
  const enrichedAssets = (vlAssets as any[]).map(a => {
    const last = a.Last_Reported ? new Date(a.Last_Reported) : null;
    const daysSince = last && !isNaN(last.getTime())
      ? Math.floor((Date.now() - last.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    let status: { label: string; color: string };
    if (daysSince == null) status = { label: 'No signal', color: '#6B7278' };
    else if (daysSince > 30) status = { label: `Stale ${daysSince}d`, color: '#D8392B' };
    else if (daysSince > 7) status = { label: `Check (${daysSince}d)`, color: '#E8892B' };
    else status = { label: `Healthy (${daysSince}d)`, color: '#198754' };
    return { ...a, daysSince, status };
  }).sort((a, b) => {
    const aR = a.daysSince == null ? 999 : a.daysSince;
    const bR = b.daysSince == null ? 999 : b.daysSince;
    return bR - aR;
  });

  const ownedActive = enrichedAssets.filter(a => a.daysSince != null && a.daysSince <= 30).length;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Equipment</span>
            <h1 className="text-4xl font-display mt-2">Owned And Rented</h1>
            <p className="text-steel-grey text-sm mt-1">
              Owned: VisionLink telematics feed. Rented: Gmail sync → Rentals sheet.
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card card-padded">
            <p className="stat-label">Owned Assets</p>
            <p className="stat-value font-mono">{enrichedAssets.length}</p>
            <p className="stat-sub">{ownedActive} reporting</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">On Rent</p>
            <p className="stat-value font-mono">{rentals.length}</p>
            <p className="stat-sub">{overdueCount} overdue · {missingRateCount} no rate</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Daily Burn</p>
            <p className="stat-value font-mono">{formatDollarsCompact(totalDailyBurn, 1)}</p>
            <p className="stat-sub">per day, all rentals</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Unmapped</p>
            <p className="stat-value font-mono" style={{ color: unmappedCount > 0 ? '#E8892B' : '#198754' }}>{unmappedCount}</p>
            <p className="stat-sub">rentals with no job match</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-grey flex justify-between items-center">
              <div>
                <p className="eyebrow">Owned Equipment</p>
                <p className="text-xs text-steel-grey mt-1">VisionLink fleet · engine hours + last check-in</p>
              </div>
              <span className="font-mono text-xs text-steel-grey">{enrichedAssets.length} assets</span>
            </div>
            {enrichedAssets.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-steel-grey italic">No VisionLink data. The Apps Script populates the VisionLink_Live tab — run it or wait for the scheduled sync.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {['Asset', 'Hours', 'Last Reported', 'Status'].map(h => (
                        <th key={h} className="table-header text-left px-4 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedAssets.map((a, i) => (
                      <tr key={i} className="table-row-zebra border-b border-line-grey">
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{a.Asset_Name || a.Asset_ID || '—'}</p>
                          <p className="text-xs text-steel-grey">{[a.Make, a.Model].filter(Boolean).join(' ') || a.Serial || ''}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-sm">
                          {a.Hours ? `${a.Hours.toLocaleString()}h` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-steel-grey font-mono">
                          {a.Last_Reported ? String(a.Last_Reported).split('T')[0] : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs font-display tracking-wider" style={{ color: a.status.color }}>
                          ● {a.status.label}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-grey flex justify-between items-center">
              <div>
                <p className="eyebrow">Active Rentals</p>
                <p className="text-xs text-steel-grey mt-1">
                  {formatDollars(totalDailyBurn)} / day burn
                  {overdueCount === 0 && missingRateCount === 0 ? ' · all clean' : ''}
                </p>
              </div>
              <span className="font-mono text-xs text-steel-grey">{rentals.length} on rent</span>
            </div>

            {rentals.length === 0 ? (
              <div className="p-6">
                <p className="text-sm text-steel-grey italic">No active rentals found. If you expected some, check that the Sunbelt/United Rentals Live tabs have rows.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header text-left px-4 py-3">Equipment / Vendor</th>
                      <th className="table-header text-left px-4 py-3">Job</th>
                      <th className="table-header text-center px-4 py-3">Days</th>
                      <th className="table-header text-right px-4 py-3">Day Rate</th>
                      <th className="table-header text-right px-4 py-3">Burn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentals.map((r, i) => (
                      <tr key={i} className={`table-row-zebra border-b border-line-grey ${r.isOverdue ? 'bg-danger-red-light/40' : r.rateMissing ? 'bg-alert-orange-light/40' : ''}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-sm">{r.Equipment_Type || '—'}</p>
                          <p className="text-xs text-steel-grey">{r.Vendor}</p>
                          {r.Contract_Number && <p className="text-[10px] text-steel-grey font-mono mt-0.5">#{r.Contract_Number}</p>}
                        </td>
                        <td className="px-4 py-3">
                          {r.Job_Number ? (
                            <>
                              <Link href={`/jobs/${encodeURIComponent(r.Job_Number)}`} className="text-sunbelt-green font-display tracking-wider hover:underline">{r.Job_Number}</Link>
                              {r.Job_Name && <p className="text-[11px] text-steel-grey truncate max-w-[160px]">{r.Job_Name}</p>}
                            </>
                          ) : (
                            <p className="text-xs text-steel-grey italic">unmapped</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={r.isOverdue ? 'pill pill-danger' : 'pill pill-neutral'}>{r.days}d</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs">
                          {r.rateMissing ? <span className="text-alert-orange font-display tracking-wider">NO RATE</span> : formatDollars(r.rate)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-xs" style={{ color: r.isOverdue ? '#D8392B' : undefined }}>
                          {r.rateMissing ? '—' : formatDollars(r.totalBurn)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
