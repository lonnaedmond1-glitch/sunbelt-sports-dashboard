import React from 'react';
import Link from 'next/link';
import { getPrepForJob, getRentalsForJob, getFieldReportForJob, getJobByNumber, getChangeOrdersForJob, getScorecardForJob, getJobFolder } from '@/lib/csv-parser';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

async function getLiveJobData(jobNumber: string) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sync/jobs`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data || []).find((j: any) => j.Job_Number?.trim() === jobNumber.trim()) || null;
  } catch { return null; }
}

async function getLiveFieldReport(jobNumber: string) {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sync/field-reports`, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return (json.data || []).find((r: any) => r.Job_Number?.trim() === jobNumber.trim()) || null;
  } catch { return null; }
}

async function getWeather(lat: string, lng: string) {
  if (!lat || !lng) return null;
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, { next: { revalidate: 3600 } });
    if (!pointRes.ok) return null;
    const pointData = await pointRes.json();
    const forecastUrl = pointData?.properties?.forecast;
    if (!forecastUrl) return null;
    const fcRes = await fetch(forecastUrl, { next: { revalidate: 3600 } });
    if (!fcRes.ok) return null;
    const fcData = await fcRes.json();
    return fcData?.properties?.periods?.slice(0, 10) || null;
  } catch { return null; }
}

