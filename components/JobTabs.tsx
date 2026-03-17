'use client';

import { useState } from 'react';

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
}

const TABS = [
  { id: 'overview', label: 'Overview & Logistics', icon: '📍' },
  { id: 'production', label: 'Production & Reports', icon: '📊' },
  { id: 'changeorders', label: 'Scope & Change Orders', icon: '📝' },
  { id: 'documents', label: 'Documents & QC', icon: '📂' },
];

function WeatherIcon({ short }: { short: string }) {
  const s = (short || '').toLowerCase();
  if (s.includes('thunder')) return <>⛈</>;
  if (s.includes('rain') || s.includes('shower')) return <>🌧</>;
  if (s.includes('snow')) return <>❄️</>;
  if (s.includes('cloud') || s.includes('overcast')) return <>☁️</>;
  if (s.includes('partly')) return <>⛅</>;
  return <>☀️</>;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'Approved') return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>
      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">APPROVED — Scope Added to Contract</span>
    </div>
  );
  if (status === 'Pending') return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 animate-pulse">
      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">⛔ PENDING — DO NOT EXECUTE SCOPE</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25">
      <span className="w-2 h-2 rounded-full bg-red-400 shrink-0"></span>
      <span className="text-[10px] font-black uppercase tracking-widest text-red-400">{status}</span>
    </div>
  );
}

// Extract Google Drive folder ID from URL
function extractDriveFolderId(url: string): string | null {
  if (!url) return null;
  // folders/FOLDER_ID
  const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];
  return null;
}

// Extract Google Drive file ID from URL for iframe embeds
function extractDriveFileId(url: string): string | null {
  if (!url) return null;
  // /file/d/FILE_ID/
  const fileMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];
  // /open?id=FILE_ID
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];
  return null;
}

