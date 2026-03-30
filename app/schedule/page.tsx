import React from 'react';
import Link from 'next/link';
import MapWrapper from '@/components/MapWrapper';
import { fetchScheduleData, fetchLiveJobs, fetchLevel10Meeting, fetchVisionLinkAssets, fetchLiveRentals } from '@/lib/sheets-data';
import { getGlobalWeather } from '@/app/api/weather/route';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';

export const dynamic = 'force-dynamic';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

async function getScheduleData() {
  return fetchScheduleData();
}

async function getWeatherData() {
  return getGlobalWeather();
}

async function getSamsaraData() {
  return getGlobalSamsara();
}

async function getJobsData() {
  return fetchLiveJobs();
}

async function getLevel10Data() {
  return fetchLevel10Meeting();
}

// Color palette for crews
const crewColors: Record<string, string> = {
  'Rosendo / P1': '#20BC64', 'Julio / B1': '#60a5fa', 'Martin / B2': '#fb923c',
  'Juan / B3': '#a78bfa', 'Cesar': '#f59e0b', 'Pedro': '#ec4899',
  'Sergio': '#14b8a6', 'Shawn': '#8b5cf6',
  'Concrete Sub 1': '#9ca3af', 'Concrete Sub 2': '#6b7280', 'Bud': '#d946ef',
};

