import React from 'react';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import MapWrapper from '@/components/MapWrapper';
import { fetchLiveJobs, fetchLiveFieldReports, fetchScheduleData } from '@/lib/sheets-data';

export const dynamic = 'force-dynamic';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

const getLiveJobs = fetchLiveJobs;
const getLiveFieldReports = fetchLiveFieldReports;

// ─── Load Project Scorecards for est/actual comparison ───────────────────────
function loadScorecardEstimates(): Record<string, { estTons: number; estDays: number }> {
  try {
    const filePath = path.join(process.cwd(), 'data', 'Project_Scorecards.csv');
    const text = fs.readFileSync(filePath, 'utf-8');
    const lines = text.trim().split('\n');
    const result: Record<string, { estTons: number; estDays: number }> = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      const jobNum = cols[0]?.trim();
      if (!jobNum) continue;
      const estBinder = parseFloat(cols[5] || '0') || 0;
      const estTopping = parseFloat(cols[7] || '0') || 0;
      const estStone = parseFloat(cols[3] || '0') || 0;
      const estDays = parseFloat(cols[9] || '0') || 0;
      result[jobNum] = { estTons: estBinder + estTopping + estStone, estDays };
    }
    return result;
  } catch { return {}; }
}

// ─── Haversine distance (miles) ───────────────────────────────────────────────
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getSamsaraData() {
  const SAMSARA_API_KEY = process.env.SAMSARA_API_KEY || '';
  if (!SAMSARA_API_KEY) return { vehicles: [], crews: [], configured: false };
  try {
    const headers = { Authorization: `Bearer ${SAMSARA_API_KEY}`, 'Content-Type': 'application/json' };
    const KEY_NAMES = [
      'alex',      // Alex Sifuentes
      'david',     // David Blaylock + David Moctezuma
      'jeff',      // Jeff Reece
      'juan',      // Juan De Lara
      'pedro',     // Pedro De Lara
      'julio',     // Julio Lopez
      'martin',    // Martin De Lara
      'rosendo',   // Rosendo Rubio
      'sergio',    // Sergio Sifuentes
    ];


    const [vehicleRes, driverRes] = await Promise.all([
      fetch('https://api.samsara.com/fleet/vehicles/locations', { headers, next: { revalidate: 60 } }),
      fetch('https://api.samsara.com/fleet/drivers?driverActivationStatus=active', { headers, next: { revalidate: 300 } }),
    ]);

    const vehicles = vehicleRes.ok
      ? ((await vehicleRes.json()).data || [])
          .map((v: any) => ({
            id: v.id, name: v.name,
            lat: v.location?.latitude, lng: v.location?.longitude,
            speed: v.location?.speed || 0, heading: v.location?.heading || 0,
            address: v.location?.reverseGeo?.formattedLocation || '',
            status: 'active', driver: v.staticAssignedDriver?.name || 'Unassigned',
          }))
          .filter((v: any) => v.lat && v.lng)
          .filter((v: any) => KEY_NAMES.some(k => (v.name || '').toLowerCase().includes(k)))
      : [];

    const crews = driverRes.ok
      ? ((await driverRes.json()).data || []).map((d: any) => ({
          id: d.id, name: d.name, phone: d.phone || '',
          status: d.eldExempt ? 'exempt' : 'on_duty',
        }))
      : [];

    return { vehicles, crews, configured: true, timestamp: new Date().toISOString() };
  } catch { return { vehicles: [], crews: [], configured: false }; }
}


