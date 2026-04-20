'use client';

import { useState } from 'react';
import { formatDollars } from '@/lib/format';

interface JobTabsProps {
  jobNumber: string;
  job: any;
  report: any;
  prep: any;
  rentals: any[];
  changeOrders: any[];
  scorecard: any;
  jobFolder: any;
  vehicles: any[];
  weatherDays: any[];
  asphaltCredit: string;
  baseCredit: string;
  hasCreditFlag: boolean;
  fieldReportFeed: any[];
  vlAssets: any[];
  fleetAssets: { equipment: any[]; vehicles: any[] };
  liveRentals: any[];
  scheduleData: any;
}

const TABS = [
  { id: 'overview', label: 'Overview & Logistics' },
  { id: 'production', label: 'Production & Reports' },
  { id: 'changeorders', label: 'Scope & Change Orders' },
  { id: 'documents', label: 'Documents & QC' },
];

// Text label for a short weather forecast string (no emoji).
function weatherLabel(short: string): string {
  const s = (short || '').toLowerCase();
  if (s.includes('thunder')) return 'Storm';
  if (s.includes('rain') || s.includes('shower')) return 'Rain';
  if (s.includes('snow')) return 'Snow';
  if (s.includes('partly')) return 'P. Cloudy';
  if (s.includes('cloud') || s.includes('overcast')) return 'Cloud';
  if (s.includes('fog') || s.includes('mist') || s.includes('haze')) return 'Fog';
  if (s.includes('wind')) return 'Windy';
  return 'Sun';
}

function StatusPill({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'approved') return <span className="pill pill-success">Approved</span>;
  if (s === 'pending') return <span className="pill pill-warning">Pending approval</span>;
  if (s === 'rejected') return <span className="pill pill-danger">Rejected</span>;
  return <span className="pill pill-neutral">{status || 'Unknown'}</span>;
}

// Extract Google Drive folder ID from URL
function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return null;
}

// Extract Google Drive file ID from URL for iframe embeds
function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  return null;
}

// Days between start date and today. Returns null if unparseable.
function daysOnJob(startDate: string): number | null {
  if (!startDate) return null;
  const t = Date.parse(startDate);
  if (isNaN(t)) return null;
  const diff = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff : null;
}

