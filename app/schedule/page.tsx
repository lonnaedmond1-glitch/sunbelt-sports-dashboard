import React from 'react';
import Link from 'next/link';
import { fetchScheduleData, fetchLiveJobs, fetchLevel10Meeting, fetchLiveRentals } from '@/lib/sheets-data';
import { getGlobalWeather } from '@/app/api/weather/route';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';

export const revalidate = 300;

async function getScheduleData() {
  return fetchScheduleData();
}

async function getWeatherData() {
  return getGlobalWeather();
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
  'Giovany (NC)': '#0ea5e9', 'Marcos (NC)': '#f97316',
  'Jeff': '#10b981', 'David': '#6366f1',
  'Lowboy 1': '#ef4444', 'Lowboy 2': '#f87171',
  'Sergio': '#14b8a6', 'Shawn': '#8b5cf6',
  'Concrete Sub 1': '#9ca3af', 'Concrete Sub 2': '#6b7280', 'Bud': '#d946ef',
};

const PRIMARY_CREWS = ['Rosendo / P1', 'Julio / B1', 'Martin / B2', 'Juan / B3', 'Cesar'];
// SUPPORT_CREWS removed — the schedule page now shows primary crews + Lowboy card only
const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LOWBOY_PLANNING_MPH = 45;

function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatEta(miles: number, speedMph: number): string {
  if (!isFinite(miles) || miles <= 0) return 'On site';
  const minutes = Math.max(1, Math.round((miles / Math.max(speedMph, 1)) * 60));
  if (minutes < 60) return `${minutes} min`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export default async function SchedulePage() {
  const [schedule, weather, jobs, level10, liveRentals, samsara] = await Promise.all([
    getScheduleData(), getWeatherData(), getJobsData(), getLevel10Data(), fetchLiveRentals(), getGlobalSamsara()
  ]);

  const weatherAlerts = (weather.alerts || []).slice(0, 8);

  // Per-job weather icon lookup — always shows weather when data available
  // Weather API returns loc.jobs as array of Job_Number strings (e.g. ["26-040", "25-300"])
  const getJobWeatherForecast = (jobRef: string, dateStr?: string) => {
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
          return {
            prob,
            severe: !!f.severe,
            high: Math.round(f.high || 0),
            low: Math.round(f.low || 0),
          };
        }
      }
    }
    return null;
  };

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
                      let assignment = dayData?.assignments?.find((a: any) => a.crew === crewName);
                      // Defensive: a PM/crew first-name leaking into a crew column (e.g. "David" appearing in Cesar's row
                      // because an adjacent PM column bled over in the sheet) must not render as a job. If the decoded
                      // jobRef is a lone first-name-like token with no activity/state/supplier, treat as noise.
                      if (assignment?.decoded && !assignment.decoded.isOff) {
                        const jr = (assignment.decoded.jobRef || '').trim();
                        const isLoneName = /^[A-Z][a-z]+$/.test(jr) && jr.length <= 10;
                        const hasDetail = !!(assignment.decoded.activity || assignment.decoded.state || assignment.decoded.supplier);
                        if (isLoneName && !hasDetail) assignment = undefined;
                      }
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
                                  {(() => { const dayData = week.days.find((d: any) => d.dayOfWeek === day); const wx = getJobWeatherForecast(assignment.decoded?.jobRef || assignment.job, dayData?.date); return wx ? (
                                    <span
                                      className={`ml-1 text-[9px] font-mono font-bold whitespace-nowrap ${wx.severe || wx.prob >= 40 ? 'text-[#E04343]' : wx.prob >= 20 ? 'text-[#F5A623]' : 'text-[#20BC64]/80'}`}
                                      title={`High ${wx.high}° / Low ${wx.low}° · ${wx.prob}% rain`}
                                    >
                                      {wx.high}°/{wx.low}° · {wx.prob}%
                                    </span>
                                  ) : null; })()}
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
                                  {(() => { const dayData = week.days.find((d: any) => d.dayOfWeek === day); const wx = getJobWeatherForecast(assignment.decoded?.jobRef || assignment.job, dayData?.date); return wx ? (
                                    <span
                                      className={`ml-1 text-[9px] font-mono font-bold whitespace-nowrap ${wx.severe || wx.prob >= 40 ? 'text-[#E04343]' : wx.prob >= 20 ? 'text-[#F5A623]' : 'text-[#20BC64]/80'}`}
                                      title={`High ${wx.high}° / Low ${wx.low}° · ${wx.prob}% rain`}
                                    >
                                      {wx.high}°/{wx.low}° · {wx.prob}%
                                    </span>
                                  ) : null; })()}
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

              {/* Support & Logistics separator removed — schedule was trimmed to primary crews only (commit ee1f5bd) */}

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
            <p className="text-xs text-[#757A7F] mt-1">Live from Schedule tab · Crew Assignments & Project Timeline · {schedule.scheduledJobCount || 0} Active Jobs</p>
          </div>
          <div className="flex items-center gap-3">
            {weatherAlerts.length > 0 && (
              <span className="text-xs font-black text-[#F5A623] bg-[#F5A623]/10 border border-amber-400/20 rounded-full px-3 py-1.5">
                ⛈️ {weatherAlerts.length} Weather Alerts
              </span>
            )}
            {schedule.deliveries?.length > 0 && (
              <span className="text-xs font-black text-blue-600 bg-blue-600/10 border border-blue-400/20 rounded-full px-3 py-1.5">
                🚚 {schedule.deliveries.length} Deliveries
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto px-8 py-8 space-y-8">
        {/* CUSTOMERS SCREAMING BANNER */}
        {level10.screaming?.length > 0 && (
          <div className="bg-[#E04343]/10 border border-red-500/30 rounded-md p-4 flex items-start gap-4 shadow-sm">
            <div className="text-3xl">😱</div>
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
              <span className="text-sm">📋</span>
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

        {/* LOWBOY MOVES — one driver, optimized as next move + queue */}
        {(() => {
          const days = schedule.currentWeek?.days || [];
          const lowboyVehicle = (samsara.vehicles || []).find((v: any) => {
            const name = String(v.name || '').toLowerCase();
            const driver = String(v.driver || '').toLowerCase();
            return name.includes('lowboy') || name.includes('hudson') || driver.includes('david hudson');
          });
          const moves: Array<{
            date: string;
            dayName: string;
            jobRef: string;
            activity: string;
            state: string;
            linkJobId: string;
            job: any;
            miles: number | null;
            eta: string;
            origin: string;
          }> = [];
          let origin = lowboyVehicle?.lat && lowboyVehicle?.lng
            ? { lat: lowboyVehicle.lat, lng: lowboyVehicle.lng, label: lowboyVehicle.address || 'Current lowboy GPS' }
            : null;
          for (const day of days) {
            for (const a of (day.assignments || [])) {
              if (!(a.crew === 'Lowboy 1' || a.crew === 'Lowboy 2' || a.crew === 'David - Lowboy' || (a.crewType === 'logistics'))) continue;
              if (a.decoded?.isOff) continue;
              const linkJobId = resolveJobLink(a) || '';
              const job = linkJobId ? jobs.find((j: any) => j.Job_Number === linkJobId) : null;
              const lat = job?.Lat ? parseFloat(job.Lat) : NaN;
              const lng = job?.Lng ? parseFloat(job.Lng) : NaN;
              const miles = origin && !isNaN(lat) && !isNaN(lng)
                ? distanceMiles(origin.lat, origin.lng, lat, lng)
                : null;
              const speed = lowboyVehicle?.speed && lowboyVehicle.speed > 10 ? lowboyVehicle.speed : LOWBOY_PLANNING_MPH;
              moves.push({
                date: day.dateDisplay || day.date || '',
                dayName: day.dayOfWeek || '',
                jobRef: a.decoded?.jobRef || a.job || '',
                activity: a.decoded?.activity || '',
                state: a.decoded?.state || '',
                linkJobId,
                job,
                miles,
                eta: miles == null ? 'Needs job GPS' : formatEta(miles, speed),
                origin: origin?.label || 'Previous move',
              });
              if (!isNaN(lat) && !isNaN(lng)) {
                origin = { lat, lng, label: job ? `${job.Job_Number} · ${job.Job_Name}` : a.decoded?.jobRef || a.job || 'Previous move' };
              }
            }
          }
          const nextMove = moves[0] || null;
          const queuedMoves = moves.slice(1);

          return (
            <div className="grid gap-4">
              <div className="bg-white rounded-xl border border-[#F1F3F4] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Next Lowboy Move</h2>
                    <p className="text-[10px] text-[#757A7F] mt-0.5">Driver: David Hudson. Distance is calculated from live lowboy GPS when available.</p>
                  </div>
                  <span className="text-[10px] text-[#757A7F]/60 font-bold uppercase">{moves.length} move{moves.length === 1 ? '' : 's'} this week</span>
                </div>
                {nextMove ? (
                  <div className="p-5 grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#E04343]">{nextMove.dayName} · {nextMove.date}</p>
                      {nextMove.linkJobId ? (
                        <Link href={`/jobs/${encodeURIComponent(nextMove.linkJobId.trim())}`} className="mt-1 block text-lg font-black text-[#3C4043] hover:underline">
                          {nextMove.linkJobId} · {nextMove.job?.Job_Name || nextMove.jobRef}
                        </Link>
                      ) : (
                        <p className="mt-1 text-lg font-black text-[#3C4043]">{nextMove.jobRef || 'Move needs job match'}</p>
                      )}
                      <p className="mt-1 text-sm text-[#757A7F]">{nextMove.activity || 'Move'}{nextMove.state ? ` · ${nextMove.state}` : ''}</p>
                      <p className="mt-2 text-xs text-[#757A7F]">From: {nextMove.origin}</p>
                    </div>
                    <div className="rounded-xl border border-[#DDE2E5] bg-[#FAFCFB] px-5 py-3 text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Distance</p>
                      <p className="text-2xl font-black text-[#3C4043]">{nextMove.miles == null ? '—' : `${nextMove.miles.toFixed(1)} mi`}</p>
                    </div>
                    <div className="rounded-xl border border-[#20BC64]/25 bg-[#20BC64]/5 px-5 py-3 text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#0F8F47]">ETA</p>
                      <p className="text-2xl font-black text-[#0F8F47]">{nextMove.eta}</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-5">
                    <p className="text-sm font-bold text-[#3C4043]">No lowboy moves are scheduled this week.</p>
                    <p className="mt-1 text-xs text-[#757A7F]">This card stays visible so the lowboy plan is never blank.</p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-[#F1F3F4] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Lowboy Queue</h2>
                  <p className="text-[10px] text-[#757A7F] mt-0.5">Each row is matched to the actual job when the schedule text can be resolved.</p>
                </div>
                <span className="text-[10px] text-[#757A7F]/60 font-bold uppercase">{queuedMoves.length} after next</span>
                </div>
                <div className="divide-y divide-[#F1F3F4]">
                  {queuedMoves.length === 0 ? (
                    <div className="p-5 text-sm text-[#757A7F]">No other lowboy moves queued this week.</div>
                  ) : queuedMoves.map((m, idx) => (
                    <div key={`${m.date}-${idx}`} className="grid gap-3 px-5 py-4 lg:grid-cols-[1fr_140px_120px] lg:items-center">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{m.dayName} · {m.date}</p>
                        {m.linkJobId ? (
                          <Link href={`/jobs/${encodeURIComponent(m.linkJobId.trim())}`} className="font-black text-[#3C4043] hover:underline">
                            {m.linkJobId} · {m.job?.Job_Name || m.jobRef}
                          </Link>
                        ) : (
                          <p className="font-black text-[#3C4043]">{m.jobRef || 'Move needs job match'}</p>
                        )}
                        <p className="text-xs text-[#757A7F]">{m.activity || 'Move'}{m.state ? ` · ${m.state}` : ''}</p>
                      </div>
                      <div className="text-sm font-black text-[#3C4043]">{m.miles == null ? 'Needs GPS' : `${m.miles.toFixed(1)} mi`}</div>
                      <div className="text-sm font-black text-[#0F8F47]">{m.eta}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* CURRENT WEEK CREW GRID */}
        {renderWeekGrid(schedule.currentWeek, 'Current Week', true)}

        {/* NEXT WEEK CREW GRID */}
        {renderWeekGrid(schedule.nextWeek, 'Next Week', false)}

        {/* TIE UP LOOSE ENDS — from Schedule tab cols 6+35 */}
        <div className="bg-white rounded-xl border border-[#F1F3F4] shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Tie Up Loose Ends</h2>
              <p className="text-[10px] text-[#757A7F] mt-0.5">Live from the Schedule tab.</p>
            </div>
            <span className="text-[10px] text-[#757A7F]/60 font-bold uppercase">
              {(schedule as any).looseEnds?.length || 0} open
            </span>
          </div>
          <div className="p-5">
            {(schedule as any).looseEnds?.length > 0 ? (
              <ul className="space-y-2.5">
                {(schedule as any).looseEnds.map((le: any, i: number) => (
                  <li key={i} className="flex gap-3 items-start text-sm leading-relaxed">
                    <span className="flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-[#F5A623]" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[#3C4043]">{le.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#757A7F] italic">No loose ends this week.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