async function getCrossCheckData() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/cross-check/samsara-reports`, { cache: 'no-store' });
    if (!res.ok) return { vehiclesOnSite: [], onSiteNoReport: [], scheduledNoActivity: [], configured: false };
    return await res.json();
  } catch { return { vehiclesOnSite: [], onSiteNoReport: [], scheduledNoActivity: [], configured: false }; }
}

async function getWeatherAlerts() {
  const THRESHOLD = 40; // ≥40% rain = operational risk
  // Use Eastern time — UTC can be next day after 8PM EDT
  const eastNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayISO = `${eastNow.getFullYear()}-${String(eastNow.getMonth()+1).padStart(2,'0')}-${String(eastNow.getDate()).padStart(2,'0')}`;

  try {
    const jobs = await fetchLiveJobs();
    // Dedupe locations
    const seen = new Set<string>();
    const locationJobs: { lat: number; lng: number; job: any }[] = [];
    for (const job of jobs) {
      if (!job) continue;
      if (!job.Lat || !job.Lng) continue;
      const lat = parseFloat(job.Lat);
      const lng = parseFloat(job.Lng);
      if (isNaN(lat) || isNaN(lng)) continue;
      const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (!seen.has(key)) seen.add(key);
      locationJobs.push({ lat, lng, job });
    }

    const alerts: any[] = [];
    await Promise.all(locationJobs.slice(0, 15).map(async ({ lat, lng, job }) => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,precipitation_probability_max,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=7`;
        const res = await fetch(url, { next: { revalidate: 1800 } });
        if (!res.ok) return;
        const weather = await res.json();
        const daily = weather.daily;
        if (!daily?.time) return;
        for (let i = 0; i < daily.time.length; i++) {
          const dateStr = daily.time[i];
          const precipProb = daily.precipitation_probability_max?.[i] || 0;
          const wind = Math.round(daily.windspeed_10m_max?.[i] || 0);
          const code = daily.weathercode?.[i] || 0;
          const severe = code >= 51; // drizzle+ is a construction risk
          const isToday = dateStr === todayISO;
          if (precipProb >= THRESHOLD || severe || wind >= 30) {
            const condLabel = code >= 95 ? 'Thunderstorm' : code >= 80 ? 'Rain Showers' : code >= 61 ? 'Rain' : code >= 51 ? 'Drizzle' : code >= 45 ? 'Fog' : 'Rain Risk';
            alerts.push({
              date: dateStr, isToday, severity: isToday ? 'critical' : 'warning',
              job: job?.Job_Number, jobName: job?.Job_Name,
              pm: job?.Project_Manager || '',
              precipProb, wind, condition: condLabel,
              message: `⛈️ WEATHER RISK${isToday ? ' TODAY' : ` ${dateStr}`} — ${condLabel} at ${job?.Job_Name || job?.Job_Number}: ${precipProb}% rain, wind ${wind}mph`,
            });
          }
        }
      } catch { /* skip bad coord */ }
    }));
    return alerts.sort((a, b) => (a.isToday === b.isToday ? a.date.localeCompare(b.date) : a.isToday ? -1 : 1));
  } catch { return []; }
}



// ─── Parse schedule date ────────────────────────────────────────────────────
function parseJobDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length < 3) return null;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
  return isNaN(d.getTime()) ? null : d;
}


// ─── Scheduled Jobs State Engine ─────────────────────────────────────────────
// A job is SCHEDULED if it appears on a crew row in THIS WEEK's schedule grid.
// Source of truth: currentWeek parsed day assignments ONLY (Mon–Fri this week).
function isScheduledCurrently(job: any, scheduleData: any): boolean {
  const jobName = (job.Job_Name || '').toLowerCase();
  const jobNum = (job.Job_Number || '');

  // Scan only this week's schedule grid (Mon–Fri current week)
  const currentWeekDays: any[] = scheduleData?.currentWeek?.days || [];
  for (const day of currentWeekDays) {
    for (const assignment of (day.assignments || [])) {
      if (assignment.decoded?.isOff) continue;
      const ref = (assignment.decoded?.jobRef || '').toLowerCase();
      if (assignment.ganttMatch?.jobNumber && assignment.ganttMatch.jobNumber === jobNum) return true;
      const refWord = ref.split(' ')[0];
      const nameWord = jobName.split(' ')[0];
      if (refWord && refWord.length > 3 && jobName.includes(refWord)) return true;
      if (nameWord && nameWord.length > 3 && ref.includes(nameWord)) return true;
    }
  }

  return false;
}


function isJobScheduled(job: any): boolean {
  const start = parseJobDate(job.Start_Date);
  if (!start) return false;
  return start <= new Date();
}

// ─── Health scoring ──────────────────────────────────────────────────────────
function getJobHealth(job: any, report: any): 'green' | 'amber' | 'red' {
  const pct = job.Pct_Complete || 0;
  const hasReport = !!report;
  const scheduled = isJobScheduled(job);

  // If the job hasn't hit its start date yet, it's pre-construction → green
  if (!scheduled) return 'green';

  // Scheduled and active — now check real indicators
  if (pct === 0 && !hasReport) return 'red';      // should have started, zero activity
  if (pct > 0 && pct < 30 && !hasReport) return 'amber'; // some billing but no field data
  if (pct >= 80 && report && (report.Base_Actual + report.Asphalt_Actual) === 0) return 'amber';
  return 'green';
}

