import React from 'react';
import MapWrapper from '@/components/MapWrapper';

export const dynamic = 'force-dynamic';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

async function getScheduleData() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sync/schedule`, { cache: 'no-store' });
    if (!res.ok) return { currentWeek: { days: [] }, nextWeek: { days: [] }, deliveries: [], activeGanttJobs: [] };
    return await res.json();
  } catch { return { currentWeek: { days: [] }, nextWeek: { days: [] }, deliveries: [], activeGanttJobs: [] }; }
}

async function getWeatherData() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/weather`, { cache: 'no-store' });
    if (!res.ok) return { locations: [], alerts: [] };
    return await res.json();
  } catch { return { locations: [], alerts: [] }; }
}

async function getSamsaraData() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/telematics/samsara`, { cache: 'no-store' });
    if (!res.ok) return { vehicles: [] };
    return await res.json();
  } catch { return { vehicles: [] }; }
}

async function getJobsData() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sync/jobs`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data || [];
  } catch { return []; }
}

// Color palette for crews
const crewColors: Record<string, string> = {
  'Rosendo / P1': '#20BC64', 'Julio / B1': '#60a5fa', 'Martin / B2': '#fb923c',
  'Juan / B3': '#a78bfa', 'Cesar': '#f59e0b', 'Pedro': '#ec4899',
  'Jeff': '#10b981', 'David': '#6366f1', 'Lowboy 1': '#ef4444', 'Lowboy 2': '#f87171',
  'Sergio': '#14b8a6', 'Shawn': '#8b5cf6', 'Giovany (NC)': '#06b6d4', 'Marcos (NC)': '#0ea5e9',
  'Concrete Sub 1': '#9ca3af', 'Concrete Sub 2': '#6b7280', 'Bud': '#d946ef',
};