export default async function JobSnapshot({ params }: { params: Promise<{ id: string }> }) {
  const { id: jobNumber } = await params;
  const [liveJob, liveReport] = await Promise.all([getLiveJobData(jobNumber), getLiveFieldReport(jobNumber)]);

  const csvJob = getJobByNumber(jobNumber);
  const prep = getPrepForJob(jobNumber);
  const rentals = getRentalsForJob(jobNumber);
  const csvReport = getFieldReportForJob(jobNumber);
  const changeOrders = getChangeOrdersForJob(jobNumber);
  const scorecard = getScorecardForJob(jobNumber);
  const jobFolder = getJobFolder(jobNumber);

  const job = liveJob || (csvJob ? { Job_Name: csvJob.Job_Name, General_Contractor: '', Point_Of_Contact: '', Project_Manager: csvJob.Project_Manager, State: csvJob.Location, Status: csvJob.Status, Start_Date: csvJob.Start_Date, Contract_Amount: 0, Billed_To_Date: 0, Pct_Complete: 0, Lat: '', Lng: '' } : null);

  const weatherPeriods = job ? await getWeather(job.Lat || '', job.Lng || '') : null;
  const weatherDays = weatherPeriods ? weatherPeriods.filter((_: any, i: number) => i % 2 === 0).slice(0, 5) : [];

  const report = liveReport || (csvReport ? { GAB_Tonnage: parseFloat(csvReport.Base_Actual), Binder_Tonnage: 0, Topping_Tonnage: parseFloat(csvReport.Asphalt_Actual), Concrete_CY: parseFloat(csvReport.Concrete_Actual), Base_Actual: parseFloat(csvReport.Base_Actual), Asphalt_Actual: parseFloat(csvReport.Asphalt_Actual), Concrete_Actual: parseFloat(csvReport.Concrete_Actual), Crew_Count: 0, Total_Man_Hours: 0, Days_Active: 0, Latest_Summary: '' } : null);

  const asphaltCredit = prep?.Asphalt_Credit_Status || 'Unknown';
  const baseCredit = prep?.Base_Credit_Status || 'Unknown';
  const hasCreditFlag = asphaltCredit === 'Pending' || asphaltCredit === 'Missing' || baseCredit === 'Pending' || baseCredit === 'Missing';

  function getWeatherIcon(short: string) {
    const s = short.toLowerCase();
    if (s.includes('thunder')) return '⛈';
    if (s.includes('rain') || s.includes('shower')) return '🌧';
    if (s.includes('snow')) return '❄️';
    if (s.includes('cloud') || s.includes('overcast')) return '☁️';
    if (s.includes('partly')) return '⛅';
    return '☀️';
  }

  if (!job) {
    return (
      <div className="min-h-screen bg-[#2A2D31] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white/40 text-6xl mb-4">🔍</p>
          <p className="text-white font-bold text-xl">Job {jobNumber} not found</p>
          <Link href="/dashboard" className="mt-4 inline-block text-[#20BC64] font-bold hover:underline">← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans flex flex-col pb-10 antialiased">

      {/* HEADER */}
      <header className="flex flex-col w-full sticky top-0 z-50 shadow-2xl">
        <div className="px-8 py-4 bg-[#2A2D31] flex justify-between items-center">
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 bg-[#20BC64] rounded-lg flex items-center justify-center font-black text-white text-sm">S</div>
            <span className="text-white/60 font-bold text-sm uppercase tracking-wide">← Dashboard</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#20BC64] animate-pulse"></div>
            <span className="text-xs text-white/40 font-bold uppercase tracking-widest">Live</span>
          </div>
        </div>
        <div className="bg-[#1e2023] px-8 py-4 border-y border-white/5">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-white">{job.Job_Name}</h1>
              <p className="text-white/40 text-sm mt-0.5">
                <span className="mr-3">Job {jobNumber}</span>
                {job.General_Contractor && <span className="mr-3">GC: {job.General_Contractor}</span>}
                {job.Point_Of_Contact && <span className="mr-3">Contact: {job.Point_Of_Contact}</span>}
                {job.Project_Manager && <span>PM: {job.Project_Manager}</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-black px-3 py-1.5 rounded-full bg-[#20BC64]/10 text-[#20BC64] border border-[#20BC64]/20">{job.State}</span>
              <span className="text-xs font-black px-3 py-1.5 rounded-full bg-white/5 text-white/50">{job.Status}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col gap-5 w-full max-w-[1920px] mx-auto p-6">

        {/* CREDIT ALERT */}
        {hasCreditFlag && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
            <span className="text-amber-400 text-xl">⚠️</span>
            <div>
              <p className="text-amber-300 font-black text-sm">CREDIT FLAG DETECTED</p>
              <p className="text-amber-200/60 text-xs mt-0.5">
                {asphaltCredit !== 'Active' && `Asphalt Plant (${prep?.Nearest_Asphalt_Plant}): ${asphaltCredit}. `}
                {baseCredit !== 'Active' && `Quarry (${prep?.Nearest_Quarry}): ${baseCredit}.`}
                {' '}Confirm credit status before scheduling pave.
              </p>
            </div>
          </div>
        )}

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Contract Value', value: `$${(job.Contract_Amount || 0).toLocaleString()}`, color: '#20BC64' },
            { label: 'Billed To Date', value: `$${(job.Billed_To_Date || 0).toLocaleString()}`, color: '#60a5fa' },
            { label: '% Complete', value: `${Math.round(job.Pct_Complete || 0)}%`, color: job.Pct_Complete >= 80 ? '#20BC64' : job.Pct_Complete >= 50 ? '#fb923c' : '#ef4444' },
            { label: 'Crew (Max)', value: report?.Crew_Count?.toString() || '—', color: '#a78bfa' },
            { label: 'Days Active', value: report?.Days_Active?.toString() || '—', color: '#fb923c' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#1e2023] rounded-xl p-4 border border-white/5 shadow-lg">
              <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-1">{kpi.label}</p>
              <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* WEATHER */}
        {weatherDays.length > 0 && (
          <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">5-Day Forecast</h2>
            <div className="grid grid-cols-5 gap-3">
              {weatherDays.map((period: any, i: number) => (
                <div key={i} className={`rounded-xl p-3 text-center border ${i === 0 ? 'border-[#20BC64]/40 bg-[#20BC64]/5' : 'border-white/5 bg-black/20'}`}>
                  <p className="text-xs font-bold text-white/40 uppercase">{period.name?.split(' ')[0]}</p>
                  <p className="text-2xl my-2">{getWeatherIcon(period.shortForecast || '')}</p>
                  <p className="text-lg font-black text-white">{period.temperature}°{period.temperatureUnit}</p>
                  <p className="text-[10px] text-white/30 mt-1 leading-tight">{period.shortForecast}</p>
                  {period.probabilityOfPrecipitation?.value && (
                    <p className="text-xs text-blue-400 font-bold mt-1">{period.probabilityOfPrecipitation.value}% rain</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* JOB DOCUMENTS */}
        {jobFolder && (
          <div className="bg-[#1e2023] rounded-xl border border-white/5 p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Job Documents</h2>
              <a href={jobFolder.Job_Folder_Link} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#20BC64] hover:underline flex items-center gap-1">
                📂 Open Job Folder →
              </a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Contract', icon: '📄', link: jobFolder.Contract_Link || jobFolder.Job_Folder_Link, color: '#20BC64' },
                { label: 'Work Order', icon: '📋', link: jobFolder.Work_Order_Link || jobFolder.Job_Folder_Link, color: '#60a5fa' },
                { label: 'Plans', icon: '📐', link: jobFolder.Plans_Link || jobFolder.Job_Folder_Link, color: '#a78bfa' },
                { label: 'Materials', icon: '🏗️', link: jobFolder.Material_Resources_Link || jobFolder.Job_Folder_Link, color: '#fb923c' },
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
          </div>
        )}

        {/* MAIN GRID */}
        <div className="grid grid-cols-12 gap-5">

          {/* PRODUCTION */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e2023] rounded-xl border border-white/5 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Production Totals (Jotform Live)</h2>
            {report ? (
              <div className="space-y-4">
                {[
                  { label: 'GAB / Base', value: report.Base_Actual || report.GAB_Tonnage, unit: 'tons', color: '#20BC64' },
                  { label: 'Asphalt (Binder + Topping)', value: report.Asphalt_Actual || (report.Binder_Tonnage + report.Topping_Tonnage), unit: 'tons', color: '#60a5fa' },
                  { label: 'Concrete', value: report.Concrete_Actual || report.Concrete_CY, unit: 'CY', color: '#a78bfa' },
                  { label: 'Total Man-Hours', value: report.Total_Man_Hours, unit: 'hrs', color: '#fb923c' },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-white/40 font-bold">{m.label}</span>
                      <span className="text-sm font-black" style={{ color: m.color }}>{(m.value || 0).toLocaleString()} {m.unit}</span>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, ((m.value || 0) / Math.max(1, m.value || 1)) * 100)}%`, backgroundColor: m.color }} />
                    </div>
                  </div>
                ))}
                {report.Latest_Summary && (
                  <div className="mt-4 pt-4 border-t border-white/5">
                    <p className="text-xs font-black text-white/30 uppercase tracking-widest mb-2">Latest Field Summary</p>
                    <p className="text-sm text-white/60 leading-relaxed">{report.Latest_Summary}</p>
                    {report.Job_Difficulty && (
                      <span className="mt-2 inline-block text-xs font-bold px-2 py-0.5 rounded bg-white/5 text-white/40">{report.Job_Difficulty}</span>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-white/20 text-sm">No Jotform submissions found for this job number.</p>
            )}
          </div>

          {/* SUPPLY CHAIN */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e2023] rounded-xl border border-white/5 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Supply Chain Status</h2>
            <div className="space-y-4">
              {prep ? (
                <>
                  <div className="flex justify-between items-start p-3 rounded-lg bg-black/20">
                    <div>
                      <p className="text-xs text-white/30 font-bold uppercase mb-1">Asphalt Plant</p>
                      <p className="text-sm font-bold text-white">{prep.Nearest_Asphalt_Plant}</p>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-full ${asphaltCredit === 'Active' ? 'bg-[#20BC64]/10 text-[#20BC64]' : 'bg-amber-500/10 text-amber-400'}`}>{asphaltCredit}</span>
                  </div>
                  <div className="flex justify-between items-start p-3 rounded-lg bg-black/20">
                    <div>
                      <p className="text-xs text-white/30 font-bold uppercase mb-1">Quarry</p>
                      <p className="text-sm font-bold text-white">{prep.Nearest_Quarry}</p>
                    </div>
                    <span className={`text-xs font-black px-2 py-1 rounded-full ${baseCredit === 'Active' ? 'bg-[#20BC64]/10 text-[#20BC64]' : 'bg-amber-500/10 text-amber-400'}`}>{baseCredit}</span>
                  </div>
                </>
              ) : (
                <p className="text-white/20 text-sm">No supply chain data for this job.</p>
              )}
            </div>

            {/* RENTAL EQUIPMENT */}
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mt-6 mb-3">Rental Equipment</h2>
            {rentals.length > 0 ? (
              <div className="space-y-2">
                {rentals.map((r, i) => {
                  const days = parseInt(r.Days_On_Site) || 0;
                  const rate = parseFloat(r.Daily_Rate) || 0;
                  const burn = days * rate;
                  const isOverdue = days > 30;
                  return (
                    <div key={i} className="p-3 rounded-lg bg-black/20 border border-white/5">
                      <div className="flex justify-between items-start">
                        <p className="text-sm font-bold text-white/80">{r.Equipment_Type}</p>
                        <span className={`text-xs font-black ${isOverdue ? 'text-red-400' : 'text-white/40'}`}>{days}d</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-white/30">{r.Vendor}</span>
                        <span className={`text-xs font-bold ${isOverdue ? 'text-red-400' : 'text-white/40'}`}>${burn.toLocaleString()} burn</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-white/20 text-sm">No rental equipment on file.</p>
            )}
          </div>

          {/* JOB INTEL */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e2023] rounded-xl border border-white/5 p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">Job Intel</h2>
            <div className="space-y-3">
              {[
                { label: 'Track Surface', value: job.Track_Surface || '—' },
                { label: 'Field Events', value: job.Field_Events || '—' },
                { label: 'Micromill', value: job.Micromill || '—' },
                { label: 'Start Date', value: job.Start_Date || '—' },
                { label: 'Status', value: job.Status || '—' },
              ].map(item => (
                <div key={item.label} className="flex justify-between py-2 border-b border-white/5">
                  <span className="text-xs text-white/30 font-bold uppercase">{item.label}</span>
                  <span className="text-sm text-white/70 font-bold">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CHANGE ORDERS */}
          {changeOrders.length > 0 && (
            <div className="col-span-12 bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Change Orders</h2>
                <span className="text-xs font-bold text-white/30">{changeOrders.length} total</span>
              </div>
              <div className="space-y-2">
                {changeOrders.map((co, i) => {
                  const statusCls = co.Status === 'Approved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : co.Status === 'Pending' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' : 'text-red-400 bg-red-500/10 border-red-500/20';
                  return (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-black text-[#60a5fa]">{co.CO_Number}</span>
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${statusCls}`}>{co.Status}</span>
                        </div>
                        <p className="text-xs text-white/60">{co.Description}</p>
                        {co.Notes && <p className="text-[10px] text-white/30 italic mt-0.5">{co.Notes}</p>}
                      </div>
                      <div className="text-right ml-4">
                        <p className="text-sm font-black text-white">{co.Amount}</p>
                        <p className="text-[10px] text-white/30">{co.Type}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {/* SCORECARD: EST vs ACTUAL */}
          {scorecard && (
            <div className="col-span-12 bg-[#1e2023] rounded-xl border border-white/5 p-5">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-white/40">Est vs Actual Scorecard</h2>
                {parseInt(scorecard.Weather_Days) > 0 && (
                  <span className="text-xs font-black px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    ☁️ {scorecard.Weather_Days} Weather Days
                  </span>
                )}
              </div>
              <div className="grid grid-cols-5 gap-3">
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
                    <div key={m.label} className="bg-black/20 rounded-lg p-3 border border-white/5">
                      <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: m.color }}>{m.label}</p>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/30">Est: {m.est.toLocaleString()}</span>
                        <span className="font-bold" style={{ color: isOver ? '#ef4444' : m.color }}>Act: {m.act.toLocaleString()}</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pctVal)}%`, backgroundColor: isOver ? '#ef4444' : m.color }} />
                      </div>
                      <p className="text-[10px] text-white/20 mt-1 text-right">{pctVal}%</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