// ─── Module 3: Risk & Alerts Engine ─────────────────────────────────────────
function computeRisks(
  jobs: any[],
  reportMap: Record<string, any>,
  scheduleData: any,
  weatherAlerts: any[],
  scorecardEstimates: Record<string, { estTons: number; estDays: number }>,
  prepBoard: any[],
  scheduledJobs: any[]
) {
  // Display weather alerts for ALL active jobs, since schedule data might be missing current week
  const activeJobNums = new Set(jobs.filter(j => isJobScheduled(j)).map(j => j.Job_Number));
  const scheduledWeatherAlerts = weatherAlerts.filter((a: any) => activeJobNums.has(a.job));

  const risks: { level: 'critical' | 'warning' | 'info'; job?: string; message: string }[] = [];
  const now = new Date();
  // Use Eastern time — UTC can flip to next day after 8PM EDT
  const eastNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayISO = `${eastNow.getFullYear()}-${String(eastNow.getMonth()+1).padStart(2,'0')}-${String(eastNow.getDate()).padStart(2,'0')}`;

  // EST offset: UTC-5 (standard) / UTC-4 (daylight)
  const estHour = now.getUTCHours() - 4; // approximate EDT

  // ── CONDITION 1: Missing Jotform ─────────────────────────────────────────
  // Crew scheduled today but zero field reports, after 10AM EST
  const todayDays = (scheduleData?.currentWeek?.days || []).filter((d: any) => d.date === todayISO);
  if (estHour >= 10) {
    for (const day of todayDays) {
      const jobsScheduledToday = new Set<{ ref: string; jobNum?: string }>();
      for (const assignment of (day.assignments || [])) {
        if (!assignment.decoded?.isOff && assignment.crewType === 'primary') {
          const ref = assignment.decoded?.jobRef;
          if (ref) jobsScheduledToday.add({ ref: ref.toLowerCase(), jobNum: assignment.ganttMatch?.jobNumber });
        }
      }
      for (const schedObj of Array.from(jobsScheduledToday)) {
        let matchedJob = jobs.find(j => j.Job_Number === schedObj.jobNum);
        if (!matchedJob) {
          matchedJob = jobs.find(j => {
            const nameWord = (j.Job_Name || '').toLowerCase().split(' ')[0];
            return nameWord.length > 3 && schedObj.ref.includes(nameWord);
          });
        }
        if (matchedJob && !reportMap[matchedJob.Job_Number]) {
          risks.push({ level: 'critical', job: matchedJob.Job_Number, message: `MISSING JOTFORM: Crew scheduled at ${matchedJob.Job_Name} today but NO field report submitted as of ${estHour}:00 EST. PM: ${matchedJob.Project_Manager}. Action: Contact foreman immediately.` });
        }
      }
    }
  }

  // ── CONDITION 2: Material Overrun ─────────────────────────────────────────
  // Cumulative Jotform tonnage > estimated tonnage from Project Scorecards
  for (const [jobNum, report] of Object.entries(reportMap)) {
    const est = scorecardEstimates[jobNum];
    if (!est || est.estTons === 0) continue;
    const actualTons = (report.GAB_Tonnage || 0) + (report.Binder_Tonnage || 0) + (report.Topping_Tonnage || 0);
    if (actualTons > est.estTons) {
      const pctOver = Math.round(((actualTons - est.estTons) / est.estTons) * 100);
      const job = jobs.find(j => j.Job_Number === jobNum);
      if (job) risks.push({ level: 'warning', job: jobNum, message: `FINANCIAL RISK — MATERIAL OVERRUN: ${job.Job_Name} has consumed ${actualTons.toLocaleString()}t vs ${est.estTons.toLocaleString()}t estimated (${pctOver}% over). PM: ${job.Project_Manager}. Review material yield and adjust remaining quantities.` });
    }
  }

  // ── CONDITION 3: Days on Site Overrun ────────────────────────────────────
  // Field report day count > allotted days from Project Scorecards
  for (const [jobNum, report] of Object.entries(reportMap)) {
    const est = scorecardEstimates[jobNum];
    if (!est || est.estDays === 0) continue;
    const actualDays = report.Days_Active || 0;
    if (actualDays > est.estDays) {
      const daysOver = actualDays - est.estDays;
      const job = jobs.find(j => j.Job_Number === jobNum);
      if (job) risks.push({ level: 'warning', job: jobNum, message: `SCHEDULE RISK — DAYS OVERRUN: ${job.Job_Name} is ${daysOver}d over allotted days on site (${actualDays} logged vs ${est.estDays} estimated). PM: ${job.Project_Manager}. Verify equipment off-rent and escalate if needed.` });
    }
  }

  // ── CONDITION 4: Weather Risk (≥40% rain during working hours) ───────────
  // Look back 1 day (today in EST may already be tomorrow in UTC) and forward 3 days
  const yesterdayISO = new Date(eastNow.getTime() - 86400000).toISOString().split('T')[0];
  const threeDaysOut = new Date(eastNow.getTime() + 3 * 86400000).toISOString().split('T')[0];
  scheduledWeatherAlerts
    .filter((a: any) => a.date >= yesterdayISO && a.date <= threeDaysOut)
    .slice(0, 8)
    .forEach((wx: any) => {
      const lvl = (wx.isToday || wx.severity === 'critical' || (wx.precipProb || 0) >= 70) ? 'critical' as const : 'warning' as const;
      const todayTag = wx.isToday ? 'TODAY — ' : `${wx.date} — `;
      risks.push({
        level: lvl,
        job: wx.job,
        message: `WEATHER RISK: ⛈️ ${todayTag}${wx.condition || 'Rain'} at ${wx.jobName}: ${wx.precipProb}% rain chance, wind ${wx.wind}mph. PM: ${wx.pm || 'N/A'}. Plan for possible work stoppage.`,
      });
    });


  // ── CONDITION 5: Vendor/Credit Account Missing ───────────────────────────
  // Uses Job Prep Board credit status as proxy for vendor account status
  for (const prep of prepBoard) {
    const creditStatus = (prep.Asphalt_Plant_Credit || prep.Plant_Credit || '').toLowerCase();
    const quarryStatus = (prep.Quarry_Credit || prep.Stone_Credit || '').toLowerCase();
    const isBad = (s: string) => s && ['pending', 'missing', 'not approved', 'inactive', 'hold'].some(k => s.includes(k));
    if (isBad(creditStatus) || isBad(quarryStatus)) {
      const job = jobs.find(j => j.Job_Number === prep.Job_Number);
      if (job) {
        const bad = [isBad(creditStatus) ? 'Asphalt Plant' : '', isBad(quarryStatus) ? 'Quarry' : ''].filter(Boolean).join(' & ');
        risks.push({ level: 'warning', job: prep.Job_Number, message: `SUPPLY CHAIN RISK: ${job.Job_Name} — ${bad} account status is NOT active. PM: ${job.Project_Manager}. Resolve credit before mobilization.` });
      }
    }
  }

  return risks.slice(0, 15);
}