export default function JobTabs({
  jobNumber, job, report, prep, rentals, changeOrders, scorecard,
  jobFolder, vehicles, weatherDays, asphaltCredit, baseCredit, hasCreditFlag,
  fieldReportFeed, vlAssets,
}: JobTabsProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [qcDone, setQcDone] = useState<Record<string, boolean>>({});
  const [fullscreenDoc, setFullscreenDoc] = useState<string | null>(null);

  const pct = Math.round(job.Pct_Complete || 0);
  const pctColor = pct >= 80 ? '#20BC64' : pct >= 50 ? '#fb923c' : '#ef4444';

  const originalContract = parseFloat(job.Contract_Amount) || 0;
  const approvedCOs = changeOrders
    .filter(co => co.Status === 'Approved')
    .reduce((sum, co) => sum + (parseFloat(co.Amount?.replace?.(/[^0-9.-]/g, '') || '0') || 0), 0);
  const revisedContract = originalContract + approvedCOs;
  const pendingCOs = changeOrders.filter(co => co.Status === 'Pending');
  const approvedCOList = changeOrders.filter(co => co.Status === 'Approved');

  const QC_ITEMS = [
    { id: 'compaction', label: 'Compaction Test', icon: '🔵', desc: 'Nuclear gauge or sand cone results' },
    { id: 'laser', label: 'Laser Grade Verification', icon: '📏', desc: 'Grade rod reads at 25ft grid' },
    { id: 'straightedge', label: '10-ft Straightedge', icon: '📐', desc: 'Smoothness check before pave' },
  ];

  const hasVisionLinkData = vlAssets && vlAssets.length > 0;

  // Google Drive folder ID for embeds
  const driveFolderId = jobFolder?.Job_Folder_Link ? extractDriveFolderId(jobFolder.Job_Folder_Link) : null;

  // Check for individual file links
  const docLinks = [
    { label: 'Contract', link: jobFolder?.Contract_Link, icon: '📄', color: '#20BC64' },
    { label: 'Work Order', link: jobFolder?.Work_Order_Link, icon: '📋', color: '#60a5fa' },
    { label: 'Plans', link: jobFolder?.Plans_Link, icon: '📐', color: '#a78bfa' },
    { label: 'Materials', link: jobFolder?.Material_Resources_Link, icon: '🏗️', color: '#fb923c' },
  ];

  return (
    <div className="flex flex-col min-h-0">

      {/* ── Fullscreen Doc Overlay ──────────────────────────────────────── */}
      {fullscreenDoc && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col">
          <div className="flex justify-between items-center px-4 py-3 bg-[#1e2023] border-b border-white/10">
            <span className="text-white font-black text-sm">📄 Document Viewer</span>
            <button onClick={() => setFullscreenDoc(null)}
              className="px-4 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-black hover:bg-red-500/30 transition-all">
              ✕ Close
            </button>
          </div>
          <iframe src={fullscreenDoc} className="flex-1 w-full" allow="autoplay" />
        </div>
      )}

      {/* ── Sticky KPI Bar ─────────────────────────────────────────────── */}
      <div className="sticky top-[104px] z-40 bg-[#1a1c1f] border-b border-white/8 shadow-lg">
        {hasCreditFlag && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
            <span className="text-amber-400 text-sm">⚠️</span>
            <p className="text-amber-300 font-black text-xs">
              CREDIT FLAG —
              {asphaltCredit !== 'Active' && ` Asphalt (${prep?.Nearest_Asphalt_Plant}): ${asphaltCredit}.`}
              {baseCredit !== 'Active' && ` Quarry (${prep?.Nearest_Quarry}): ${baseCredit}.`}
              {' '} Confirm before scheduling pave.
              <span className="ml-2 text-amber-400/40 text-[9px]">SOURCE: JOB PREP BOARD (Manual)</span>
            </p>
          </div>
        )}

        <div className="flex items-center gap-4 px-4 py-3 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative w-10 h-10">
              <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3"/>
                <circle cx="18" cy="18" r="15" fill="none" stroke={pctColor} strokeWidth="3"
                  strokeDasharray={`${pct * 0.942} 94.2`} strokeLinecap="round"/>
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black" style={{ color: pctColor }}>{pct}%</span>
            </div>
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">Complete</p>
              <p className="text-xs font-black text-white">{pct}%</p>
            </div>
          </div>

          <div className="w-px h-8 bg-white/10 shrink-0"/>

          {[
            { label: 'Contract', value: `$${(originalContract).toLocaleString()}`, color: '#20BC64' },
            { label: 'Billed', value: `$${(job.Billed_To_Date || 0).toLocaleString()}`, color: '#60a5fa' },
            ...(approvedCOs > 0 ? [{ label: 'CO Added', value: `+$${approvedCOs.toLocaleString()}`, color: '#a78bfa' }] : []),
          ].map(kpi => (
            <div key={kpi.label} className="shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{kpi.label}</p>
              <p className="text-xs font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}

          {weatherDays.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/10 shrink-0"/>
              {weatherDays.slice(0, 4).map((period: any, i: number) => {
                const rawDay = (period.name || '').split(' ')[0];
                const dayLabel = rawDay.toLowerCase() === 'tonight' || rawDay.toLowerCase() === 'today' ? 'TODAY'
                  : rawDay.toLowerCase() === 'this' ? 'TODAY'
                  : rawDay.slice(0, 3).toUpperCase();
                return (
                <div key={i} className={`shrink-0 flex flex-col items-center px-2 py-1 rounded-lg ${i === 0 ? 'bg-white/8 border border-white/10' : ''}`}>
                  <p className="text-[9px] font-bold text-white/30 uppercase">{dayLabel}</p>
                  <p className="text-base leading-none my-0.5"><WeatherIcon short={period.shortForecast || ''} /></p>
                  <p className="text-[9px] font-black text-white">{period.temperature}°</p>
                  {period.probabilityOfPrecipitation?.value ? (
                    <p className="text-[8px] text-blue-400 font-bold">{period.probabilityOfPrecipitation.value}%</p>
                  ) : null}
                </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex border-t border-white/6">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2.5 px-2 text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center gap-0.5 ${
                activeTab === tab.id
                  ? 'text-[#20BC64] border-b-2 border-[#20BC64] bg-[#20BC64]/5'
                  : 'text-white/30 hover:text-white/60 hover:bg-white/3'
              }`}
            >
              <span className="text-sm">{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────── */}
      <div className="flex-1 p-4 md:p-6 space-y-5">

        {/* ════ TAB 1: OVERVIEW & LOGISTICS ════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-5">

            {/* Job Intel */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Job Intel</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
                ].filter(i => i.value).map(item => (
                  <div key={item.label} className="p-3 rounded-lg bg-black/20 border border-white/5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/30">{item.label}</p>
                    <p className="text-sm font-bold text-white/80 mt-0.5">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Supply Chain / Vendor Credit */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Supply Chain Status</h2>
                <span className="text-[9px] font-bold text-white/20 px-2 py-1 rounded bg-white/5">SOURCE: JOB PREP BOARD (Manual)</span>
              </div>
              {prep ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex justify-between items-center p-4 rounded-xl bg-black/20 border border-white/5">
                    <div>
                      <p className="text-[10px] font-black uppercase text-white/30 mb-1">Asphalt Plant</p>
                      <p className="text-sm font-bold text-white">{prep.Nearest_Asphalt_Plant}</p>
                    </div>
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full ${asphaltCredit === 'Active' ? 'bg-[#20BC64]/10 text-[#20BC64] border border-[#20BC64]/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      {asphaltCredit}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-4 rounded-xl bg-black/20 border border-white/5">
                    <div>
                      <p className="text-[10px] font-black uppercase text-white/30 mb-1">Quarry</p>
                      <p className="text-sm font-bold text-white">{prep.Nearest_Quarry}</p>
                    </div>
                    <span className={`text-xs font-black px-3 py-1.5 rounded-full ${baseCredit === 'Active' ? 'bg-[#20BC64]/10 text-[#20BC64] border border-[#20BC64]/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                      {baseCredit}
                    </span>
                  </div>
                </div>
              ) : <p className="text-white/20 text-sm">Awaiting Live Data — No supply chain data on file.</p>}
            </div>

            {/* Box A: Owned Assets (VisionLink / Samsara) */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">
                  📡 Owned Assets On Site
                  <span className="ml-2 text-[9px] font-bold text-amber-400/60">VISIONLINK + SAMSARA</span>
                </h2>
                {vehicles.length > 0 && (
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {vehicles.length} Tracked
                  </span>
                )}
              </div>

              {/* VisionLink Fleet Section */}
              {hasVisionLinkData ? (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400/60">VISIONLINK Fleet — {vlAssets.length} Assets</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                    {vlAssets.map((a: any, i: number) => {
                      const isReporting = !!a.Last_Reported;
                      const icon = a.Make === 'BOBCAT' ? '🏗️' : a.Make === 'LEEBOY' ? '🛤️' : a.Make === 'SAKAI' ? '🔨' : a.Make === 'INTERNATIONAL' ? '🚛' : '🚜';
                      return (
                        <div key={i} className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all ${
                          isReporting ? 'bg-black/20 border-emerald-500/10' : 'bg-black/10 border-white/5 opacity-60'
                        }`}>
                          <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/15 flex items-center justify-center text-sm shrink-0">{icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">#{a.Asset_ID} · {a.Make} {a.Model}</p>
                            <p className="text-[10px] text-white/30 truncate">{a.Hours > 0 ? `${a.Hours.toLocaleString()} hrs` : 'No data'}</p>
                          </div>
                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded shrink-0 ${isReporting ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                            {isReporting ? '● LIVE' : '○ OFF'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/15 mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🔗</span>
                    <div>
                      <p className="text-xs font-black text-amber-400">VisionLink — Pending API Provisioning</p>
                      <p className="text-[10px] text-white/30 mt-0.5">Contact your Cat dealer to enable API access. Data scraped manually in the meantime.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Samsara Lowboy / Vehicle Section */}
              {vehicles.length > 0 && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-400/60">SAMSARA Vehicles — {vehicles.length} Near Site</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {vehicles.map((v: any, i: number) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-blue-500/10">
                        <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm shrink-0">🚛</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-white truncate">{v.name?.replace?.(/\s*\(.*\)/, '') || v.name}</p>
                          <p className="text-xs text-white/40 truncate">{v.address || 'Location active'}</p>
                        </div>
                        <span className={`text-[10px] font-black px-2 py-1 rounded-full shrink-0 ${v.speed > 2 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {v.speed > 2 ? `${v.speed} mph` : 'Parked'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!hasVisionLinkData && vehicles.length === 0 && (
                <div className="text-center py-4">
                  <p className="text-white/20 text-sm">No equipment data available.</p>
                </div>
              )}
            </div>

            {/* Box B: Active Rentals — STRICTLY SEPARATE */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">
                  💳 Active Rentals On Site
                  <span className="ml-2 text-[9px] font-bold text-amber-400/60">RENTAL TRACKER</span>
                </h2>
                {rentals.length > 0 && (
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    {rentals.length} Units
                  </span>
                )}
              </div>
              {rentals.length > 0 ? (
                <div className="space-y-3">
                  {(() => {
                    const totalDailyBurn = rentals.reduce((sum, r) => sum + (parseFloat(r.Daily_Rate) || 0), 0);
                    const totalBurnToDate = rentals.reduce((sum, r) => sum + ((parseInt(r.Days_On_Site) || 0) * (parseFloat(r.Daily_Rate) || 0)), 0);
                    return (
                      <div className="flex gap-3 mb-4">
                        <div className="flex-1 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                          <p className="text-[9px] font-black uppercase tracking-widest text-amber-400/60">Daily Burn Rate</p>
                          <p className="text-xl font-black text-amber-400">${totalDailyBurn.toLocaleString()}<span className="text-sm">/day</span></p>
                        </div>
                        <div className="flex-1 p-3 rounded-xl bg-red-500/8 border border-red-500/20">
                          <p className="text-[9px] font-black uppercase tracking-widest text-red-400/60">Total Burn</p>
                          <p className="text-xl font-black text-red-400">${totalBurnToDate.toLocaleString()}</p>
                        </div>
                      </div>
                    );
                  })()}
                  {rentals.map((r, i) => {
                    const days = parseInt(r.Days_On_Site) || 0;
                    const rate = parseFloat(r.Daily_Rate) || 0;
                    const burn = days * rate;
                    const isOverdue = days > 30;
                    return (
                      <div key={i} className={`p-4 rounded-xl border ${isOverdue ? 'bg-red-500/5 border-red-500/20' : 'bg-black/20 border-white/5'}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="text-sm font-black text-white">{r.Equipment_Type}</p>
                            <p className="text-xs text-white/40 mt-0.5">{r.Vendor}</p>
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            <p className="text-lg font-black text-amber-400">${rate.toLocaleString()}<span className="text-xs text-amber-400/50">/day</span></p>
                            <p className={`text-xs font-bold ${isOverdue ? 'text-red-400' : 'text-white/30'}`}>{days}d · ${burn.toLocaleString()} total</p>
                          </div>
                        </div>
                        {isOverdue && (
                          <p className="text-[10px] text-red-400 font-black mt-2">⚠️ OVERDUE — {days - 30} days past 30-day mark. Confirm off-rent.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-white/20 text-sm py-4 text-center">Awaiting Live Data — No rental equipment on file for this job.</p>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB 2: PRODUCTION & FIELD REPORTS ═════════════════════ */}
        {activeTab === 'production' && (
          <div className="space-y-5">

            {/* Production Totals */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Production Totals</h2>
                <span className="text-[9px] font-bold text-white/20 px-2 py-1 rounded bg-white/5">SOURCE: SCORECARD + JOTFORM LIVE</span>
              </div>
              {report ? (
                <div className="space-y-5">
                  {[
                    { label: 'GAB / Base', actual: scorecard ? parseFloat(scorecard.Act_Stone_Tons) || (report.Base_Actual || report.GAB_Tonnage || 0) : (report.Base_Actual || report.GAB_Tonnage || 0), est: scorecard ? parseFloat(scorecard.Est_Stone_Tons) || 0 : 0, unit: 'tons', color: '#20BC64' },
                    { label: 'Asphalt Binder', actual: scorecard ? parseFloat(scorecard.Act_Binder_Tons) || (report.Binder_Tonnage || 0) : (report.Binder_Tonnage || 0), est: scorecard ? parseFloat(scorecard.Est_Binder_Tons) || 0 : 0, unit: 'tons', color: '#60a5fa' },
                    { label: 'Asphalt Topping', actual: scorecard ? parseFloat(scorecard.Act_Topping_Tons) || (report.Topping_Tonnage || 0) : (report.Topping_Tonnage || 0), est: scorecard ? parseFloat(scorecard.Est_Topping_Tons) || 0 : 0, unit: 'tons', color: '#a78bfa' },
                    { label: 'Concrete', actual: report.Concrete_Actual || report.Concrete_CY, est: 0, unit: 'CY', color: '#f472b6' },
                    { label: 'Total Man-Hours', actual: scorecard ? parseFloat(scorecard.Act_Man_Hours) || (report.Total_Man_Hours || 0) : (report.Total_Man_Hours || 0), est: scorecard ? parseFloat(scorecard.Est_Man_Hours) || 0 : 0, unit: 'hrs', color: '#fb923c' },
                    { label: 'Days Active', actual: scorecard ? parseFloat(scorecard.Act_Days_On_Site) || (report.Days_Active || 0) : (report.Days_Active || 0), est: scorecard ? parseFloat(scorecard.Est_Days_On_Site) || 0 : 0, unit: 'days', color: '#fbbf24' },
                  ].map(m => {
                    const act = m.actual || 0;
                    const est = m.est;
                    const pctUsed = est > 0 ? Math.min(130, Math.round((act / est) * 100)) : 0;
                    const isOver = est > 0 && act > est * 1.05;
                    return (
                      <div key={m.label}>
                        <div className="flex justify-between items-end mb-2">
                          <span className="text-xs text-white/50 font-bold">{m.label}</span>
                          <div className="text-right">
                            <span className="text-sm font-black" style={{ color: isOver ? '#ef4444' : m.color }}>{(act || 0).toLocaleString()} {m.unit}</span>
                            {est > 0 && <span className="text-xs text-white/30 ml-2">/ {est.toLocaleString()} est</span>}
                          </div>
                        </div>
                        {est > 0 && (
                          <div className="w-full bg-white/5 rounded-full h-3 overflow-hidden relative">
                            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pctUsed)}%`, backgroundColor: isOver ? '#ef4444' : m.color }} />
                            {isOver && (
                              <div className="absolute right-0 top-0 h-full flex items-center pr-1">
                                <span className="text-[8px] text-red-400 font-black">+{pctUsed - 100}%</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-white/20 text-sm py-4">Awaiting Live Data — No Jotform submissions found for this job.</p>}
            </div>

            {/* FIELD REPORT FEED — Daily submissions */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Daily Field Reports</h2>
                <span className="text-[9px] font-bold text-white/20 px-2 py-1 rounded bg-white/5">SOURCE: JOTFORM API · {fieldReportFeed.length} Reports</span>
              </div>
              {fieldReportFeed.length > 0 ? (
                <div className="space-y-3">
                  {fieldReportFeed.map((entry: any, i: number) => {
                    const d = new Date(entry.date);
                    const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    const hasProduction = entry.gabTons > 0 || entry.binderTons > 0 || entry.toppingTons > 0 || entry.concreteCY > 0;
                    return (
                      <div key={entry.id || i} className="p-4 rounded-xl bg-black/20 border border-white/5">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                              📋 {dateStr}
                            </span>
                            {entry.difficulty && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white/5 text-white/30">{entry.difficulty}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-white/30">
                            {entry.crewCount > 0 && <span>👷 {entry.crewCount} crew</span>}
                            {entry.manHours > 0 && <span>⏱ {entry.manHours}h</span>}
                            {entry.truckCount > 0 && <span>🚛 {entry.truckCount} trucks</span>}
                          </div>
                        </div>

                        {/* Production Grid */}
                        {hasProduction && (
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            {entry.gabTons > 0 && (
                              <div className="p-2 rounded-lg bg-[#20BC64]/5 border border-[#20BC64]/15">
                                <p className="text-[8px] font-black uppercase text-[#20BC64]/60">GAB</p>
                                <p className="text-sm font-black text-[#20BC64]">{entry.gabTons.toLocaleString()}t</p>
                              </div>
                            )}
                            {entry.binderTons > 0 && (
                              <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/15">
                                <p className="text-[8px] font-black uppercase text-blue-400/60">Binder</p>
                                <p className="text-sm font-black text-blue-400">{entry.binderTons.toLocaleString()}t</p>
                              </div>
                            )}
                            {entry.toppingTons > 0 && (
                              <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/15">
                                <p className="text-[8px] font-black uppercase text-purple-400/60">Topping</p>
                                <p className="text-sm font-black text-purple-400">{entry.toppingTons.toLocaleString()}t</p>
                              </div>
                            )}
                            {entry.concreteCY > 0 && (
                              <div className="p-2 rounded-lg bg-pink-500/5 border border-pink-500/15">
                                <p className="text-[8px] font-black uppercase text-pink-400/60">Concrete</p>
                                <p className="text-sm font-black text-pink-400">{entry.concreteCY.toLocaleString()} CY</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Summary */}
                        {entry.summary && entry.summary !== 'no' && (
                          <p className="text-xs text-white/50 leading-relaxed border-t border-white/5 pt-2">{entry.summary}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-white/30 text-sm font-bold">Awaiting Live Data — No field reports submitted for this job.</p>
                  <p className="text-white/15 text-xs mt-1">Foremen submit daily reports via Jotform. Reports appear here automatically.</p>
                </div>
              )}
            </div>

            {/* Scorecard */}
            {scorecard && (
              <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Est vs Actual Scorecard</h2>
                  {parseInt(scorecard.Weather_Days) > 0 && (
                    <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      ☁️ {scorecard.Weather_Days} Weather Days
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {[
                    { label: 'Man Hours', est: parseFloat(scorecard.Est_Man_Hours)||0, act: parseFloat(scorecard.Act_Man_Hours)||0, unit: 'hrs', color: '#fb923c' },
                    { label: 'Stone', est: parseFloat(scorecard.Est_Stone_Tons)||0, act: parseFloat(scorecard.Act_Stone_Tons)||0, unit: 'tons', color: '#a78bfa' },
                    { label: 'Binder', est: parseFloat(scorecard.Est_Binder_Tons)||0, act: parseFloat(scorecard.Act_Binder_Tons)||0, unit: 'tons', color: '#60a5fa' },
                    { label: 'Topping', est: parseFloat(scorecard.Est_Topping_Tons)||0, act: parseFloat(scorecard.Act_Topping_Tons)||0, unit: 'tons', color: '#20BC64' },
                    { label: 'Days', est: parseFloat(scorecard.Est_Days_On_Site)||0, act: parseFloat(scorecard.Act_Days_On_Site)||0, unit: 'days', color: '#f472b6' },
                  ].map(m => {
                    const pctVal = m.est > 0 ? Math.round((m.act / m.est) * 100) : 0;
                    const isOver = m.act > m.est * 1.05;
                    return (
                      <div key={m.label} className="bg-black/20 rounded-xl p-4 border border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: m.color }}>{m.label}</p>
                        <p className="text-xl font-black mb-0.5" style={{ color: isOver ? '#ef4444' : m.color }}>{m.act.toLocaleString()}</p>
                        <p className="text-xs text-white/30">est: {m.est.toLocaleString()} {m.unit}</p>
                        <div className="w-full bg-white/5 rounded-full h-1.5 mt-2 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctVal)}%`, backgroundColor: isOver ? '#ef4444' : m.color }} />
                        </div>
                        <p className="text-[10px] text-right mt-1" style={{ color: isOver ? '#ef4444' : 'rgba(255,255,255,0.2)' }}>{pctVal}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════ TAB 3: SCOPE & CHANGE ORDERS ═══════════════════════════ */}
        {activeTab === 'changeorders' && (
          <div className="space-y-5">

            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Contract Value Summary</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Original Contract</p>
                  <p className="text-xl font-black text-[#20BC64]">${originalContract.toLocaleString()}</p>
                </div>
                <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Approved COs</p>
                  <p className="text-xl font-black text-[#a78bfa]">+${approvedCOs.toLocaleString()}</p>
                </div>
                <div className="rounded-xl p-4 border border-[#20BC64]/20 bg-[#20BC64]/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#20BC64]/60">Revised Contract</p>
                  <p className="text-xl font-black text-[#20BC64]">${revisedContract.toLocaleString()}</p>
                </div>
              </div>
              {pendingCOs.length > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3">
                  <span className="text-amber-400 text-lg shrink-0">⛔</span>
                  <div>
                    <p className="text-amber-300 font-black text-xs">{pendingCOs.length} PENDING CHANGE ORDER{pendingCOs.length > 1 ? 'S' : ''} — DO NOT EXECUTE SCOPE</p>
                    <p className="text-amber-200/50 text-[10px] mt-0.5">Work associated with pending COs cannot be performed until approved by GC. Contact PM immediately.</p>
                  </div>
                </div>
              )}
            </div>

            {pendingCOs.length > 0 && (
              <div className="bg-[#1e2023] rounded-xl border border-amber-500/20 p-5">
                <h2 className="text-xs font-black uppercase tracking-widest text-amber-400/70 mb-4">⛔ Pending — Awaiting Approval</h2>
                <div className="space-y-3">
                  {pendingCOs.map((co, i) => (
                    <div key={i} className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-black text-[#60a5fa]">{co.CO_Number}</span>
                            <span className="text-[10px] text-white/30">{co.Type}</span>
                          </div>
                          <p className="text-sm text-white/70">{co.Description}</p>
                          {co.Notes && <p className="text-xs text-white/30 italic mt-1">{co.Notes}</p>}
                        </div>
                        <p className="text-lg font-black text-amber-400 shrink-0">{co.Amount}</p>
                      </div>
                      <StatusBadge status="Pending" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {approvedCOList.length > 0 && (
              <div className="bg-[#1e2023] rounded-xl border border-emerald-500/15 p-5">
                <h2 className="text-xs font-black uppercase tracking-widest text-emerald-400/60 mb-4">✅ Approved — Scope Added to Contract</h2>
                <div className="space-y-3">
                  {approvedCOList.map((co, i) => (
                    <div key={i} className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-black text-[#60a5fa]">{co.CO_Number}</span>
                            <span className="text-[10px] text-white/30">{co.Type}</span>
                          </div>
                          <p className="text-sm text-white/70">{co.Description}</p>
                          {co.Notes && <p className="text-xs text-white/30 italic mt-1">{co.Notes}</p>}
                        </div>
                        <p className="text-lg font-black text-emerald-400 shrink-0">{co.Amount}</p>
                      </div>
                      <StatusBadge status="Approved" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {changeOrders.length === 0 && (
              <div className="bg-[#1e2023] rounded-xl border border-white/5 p-8 text-center">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-white/40 font-bold">No change orders on file for this job.</p>
              </div>
            )}
          </div>
        )}

        {/* ════ TAB 4: DOCUMENTS & QC ═══════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-5">

            {/* Job Documents — Button Layout */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Job Documents</h2>
                {jobFolder?.Job_Folder_Link && (
                  <a href={jobFolder.Job_Folder_Link} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#20BC64]/10 border border-[#20BC64]/20 text-[#20BC64] text-xs font-black hover:bg-[#20BC64]/20 transition-all">
                    📂 Open Job Folder →
                  </a>
                )}
              </div>
              {jobFolder ? (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Contract', icon: '📄', link: jobFolder.Contract_Link || jobFolder.Job_Folder_Link, color: '#20BC64' },
                    { label: 'Work Order', icon: '📋', link: jobFolder.Work_Order_Link || jobFolder.Job_Folder_Link, color: '#60a5fa' },
                    { label: 'Plans', icon: '📐', link: jobFolder.Plans_Link || jobFolder.Job_Folder_Link, color: '#a78bfa' },
                  ].map(doc => (
                    <a key={doc.label} href={doc.link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-black/20 border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all group cursor-pointer">
                      <span className="text-2xl">{doc.icon}</span>
                      <div>
                        <p className="text-sm font-black" style={{ color: doc.color }}>{doc.label}</p>
                        <p className="text-[10px] text-white/30 group-hover:text-white/50 transition-colors">View in Drive →</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-white/20 text-sm">No Drive folder linked for job {jobNumber}.</p>
                </div>
              )}
            </div>

            {/* ── 🚨 THE SUNBELT WAY: Dynamic Phase QC Checklist ─────────── */}
            {(() => {
              // Phase detection from production data
              const stoneActual = scorecard ? parseFloat(scorecard.Act_Stone_Tons) || 0 : (report?.GAB_Tonnage || 0);
              const stoneEst = scorecard ? parseFloat(scorecard.Est_Stone_Tons) || 0 : 0;
              const binderActual = scorecard ? parseFloat(scorecard.Act_Binder_Tons) || 0 : (report?.Binder_Tonnage || 0);
              const toppingActual = scorecard ? parseFloat(scorecard.Act_Topping_Tons) || 0 : (report?.Topping_Tonnage || 0);
              const toppingEst = scorecard ? parseFloat(scorecard.Est_Topping_Tons) || 0 : 0;
              const concActual = report?.Concrete_Actual || report?.Concrete_CY || 0;
              const pctDone = pct;
              const hasMicromill = (job.Micromill || '').toLowerCase().includes('yes') || (job.Micromill || '').toLowerCase().includes('true');
              const hasMillCap = (job.Track_Surface || '').toLowerCase().includes('mill');

              type PhaseInfo = { phase: string; emoji: string; color: string; borderColor: string; bgColor: string; items: string[] };

              let activePhase: PhaseInfo;

              if (hasMillCap || hasMicromill) {
                activePhase = {
                  phase: 'Mill & Cap',
                  emoji: '🔄',
                  color: 'text-orange-400',
                  borderColor: 'border-orange-500/30',
                  bgColor: 'bg-orange-500/5',
                  items: [
                    'Core a minimum of 12 random locations to verify existing thickness before mobilization.',
                    'ZERO dump trucks/heavy equipment on the field without 3/4" plywood protection.',
                  ],
                };
              } else if (pctDone >= 85 && toppingActual > 0 && toppingEst > 0 && toppingActual >= toppingEst * 0.8) {
                activePhase = {
                  phase: 'Post-Asphalt / QC',
                  emoji: '✅',
                  color: 'text-emerald-400',
                  borderColor: 'border-emerald-500/30',
                  bgColor: 'bg-emerald-500/5',
                  items: [
                    'Conduct a joint walkthrough with the track surfacing contractor.',
                    'Mandatory 10-foot straightedge check for high spots and deviations.',
                    'Complete all necessary grinding and sweep residue before surfacing begins.',
                  ],
                };
              } else if (binderActual > 0 || toppingActual > 0) {
                activePhase = {
                  phase: 'Paving',
                  emoji: '🚧',
                  color: 'text-red-400',
                  borderColor: 'border-red-500/30',
                  bgColor: 'bg-red-500/5',
                  items: [
                    'Paint elevation marks at 30-foot intervals (remember asphalt is 25% thicker loose).',
                    'Use a straightedge continuously to check flatness of the mat during paving.',
                    'Use a digital level to verify proper cross slope.',
                  ],
                };
              } else if (stoneActual > 0) {
                activePhase = {
                  phase: 'Aggregate Base',
                  emoji: '🪨',
                  color: 'text-amber-400',
                  borderColor: 'border-amber-500/30',
                  bgColor: 'bg-amber-500/5',
                  items: [
                    'Laser-grade subgrade before placing stone.',
                    'Active water truck or hydrant MUST be present during installation to prevent segregation.',
                    'Vibratory and 9-tire rollers MUST be used to seal rock against weather.',
                  ],
                };
              } else if (concActual > 0) {
                activePhase = {
                  phase: 'Curbs & Drainage',
                  emoji: '🧱',
                  color: 'text-blue-400',
                  borderColor: 'border-blue-500/30',
                  bgColor: 'bg-blue-500/5',
                  items: [
                    'Curb tolerances: ±1/4 inch for both elevation and horizontal location.',
                    'All concrete forms MUST be set using laser-guided elevations.',
                    'Ensure landing areas do NOT have downhill throwing conditions (Max cross slope 1%).',
                  ],
                };
              } else {
                activePhase = {
                  phase: 'Pre-Construction / Subgrade',
                  emoji: '📐',
                  color: 'text-purple-400',
                  borderColor: 'border-purple-500/30',
                  bgColor: 'bg-purple-500/5',
                  items: [
                    'Measure radius points to verify true 400m track layout.',
                    'Set SINGLE hubs for inside and outside curbs to establish laser control.',
                    'Verify subgrade elevation is within ±0.10 feet of design grade.',
                  ],
                };
              }

              return (
                <div className={`rounded-xl border-2 ${activePhase.borderColor} ${activePhase.bgColor} p-5`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{activePhase.emoji}</span>
                      <div>
                        <h2 className="text-xs font-black uppercase tracking-widest text-amber-400">🚨 The Sunbelt Way</h2>
                        <p className={`text-sm font-black mt-0.5 ${activePhase.color}`}>Active Phase: {activePhase.phase}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-white/20 px-2 py-1 rounded bg-white/5">SOP: JEFF REECE</span>
                  </div>
                  <div className="space-y-3">
                    {activePhase.items.map((item, i) => {
                      const qcKey = `sunbelt_${activePhase.phase}_${i}`;
                      const done = qcDone[qcKey];
                      return (
                        <button key={i} onClick={() => setQcDone(prev => ({ ...prev, [qcKey]: !prev[qcKey] }))}
                          className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all ${done ? 'bg-emerald-500/10 border-emerald-500/25' : 'bg-black/15 border-white/5 hover:border-white/15'}`}>
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-black border transition-all ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/20 text-transparent hover:border-white/40'}`}>
                            ✓
                          </div>
                          <p className={`text-sm leading-relaxed ${done ? 'text-emerald-400/80 line-through' : 'text-white/70'}`}>{item}</p>
                        </button>
                      );
                    })}
                  </div>
                  {activePhase.items.every((_, i) => qcDone[`sunbelt_${activePhase.phase}_${i}`]) && (
                    <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                      <p className="text-emerald-400 font-black text-xs">✅ ALL {activePhase.phase.toUpperCase()} QC ITEMS VERIFIED</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* QC Verification Checklist */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Field QC Verification</h2>
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-white/5 text-white/30">
                  {Object.values(qcDone).filter(Boolean).length}/{QC_ITEMS.length} Complete
                </span>
              </div>
              <p className="text-xs text-white/30 mb-5">Required before every pave. Tap to mark complete then upload proof photo.</p>
              <div className="space-y-3">
                {QC_ITEMS.map(item => {
                  const done = qcDone[item.id];
                  const uploadLink = jobFolder?.Job_Folder_Link || '#';
                  return (
                    <div key={item.id}
                      className={`p-4 rounded-xl border transition-all ${done ? 'bg-emerald-500/8 border-emerald-500/25' : 'bg-black/20 border-white/5 hover:border-white/15'}`}>
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => setQcDone(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all font-black text-sm border ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/20 text-transparent hover:border-emerald-400'}`}>
                          ✓
                        </button>
                        <div className="flex-1">
                          <p className={`text-sm font-black ${done ? 'text-emerald-400' : 'text-white'}`}>
                            {item.icon} {item.label}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
                        </div>
                        <a href={uploadLink} target="_blank" rel="noopener noreferrer"
                          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20BC64]/10 border border-[#20BC64]/20 text-[#20BC64] text-[10px] font-black hover:bg-[#20BC64]/20 transition-all">
                          📤 Upload
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
              {Object.values(qcDone).filter(Boolean).length === QC_ITEMS.length && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-center">
                  <p className="text-emerald-400 font-black text-sm">✅ ALL QC CHECKS COMPLETE — Clear to pave.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