const PRIMARY_CREWS = ['Rosendo / P1', 'Julio / B1', 'Martin / B2', 'Juan / B3', 'Cesar', 'Pedro', 'Giovany (NC)', 'Marcos (NC)'];
const SUPPORT_CREWS = ['Jeff', 'David', 'Lowboy 1', 'Lowboy 2', 'Sergio', 'Shawn', 'Concrete Sub 1', 'Concrete Sub 2', 'Bud'];
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function SchedulePage() {
  const [schedule, weather, samsara, jobs] = await Promise.all([
    getScheduleData(), getWeatherData(), getSamsaraData(), getJobsData(),
  ]);

  const weatherAlerts = (weather.alerts || []).slice(0, 8);
  const vehicles = samsara.vehicles || [];

  // Build weather by date lookup
  const weatherByDate: Record<string, any[]> = {};
  for (const loc of (weather.locations || [])) {
    for (const f of (loc.forecasts || [])) {
      if (!weatherByDate[f.date]) weatherByDate[f.date] = [];
      weatherByDate[f.date].push({ ...f, jobs: loc.jobs });
    }
  }

  // Get worst weather per day (highest precip prob)
  const getDayWeather = (dateStr: string) => {
    const forecasts = weatherByDate[dateStr] || [];
    if (forecasts.length === 0) return null;
    return forecasts.reduce((worst: any, f: any) => (!worst || f.precipProb > worst.precipProb) ? f : worst, null);
  };

  // Equipment locations from Samsara
  const equipmentLocations = vehicles.filter((v: any) => v.lat && v.lng).map((v: any) => ({
    name: v.name, lat: v.lat, lng: v.lng, address: v.address || '',
  }));

  // Job locations for map
  const jobLocations = jobs.filter((j: any) => j.Lat && j.Lng).map((j: any) => ({
    jobNumber: j.Job_Number, name: j.Job_Name, lat: parseFloat(j.Lat), lng: parseFloat(j.Lng),
  }));

  const renderWeekGrid = (week: any, label: string, isCurrent: boolean) => {
    if (!week?.days?.length) return null;

    return (
      <div className={`bg-[#1e2023] rounded-2xl border shadow-xl overflow-hidden ${isCurrent ? 'border-[#20BC64]/30' : 'border-white/5'}`}>
        <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center" style={{ background: isCurrent ? 'rgba(32,188,100,0.04)' : 'transparent' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-white/70">{week.label || label}</h2>
            {isCurrent && <span className="text-[10px] font-black text-[#20BC64] bg-[#20BC64]/15 px-2 py-0.5 rounded-full">THIS WEEK</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-white/30 sticky left-0 bg-[#1e2023] z-10 w-36 min-w-[144px]">Crew</th>
                {dayNames.map(day => {
                  const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                  const dateStr = dayData?.date;
                  const wx = dateStr ? getDayWeather(dateStr) : null;
                  return (
                    <th key={day} className={`text-left px-3 py-2 text-xs font-bold uppercase tracking-widest min-w-[185px] ${dayData?.isToday ? 'bg-[#20BC64]/5 text-[#20BC64]' : 'text-white/30'}`}>
                      <div className="flex items-center justify-between">
                        <span>{day}</span>
                        {wx && (
                          <span className={`text-[10px] font-medium ${wx.severe ? 'text-red-400' : 'text-white/30'}`} title={`${wx.label}: ${wx.high}°/${wx.low}°, ${wx.precipProb}% rain, ${wx.wind}mph wind`}>
                            {wx.icon} {wx.high}° {wx.precipProb > 0 ? `${wx.precipProb}%💧` : ''}
                          </span>
                        )}
                      </div>
                      {dayData && (
                        <div className="text-[10px] text-white/20 font-normal mt-0.5">
                          {dayData.dateDisplay?.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '')}
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {/* Primary Crews */}
              {PRIMARY_CREWS.map((crewName, ci) => {
                const color = crewColors[crewName] || '#9ca3af';
                const hasWork = week.days.some((d: any) => d.assignments?.some((a: any) => a.crew === crewName && !a.decoded?.isOff));
                return (
                  <tr key={crewName} className={`border-b border-white/5 ${ci % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                    <td className="px-4 py-3 sticky left-0 bg-[#1e2023] z-10 border-r border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: hasWork ? color : '#4b5563' }}></span>
                        <span className="text-xs font-bold text-white/70 whitespace-nowrap">{crewName}</span>
                      </div>
                    </td>
                    {dayNames.map(day => {
                      const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                      const assignment = dayData?.assignments?.find((a: any) => a.crew === crewName);
                      const decoded = assignment?.decoded;
                      return (
                        <td key={day} className={`px-2 py-1.5 border-r border-white/5 align-top ${dayData?.isToday ? 'bg-[#20BC64]/5' : ''}`}>
                          {assignment ? (
                            decoded?.isOff ? (
                              <div className="text-[10px] text-white/20 italic px-2 py-1">{decoded.jobRef}</div>
                            ) : (
                              <div className="rounded-lg px-2.5 py-2 text-[11px] border" style={{ borderColor: `${color}30`, backgroundColor: `${color}08`, color: color }}>
                                <div className="font-bold leading-tight">{decoded?.jobRef || assignment.job}</div>
                                {decoded?.activity && (
                                  <div className="text-[10px] opacity-70 mt-0.5 flex items-center gap-1">
                                    <span className="uppercase font-bold">{decoded.activity}</span>
                                    {decoded.state && <span className="opacity-50">· {decoded.state}</span>}
                                  </div>
                                )}
                                {(assignment.pm || assignment.supplierFull) && (
                                  <div className="text-[9px] opacity-40 mt-0.5">
                                    {assignment.pm && <span>PM: {assignment.pm}</span>}
                                    {assignment.supplierFull && <span> · {assignment.supplierFull}</span>}
                                  </div>
                                )}
                                {assignment.ganttMatch && (
                                  <div className="text-[9px] opacity-30 mt-0.5">
                                    #{assignment.ganttMatch.jobNumber} · {assignment.ganttMatch.projectType}
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            <span className="text-[10px] text-white/10 px-2">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Support separator */}
              <tr className="border-b-2 border-white/10">
                <td colSpan={8} className="px-4 py-1.5 bg-white/[0.02]">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Support & Logistics</span>
                </td>
              </tr>

              {/* Support Crews */}
              {SUPPORT_CREWS.map((crewName, ci) => {
                const color = crewColors[crewName] || '#9ca3af';
                const hasWork = week.days.some((d: any) => d.assignments?.some((a: any) => a.crew === crewName));
                if (!hasWork) return null;
                return (
                  <tr key={crewName} className={`border-b border-white/5 ${ci % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                    <td className="px-4 py-3 sticky left-0 bg-[#1e2023] z-10 border-r border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                        <span className="text-xs font-medium text-white/50 whitespace-nowrap">{crewName}</span>
                      </div>
                    </td>
                    {dayNames.map(day => {
                      const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                      const assignment = dayData?.assignments?.find((a: any) => a.crew === crewName);
                      return (
                        <td key={day} className={`px-2 py-1.5 border-r border-white/5 align-top ${dayData?.isToday ? 'bg-[#20BC64]/5' : ''}`}>
                          {assignment ? (
                            <div className="text-[10px] text-white/40 px-2 py-1 rounded bg-white/[0.03]">
                              {assignment.decoded?.isOff ? (
                                <span className="italic text-white/20">{assignment.decoded.jobRef}</span>
                              ) : (
                                <>
                                  <span className="font-medium">{assignment.decoded?.jobRef || assignment.job}</span>
                                  {assignment.decoded?.activity && <span className="opacity-50"> · {assignment.decoded.activity}</span>}
                                </>
                              )}
                            </div>
                          ) : <span className="text-[10px] text-white/10 px-2">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans pb-10 antialiased">
      {/* Header */}
      <header className="bg-[#1e2023] px-8 py-5 border-b border-white/5 shadow-xl">
        <div className="flex justify-between items-center max-w-[1920px] mx-auto">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Weekly Schedule</h1>
            <p className="text-xs text-white/30 mt-1">Live from Level 10 · Schedule & Project Timeline · {schedule.scheduledJobCount || 0} Active Jobs</p>
          </div>
          <div className="flex items-center gap-3">
            {weatherAlerts.length > 0 && (
              <span className="text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1.5">
                ⛈️ {weatherAlerts.length} Weather Alerts
              </span>
            )}
            {schedule.deliveries?.length > 0 && (
              <span className="text-xs font-black text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-3 py-1.5">
                🚚 {schedule.deliveries.length} Deliveries
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto p-6 flex flex-col gap-6">

        {/* TOP ROW: Weather Alerts + Deliveries */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Weather Alerts */}
          <div className="bg-[#1e2023] rounded-2xl border border-amber-400/10 shadow-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 bg-amber-400/5 flex items-center gap-2">
              <span className="text-sm">⛈️</span>
              <h2 className="text-xs font-black uppercase tracking-widest text-amber-400">Weather Alerts — Next 7 Days</h2>
            </div>
            <div className="p-4 space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
              {weatherAlerts.length > 0 ? weatherAlerts.map((alert: any, i: number) => (
                <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 bg-white/[0.02] border border-white/5">
                  <span className="text-lg flex-shrink-0">{alert.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-amber-400">{alert.date}</span>
                      <span className="text-[10px] text-white/30">{alert.weather}</span>
                    </div>
                    <p className="text-[11px] text-white/60 mt-0.5 truncate">{alert.jobName}</p>
                    <p className="text-[10px] text-white/30">{alert.high}°/{alert.low}° · {alert.precipProb}% rain{alert.precip > 0 ? ` · ${alert.precip}" expected` : ''} · {alert.wind}mph wind</p>
                  </div>
                </div>
              )) : (
                <p className="text-white/20 text-xs">No severe weather expected at job sites this week. ☀️</p>
              )}
            </div>
          </div>

          {/* Deliveries */}
          <div className="bg-[#1e2023] rounded-2xl border border-blue-400/10 shadow-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 bg-blue-400/5 flex items-center gap-2">
              <span className="text-sm">🚚</span>
              <h2 className="text-xs font-black uppercase tracking-widest text-blue-400">Deliveries & Equipment Moves</h2>
            </div>
            <div className="p-4 space-y-2 max-h-[220px] overflow-y-auto custom-scrollbar">
              {(schedule.deliveries || []).length > 0 ? (schedule.deliveries || []).map((del: any, i: number) => (
                <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2 bg-white/[0.02] border border-white/5">
                  <span className="text-lg flex-shrink-0">📦</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-blue-400">{del.dayOfWeek} {del.date}</span>
                      {del.isCurrentWeek ? (
                        <span className="text-[9px] font-black text-[#20BC64] bg-[#20BC64]/15 px-1.5 py-0.5 rounded">THIS WEEK</span>
                      ) : (
                        <span className="text-[9px] font-bold text-white/20 bg-white/5 px-1.5 py-0.5 rounded">NEXT WEEK</span>
                      )}
                    </div>
                    <p className="text-[11px] text-white/60 mt-1">{del.description}</p>
                  </div>
                </div>
              )) : (
                <p className="text-white/20 text-xs">No deliveries or equipment moves scheduled.</p>
              )}
            </div>
          </div>
        </div>

        {/* ACTIVE PROJECTS TIMELINE (from Gantt sheet) */}
        {(schedule.activeGanttJobs || []).length > 0 && (
          <div className="bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
              <span className="text-sm">📋</span>
              <h2 className="text-xs font-black uppercase tracking-widest text-white/50">Active Projects — Timeline</h2>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {(schedule.activeGanttJobs || []).map((job: any) => {
                const now = new Date();
                const start = new Date(job.Start);
                const end = new Date(job.End);
                const total = end.getTime() - start.getTime();
                const elapsed = now.getTime() - start.getTime();
                const pct = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
                const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const isOverdue = daysLeft < 0;
                return (
                  <div key={job.Job_Number} className="rounded-xl p-3 border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                    <div className="flex justify-between items-start mb-1.5">
                      <span className="text-[10px] font-bold text-white/30">{job.Job_Number}</span>
                      <span className={`text-[10px] font-black ${isOverdue ? 'text-red-400' : daysLeft <= 7 ? 'text-amber-400' : 'text-[#20BC64]'}`}>
                        {isOverdue ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-white/80 mb-1 line-clamp-2">{job.Job_Name}</p>
                    <p className="text-[9px] text-white/30 mb-2">{job.Project_Type} · {job.Start} → {job.End}</p>
                    <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${isOverdue ? 'bg-red-400' : 'bg-[#20BC64]'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* CURRENT WEEK CREW GRID */}
        {renderWeekGrid(schedule.currentWeek, 'Current Week', true)}

        {/* NEXT WEEK CREW GRID */}
        {renderWeekGrid(schedule.nextWeek, 'Next Week', false)}

        {/* EQUIPMENT & RESOURCE MAP */}
        <div className="bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">🗺️</span>
              <h2 className="text-xs font-black uppercase tracking-widest text-white/50">Equipment & Crew Locations</h2>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#20BC64] inline-block"></span> Job Sites ({jobLocations.length})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span> Vehicles ({equipmentLocations.length})</span>
            </div>
          </div>
          <div className="h-[400px]">
            <MapWrapper
              jobs={jobLocations.map((j: any) => ({ Job_Number: j.jobNumber, Job_Name: j.name, Lat: j.lat, Lng: j.lng, Pct_Complete: 0 }))}
              vehicles={equipmentLocations.map((v: any) => ({ name: v.name, lat: v.lat, lng: v.lng, address: v.address }))}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