export default function JobTabs({
  jobNumber, job, report, prep, rentals, changeOrders, scorecard,
  jobFolder, vehicles, weatherDays, asphaltCredit, baseCredit, hasCreditFlag,
  fieldReportFeed, vlAssets, fleetAssets, liveRentals, scheduleData,
}: JobTabsProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [qcDone, setQcDone] = useState<Record<string, boolean>>({});
  const [fullscreenDoc, setFullscreenDoc] = useState<string | null>(null);
  const [surfaceReadyAuthorized, setSurfaceReadyAuthorized] = useState<{ by: string; at: string } | null>(null);

  const pct = Math.round(Number(job.Pct_Complete) || 0);

  const originalContract = parseFloat(job.Contract_Amount) || 0;
  const billedToDate = parseFloat(job.Billed_To_Date) || 0;

  const approvedCOs = changeOrders
    .filter(co => co.Status === 'Approved')
    .reduce((sum, co) => sum + (parseFloat(co.Amount?.replace?.(/[^0-9.-]/g, '') || '0') || 0), 0);
  const pendingCOsAmount = changeOrders
    .filter(co => co.Status === 'Pending')
    .reduce((sum, co) => sum + (parseFloat(co.Amount?.replace?.(/[^0-9.-]/g, '') || '0') || 0), 0);
  const revisedContract = originalContract + approvedCOs;
  const pendingCOs = changeOrders.filter(co => co.Status === 'Pending');
  const approvedCOList = changeOrders.filter(co => co.Status === 'Approved');

  // Scorecard — build Est/Act totals. CSV scorecard has per-type tons; QBO fields
  // (Act_Income, Est_Income, Profit) may or may not be present.
  const sc = scorecard || {};
  const estTons =
    (parseFloat(sc.Est_Stone_Tons) || 0) +
    (parseFloat(sc.Est_Binder_Tons) || 0) +
    (parseFloat(sc.Est_Topping_Tons) || 0);
  const actTons =
    (parseFloat(sc.Act_Stone_Tons) || 0) +
    (parseFloat(sc.Act_Binder_Tons) || 0) +
    (parseFloat(sc.Act_Topping_Tons) || 0);
  const estIncome = parseFloat(sc.Est_Income) || 0;
  const actIncome = parseFloat(sc.Act_Income) || 0;
  const profit = parseFloat(sc.Profit) || 0;
  const honestMargin = actIncome > 0 ? (profit / actIncome) * 100 : null;

  // Tonnage variance pill
  let tonsPill: { cls: string; text: string } | null = null;
  if (actTons > 0 && estTons > 0) {
    if (actTons > estTons * 1.05) tonsPill = { cls: 'pill pill-danger', text: `Over by ${Math.round(((actTons - estTons) / estTons) * 100)}%` };
    else if (actTons < estTons * 0.95) tonsPill = { cls: 'pill pill-warning', text: `Under by ${Math.round(((estTons - actTons) / estTons) * 100)}%` };
    else tonsPill = { cls: 'pill pill-success', text: 'On plan' };
  }

  const QC_ITEMS = [
    { id: 'compaction', label: 'Compaction Test', desc: 'Nuclear gauge or sand cone results' },
    { id: 'laser', label: 'Laser Grade Verification', desc: 'Grade rod reads at 25ft grid' },
    { id: 'straightedge', label: '10-ft Straightedge', desc: 'Smoothness check before pave' },
  ];

  // Google Drive folder ID for embeds (kept for future use)
  const driveFolderId = jobFolder?.Job_Folder_Link ? extractDriveFolderId(jobFolder.Job_Folder_Link) : null;
  void driveFolderId;

  // Filter live rentals for this job by Job_Number (set upstream by fetchLiveRentals).
  const jobRentals = (liveRentals || []).filter((r: any) => r.Job_Number === jobNumber);
  const totalDailyBurn = jobRentals.reduce((sum: number, r: any) => sum + (Number(r.dayRate) || 0), 0);
  const totalBurnToDate = jobRentals.reduce(
    (sum: number, r: any) => sum + ((Number(r.daysOnRent) || 0) * (Number(r.dayRate) || 0)),
    0,
  );

  // Assets on site: VisionLink + internal fleet equipment near this job.
  const vlOnSite = (vlAssets || []).filter((a: any) => {
    const jn = (a.jobNumber || a.Job_Number || '').toString().trim();
    return jn && jn === jobNumber;
  });
  const fleetOnSite = (fleetAssets?.equipment || []).filter((e: any) => {
    const jn = (e.jobNumber || e.Job_Number || '').toString().trim();
    return jn && jn === jobNumber;
  });
  const assetsOnSite = [
    ...vlOnSite.map((a: any) => ({
      name: a.displayName || a.assetName || a.name || 'Equipment',
      id: a.assetNum || a.serialNumber || a.id || '',
      source: 'VisionLink',
      driver: a.driver || '',
    })),
    ...fleetOnSite.map((e: any) => ({
      name: e.displayName || e.name || 'Equipment',
      id: e.assetNum || e.id || '',
      source: 'Fleet',
      driver: e.driver || '',
    })),
  ];

  // Last ~10 field reports for the feed table
  const recentReports = (fieldReportFeed || []).slice(0, 10);

  // Crew size today from latest field report
  const crewSizeToday = report?.Crew_Size || report?.crewCount || 0;
  const daysOn = daysOnJob(job.Start_Date);

  // Documents list — only show doc rows whose link is present.
  const docLinks: { label: string; link: string }[] = [];
  if (jobFolder?.Contract_Link) docLinks.push({ label: 'Contract', link: jobFolder.Contract_Link });
  if (jobFolder?.Work_Order_Link) docLinks.push({ label: 'Work Order', link: jobFolder.Work_Order_Link });
  if (jobFolder?.Plans_Link) docLinks.push({ label: 'Plans', link: jobFolder.Plans_Link });
  if (jobFolder?.Material_Resources_Link) docLinks.push({ label: 'Materials', link: jobFolder.Material_Resources_Link });
  // Extras — only include if they actually exist on the folder object.
  if (jobFolder?.Insurance_Link) docLinks.push({ label: 'Insurance', link: jobFolder.Insurance_Link });
  if (jobFolder?.Permits_Link) docLinks.push({ label: 'Permits', link: jobFolder.Permits_Link });

  const surfaceReadyReady = QC_ITEMS.every(q => qcDone[q.id]);

  return (
    <div className="flex flex-col min-h-0">

      {/* ── Fullscreen Doc Overlay ──────────────────────────────────────── */}
      {fullscreenDoc && (
        <div className="fixed inset-0 z-[100] bg-iron-charcoal/90 flex flex-col">
          <div className="flex justify-between items-center px-4 py-3 bg-safety-white border-b border-line-grey">
            <span className="font-display tracking-widest uppercase text-sm text-iron-charcoal">Document Viewer</span>
            <button
              onClick={() => setFullscreenDoc(null)}
              className="btn-secondary text-xs"
            >
              Close
            </button>
          </div>
          <iframe src={fullscreenDoc} className="flex-1 w-full bg-safety-white" allow="autoplay" />
        </div>
      )}

      {/* ── Tab Nav ─────────────────────────────────────────────────────── */}
      <div className="sticky top-[112px] z-40 bg-safety-white border-b border-line-grey">
        <div className="flex overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-5 py-3 font-display tracking-widest uppercase text-xs transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-sunbelt-green border-sunbelt-green'
                  : 'text-steel-grey border-transparent hover:text-iron-charcoal'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-7xl w-full mx-auto">

        {/* ════ TAB 1: OVERVIEW & LOGISTICS ═════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-5">

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card card-padded">
                <p className="stat-label">Contract Value</p>
                <p className="stat-value font-mono mt-1">{formatDollars(originalContract)}</p>
                <p className="stat-sub mt-1">{approvedCOs > 0 ? `+ ${formatDollars(approvedCOs)} approved COs` : 'No approved COs'}</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Billed</p>
                <p className="stat-value font-mono mt-1">
                  {originalContract > 0 ? Math.round((billedToDate / originalContract) * 100) : 0}%
                </p>
                <p className="stat-sub mt-1">{formatDollars(billedToDate)} of {formatDollars(originalContract)}</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Days On Job</p>
                <p className="stat-value font-mono mt-1">{daysOn !== null ? daysOn : '—'}</p>
                <p className="stat-sub mt-1">Since {job.Start_Date || 'start'}</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Crew Today</p>
                <p className="stat-value font-mono mt-1">{crewSizeToday || '—'}</p>
                <p className="stat-sub mt-1">{pct}% complete</p>
              </div>
            </div>

            {/* Credit flag */}
            {hasCreditFlag && (
              <div className="card card-padded border-l-4" style={{ borderLeftColor: '#E8892B' }}>
                <p className="eyebrow" style={{ color: '#E8892B', borderBottomColor: '#E8892B' }}>Credit Hold</p>
                <p className="text-sm text-iron-charcoal mt-2">
                  Confirm vendor credit before scheduling pave.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
                  <div className="flex justify-between items-center p-3 rounded bg-mist-grey">
                    <div>
                      <p className="text-xs text-steel-grey uppercase tracking-wide">Asphalt plant</p>
                      <p className="text-sm text-iron-charcoal">{prep?.Nearest_Asphalt_Plant || 'Unknown'}</p>
                    </div>
                    <span className={asphaltCredit === 'Active' ? 'pill pill-success' : 'pill pill-warning'}>
                      {asphaltCredit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded bg-mist-grey">
                    <div>
                      <p className="text-xs text-steel-grey uppercase tracking-wide">Quarry</p>
                      <p className="text-sm text-iron-charcoal">{prep?.Nearest_Quarry || 'Unknown'}</p>
                    </div>
                    <span className={baseCredit === 'Active' ? 'pill pill-success' : 'pill pill-warning'}>
                      {baseCredit}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Weather */}
            <div className="card card-padded">
              <p className="eyebrow">5-Day Forecast</p>
              {weatherDays.length > 0 ? (
                <div className="grid grid-cols-5 gap-2 mt-4">
                  {weatherDays.slice(0, 5).map((p: any, i: number) => {
                    const rawDay = (p.name || '').split(' ')[0];
                    const dayLabel = rawDay.toLowerCase() === 'tonight' || rawDay.toLowerCase() === 'today' || rawDay.toLowerCase() === 'this'
                      ? 'TODAY'
                      : rawDay.slice(0, 3).toUpperCase();
                    const pop = p.probabilityOfPrecipitation?.value;
                    return (
                      <div key={i} className={`p-3 rounded border ${i === 0 ? 'border-sunbelt-green bg-sunbelt-green/5' : 'border-line-grey bg-mist-grey'}`}>
                        <p className="stat-label text-[10px]">{dayLabel}</p>
                        <p className="text-sm text-iron-charcoal font-medium mt-1">{weatherLabel(p.shortForecast || '')}</p>
                        <p className="font-mono text-base text-iron-charcoal mt-1">{p.temperature}&deg;</p>
                        {pop ? <p className="font-mono text-xs text-info-blue mt-0.5">{pop}% rain</p> : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-steel-grey text-sm italic mt-3">Forecast unavailable for this location.</p>
              )}
            </div>

            {/* Active Rentals */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Active Rentals</p>
                {jobRentals.length > 0 && (
                  <span className="pill pill-neutral">{jobRentals.length} unit{jobRentals.length === 1 ? '' : 's'}</span>
                )}
              </div>
              {jobRentals.length > 0 ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                    <div className="p-4 rounded bg-mist-grey">
                      <p className="stat-label">Daily burn</p>
                      <p className="font-display text-2xl text-iron-charcoal font-mono mt-1">
                        {formatDollars(totalDailyBurn)}
                        <span className="text-sm text-steel-grey"> / day</span>
                      </p>
                    </div>
                    <div className="p-4 rounded bg-mist-grey">
                      <p className="stat-label">Total burn to date</p>
                      <p className="font-display text-2xl text-iron-charcoal font-mono mt-1">
                        {formatDollars(totalBurnToDate)}
                      </p>
                    </div>
                  </div>
                  <div className="overflow-x-auto mt-4">
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="table-header text-left px-3 py-2">Equipment</th>
                          <th className="table-header text-left px-3 py-2">Vendor</th>
                          <th className="table-header text-left px-3 py-2">Contract</th>
                          <th className="table-header text-right px-3 py-2">Day Rate</th>
                          <th className="table-header text-right px-3 py-2">Days On</th>
                          <th className="table-header text-left px-3 py-2">Pickup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {jobRentals.map((r: any, i: number) => {
                          const overdue = Number(r.daysOnRent) > 30;
                          return (
                            <tr key={i} className="table-row-zebra">
                              <td className="px-3 py-2 text-iron-charcoal">{r.equipmentType || '—'}</td>
                              <td className="px-3 py-2 text-iron-charcoal">{r.vendor || '—'}</td>
                              <td className="px-3 py-2 font-mono text-xs text-steel-grey">{r.contractNumber || '—'}</td>
                              <td className="px-3 py-2 text-right font-mono text-iron-charcoal">
                                {Number(r.dayRate) > 0 ? formatDollars(r.dayRate) : '—'}
                              </td>
                              <td className={`px-3 py-2 text-right font-mono ${overdue ? 'text-danger-red' : 'text-iron-charcoal'}`}>
                                {Number(r.daysOnRent) > 0 ? r.daysOnRent : '—'}
                                {overdue && <span className="ml-2 pill pill-danger">Over 30d</span>}
                              </td>
                              <td className="px-3 py-2 text-steel-grey text-xs">{r.pickupDate || 'Open'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-steel-grey text-sm italic mt-3">No active rentals on this job.</p>
              )}
            </div>

            {/* Assets on site */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Assets On Site</p>
                {assetsOnSite.length > 0 && (
                  <span className="pill pill-neutral">{assetsOnSite.length}</span>
                )}
              </div>
              {assetsOnSite.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {assetsOnSite.map((a, i) => (
                    <div key={i} className="p-3 rounded border border-line-grey bg-safety-white">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-iron-charcoal font-medium truncate">{a.name}</p>
                        <span className="pill pill-info">{a.source}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-steel-grey">
                        {a.id && <span className="font-mono">{a.id}</span>}
                        {a.driver && <span>Driver: {a.driver}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-steel-grey text-sm italic mt-3">No equipment currently reported on this job.</p>
              )}
            </div>

            {/* Nearby vehicles (Samsara, 0.5mi radius) */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Nearby Vehicles (0.5 mi)</p>
                {vehicles.length > 0 && (
                  <span className="pill pill-neutral">{vehicles.length}</span>
                )}
              </div>
              {vehicles.length > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header text-left px-3 py-2">Vehicle</th>
                        <th className="table-header text-left px-3 py-2">Driver</th>
                        <th className="table-header text-right px-3 py-2">Speed</th>
                        <th className="table-header text-left px-3 py-2">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vehicles.map((v: any, i: number) => (
                        <tr key={i} className="table-row-zebra">
                          <td className="px-3 py-2 text-iron-charcoal">{v.name}</td>
                          <td className="px-3 py-2 text-iron-charcoal">{v.driver || 'Unassigned'}</td>
                          <td className="px-3 py-2 text-right font-mono text-iron-charcoal">{Math.round(v.speed || 0)} mph</td>
                          <td className="px-3 py-2 text-xs text-steel-grey">{v.address || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-steel-grey text-sm italic mt-3">No Sunbelt vehicles within half a mile of the site right now.</p>
              )}
            </div>

            {/* Job Intel */}
            <div className="card card-padded">
              <p className="eyebrow">Job Details</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                {[
                  { label: 'PM', value: job.Project_Manager },
                  { label: 'GC', value: job.General_Contractor },
                  { label: 'State', value: job.State },
                  { label: 'Track Surface', value: job.Track_Surface },
                  { label: 'Field Events', value: job.Field_Events },
                  { label: 'Micromill', value: job.Micromill },
                  { label: 'Start Date', value: job.Start_Date },
                  { label: 'Status', value: job.Status },
                  { label: 'Contact', value: job.Point_Of_Contact },
                ]
                  .filter(i => i.value)
                  .map(item => (
                    <div key={item.label} className="p-3 rounded bg-mist-grey">
                      <p className="stat-label">{item.label}</p>
                      <p className="text-sm text-iron-charcoal mt-0.5">{item.value}</p>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* ════ TAB 2: PRODUCTION & REPORTS ════════════════════════════ */}
        {activeTab === 'production' && (
          <div className="space-y-5">

            {/* Scorecard comparison */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Estimated vs Actual</p>
                {tonsPill && <span className={tonsPill.cls}>{tonsPill.text}</span>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Tons</p>
                  <p className="stat-value font-mono mt-1">{actTons.toLocaleString()}</p>
                  <p className="stat-sub mt-1">Est: {estTons.toLocaleString()}</p>
                </div>
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Yards Concrete</p>
                  <p className="stat-value font-mono mt-1">
                    {(report?.Yds_Concrete || report?.Concrete_CY || 0).toLocaleString()}
                  </p>
                  <p className="stat-sub mt-1">From latest report</p>
                </div>
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Billed Income</p>
                  <p className="stat-value font-mono mt-1">
                    {actIncome > 0 ? formatDollars(actIncome) : '—'}
                  </p>
                  <p className="stat-sub mt-1">{estIncome > 0 ? `Est: ${formatDollars(estIncome)}` : 'No estimate on file'}</p>
                </div>
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Honest Margin</p>
                  <p className="stat-value font-mono mt-1">
                    {honestMargin === null ? '—' : `${honestMargin.toFixed(1)}%`}
                  </p>
                  <p className="stat-sub mt-1">
                    {profit !== 0 ? `${profit >= 0 ? '+' : ''}${formatDollars(profit)} profit` : 'Profit ÷ Billed'}
                  </p>
                </div>
              </div>
            </div>

            {/* Per-type scorecard breakdown */}
            {scorecard && (
              <div className="card card-padded">
                <p className="eyebrow">Material Scorecard</p>
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header text-left px-3 py-2">Material</th>
                        <th className="table-header text-right px-3 py-2">Estimated</th>
                        <th className="table-header text-right px-3 py-2">Actual</th>
                        <th className="table-header text-right px-3 py-2">% Used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { label: 'Man Hours', est: parseFloat(scorecard.Est_Man_Hours) || 0, act: parseFloat(scorecard.Act_Man_Hours) || 0, unit: 'hrs' },
                        { label: 'Stone Base', est: parseFloat(scorecard.Est_Stone_Tons) || 0, act: parseFloat(scorecard.Act_Stone_Tons) || 0, unit: 'tons' },
                        { label: 'Asphalt Binder', est: parseFloat(scorecard.Est_Binder_Tons) || 0, act: parseFloat(scorecard.Act_Binder_Tons) || 0, unit: 'tons' },
                        { label: 'Asphalt Topping', est: parseFloat(scorecard.Est_Topping_Tons) || 0, act: parseFloat(scorecard.Act_Topping_Tons) || 0, unit: 'tons' },
                        { label: 'Days On Site', est: parseFloat(scorecard.Est_Days_On_Site) || 0, act: parseFloat(scorecard.Act_Days_On_Site) || 0, unit: 'days' },
                      ].map(m => {
                        const pctUsed = m.est > 0 ? Math.round((m.act / m.est) * 100) : 0;
                        const isOver = m.est > 0 && m.act > m.est * 1.05;
                        const isUnder = m.est > 0 && m.act > 0 && m.act < m.est * 0.95;
                        return (
                          <tr key={m.label} className="table-row-zebra">
                            <td className="px-3 py-2 text-iron-charcoal">{m.label}</td>
                            <td className="px-3 py-2 text-right font-mono text-steel-grey">
                              {m.est ? `${m.est.toLocaleString()} ${m.unit}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-iron-charcoal">
                              {m.act ? `${m.act.toLocaleString()} ${m.unit}` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {m.est > 0 ? (
                                <span className={isOver ? 'pill pill-danger' : isUnder ? 'pill pill-warning' : 'pill pill-success'}>
                                  {pctUsed}%
                                </span>
                              ) : (
                                <span className="text-steel-grey">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Recent field reports */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Recent Field Reports</p>
                <span className="text-xs text-steel-grey">{fieldReportFeed.length} on file</span>
              </div>
              {recentReports.length > 0 ? (
                <div className="overflow-x-auto mt-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className="table-header text-left px-3 py-2">Date</th>
                        <th className="table-header text-right px-3 py-2">Crew</th>
                        <th className="table-header text-right px-3 py-2">Man-Hrs</th>
                        <th className="table-header text-right px-3 py-2">Tons</th>
                        <th className="table-header text-right px-3 py-2">Yds</th>
                        <th className="table-header text-left px-3 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentReports.map((e: any, i: number) => {
                        const d = new Date(e.date);
                        const dateStr = isNaN(d.getTime())
                          ? (e.date || '—')
                          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                        const totalTons = (Number(e.gabTons) || 0) + (Number(e.binderTons) || 0) + (Number(e.toppingTons) || 0);
                        return (
                          <tr key={e.id || i} className="table-row-zebra">
                            <td className="px-3 py-2 font-mono text-xs text-iron-charcoal">{dateStr}</td>
                            <td className="px-3 py-2 text-right font-mono text-iron-charcoal">{e.crewCount || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-iron-charcoal">{e.manHours || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-iron-charcoal">{totalTons ? totalTons.toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-iron-charcoal">{e.concreteCY ? Number(e.concreteCY).toLocaleString() : '—'}</td>
                            <td className="px-3 py-2 text-xs text-steel-grey max-w-md truncate" title={e.summary}>
                              {e.summary && e.summary !== 'no' ? e.summary : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-steel-grey text-sm italic mt-3">No field reports submitted for this job yet.</p>
              )}
            </div>

            {/* Latest report detail */}
            {report && (
              <div className="card card-padded">
                <p className="eyebrow">Latest Report</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="p-3 rounded bg-mist-grey">
                    <p className="stat-label">Date</p>
                    <p className="text-sm text-iron-charcoal mt-1">{report.Date || '—'}</p>
                  </div>
                  <div className="p-3 rounded bg-mist-grey">
                    <p className="stat-label">Weather</p>
                    <p className="text-sm text-iron-charcoal mt-1">{report.Weather || '—'}</p>
                  </div>
                  <div className="p-3 rounded bg-mist-grey">
                    <p className="stat-label">Crew Size</p>
                    <p className="text-sm text-iron-charcoal mt-1">{report.Crew_Size || '—'}</p>
                  </div>
                </div>
                {report.Notes && (
                  <div className="mt-4 p-4 rounded bg-mist-grey border-l-4 border-sunbelt-green">
                    <p className="stat-label mb-1">Foreman Notes</p>
                    <p className="text-sm text-iron-charcoal leading-relaxed">{report.Notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════ TAB 3: SCOPE & CHANGE ORDERS ═══════════════════════════ */}
        {activeTab === 'changeorders' && (
          <div className="space-y-5">

            {/* Running totals */}
            <div className="card card-padded">
              <p className="eyebrow">Contract Total</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Original</p>
                  <p className="stat-value font-mono mt-1">{formatDollars(originalContract)}</p>
                </div>
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Approved COs</p>
                  <p className="stat-value font-mono mt-1">+ {formatDollars(approvedCOs)}</p>
                  <p className="stat-sub mt-1">{approvedCOList.length} approved</p>
                </div>
                <div className="p-4 rounded bg-mist-grey">
                  <p className="stat-label">Pending COs</p>
                  <p className="stat-value font-mono mt-1">{formatDollars(pendingCOsAmount)}</p>
                  <p className="stat-sub mt-1">{pendingCOs.length} awaiting approval</p>
                </div>
                <div className="p-4 rounded" style={{ backgroundColor: 'var(--color-sunbelt-green-light)' }}>
                  <p className="stat-label">Revised Total</p>
                  <p className="stat-value font-mono mt-1 text-sunbelt-green">{formatDollars(revisedContract)}</p>
                  <p className="stat-sub mt-1">Original plus approved COs</p>
                </div>
              </div>
            </div>

            {/* Pending */}
            {pendingCOs.length > 0 && (
              <div className="card card-padded border-l-4" style={{ borderLeftColor: '#E8892B' }}>
                <div className="flex items-center justify-between">
                  <p className="eyebrow" style={{ color: '#E8892B', borderBottomColor: '#E8892B' }}>Pending Approval</p>
                  <span className="pill pill-warning">{pendingCOs.length} open</span>
                </div>
                <p className="text-sm text-iron-charcoal mt-2">
                  Pending approval — do not start this scope yet.
                </p>
                <div className="mt-4 space-y-3">
                  {pendingCOs.map((co, i) => (
                    <div key={i} className="p-4 rounded border border-line-grey bg-safety-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-display tracking-widest uppercase text-sm text-iron-charcoal">CO {co.CO_Number}</span>
                            {co.Type && <span className="pill pill-neutral">{co.Type}</span>}
                          </div>
                          <p className="text-sm text-iron-charcoal mt-2">{co.Description}</p>
                          {co.Notes && <p className="text-xs text-steel-grey italic mt-1">{co.Notes}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-display text-xl text-iron-charcoal">{co.Amount}</p>
                          <div className="mt-2"><StatusPill status="Pending" /></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approved */}
            {approvedCOList.length > 0 && (
              <div className="card card-padded">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">Approved &mdash; Scope Added</p>
                  <span className="pill pill-success">{approvedCOList.length} approved</span>
                </div>
                <div className="mt-4 space-y-3">
                  {approvedCOList.map((co, i) => (
                    <div key={i} className="p-4 rounded border border-line-grey bg-safety-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="font-display tracking-widest uppercase text-sm text-iron-charcoal">CO {co.CO_Number}</span>
                            {co.Type && <span className="pill pill-neutral">{co.Type}</span>}
                          </div>
                          <p className="text-sm text-iron-charcoal mt-2">{co.Description}</p>
                          {co.Notes && <p className="text-xs text-steel-grey italic mt-1">{co.Notes}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-mono font-display text-xl text-sunbelt-green">{co.Amount}</p>
                          <div className="mt-2"><StatusPill status="Approved" /></div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {changeOrders.length === 0 && (
              <div className="card card-padded text-center">
                <p className="text-steel-grey text-sm italic">No change orders on file for this job.</p>
              </div>
            )}
          </div>
        )}

        {/* ════ TAB 4: DOCUMENTS & QC ══════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-5">

            {/* Job folder + docs */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Job Documents</p>
                {jobFolder?.Job_Folder_Link && (
                  <a
                    href={jobFolder.Job_Folder_Link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-primary text-xs"
                  >
                    Open Drive Folder
                  </a>
                )}
              </div>
              {docLinks.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                  {docLinks.map(doc => (
                    <a
                      key={doc.label}
                      href={doc.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 rounded border border-line-grey bg-safety-white hover:border-sunbelt-green transition-colors group"
                    >
                      <div>
                        <p className="font-display tracking-widest uppercase text-sm text-iron-charcoal">{doc.label}</p>
                        <p className="text-xs text-steel-grey mt-1">Open in Google Drive</p>
                      </div>
                      <span className="text-sunbelt-green font-display tracking-widest uppercase text-xs group-hover:translate-x-1 transition-transform">
                        View &rarr;
                      </span>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-steel-grey text-sm italic mt-3">
                  {jobFolder ? 'Folder linked, but no specific document links set.' : `No Drive folder linked for job ${jobNumber}.`}
                </p>
              )}
            </div>

            {/* QC Checklist */}
            <div className="card card-padded">
              <div className="flex items-center justify-between">
                <p className="eyebrow">Field QC Checklist</p>
                <span className="pill pill-neutral">
                  {Object.values(qcDone).filter(Boolean).length} / {QC_ITEMS.length} done
                </span>
              </div>
              <p className="text-sm text-steel-grey mt-2">
                Required before every pave. Tap to mark complete, then upload proof.
              </p>
              <div className="mt-4 space-y-3">
                {QC_ITEMS.map(item => {
                  const done = !!qcDone[item.id];
                  const uploadLink = jobFolder?.Job_Folder_Link || '#';
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded border transition-colors ${
                        done ? 'border-sunbelt-green bg-sunbelt-green/5' : 'border-line-grey bg-safety-white'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => setQcDone(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                          aria-pressed={done}
                          aria-label={`Mark ${item.label} ${done ? 'not done' : 'done'}`}
                          className={`w-6 h-6 rounded border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                            done
                              ? 'bg-sunbelt-green border-sunbelt-green text-safety-white'
                              : 'border-steel-grey text-transparent hover:border-iron-charcoal'
                          }`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </button>
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${done ? 'text-sunbelt-green' : 'text-iron-charcoal'}`}>
                            {item.label}
                          </p>
                          <p className="text-xs text-steel-grey mt-0.5">{item.desc}</p>
                        </div>
                        {jobFolder?.Job_Folder_Link && (
                          <a
                            href={uploadLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary text-xs shrink-0"
                          >
                            Upload
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {surfaceReadyReady && (
                <p className="text-sm text-sunbelt-green font-medium mt-4">
                  All QC checks complete. Clear to pave.
                </p>
              )}
            </div>

            {/* Surface Ready authorization */}
            <div className="card card-padded">
              <p className="eyebrow">Surface Ready Authorization</p>
              <p className="text-sm text-steel-grey mt-2">
                Required before the surfacing contractor (Beynon, AstroTurf, Geo Surfaces) may proceed.
              </p>
              {surfaceReadyAuthorized ? (
                <div className="mt-4 p-4 rounded border-l-4 border-sunbelt-green bg-sunbelt-green/5">
                  <p className="font-display tracking-widest uppercase text-sm text-sunbelt-green">
                    Surface Ready &mdash; Authorized
                  </p>
                  <p className="text-sm text-iron-charcoal mt-1">
                    Signed by {surfaceReadyAuthorized.by} on {surfaceReadyAuthorized.at}.
                  </p>
                  <button
                    onClick={() => setSurfaceReadyAuthorized(null)}
                    className="btn-secondary text-xs mt-3"
                  >
                    Revoke
                  </button>
                </div>
              ) : (
                <div className="mt-4">
                  {!surfaceReadyReady && (
                    <p className="text-sm text-alert-orange mb-3">
                      Finish the QC checklist above before authorizing.
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {['Jefferson Reece', 'Pedro De Lara'].map(name => (
                      <button
                        key={name}
                        disabled={!surfaceReadyReady}
                        onClick={() =>
                          setSurfaceReadyAuthorized({
                            by: name,
                            at: new Date().toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            }),
                          })
                        }
                        className={`p-4 rounded border text-left transition-colors ${
                          surfaceReadyReady
                            ? 'border-sunbelt-green bg-sunbelt-green/5 hover:bg-sunbelt-green/10 cursor-pointer'
                            : 'border-line-grey bg-mist-grey cursor-not-allowed opacity-60'
                        }`}
                      >
                        <p className="font-display tracking-widest uppercase text-xs text-steel-grey">Authorize as</p>
                        <p className={`text-base font-medium mt-1 ${surfaceReadyReady ? 'text-sunbelt-green' : 'text-steel-grey'}`}>
                          {name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