export default async function MasterDashboard() {
  // Fetch all data in parallel
  const [jobs, fieldReports, samsara, crossCheck, weatherAlerts, scheduleData] = await Promise.all([
    getLiveJobs(),
    getLiveFieldReports(),
    getSamsaraData(),
    getCrossCheckData(),
    getWeatherAlerts(),
    fetchScheduleData(),
  ]);

  // Load local estimates for risk engine
  const scorecardEstimates = loadScorecardEstimates();

  // Load prep board for vendor credit status
  let prepBoard: any[] = [];
  try {
    const prepText = fs.readFileSync(path.join(process.cwd(), 'data', 'Job_Prep_Board.csv'), 'utf-8');
    const prepLines = prepText.trim().split('\n');
    const headers = prepLines[0].split(',').map((h: string) => h.trim());
    prepBoard = prepLines.slice(1).map((line: string) => {
      const cols = line.split(',');
      const obj: any = {};
      headers.forEach((h: string, i: number) => obj[h] = cols[i]?.trim() || '');
      return obj;
    });
  } catch { prepBoard = []; }

  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) reportMap[r.Job_Number] = r;

  // ── Scheduled Jobs State Engine ──────────────────────────────────────────
  // ScheduledStatus = TRUE: appears on master schedule within ±7 days of today
  const scheduledJobs = jobs.filter((j: any) => isScheduledCurrently(j, scheduleData));

  // On schedule this week but no field report yet
  const scheduledNotMobilized = jobs.filter((j: any) =>
    isScheduledCurrently(j, scheduleData) && !reportMap[j.Job_Number]
  );

  // Not on current schedule window
  const upcomingJobs = jobs.filter((j: any) => !isScheduledCurrently(j, scheduleData));


  const totalPortfolio = jobs.reduce((sum: number, j: any) => sum + (j.Contract_Amount || 0), 0);
  const totalBilled = jobs.reduce((sum: number, j: any) => sum + (j.Billed_To_Date || 0), 0);
  const overallPct = totalPortfolio > 0 ? Math.round((totalBilled / totalPortfolio) * 100) : 0;

  // Scorecard aggregates
  const totalAsphaltLogged = fieldReports.reduce((s: number, r: any) => s + (r.Asphalt_Actual || 0), 0);
  const totalBaseLogged = fieldReports.reduce((s: number, r: any) => s + (r.Base_Actual || 0), 0);
  const totalManHours = fieldReports.reduce((s: number, r: any) => s + (r.Total_Man_Hours || 0), 0);
  const totalCrew = fieldReports.reduce((s: number, r: any) => s + (r.Crew_Count || 0), 0);

  const risks = computeRisks(jobs, reportMap, scheduleData, weatherAlerts, scorecardEstimates, prepBoard, scheduledJobs);


  const criticalCount = risks.filter(r => r.level === 'critical').length;
  const warningCount = risks.filter(r => r.level === 'warning').length;

  // Job health summary
  const healthCounts = { green: 0, amber: 0, red: 0 };
  scheduledJobs.forEach((j: any) => { healthCounts[getJobHealth(j, reportMap[j.Job_Number])]++; });

  const healthColor = { green: '#20BC64', amber: '#fb923c', red: '#ef4444' };
  const riskColor = { critical: '#ef4444', warning: '#fb923c', info: '#60a5fa' };
  const riskBg = { critical: 'rgba(239,68,68,0.07)', warning: 'rgba(251,146,60,0.07)', info: 'rgba(96,165,250,0.07)' };
  const riskBorder = { critical: 'rgba(239,68,68,0.2)', warning: 'rgba(251,146,60,0.2)', info: 'rgba(96,165,250,0.2)' };

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans flex flex-col pb-10 antialiased overflow-x-hidden">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col w-full sticky top-0 z-50 shadow-2xl">
        <div className="px-8 py-5 bg-[#2A2D31] flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#20BC64] rounded-lg flex items-center justify-center font-black text-white text-lg">S</div>
            <span className="text-white font-black text-xl tracking-wide">SUNBELT SPORTS</span>
          </div>
          <div className="flex items-center gap-4">
            {criticalCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-black text-red-400 bg-red-400/10 border border-red-400/20 rounded-full px-3 py-1">
                🔴 {criticalCount} Critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-black text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1">
                ⚠️ {warningCount} Warnings
              </span>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#20BC64] animate-pulse"></div>
              <span className="text-xs text-white/40 font-bold uppercase tracking-widest">Live Data</span>
            </div>
          </div>
        </div>
        <div className="bg-[#1e2023] px-8 py-3 border-y border-white/5 shadow-md flex justify-between items-center">
          <h1 className="text-xl font-black uppercase tracking-wide text-white/90">Construction Management Portal</h1>
          <p className="text-xs text-white/30 font-bold">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 w-full max-w-[1920px] mx-auto p-6">

        {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'Scheduled Jobs', value: scheduledJobs.length.toString(), sub: 'Within ±7 day window', color: '#20BC64' },
            { label: 'Portfolio Value', value: `$${(totalPortfolio / 1000000).toFixed(1)}M`, sub: 'Total contract value', color: '#60a5fa' },
            { label: 'Billed To Date', value: `$${(totalBilled / 1000000).toFixed(1)}M`, sub: `${overallPct}% collected`, color: '#a78bfa' },
            { label: 'Crews Live', value: samsara.configured ? samsara.vehicles.length.toString() : '—', sub: samsara.configured ? 'Samsara GPS' : 'No API key', color: '#fb923c' },
            { label: 'Field Reports', value: fieldReports.length.toString(), sub: 'Jobs with Jotform data', color: '#20BC64' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-[#1e2023] rounded-2xl p-5 border border-white/5 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">{kpi.label}</p>
              <p className="text-4xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-xs text-white/30 mt-1">{kpi.sub}</p>
            </div>
          ))}
        </div>

        {/* ── ROW 2: MAP + RISK BOX ───────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* LIVE MAP */}
          <div className="col-span-12 lg:col-span-8 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden" style={{ minHeight: '500px' }}>
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Live Operations Map</h2>
                <div className="flex items-center gap-3 text-xs font-bold">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-[#20BC64] inline-block"></span>Job Site</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-400 inline-block"></span>Vehicle</span>
                  <span className="flex items-center gap-1.5 text-white/30">● Green &gt;40% · Orange &lt;40% · Red Stalled</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#20BC64] font-bold">{scheduledJobs.filter((j:any) => j.Lat && j.Lng).length} Pinned</span>
                {samsara.configured && <span className="text-blue-400 font-bold">{samsara.vehicles.length} Vehicles</span>}
              </div>
            </div>
            <div style={{ height: '460px' }}>
              <MapWrapper
                jobs={scheduledJobs.map((j: any) => {
                  const jobLat = parseFloat(j.Lat);
                  const jobLng = parseFloat(j.Lng);
                  // Module 2: Find nearest Samsara vehicle within 10 miles
                  let nearestVehicle: { name: string; driver: string; miles: number } | null = null;
                  if (!isNaN(jobLat) && !isNaN(jobLng) && samsara.vehicles?.length) {
                    let minDist = Infinity;
                    for (const v of samsara.vehicles) {
                      if (!v.lat || !v.lng) continue;
                      const dist = haversineDistance(jobLat, jobLng, v.lat, v.lng);
                      if (dist < minDist && dist <= 10) {
                        minDist = dist;
                        nearestVehicle = { name: v.name, driver: v.driver, miles: dist };
                      }
                    }
                  }
                  return {
                    Job_Number: j.Job_Number,
                    Job_Name: j.Job_Name,
                    Lat: j.Lat,
                    Lng: j.Lng,
                    Status: j.Status,
                    Pct_Complete: j.Pct_Complete || 0,
                    General_Contractor: j.General_Contractor,
                    Contract_Amount: j.Contract_Amount || 0,
                    nearestVehicle,
                  };
                })}
                vehicles={samsara.vehicles || []}
              />
            </div>
          </div>

          {/* RISK BOX */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-white/5 flex justify-between items-center flex-shrink-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Risk & Alerts</h2>
              <div className="flex gap-2">
                {criticalCount > 0 && <span className="text-xs font-black text-red-400 bg-red-400/10 rounded-full px-2 py-0.5">{criticalCount} Critical</span>}
                {warningCount > 0 && <span className="text-xs font-black text-amber-400 bg-amber-400/10 rounded-full px-2 py-0.5">{warningCount} Warn</span>}
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-4 space-y-3 flex-1">
              {risks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-2">✅</p>
                  <p className="text-[#20BC64] font-bold text-sm">All Clear</p>
                  <p className="text-white/30 text-xs mt-1">No active risks detected</p>
                </div>
              ) : risks.map((risk, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 border"
                  style={{ backgroundColor: riskBg[risk.level], borderColor: riskBorder[risk.level] }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-sm flex-shrink-0 mt-0.5">
                      {risk.level === 'critical' ? '🔴' : risk.level === 'warning' ? '⚠️' : 'ℹ️'}
                    </span>
                    <div>
                      {risk.job && (
                        <Link href={`/jobs/${risk.job}`} className="text-[10px] font-black uppercase tracking-widest mb-1 block hover:text-white transition-colors" style={{ color: riskColor[risk.level] }}>
                          {risk.job} {(() => { const j = jobs.find((jb: any) => jb.Job_Number === risk.job); return j?.Job_Name ? `· ${j.Job_Name}` : ''; })()} →
                        </Link>
                      )}
                      <p className="text-xs text-white/70 leading-relaxed">{risk.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── ROW 3: SCORECARD + JOB HEALTH ──────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* PORTFOLIO SCORECARD */}
          <div className="col-span-12 lg:col-span-5 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-white/5">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Portfolio Scorecard — Estimated vs. Actual</h2>
              <p className="text-xs text-white/30 mt-1">Billing % from Google Sheets · Tonnage from Jotform field reports</p>
            </div>
            <div className="p-5 space-y-5">

              {/* Billing Progress */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-white/50">Portfolio Billed</span>
                  <span className="text-xs font-bold text-[#20BC64]">${(totalBilled/1000000).toFixed(2)}M / ${(totalPortfolio/1000000).toFixed(2)}M</span>
                </div>
                <div className="relative h-6 bg-white/5 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#20BC64] to-[#16a558] rounded-full transition-all" style={{ width: `${overallPct}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{overallPct}% Billed</span>
                </div>
              </div>

              {/* Asphalt Tonnage */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-white/50">Asphalt Tonnage (Jotform)</span>
                  <span className="text-xs font-bold text-blue-400">{totalAsphaltLogged.toLocaleString()} tons logged</span>
                </div>
                <div className="relative h-5 bg-white/5 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-blue-500/70 rounded-full" style={{ width: `${Math.min(100, (totalAsphaltLogged / Math.max(1, totalAsphaltLogged * 1.3)) * 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{totalAsphaltLogged.toLocaleString()} tons</span>
                </div>
              </div>

              {/* Base Tonnage */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-white/50">Base / GAB Tonnage (Jotform)</span>
                  <span className="text-xs font-bold text-purple-400">{totalBaseLogged.toLocaleString()} tons logged</span>
                </div>
                <div className="relative h-5 bg-white/5 rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-purple-500/70 rounded-full" style={{ width: `${Math.min(100, (totalBaseLogged / Math.max(1, totalBaseLogged * 1.3)) * 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{totalBaseLogged.toLocaleString()} tons</span>
                </div>
              </div>

              {/* Labour */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-white/30 font-bold uppercase mb-1">Total Man-Hours</p>
                  <p className="text-2xl font-black text-amber-400">{totalManHours.toLocaleString()}</p>
                  <p className="text-[10px] text-white/20">from Jotform reports</p>
                </div>
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-white/30 font-bold uppercase mb-1">Reported Jobs</p>
                  <p className="text-2xl font-black text-[#20BC64]">{fieldReports.length}</p>
                  <p className="text-[10px] text-white/20">of {jobs.length} total</p>
                </div>
              </div>

              {/* Per-job billing vs activity mismatch summary */}
              <div className="pt-2 border-t border-white/5">
                <p className="text-xs font-black uppercase tracking-widest text-white/30 mb-3">Billing vs. Activity Summary</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(['green','amber','red'] as const).map(h => (
                    <div key={h} className="rounded-lg p-2" style={{ background: `${healthColor[h]}10`, border: `1px solid ${healthColor[h]}20` }}>
                      <p className="text-xl font-black" style={{ color: healthColor[h] }}>{healthCounts[h]}</p>
                      <p className="text-[10px] font-bold uppercase text-white/40">{h === 'green' ? 'On Track' : h === 'amber' ? 'Watch' : 'At Risk'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* QUICK JOB HEALTH */}
          <div className="col-span-12 lg:col-span-7 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Quick Job Health</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#20BC64] font-bold">● On Track</span>
                <span className="text-amber-400 font-bold">● Watch</span>
                <span className="text-red-400 font-bold">● At Risk</span>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: '380px' }}>
              {scheduledJobs.map((job: any) => {
                const health = getJobHealth(job, reportMap[job.Job_Number]);
                const pct = Math.round(job.Pct_Complete || 0);
                const report = reportMap[job.Job_Number];
                const asphaltT = report?.Asphalt_Actual || 0;
                const baseT = report?.Base_Actual || 0;
                return (
                  <Link
                    key={job.Job_Number}
                    href={`/jobs/${job.Job_Number}`}
                    className="rounded-xl p-3 border transition-all hover:scale-[1.02]"
                    style={{
                      background: `${healthColor[health]}07`,
                      borderColor: `${healthColor[health]}25`,
                      borderLeftWidth: '3px',
                      borderLeftColor: healthColor[health],
                    }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black text-white/40">{job.Job_Number}</span>
                      <span className="text-[10px] font-black uppercase" style={{ color: healthColor[health] }}>
                        {health === 'green' ? '● OK' : health === 'amber' ? '● Watch' : '● Risk'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white leading-tight mb-2 line-clamp-1">{job.Job_Name}</p>
                    <div className="flex flex-col gap-1">
                      <div>
                        <div className="flex justify-between text-[9px] text-white/30 mb-0.5">
                          <span>Billed</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: healthColor[health] }} />
                        </div>
                      </div>
                      {(asphaltT > 0 || baseT > 0) && (
                        <div className="mt-1 flex gap-2 text-[9px] text-white/25">
                          {asphaltT > 0 && <span className="text-blue-400/60">{asphaltT.toLocaleString()}t asph</span>}
                          {baseT > 0 && <span className="text-purple-400/60">{baseT.toLocaleString()}t base</span>}
                        </div>
                      )}
                      {!report && <p className="text-[9px] text-red-400/60 mt-1">No field reports</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ROW 4: JOB LIST + PORTFOLIO TABLE ─────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* LIVE MISSION PROGRESS */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl flex flex-col overflow-hidden" style={{ maxHeight: '500px' }}>
            <div className="p-5 border-b border-white/5 flex justify-between items-center flex-shrink-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Live Mission Progress</h2>
              <span className="text-xs text-white/20 font-bold uppercase">Click a job</span>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-4 space-y-3 flex-1">
              {scheduledJobs.map((job: any) => {
                const pct = Math.round(job.Pct_Complete || 0);
                const report = reportMap[job.Job_Number];
                const health = getJobHealth(job, report);
                return (
                  <Link
                    key={job.Job_Number}
                    href={`/jobs/${job.Job_Number}`}
                    className="block bg-black/30 rounded-xl p-4 border border-white/5 hover:scale-[1.01] transition-all group"
                    style={{ borderLeftWidth: '3px', borderLeftColor: healthColor[health] }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-white text-sm leading-tight">{job.Job_Name}</p>
                        <p className="text-xs text-white/40 mt-0.5">{job.General_Contractor} · {job.Project_Manager} PM · {job.State}</p>
                      </div>
                      <span className="text-xs font-black ml-2 flex-shrink-0" style={{ color: healthColor[health] }}>{pct}%</span>
                    </div>
                    <div className="flex gap-1 mb-1">
                      <span className="text-[10px] text-white/30 w-14 flex-shrink-0">Billed</span>
                      <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: healthColor[health] }} />
                      </div>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] text-white/25">{job.Job_Number}</span>
                      <span className="text-[10px] text-white/25">${(job.Contract_Amount || 0).toLocaleString()}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* FULL PORTFOLIO TABLE */}
          <div className="col-span-12 lg:col-span-8 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
            <div className="p-5 border-b border-white/5 flex justify-between items-center">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Full Portfolio — {jobs.length} Jobs</h2>
              <span className="text-xs text-white/20 font-bold uppercase">Google Sheets · Live</span>
            </div>
            <div className="overflow-x-auto overflow-y-auto custom-scrollbar" style={{ maxHeight: '440px' }}>
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-[#1e2023] z-10">
                  <tr className="border-b border-white/5">
                    {['Job #', 'Name', 'GC', 'PM', 'State', 'Status', 'Contract', '% Complete', 'Health'].map(h => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-widest text-white/30 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job: any, i: number) => {
                    const pct = Math.round(job.Pct_Complete || 0);
                    const health = getJobHealth(job, reportMap[job.Job_Number]);
                    const statusColor = job.Status === 'Executed' ? '#20BC64' : job.Status === 'Signed' ? '#60a5fa' : job.Status === 'Received' ? '#fb923c' : '#9ca3af';
                    return (
                      <tr key={job.Job_Number} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.02]'}`}>
                        <td className="px-4 py-3">
                          <Link href={`/jobs/${job.Job_Number}`} className="text-[#20BC64] font-bold hover:text-white transition-colors text-xs">{job.Job_Number}</Link>
                        </td>
                        <td className="px-4 py-3 font-medium text-white/80 max-w-[180px] truncate text-xs">{job.Job_Name}</td>
                        <td className="px-4 py-3 text-white/40 text-xs truncate max-w-[120px]">{job.General_Contractor}</td>
                        <td className="px-4 py-3 text-white/40 text-xs">{job.Project_Manager}</td>
                        <td className="px-4 py-3"><span className="text-xs bg-white/5 rounded px-2 py-0.5 text-white/50">{job.State}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>{job.Status}</span></td>
                        <td className="px-4 py-3 text-white/60 text-xs font-mono whitespace-nowrap">${(job.Contract_Amount || 0).toLocaleString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-white/5 rounded-full h-1.5 overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: healthColor[health] }} />
                            </div>
                            <span className="text-xs text-white/40">{pct}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-black" style={{ color: healthColor[health] }}>
                            {health === 'green' ? '● OK' : health === 'amber' ? '● Watch' : '● Risk'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