const PRIMARY_CREWS = ['Rosendo / P1', 'Julio / B1', 'Martin / B2', 'Juan / B3', 'Cesar', 'Pedro'];
const SUPPORT_CREWS = ['David', 'Lowboy 1', 'Lowboy 2', 'Sergio', 'Shawn', 'Concrete Sub 1', 'Concrete Sub 2', 'Bud'];
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default async function SchedulePage() {
  const [schedule, weather, samsara, jobs, level10, vlAssets, liveRentals] = await Promise.all([
    getScheduleData(), getWeatherData(), getSamsaraData(), getJobsData(), getLevel10Data(), fetchVisionLinkAssets(), fetchLiveRentals()
  ]);

  const weatherAlerts = (weather.alerts || []).slice(0, 8);
  const vehicles = samsara.vehicles || [];

  // Build set of scheduled job names from current + next week
  const scheduledJobRefs = new Set<string>();
  [...(schedule.currentWeek?.days || []), ...(schedule.nextWeek?.days || [])].forEach((d: any) =>
    (d.assignments || []).forEach((a: any) => {
      if (!a.decoded?.isOff && a.decoded?.jobRef) scheduledJobRefs.add(a.decoded.jobRef.toLowerCase());
    })
  );

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

  // Per-job weather icon lookup — always shows weather when data available
  // Weather API returns loc.jobs as array of Job_Number strings (e.g. ["26-040", "25-300"])
  const getJobWeatherIcon = (jobRef: string, dateStr?: string) => {
    if (!jobRef) return null;
    const ref = jobRef.toLowerCase();
    for (const loc of (weather.locations || [])) {
      const locJobNums = (loc.jobs || []).map((j: any) => typeof j === 'string' ? j : (j.Job_Number || j));
      // Check if any job at this weather location matches the assignment
      const matches = locJobNums.some((jobNum: string) => {
        // Direct job number match (e.g. ref contains "26-040")
        if (ref.includes(jobNum.toLowerCase())) return true;
        // Look up job name from the number and match by first word
        const jobObj = jobs.find((j: any) => j.Job_Number === jobNum);
        if (jobObj) {
          const nameWord = (jobObj.Job_Name || '').toLowerCase().split(' ')[0];
          return nameWord.length > 3 && ref.includes(nameWord);
        }
        return false;
      });
      if (matches) {
        const forecasts = loc.forecasts || [];
        const f = dateStr ? forecasts.find((fx: any) => fx.date === dateStr) : forecasts[0];
        if (f) {
          const prob = f.precipProb || 0;
          let icon = 'âï¸';
          if (f.severe) icon = '⛈️';
          else if (prob >= 60) icon = 'ð§ï¸';
          else if (prob >= 30) icon = 'ð¦ï¸';
          else if (prob >= 10) icon = 'â';
          return { icon: f.icon || icon, prob, severe: f.severe, temp: f.high || 0 };
        }
      }
    }
    return null;
  };

  // Job locations for map
  const jobLocations = jobs.filter((j: any) => j.Lat && j.Lng).map((j: any) => ({
    jobNumber: j.Job_Number, name: j.Job_Name, lat: parseFloat(j.Lat), lng: parseFloat(j.Lng),
  }));

  // Rental equipment from live Google Sheets (Sunbelt + United)
  const rentalEquipment = (liveRentals || []).map((r: any) => ({
    jobName: r.jobName || '',
    type: r.equipmentType || r.className || '',
    vendor: r.vendor || '',
    daysOnRent: r.daysOnRent || 0,
    dailyRate: r.dayRate || 0,
  })).filter((r: any) => r.type);

  // Group rental equipment by job name
  const equipByJob: Record<string, { jobName: string; items: typeof rentalEquipment }> = {};
  for (const eq of rentalEquipment) {
    const key = eq.jobName || 'Unassigned';
    if (!equipByJob[key]) equipByJob[key] = { jobName: key, items: [] };
    equipByJob[key].items.push(eq);
  }

  // Map Make/Model to readable equipment type
  const getEquipType = (make: string, model: string) => {
    const m = make.toUpperCase();
    const mod = model.toUpperCase();
    if (m === 'BOBCAT' && (mod.startsWith('T') || mod.startsWith('S7'))) return 'Skid Steer';
    if (m === 'BOBCAT' && mod.startsWith('E')) return 'Mini Excavator';
    if (m === 'DYNAPAC' || m === 'SAKAI') return 'Roller';
    if (m === 'LEEBOY' && mod.includes('SCREEN')) return 'Screening Plant';
    if (m === 'LEEBOY') return 'Paver';
    if (m === 'BASIC') return 'Tack Truck';
    if (m === 'INTERNATIONAL') return 'Service Truck';
    return `${make} ${model}`;
  };

  // Build equipment map pins by matching rental job names to jobs with coordinates
  const equipmentMapPins: { name: string; lat: number; lng: number; address: string }[] = [];
  for (const eq of rentalEquipment) {
    if (!eq.jobName) continue;
    const eqName = eq.jobName.toLowerCase();
    const matchedJob = jobs.find((j: any) => {
      if (!j.Lat || !j.Lng || !j.Job_Name) return false;
      const jName = j.Job_Name.toLowerCase();
      const word = eqName.split(' ')[0];
      return word.length > 3 && jName.includes(word);
    });
    if (matchedJob) {
      equipmentMapPins.push({
        name: eq.type,
        lat: parseFloat(matchedJob.Lat),
        lng: parseFloat(matchedJob.Lng),
        address: matchedJob.Job_Name,
      });
    }
  }

  // Filter job locations to only scheduled jobs
  const scheduledJobLocations = jobLocations.filter((j: any) => {
    const name = j.name.toLowerCase();
    return Array.from(scheduledJobRefs).some(ref => {
      const refWord = ref.split(' ')[0];
      return refWord.length > 3 && name.includes(refWord);
    });
  });

  // Resolve Job Links even when Gantt matching fails
  // Use jobRef (just the job name portion) for name matching to avoid vendor false matches
  const resolveJobLink = (assignment: any) => {
    const raw = (assignment.job || assignment.decoded?.raw || '').toLowerCase();
    const jobRef = (assignment.decoded?.jobRef || '').toLowerCase();
    
    // 1. Direct Job Number match (safe to check full raw)
    const numMatch = jobs.find((j: any) => j.Job_Number && raw.includes(j.Job_Number.toLowerCase()));
    if (numMatch) return numMatch.Job_Number;

    // 2. Strict longest substring match (use jobRef to avoid vendor false matches)
    const matchTarget = jobRef || raw;
    let bestMatch = null;
    let maxLen = 0;
    for (const j of jobs) {
      if (!j || !j.Job_Name) continue;
      const jName = j.Job_Name.toLowerCase().replace(/ paving| base| hs/g, '').trim();
      if (jName.length > 4 && matchTarget.includes(jName) && jName.length > maxLen) {
        maxLen = jName.length;
        bestMatch = j;
      }
    }
    if (bestMatch) return bestMatch.Job_Number;

    // 3. Fallback to Gantt
    if (assignment.ganttMatch?.jobNumber) return assignment.ganttMatch.jobNumber;

    // 4. First word fallback
    const ref = (assignment.decoded?.jobRef || '').toLowerCase();
    const fallback = jobs.find((j: any) => {
      const nameWord = (j.Job_Name || '').toLowerCase().split(' ')[0];
      return nameWord && nameWord.length > 3 && ref.includes(nameWord);
    });
    return fallback?.Job_Number || null;
  };

  const renderWeekGrid = (week: any, label: string, isCurrent: boolean) => {
    if (!week?.days?.length) return null;

    return (
      <div className={`bg-white rounded-md border shadow-sm overflow-hidden ${isCurrent ? 'border-[#20BC64]/30' : 'border-[#F1F3F4]'}`}>
        <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center" style={{ background: isCurrent ? 'rgba(32,188,100,0.04)' : 'transparent' }}>
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]">{week.label || label}</h2>
            {isCurrent && <span className="text-sm font-black text-[#20BC64] bg-[#20BC64]/15 px-2 py-0.5 rounded-full">THIS WEEK</span>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-[#F1F3F4]">
                <th className="text-left px-4 py-3 text-xs font-black uppercase tracking-widest text-[#757A7F] sticky left-0 bg-white z-10 w-36 min-w-[144px]">Crew</th>
                {dayNames.map(day => {
                  const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                  return (
                    <th key={day} className={`text-left px-3 py-2 text-xs font-bold uppercase tracking-widest min-w-[185px] ${dayData?.isToday ? 'bg-[#20BC64]/5 text-[#20BC64]' : 'text-[#757A7F]'}`}>
                      <span>{day}</span>
                      {dayData && (
                        <div className="text-sm text-[#757A7F]/60 font-normal mt-0.5">
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
                  <tr key={crewName} className={`border-b border-[#F1F3F4] ${ci % 2 === 0 ? '' : 'bg-[#F1F3F4]/40'}`}>
                    <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-[#F1F3F4]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: hasWork ? color : '#4b5563' }}></span>
                        <span className="text-xs font-bold text-[#3C4043] whitespace-nowrap">{crewName}</span>
                      </div>
                    </td>
                    {dayNames.map(day => {
                      const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                      const assignment = dayData?.assignments?.find((a: any) => a.crew === crewName);
                      const decoded = assignment?.decoded;
                      return (
                        <td key={day} className={`px-2 py-1.5 border-r border-[#F1F3F4] align-top ${dayData?.isToday ? 'bg-[#20BC64]/5' : ''}`}>
                          {assignment ? (() => {
                            const linkJobId = resolveJobLink(assignment);
                            return (
                            assignment.decoded?.isOff ? (
                              <div className="text-sm text-[#757A7F]/60 italic px-2 py-1">{assignment.decoded.jobRef}</div>
                            ) : linkJobId ? (
                              <Link href={`/jobs/${encodeURIComponent(linkJobId.trim())}`} className="block rounded-lg px-2.5 py-2 text-[11px] border hover:opacity-80 transition-opacity cursor-pointer" style={{ borderColor: `${color}30`, backgroundColor: `${color}08`, color: color }}>
                                <div className="font-bold leading-tight flex items-center gap-1">
                                  {assignment.decoded?.jobRef || assignment.job}
                                  {(() => { const dayData = week.days.find((d: any) => d.dayOfWeek === day); const wx = getJobWeatherIcon(assignment.decoded?.jobRef || assignment.job, dayData?.date); return wx ? <span title={`${wx.prob}% rain`} className={wx.severe ? 'text-[#E04343]' : ''}>{wx.icon}</span> : null; })()}
                                </div>
                                {assignment.decoded?.activity && (
                                  <div className="text-sm opacity-70 mt-0.5 flex items-center gap-1">
                                    <span className="uppercase font-bold">{assignment.decoded.activity}</span>
                                    {assignment.decoded.state && <span className="opacity-50">· {assignment.decoded.state}</span>}
                                  </div>
                                )}
                                {(assignment.pm || assignment.supplierFull) && (
                                  <div className="text-[9px] opacity-40 mt-0.5">
                                    {assignment.pm && <span>PM: {assignment.pm}</span>}
                                    {assignment.supplierFull && <span> · {assignment.supplierFull}</span>}
                                  </div>
                                )}
                                <div className="text-[9px] opacity-30 mt-0.5">
                                  #{linkJobId} {assignment.ganttMatch?.projectType ? `· ${assignment.ganttMatch.projectType}` : ''}
                                </div>
                              </Link>
                            ) : (
                              <div className="rounded-lg px-2.5 py-2 text-[11px] border" style={{ borderColor: `${color}30`, backgroundColor: `${color}08`, color: color }}>
                                <div className="font-bold leading-tight flex items-center gap-1">
                                  {assignment.decoded?.jobRef || assignment.job}
                                  {(() => { const dayData = week.days.find((d: any) => d.dayOfWeek === day); const wx = getJobWeatherIcon(assignment.decoded?.jobRef || assignment.job, dayData?.date); return wx ? <span title={`${wx.prob}% rain`} className={wx.severe ? 'text-[#E04343]' : ''}>{wx.icon}</span> : null; })()}
                                </div>
                                {assignment.decoded?.activity && (
                                  <div className="text-sm opacity-70 mt-0.5 flex items-center gap-1">
                                    <span className="uppercase font-bold">{assignment.decoded.activity}</span>
                                    {assignment.decoded.state && <span className="opacity-50">· {assignment.decoded.state}</span>}
                                  </div>
                                )}
                                {(assignment.pm || assignment.supplierFull) && (
                                  <div className="text-[9px] opacity-40 mt-0.5">
                                    {assignment.pm && <span>PM: {assignment.pm}</span>}
                                    {assignment.supplierFull && <span> · {assignment.supplierFull}</span>}
                                  </div>
                                )}
                              </div>
                            )
                            );
                          })() : (
                            <span className="text-sm text-[#757A7F]/40 px-2">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Support separator */}
              <tr className="border-b-2 border-[#3C4043]/15">
                <td colSpan={8} className="px-4 py-1.5 bg-[#F1F3F4]/50">
                  <span className="text-sm font-bold uppercase tracking-widest text-[#757A7F]/60">Support & Logistics</span>
                </td>
              </tr>

              {/* Support Crews */}
              {SUPPORT_CREWS.map((crewName, ci) => {
                const color = crewColors[crewName] || '#9ca3af';
                const hasWork = week.days.some((d: any) => d.assignments?.some((a: any) => a.crew === crewName));
                if (!hasWork) return null;
                return (
                  <tr key={crewName} className={`border-b border-[#F1F3F4] ${ci % 2 === 0 ? '' : 'bg-[#F1F3F4]/40'}`}>
                    <td className="px-4 py-3 sticky left-0 bg-white z-10 border-r border-[#F1F3F4]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }}></span>
                        <span className="text-xs font-medium text-[#757A7F] whitespace-nowrap">{crewName}</span>
                      </div>
                    </td>
                    {dayNames.map(day => {
                      const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                      const assignment = dayData?.assignments?.find((a: any) => a.crew === crewName);
                      return (
                        <td key={day} className={`px-2 py-1.5 border-r border-[#F1F3F4] align-top ${dayData?.isToday ? 'bg-[#20BC64]/5' : ''}`}>
                          {assignment ? (() => {
                            const linkJobId = resolveJobLink(assignment);
                            return (
                            <div className="text-sm text-[#757A7F] px-2 py-1 rounded bg-[#F1F3F4]/60">
                              {assignment.decoded?.isOff ? (
                                <span className="italic text-[#757A7F]/60">{assignment.decoded.jobRef}</span>
                              ) : linkJobId ? (
                                <Link href={`/jobs/${encodeURIComponent(linkJobId.trim())}`} className="block hover:opacity-80 transition-opacity cursor-pointer">
                                  <span className="font-medium text-[#3C4043] hover:text-[#20BC64] transition-colors">{assignment.decoded?.jobRef || assignment.job}</span>
                                  {assignment.decoded?.activity && <span className="opacity-50 text-[#3C4043]/70"> · {assignment.decoded.activity}</span>}
                                </Link>
                              ) : (
                                <>
                                  <span className="font-medium">{assignment.decoded?.jobRef || assignment.job}</span>
                                  {assignment.decoded?.activity && <span className="opacity-50"> · {assignment.decoded.activity}</span>}
                                </>
                              )}
                            </div>
                            );
                          })() : <span className="text-sm text-[#757A7F]/40 px-2">—</span>}
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
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body pb-10 antialiased">
      {/* Header */}
      <header className="bg-white px-8 py-5 border-b border-[#F1F3F4] shadow-sm">
        <div className="flex justify-between items-center max-w-[1920px] mx-auto">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Weekly Schedule</h1>
            <p className="text-xs text-[#757A7F] mt-1">Live from Level 10 · Schedule & Project Timeline · {schedule.scheduledJobCount || 0} Active Jobs</p>
          </div>
          <div className="flex items-center gap-3">
            {weatherAlerts.length > 0 && (
              <span className="text-xs font-black text-[#F5A623] bg-[#F5A623]/10 border border-amber-400/20 rounded-full px-3 py-1.5">
                ⛈️ {weatherAlerts.length} Weather Alerts
              </span>
            )}
            {schedule.deliveries?.length > 0 && (
              <span className="text-xs font-black text-blue-600 bg-blue-600/10 border border-blue-400/20 rounded-full px-3 py-1.5">
                ð {schedule.deliveries.length} Deliveries
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-8 py-8 space-y-8">
        {/* CUSTOMERS SCREAMING BANNER */}
        {level10.screaming?.length > 0 && (
          <div className="bg-[#E04343]/10 border border-red-500/30 rounded-md p-4 flex items-start gap-4 shadow-sm">
            <div className="text-3xl">ð±</div>
            <div>
              <h2 className="text-[#E04343] font-black uppercase tracking-widest text-xs mb-2">What Customers Are Screaming</h2>
              <ul className="list-disc pl-4 space-y-1">
                {level10.screaming.map((s, i) => (
                  <li key={i} className="text-sm font-bold text-[#3C4043]">{s}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* ACTIVE PROJECTS TIMELINE (from Gantt sheet) */}
        {(schedule.activeGanttJobs || []).length > 0 && (
          <div className="bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[#F1F3F4] flex items-center gap-2">
              <span className="text-sm">ð</span>
              <h2 className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Active Projects — Timeline</h2>
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
                  <div key={job.Job_Number} className="rounded-xl p-3 border border-[#F1F3F4] bg-[#F1F3F4]/50 hover:bg-white/[0.04] transition-colors">
                    <div className="flex justify-between items-start mb-1.5">
                      <Link href={`/jobs/${job.Job_Number}`} className="font-bold text-blue-400 hover:underline">{job.Job_Number} &mdash; {job.Job_Name}</Link>
                      <span className={`text-[10px] font-black ${isOverdue ? 'text-[#E04343]' : daysLeft <= 7 ? 'text-[#F5A623]' : 'text-[#20BC64]'}`}>
                        {isOverdue ? `${Math.abs(daysLeft)}d over` : `${daysLeft}d left`}
                      </span>
                    </div>
                    <p className="text-[11px] font-bold text-[#3C4043] mb-1 line-clamp-2">{job.Job_Name}</p>
                    <p className="text-[9px] text-[#757A7F] mb-2">{job.Project_Type} · {job.Start} → {job.End}</p>
                    <div className="w-full bg-[#F1F3F4] rounded-full h-1.5 overflow-hidden">
                      <div className={`h-full rounded-full ${isOverdue ? 'bg-[#E04343]' : 'bg-[#20BC64]'}`} style={{ width: `${pct}%` }} />
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

        {/* 2-COLUMN BOTTOM: LEVEL 10 LOOSE ENDS & EQUIPMENT */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* LOOSE ENDS (Level 10) */}
          <div className="lg:col-span-1 bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-5 py-4 border-b border-[#F1F3F4] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm">ð</span>
                <h2 className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Tie Up Loose Ends</h2>
              </div>
            </div>
            <div className="p-4 space-y-3 flex-1 overflow-y-auto">
              {level10.looseEnds?.length > 0 ? (
                level10.looseEnds.map((end, i) => (
                  <div key={i} className="rounded-xl p-3 border border-[#F1F3F4] bg-[#F1F3F4]/50">
                    <p className="text-xs font-bold text-[#3C4043] mb-1 leading-tight">{end.details}</p>
                    {end.who && <p className="text-sm text-[#F5A623] font-bold uppercase">Who: {end.who}</p>}
                  </div>
                ))
              ) : (
                <div className="text-center py-8 opacity-40">
                  <span className="text-2xl block mb-2">✅</span>
                  <p className="text-xs font-bold uppercase tracking-widest">No loose ends</p>
                </div>
              )}
            </div>
          </div>

          {/* EQUIPMENT MAP — GPS pins only, no lists */}
          <div className="lg:col-span-3 bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm">ð</span>
                <h2 className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Equipment Locations</h2>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#20BC64] inline-block"></span> Rentals ({rentalEquipment.length})</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span> Assets ({vlAssets.length})</span>
              </div>
            </div>
            <div className="h-[500px]">
              <MapWrapper
                jobs={scheduledJobLocations.map((j: any) => ({
                  Job_Number: j.jobNumber, Job_Name: j.name, Lat: j.lat, Lng: j.lng, Pct_Complete: 0,
                  Status: 'Active', General_Contractor: '', Contract_Amount: 0
                }))}
                vehicles={[
                  ...equipmentMapPins.map((eq, i) => ({
                    id: `rental-${i}`, name: eq.name, lat: eq.lat, lng: eq.lng, address: eq.address,
                    speed: 0, driver: '', status: 'rental'
                  })),
                  ...vlAssets.filter((a: any) => {
                    // Pin VisionLink assets at nearest scheduled job site
                    return scheduledJobLocations.length > 0;
                  }).map((a: any, i: number) => {
                    // Distribute VisionLink assets across scheduled job sites
                    const jobIdx = i % scheduledJobLocations.length;
                    const job = scheduledJobLocations[jobIdx];
                    return {
                      id: `asset-${a.Asset_ID}`, name: getEquipType(a.Make, a.Model),
                      lat: job.lat, lng: job.lng, address: `#${a.Asset_ID} · ${a.Hours}h`,
                      speed: 0, driver: '', status: 'asset'
                    };
                  }),
                ]}
              />
            </div>
          </div>
      </div>
    </div>
    </div>
  );
}
