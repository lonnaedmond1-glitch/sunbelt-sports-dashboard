import React from 'react';
export const revalidate = 300;
import Link from 'next/link';
import { getAllRentals } from '@/lib/csv-parser';
import { fetchLiveJobs, fetchLiveRentals, fetchVisionLinkAssets } from '@/lib/sheets-data';

const APPROVED_RENTAL_REP_EMAILS: Record<string, string> = {
  ur: 'jbeasley@ur.com',
  united: 'jbeasley@ur.com',
  united_rentals: 'jbeasley@ur.com',
  'united rentals': 'jbeasley@ur.com',
  sr: 'Justin.Stanley@sunbeltrentals.com',
  sunbelt: 'Justin.Stanley@sunbeltrentals.com',
  sunbelt_rentals: 'Justin.Stanley@sunbeltrentals.com',
  'sunbelt rentals': 'Justin.Stanley@sunbeltrentals.com',
  wm: 'midsouthbuildersdirect@wm.com',
  waste_management: 'midsouthbuildersdirect@wm.com',
  'waste management': 'midsouthbuildersdirect@wm.com',
};

function money(value: number): string {
  return `$${Math.round(value || 0).toLocaleString()}`;
}

function parseRentalDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const startDay = new Date(start); startDay.setHours(0, 0, 0, 0);
  const endDay = new Date(end); endDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((endDay.getTime() - startDay.getTime()) / (1000 * 60 * 60 * 24)));
}

function getRentalStatus(rental: any, days: number, now: Date) {
  const rawStatus = String(rental.Rental_Status || rental.rentalStatus || rental.status || '').toLowerCase();
  const pickupDate = parseRentalDate(rental.Target_Off_Rent || rental.pickupDate || '');
  const calledOffDate = parseRentalDate(rental.Called_Off_Date || rental.calledOffDate || '');
  const dateRented = parseRentalDate(rental.Date_Rented || rental.dateRented || '');
  const pickupIsPast = pickupDate ? pickupDate.getTime() <= now.getTime() : false;

  if (
    calledOffDate ||
    pickupIsPast ||
    /called|off.?rent|off rent|picked.?up|returned|closed|cancel/.test(rawStatus)
  ) {
    return {
      key: 'called_off',
      label: 'Called Off',
      color: '#6D7478',
      billable: false,
      effectiveDays: daysBetween(dateRented, calledOffDate || pickupDate) ?? days,
    };
  }

  if (
    /ordered|not.?delivered|pending|awaiting|scheduled|reserved/.test(rawStatus) ||
    (!dateRented && days === 0)
  ) {
    return {
      key: 'ordered',
      label: 'Ordered / Not Delivered',
      color: '#F5A623',
      billable: false,
      effectiveDays: 0,
    };
  }

  return {
    key: 'on_site',
    label: 'On Site',
    color: '#20BC64',
    billable: true,
    effectiveDays: days,
  };
}

function getRentalRepEmail(rental: any): string {
  if (rental.salesRepEmail) return String(rental.salesRepEmail).trim();
  let map: Record<string, string> = {};
  try {
    map = process.env.RENTAL_SALES_REP_EMAILS ? JSON.parse(process.env.RENTAL_SALES_REP_EMAILS) : {};
  } catch {
    map = {};
  }
  const vendor = String(rental.Vendor || rental.vendor || '').toLowerCase().trim();
  const branch = String(rental.Branch || rental.branch || '').toLowerCase().trim();
  const vendorKey = vendor.replace(/\s+/g, '_');
  const branchKey = branch ? `${vendorKey}:${branch}` : '';
  return (
    (branchKey && map[branchKey]) ||
    map[vendorKey] ||
    map[vendor] ||
    (branchKey && APPROVED_RENTAL_REP_EMAILS[branchKey]) ||
    APPROVED_RENTAL_REP_EMAILS[vendorKey] ||
    APPROVED_RENTAL_REP_EMAILS[vendor] ||
    (vendor.includes('sunbelt') ? process.env.SUNBELT_RENTAL_SALES_REP_EMAIL : '') ||
    (vendor.includes('united') ? process.env.UNITED_RENTAL_SALES_REP_EMAIL : '') ||
    (vendor === 'wm' || vendor.includes('waste management')
      ? process.env.WM_RENTAL_SALES_REP_EMAIL || process.env.WASTE_MANAGEMENT_RENTAL_SALES_REP_EMAIL
      : '') ||
    process.env.RENTAL_DEFAULT_SALES_REP_EMAIL ||
    ''
  ).trim();
}

