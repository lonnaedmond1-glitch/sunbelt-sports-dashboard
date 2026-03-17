'use client';

import { useState } from 'react';
import Link from 'next/link';

interface JobTabsProps {
  jobNumber: string;
  job: any;
  report: any;
  prep: any;
  rentals: any[];
  changeOrders: any[];
  scorecard: any;
  jobFolder: any;
  vehicles: any[]; // Samsara vehicles nearby
  weatherDays: any[];
  asphaltCredit: string;
  baseCredit: string;
  hasCreditFlag: boolean;
}

const TABS = [
  { id: 'overview', label: 'Overview & Logistics', icon: '📍' },
  { id: 'production', label: 'Production vs. Estimate', icon: '📊' },
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
      <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0"></span>
      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">APPROVED — Scope Added to Contract</span>
    </div>
  );
  if (status === 'Pending') return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 animate-pulse">
      <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"></span>
      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">⛔ PENDING — DO NOT EXECUTE SCOPE</span>
    </div>
  );
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25">
      <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"></span>
      <span className="text-[10px] font-black uppercase tracking-widest text-red-400">{status}</span>
    </div>
  );
}

export default function JobTabs({
  jobNumber, job, report, prep, rentals, changeOrders, scorecard,
  jobFolder, vehicles, weatherDays, asphaltCredit, baseCredit, hasCreditFlag,
}: JobTabsProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [qcDone, setQcDone] = useState<Record<string, boolean>>({});

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

  return (
    <div className="flex flex-col min-h-0">

      {/* ── Sticky KPI Bar ─────────────────────────────────────────────────── */}
      <div className="sticky top-[104px] z-40 bg-[#1a1c1f] border-b border-white/8 shadow-lg">
        {/* Credit/Vendor Alert Banner */}
        {hasCreditFlag && (
          <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
            <span className="text-amber-400 text-sm">⚠️</span>
            <p className="text-amber-300 font-black text-xs">
              CREDIT FLAG —
              {asphaltCredit !== 'Active' && ` Asphalt (${prep?.Nearest_Asphalt_Plant}): ${asphaltCredit}.`}
              {baseCredit !== 'Active' && ` Quarry (${prep?.Nearest_Quarry}): ${baseCredit}.`}
              {' '} Confirm before scheduling pave.
            </p>
          </div>
        )}

        {/* KPIs + Weather strip */}
        <div className="flex items-center gap-4 px-4 py-3 overflow-x-auto no-scrollbar">
          {/* % Complete pill */}
          <div className="flex items-center gap-2 flex-shrink-0">
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

          <div className="w-px h-8 bg-white/10 flex-shrink-0"/>

          {/* Financial KPIs */}
          {[
            { label: 'Contract', value: `$${(originalContract).toLocaleString()}`, color: '#20BC64' },
            { label: 'Billed', value: `$${(job.Billed_To_Date || 0).toLocaleString()}`, color: '#60a5fa' },
            ...(approvedCOs > 0 ? [{ label: 'CO Added', value: `+$${approvedCOs.toLocaleString()}`, color: '#a78bfa' }] : []),
          ].map(kpi => (
            <div key={kpi.label} className="flex-shrink-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-white/30">{kpi.label}</p>
              <p className="text-xs font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}

          {weatherDays.length > 0 && (
            <>
              <div className="w-px h-8 bg-white/10 flex-shrink-0"/>
              {/* Weather strip — compact */}
              {weatherDays.slice(0, 4).map((period: any, i: number) => (
                <div key={i} className={`flex-shrink-0 flex flex-col items-center px-2 py-1 rounded-lg ${i === 0 ? 'bg-white/8 border border-white/10' : ''}`}>
                  <p className="text-[9px] font-bold text-white/30 uppercase">{period.name?.split(' ')[0]?.slice(0,3)}</p>
                  <p className="text-base leading-none my-0.5"><WeatherIcon short={period.shortForecast || ''} /></p>
                  <p className="text-[9px] font-black text-white">{period.temperature}°</p>
                  {period.probabilityOfPrecipitation?.value ? (
                    <p className="text-[8px] text-blue-400 font-bold">{period.probabilityOfPrecipitation.value}%</p>
                  ) : null}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Tab Nav */}
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

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 p-4 md:p-6 space-y-5">

        {/* ════ TAB 1: OVERVIEW & LOGISTICS ════════════════════════════════ */}
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

            {/* Supply Chain */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Supply Chain Status</h2>
              {prep ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex justify-between items-center p-4 rounded-xl bg-black/20 border border-white/5">
                    <div>
                      <p className="text-[10px] font-black uppercase text-white/30 mb-1">Asphalt Plant</p>
                      <p className="text-sm font-bold text-white">{prep.Nearest_Asphalt_Plant}</p>
                      {prep.Asphalt_Mix_Type && <p className="text-xs text-white/40 mt-0.5">Mix: {prep.Asphalt_Mix_Type}</p>}
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
              ) : <p className="text-white/20 text-sm">No supply chain data.</p>}
            </div>

            {/* Box A: Owned Assets */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">
                  📡 Owned Assets On Site
                  <span className="ml-2 text-[9px] font-bold text-blue-400/60">SAMSARA LIVE</span>
                </h2>
                {vehicles.length > 0 && (
                  <span className="text-[10px] font-black px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {vehicles.length} Tracked
                  </span>
                )}
              </div>
              {vehicles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {vehicles.map((v: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-black/20 border border-blue-500/10">
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-sm flex-shrink-0">🚛</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-white truncate">{v.name?.replace?.(/\s*\(.*\)/, '') || v.name}</p>
                        <p className="text-xs text-white/40 truncate">{v.address || 'Location active'}</p>
                      </div>
                      <span className={`text-[10px] font-black px-2 py-1 rounded-full flex-shrink-0 ${v.speed > 2 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {v.speed > 2 ? `${v.speed} mph` : 'Parked'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-white/20 text-sm">No company assets tracked near this site.</p>
                  <p className="text-white/10 text-xs mt-1">Vehicles within 15 miles appear automatically via Samsara GPS.</p>
                </div>
              )}
            </div>

            {/* Box B: Active Rentals — STRICTLY SEPARATE from Box A */}
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
                  {/* Burn Rate Summary */}
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
                          <div className="text-right ml-3 flex-shrink-0">
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
                <p className="text-white/20 text-sm py-4 text-center">No rental equipment on file for this job.</p>
              )}
            </div>
          </div>
        )}

        {/* ════ TAB 2: PRODUCTION VS. ESTIMATE ═════════════════════════════ */}
        {activeTab === 'production' && (
          <div className="space-y-5">

            {/* Production Totals */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Production Totals — Jotform Live</h2>
              {report ? (
                <div className="space-y-5">
                  {[
                    { label: 'GAB / Base', actual: report.Base_Actual || report.GAB_Tonnage, est: scorecard ? parseFloat(scorecard.Est_Stone_Tons) || 0 : 0, unit: 'tons', color: '#20BC64' },
                    { label: 'Asphalt Binder', actual: report.Binder_Tonnage || 0, est: scorecard ? parseFloat(scorecard.Est_Binder_Tons) || 0 : 0, unit: 'tons', color: '#60a5fa' },
                    { label: 'Asphalt Topping', actual: report.Topping_Tonnage || 0, est: scorecard ? parseFloat(scorecard.Est_Topping_Tons) || 0 : 0, unit: 'tons', color: '#a78bfa' },
                    { label: 'Concrete', actual: report.Concrete_Actual || report.Concrete_CY, est: 0, unit: 'CY', color: '#f472b6' },
                    { label: 'Total Man-Hours', actual: report.Total_Man_Hours, est: scorecard ? parseFloat(scorecard.Est_Man_Hours) || 0 : 0, unit: 'hrs', color: '#fb923c' },
                    { label: 'Days Active', actual: report.Days_Active, est: scorecard ? parseFloat(scorecard.Est_Days_On_Site) || 0 : 0, unit: 'days', color: '#fbbf24' },
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
                  {report.Latest_Summary && (
                    <div className="mt-2 p-4 rounded-xl bg-black/20 border border-white/5">
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2">Latest Field Summary</p>
                      <p className="text-sm text-white/70 leading-relaxed">{report.Latest_Summary}</p>
                    </div>
                  )}
                </div>
              ) : <p className="text-white/20 text-sm py-4">No Jotform submissions found for this job.</p>}
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

        {/* ════ TAB 3: SCOPE & CHANGE ORDERS ═══════════════════════════════ */}
        {activeTab === 'changeorders' && (
          <div className="space-y-5">

            {/* Contract Value Summary */}
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
                <div className="bg-black/20 rounded-xl p-4 border border-[#20BC64]/20 bg-[#20BC64]/5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#20BC64]/60">Revised Contract</p>
                  <p className="text-xl font-black text-[#20BC64]">${revisedContract.toLocaleString()}</p>
                </div>
              </div>
              {pendingCOs.length > 0 && (
                <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3">
                  <span className="text-amber-400 text-lg flex-shrink-0">⛔</span>
                  <div>
                    <p className="text-amber-300 font-black text-xs">{pendingCOs.length} PENDING CHANGE ORDER{pendingCOs.length > 1 ? 'S' : ''} — DO NOT EXECUTE SCOPE</p>
                    <p className="text-amber-200/50 text-[10px] mt-0.5">Work associated with pending COs cannot be performed until approved by GC. Contact PM immediately.</p>
                  </div>
                </div>
              )}
            </div>

            {/* Pending COs */}
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
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-black text-amber-400">{co.Amount}</p>
                        </div>
                      </div>
                      <StatusBadge status="Pending" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Approved COs */}
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
                        <p className="text-lg font-black text-emerald-400 flex-shrink-0">{co.Amount}</p>
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

        {/* ════ TAB 4: DOCUMENTS & QC ═══════════════════════════════════════ */}
        {activeTab === 'documents' && (
          <div className="space-y-5">

            {/* Job Folder */}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Contract', icon: '📄', link: jobFolder.Contract_Link || jobFolder.Job_Folder_Link, color: '#20BC64' },
                    { label: 'Work Order', icon: '📋', link: jobFolder.Work_Order_Link || jobFolder.Job_Folder_Link, color: '#60a5fa' },
                    { label: 'Plans', icon: '📐', link: jobFolder.Plans_Link || jobFolder.Job_Folder_Link, color: '#a78bfa' },
                    { label: 'Materials', icon: '🏗️', link: jobFolder.Material_Resources_Link || jobFolder.Job_Folder_Link, color: '#fb923c' },
                  ].map(doc => (
                    <a key={doc.label} href={doc.link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 rounded-xl bg-black/20 border border-white/5 hover:border-white/20 hover:bg-white/5 transition-all group">
                      <span className="text-2xl">{doc.icon}</span>
                      <div>
                        <p className="text-sm font-black" style={{ color: doc.color }}>{doc.label}</p>
                        <p className="text-[10px] text-white/30 group-hover:text-white/50">View in Drive →</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4">
                  <p className="text-white/20 text-sm">No Drive folder linked for job {jobNumber}.</p>
                  <p className="text-white/10 text-xs mt-1">Add Job_Folder_Link to the Job_Folders CSV to enable this.</p>
                </div>
              )}
            </div>

            {/* QC Verification Checklist */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Field QC Verification</h2>
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-white/5 text-white/30">
                  {Object.values(qcDone).filter(Boolean).length}/{QC_ITEMS.length} Complete
                </span>
              </div>
              <p className="text-xs text-white/30 mb-5">Required before every pave. Tap to mark complete and open upload.</p>
              <div className="space-y-3">
                {QC_ITEMS.map(item => {
                  const done = qcDone[item.id];
                  const uploadLink = jobFolder?.Job_Folder_Link
                    ? `${jobFolder.Job_Folder_Link}`
                    : '#';
                  return (
                    <div key={item.id}
                      className={`p-4 rounded-xl border transition-all ${done ? 'bg-emerald-500/8 border-emerald-500/25' : 'bg-black/20 border-white/5 hover:border-white/15'}`}>
                      <div className="flex items-start gap-4">
                        <button
                          onClick={() => setQcDone(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-all font-black text-sm border ${done ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-white/20 text-transparent hover:border-emerald-400'}`}>
                          ✓
                        </button>
                        <div className="flex-1">
                          <p className={`text-sm font-black ${done ? 'text-emerald-400' : 'text-white'}`}>
                            {item.icon} {item.label}
                          </p>
                          <p className="text-xs text-white/40 mt-0.5">{item.desc}</p>
                        </div>
                        {/* Upload button → direct to job folder */}
                        <a href={uploadLink} target="_blank" rel="noopener noreferrer"
                          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#20BC64]/10 border border-[#20BC64]/20 text-[#20BC64] text-[10px] font-black hover:bg-[#20BC64]/20 transition-all">
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

            {/* Quick Jotform Link */}
            <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Field Reports</h2>
              <a href="https://form.jotform.com/240915802348154" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-4 p-5 rounded-xl bg-black/20 border border-white/5 hover:border-[#20BC64]/30 hover:bg-[#20BC64]/5 transition-all group">
                <div className="w-12 h-12 rounded-xl bg-[#20BC64]/10 border border-[#20BC64]/20 flex items-center justify-center text-2xl flex-shrink-0">📋</div>
                <div className="flex-1">
                  <p className="text-sm font-black text-white group-hover:text-[#20BC64] transition-colors">Submit Field Report</p>
                  <p className="text-xs text-white/30 mt-0.5">Jotform · Daily production, tonnage, crew count</p>
                </div>
                <span className="text-[#20BC64] text-lg group-hover:translate-x-1 transition-transform">→</span>
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