function callOffHref(rental: any, repEmail: string): string {
  const subject = `Call off rental ${rental.Contract_Number || rental.contractNumber || ''} - ${rental.Equipment_Type || rental.equipmentType || 'equipment'}`;
  const body = [
    'Please call off this rental.',
    '',
    `Vendor: ${rental.Vendor || rental.vendor || ''}`,
    `Contract: ${rental.Contract_Number || rental.contractNumber || ''}`,
    `Equipment: ${rental.Equipment_Type || rental.equipmentType || ''}`,
    `Job: ${rental.jobName || rental.Job_Name_Raw || rental.Job_Number || ''}`,
    `Pickup date on file: ${rental.Target_Off_Rent || rental.pickupDate || ''}`,
    '',
    'Confirm off-rent date and pickup status.',
  ].join('\n');
  return `mailto:${encodeURIComponent(repEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default async function EquipmentPage() {
  const csvRentals = getAllRentals();
  const jobs = await fetchLiveJobs();
  const liveRentals = await fetchLiveRentals();
  const vlAssets = await fetchVisionLinkAssets();

  const isLive = liveRentals.length > 0;

  // Job number / name lookups so rentals can deep-link into job pages.
  const jobNumToName = new Map<string, string>();
  const jobNameToNum = new Map<string, string>();
  jobs.forEach((j: any) => {
    if (j && j.Job_Number) {
      const num = j.Job_Number.trim();
      jobNumToName.set(num, j.Job_Name);
      if (j.Job_Name) jobNameToNum.set(j.Job_Name.trim().toLowerCase(), num);
    }
  });

  // ── RENTALS ─────────────────────────────────────────────────────────────
  const rentals = isLive ? liveRentals.map((r: any) => {
    const rawName = (r.jobName || '').trim();
    const matchedNum = rawName ? jobNameToNum.get(rawName.toLowerCase()) || '' : '';
    return {
      Job_Number: matchedNum,
      Job_Name_Raw: rawName,
      Equipment_Type: r.equipmentType,
      Vendor: r.vendor,
      Branch: r.branch || '',
      Days_On_Site: r.daysOnRent.toString(),
      Target_Off_Rent: r.pickupDate || '',
      Daily_Rate: r.dayRate.toString(),
      Accrued_Amount: String(r.accruedAmount || 0),
      Date_Rented: r.dateRented || '',
      Contract_Number: r.contractNumber,
      Email_Date: r.emailDate || '',
      Synced_At: r.syncedAt || '',
      salesRepEmail: r.salesRepEmail || '',
      Rental_Status: r.rentalStatus || '',
      Ordered_Date: r.orderedDate || '',
      Delivered_Date: r.deliveredDate || '',
      Called_Off_Date: r.calledOffDate || '',
      Status_Notes: r.statusNotes || '',
      isLive: true,
    };
  }) : csvRentals.map(r => ({ ...r, Job_Name_Raw: '', isLive: false }));

  // Dedup — same job + equipment + vendor + contract is one row.
  const seen = new Set<string>();
  const dedupedRentals = rentals.filter((r: any) => {
    const key = [
      (r.Job_Number || r.Job_Name_Raw || '').toString().trim().toLowerCase(),
      (r.Equipment_Type || '').trim().toLowerCase(),
      (r.Vendor || '').trim().toLowerCase(),
      (r.Contract_Number || '').trim().toLowerCase(),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let totalDailyBurn = 0;
  let totalAccruedBurn = 0;
  let overdueCount = 0;
  let missingRateCount = 0;
  let orderedCount = 0;
  let onSiteCount = 0;
  let calledOffCount = 0;
  const now = new Date();

  const enrichedRentals = dedupedRentals.map((r: any) => {
    const days = parseInt(r.Days_On_Site) || 0;
    const rate = parseFloat(r.Daily_Rate) || 0;
    const status = getRentalStatus(r, days, now);
    const accrued = status.key === 'ordered'
      ? 0
      : parseFloat(r.Accrued_Amount) || (status.effectiveDays * rate);
    const dailyBurn = status.billable ? rate : 0;
    const totalBurn = status.billable ? days * rate : accrued;
    const isOverdue = status.key === 'on_site' && days > 30;
    const rateMissing = rate <= 0;

    totalDailyBurn += dailyBurn;
    totalAccruedBurn += accrued;
    if (isOverdue) overdueCount++;
    if (rateMissing && status.key !== 'called_off') missingRateCount++;
    if (status.key === 'ordered') orderedCount++;
    if (status.key === 'on_site') onSiteCount++;
    if (status.key === 'called_off') calledOffCount++;

    const displayName =
      (r.Job_Name_Raw && r.Job_Name_Raw.length > 0)
        ? r.Job_Name_Raw
        : jobNumToName.get((r.Job_Number || '').toString().trim()) || '';

    return {
      ...r,
      days,
      rate,
      accrued,
      dailyBurn,
      rateMissing,
      totalBurn,
      isOverdue,
      status,
      jobName: displayName || 'Unassigned',
      hasJobLink: !!(r.Job_Number && r.Job_Number.toString().trim()),
      dataDate: r.Synced_At || r.Email_Date || '',
    };
  }).sort((a: any, b: any) => {
    const rank: Record<string, number> = { on_site: 0, ordered: 1, called_off: 2 };
    return (rank[a.status.key] - rank[b.status.key]) || (b.totalBurn - a.totalBurn);
  });

  const latestRentalDate = enrichedRentals
    .map((r: any) => parseRentalDate(r.dataDate))
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
  const rentalAge = latestRentalDate ? Math.floor((Date.now() - latestRentalDate.getTime()) / (1000 * 60 * 60 * 24)) : null;
  const rentalDataFresh = isLive && rentalAge != null && rentalAge <= 2;

  // ── OWNED (VisionLink) ──────────────────────────────────────────────────
  const enrichedAssets = vlAssets.map((a: any) => {
    const lastReportedDate = a.Last_Reported ? new Date(a.Last_Reported) : null;
    const daysSince = lastReportedDate && !isNaN(lastReportedDate.getTime())
      ? Math.floor((Date.now() - lastReportedDate.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    let status: { label: string; color: string };
    if (daysSince == null) status = { label: 'No signal', color: '#9CA3AF' };
    else if (daysSince > 30) status = { label: `Stale ${daysSince}d`, color: '#E04343' };
    else if (daysSince > 7) status = { label: `Check (${daysSince}d)`, color: '#F5A623' };
    else status = { label: `Healthy (${daysSince}d)`, color: '#20BC64' };
    return { ...a, daysSince, status };
  }).sort((a: any, b: any) => {
    // Surface stale/missing first
    const aRank = a.daysSince == null ? 999 : a.daysSince;
    const bRank = b.daysSince == null ? 999 : b.daysSince;
    return bRank - aRank;
  });

  const ownedActiveCount = enrichedAssets.filter(a => a.daysSince != null && a.daysSince <= 30).length;

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Equipment</h1>
        <p className="text-[#757A7F] text-sm">Owned heavy equipment vs. rentals. Rental data refreshes every 5 minutes when the Gmail sync sheet is current.</p>
      </header>

      {!isLive && (
        <div className="mb-5 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <span className="text-amber-600 text-lg mt-0.5" aria-hidden>!</span>
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-amber-700">Showing Static CSV Data</p>
            <p className="text-xs text-[#757A7F] mt-0.5">Live rental data from Gmail sync is unavailable. Figures below come from <code className="font-mono">Equipment_On_Rent.csv</code> and may not reflect current on-rent status.</p>
          </div>
        </div>
      )}

      {/* ── 2-COLUMN LAYOUT: OWNED (left) | RENTED (right) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ════════ OWNED ASSETS ════════ */}
        <section className="bg-white rounded-xl border border-[#F1F3F4] shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Owned Equipment</h2>
              <p className="text-[10px] text-[#757A7F] mt-0.5">VisionLink fleet · engine hours + last check-in</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-[#3C4043]">{enrichedAssets.length}</p>
              <p className="text-[10px] text-[#757A7F]/70 font-bold uppercase">{ownedActiveCount} active</p>
            </div>
          </div>

          {enrichedAssets.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-[#757A7F] italic">No VisionLink data yet. Apps Script <code className="font-mono text-[11px]">visionlink_aemp_sync.gs</code> will populate the <code className="font-mono text-[11px]">VisionLink_Live</code> sheet on its next run.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F1F3F4]">
                  <tr>
                    {['Asset', 'Hours', 'Last Reported', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {enrichedAssets.map((a, i) => (
                    <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                      <td className="px-4 py-3">
                        <p className="text-xs font-bold text-[#3C4043]">{a.Asset_Name || a.Asset_ID || '—'}</p>
                        <p className="text-[10px] text-[#757A7F] mt-0.5">{[a.Make, a.Model].filter(Boolean).join(' ') || a.Serial || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-[#3C4043]">
                        {a.Hours ? `${a.Hours.toLocaleString()}h` : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#757A7F]">
                        {a.Last_Reported ? a.Last_Reported.split('T')[0] : '—'}
                      </td>
                      <td className="px-4 py-3 text-xs font-black" style={{ color: a.status.color }}>
                        ● {a.status.label}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ════════ RENTED EQUIPMENT ════════ */}
        <section className="bg-white rounded-xl border border-[#F1F3F4] shadow-sm overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">
                Rentals {isLive && <span className={`ml-1 text-[8px] px-1.5 py-0.5 rounded tracking-normal ${rentalDataFresh ? 'bg-[#20BC64]/20 text-[#20BC64]' : 'bg-[#F5A623]/15 text-[#B7791F]'}`}>{rentalDataFresh ? 'LIVE' : 'STALE'}</span>}
              </h2>
              <p className="text-[10px] text-[#757A7F] mt-0.5">
                {money(totalDailyBurn)} / day burn · {money(totalAccruedBurn)} accumulated
                {rentalAge != null && <span> · updated {rentalAge === 0 ? 'today' : `${rentalAge}d ago`}</span>}
                {' · '}
                <span className="text-[#20BC64] font-bold">{onSiteCount} on site</span>
                {' · '}
                <span className="text-[#F5A623] font-bold">{orderedCount} ordered</span>
                {' · '}
                <span className="text-[#6D7478] font-bold">{calledOffCount} called off</span>
                {' · '}
                {overdueCount > 0 && <span className="text-[#E04343] font-bold">{overdueCount} overdue</span>}
                {overdueCount > 0 && missingRateCount > 0 && ' · '}
                {missingRateCount > 0 && <span className="text-[#F5A623] font-bold">{missingRateCount} missing rate</span>}
                {overdueCount === 0 && missingRateCount === 0 && ' '}
              </p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-[#3C4043]">{enrichedRentals.length}</p>
              <p className="text-[10px] text-[#757A7F]/70 font-bold uppercase">tracked</p>
            </div>
          </div>

          {enrichedRentals.length === 0 ? (
            <div className="p-6">
              <p className="text-sm text-[#757A7F] italic">No active rentals.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F1F3F4]">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Equipment / Vendor</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Job</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Status</th>
                    <th className="text-center px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Days</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Daily Rate</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Burn</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {enrichedRentals.map((r, i) => {
                    const rowTone = r.isOverdue ? 'bg-[#E04343]/5' : r.status.key === 'called_off' ? 'bg-[#F1F3F4]/70' : r.rateMissing ? 'bg-[#F5A623]/5' : '';
                    const repEmail = getRentalRepEmail(r);
                    return (
                      <tr key={i} className={`border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40 ${rowTone}`}>
                        <td className="px-4 py-3">
                          <p className="text-xs font-bold text-[#3C4043]">{r.Equipment_Type || '—'}</p>
                          <p className="text-[10px] text-[#757A7F] mt-0.5">{r.Vendor || ''}</p>
                          {r.Contract_Number && (
                            <p className="text-[9px] text-[#757A7F]/60 font-mono mt-0.5">#{r.Contract_Number}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {r.hasJobLink ? (
                            <Link href={`/jobs/${encodeURIComponent(r.Job_Number.toString().trim())}`} className="text-xs font-bold text-[#20BC64] hover:underline">
                              {r.Job_Number}
                            </Link>
                          ) : (
                            <p className="text-xs font-bold text-[#757A7F] truncate max-w-[140px]" title={r.jobName}>{r.jobName !== 'Unassigned' ? r.jobName : '—'}</p>
                          )}
                          {r.hasJobLink && r.jobName && (
                            <p className="text-[10px] text-[#757A7F] mt-0.5 truncate max-w-[140px]" title={r.jobName}>{r.jobName}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest" style={{ color: r.status.color, backgroundColor: `${r.status.color}18` }}>
                            {r.status.label}
                          </span>
                          {r.Status_Notes && (
                            <p className="mt-1 max-w-[150px] truncate text-[9px] text-[#757A7F]" title={r.Status_Notes}>{r.Status_Notes}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black ${r.isOverdue ? 'bg-[#E04343]/15 text-[#E04343]' : 'bg-[#F1F3F4] text-[#3C4043]/70'}`}>
                            {r.status.effectiveDays}d
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.rateMissing ? (
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#F5A623]" title="No daily rate on file — verify with vendor">
                              MISSING
                            </span>
                          ) : (
                            <p className="text-xs font-bold text-[#3C4043]">${r.rate.toLocaleString()}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status.key === 'ordered' ? (
                            <span className="text-xs text-[#757A7F]/40">$0</span>
                          ) : r.rateMissing ? (
                            <span className="text-xs text-[#757A7F]/40">—</span>
                          ) : (
                            <p className={`text-xs font-black ${r.isOverdue ? 'text-[#E04343]' : 'text-[#3C4043]'}`}>
                              {money(r.accrued || r.totalBurn)}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status.key === 'called_off' ? (
                            <span className="inline-flex rounded-full bg-[#F1F3F4] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#6D7478]">
                              Called Off
                            </span>
                          ) : repEmail ? (
                            <a href={callOffHref(r, repEmail)} className="inline-flex rounded-full bg-[#20BC64] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-[#16a558]">
                              Call Off
                            </a>
                          ) : (
                            <span className="inline-flex rounded-full bg-[#F1F3F4] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-[#9CA3AF]" title="Set a sales rep email in the rental sheet or Vercel env vars.">
                              No Rep
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
