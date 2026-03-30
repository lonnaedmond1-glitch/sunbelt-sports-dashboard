import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
      'alex',              // Alex Sifuentes
      'sergio',            // Sergio Sifuentes
      'martin',            // Martin De Lara
      'julio',             // Julio Lopez
      'juan',              // Juan De Lara
      'cesar',             // Cesar
      'david moctezuma',   // David Moctezuma (specific to avoid matching DeJuan, etc.)
      'rosendo',           // Rosendo Rubio
      'lowboy',            // Lowboy 1 & 2
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
          .filter((v: any) => {
            const nameLower = (v.name || '').toLowerCase();
            return KEY_NAMES.some(k => new RegExp(`\\b${k}\\b`).test(nameLower));
          })
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


// Cross-check is now inlined — no more self-referencing fetch
function computeCrossCheck(vehicles: any[], jobs: any[], reportMap: Record<string, any>) {
  const PROXIMITY_MILES = 0.5;
  const geoJobs = jobs
    .filter((j: any) => j.Lat && j.Lng && !isNaN(parseFloat(j.Lat)))
    .map((j: any) => ({
      Job_Number: j.Job_Number, Job_Name: j.Job_Name,
      lat: parseFloat(j.Lat), lng: parseFloat(j.Lng),
      PM: j.Project_Manager, Status: j.Status,
      Pct_Complete: j.Pct_Complete || 0, Start_Date: j.Start_Date,
      hasReport: !!reportMap[j.Job_Number],
    }));

  const vehiclesOnSite: any[] = [];
  const onSiteNoReport: any[] = [];
  const scheduledNoActivity: any[] = [];

  for (const vehicle of vehicles) {
    if (!vehicle.lat || !vehicle.lng) continue;
    for (const job of geoJobs) {
      const dist = haversineDistance(vehicle.lat, vehicle.lng, job.lat, job.lng);
      if (dist <= PROXIMITY_MILES) {
        const match = { vehicle: vehicle.name, vehicleAddress: vehicle.address, job: job.Job_Number, jobName: job.Job_Name, pm: job.PM, distance: Math.round(dist * 5280), hasReport: job.hasReport };
        vehiclesOnSite.push(match);
        if (!job.hasReport) onSiteNoReport.push(match);
      }
    }
  }

  const today = new Date();
  for (const job of geoJobs) {
    if (!job.Start_Date) continue;
    const parts = job.Start_Date.split('/');
    if (parts.length < 3) continue;
    let year = parseInt(parts[2]); if (year < 100) year += 2000;
    const startDate = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
    if (isNaN(startDate.getTime()) || startDate > today) continue;
    const hasVehicle = vehiclesOnSite.some(v => v.job === job.Job_Number);
    if (!hasVehicle && !job.hasReport) {
      scheduledNoActivity.push({ job: job.Job_Number, jobName: job.Job_Name, pm: job.PM });
    }
  }

  return { vehiclesOnSite, onSiteNoReport, scheduledNoActivity, configured: vehicles.length > 0 };
}

async function getWeatherAlerts(jobsPreloaded: any[]) {
  const THRESHOLD = 40;
  const eastNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayISO = `${eastNow.getFullYear()}-${String(eastNow.getMonth()+1).padStart(2,'0')}-${String(eastNow.getDate()).padStart(2,'0')}`;

  try {
    // Dedupe locations — only fetch once per unique lat/lng rounded to 1 decimal
    const seen = new Set<string>();
    const locationJobs: { lat: number; lng: number; job: any }[] = [];
    for (const job of jobsPreloaded) {
      if (!job?.Lat || !job?.Lng) continue;
      const lat = parseFloat(job.Lat);
      const lng = parseFloat(job.Lng);
      if (isNaN(lat) || isNaN(lng)) continue;
      const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (seen.has(key)) continue; // skip duplicate coords
      seen.add(key);
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
// Resolve a schedule assignment to a job number (mirrors schedule page logic)
// IMPORTANT: Format is "Job Name - Scope - State - Vendor"
// We must use decoded.jobRef (just the job name) for name matching, NOT raw text
// which includes the vendor name and could cause false matches (e.g. Scruggs as vendor
// matching to a Scruggs job when the actual job is Chateau Elan)
function resolveAssignmentToJob(assignment: any, jobs: any[]): string | null {
  if (assignment.decoded?.isOff) return null;
  const raw = (assignment.job || assignment.decoded?.raw || assignment.decoded?.jobRef || '').toLowerCase();
  if (!raw) return null;

  // Use jobRef (just the job name portion) for name matching to avoid vendor false matches
  const jobRef = (assignment.decoded?.jobRef || '').toLowerCase();

  // 1. Direct job number match (safe to check full raw for numbers)
  const numMatch = jobs.find((j: any) => j.Job_Number && raw.includes(j.Job_Number.toLowerCase()));
  if (numMatch) return numMatch.Job_Number;

  // 2. Gantt match
  if (assignment.ganttMatch?.jobNumber) return assignment.ganttMatch.jobNumber;

  // 3. Longest substring match using jobRef ONLY (not vendor/supplier)
  const matchTarget = jobRef || raw;
  let bestMatch: any = null;
  let maxLen = 0;
  for (const j of jobs) {
    if (!j?.Job_Name) continue;
    const jName = j.Job_Name.toLowerCase().replace(/ paving| base| hs| \(.*\)/g, '').trim();
    if (jName.length > 4 && matchTarget.includes(jName) && jName.length > maxLen) {
      maxLen = jName.length;
      bestMatch = j;
    }
  }
  if (bestMatch) return bestMatch.Job_Number;

  return null;
}

// Build set of job numbers that appear on this week's and next week's schedule
function getScheduledJobNumbers(scheduleData: any, jobs: any[]): Set<string> {
  const scheduled = new Set<string>();
  const allDays = [
    ...(scheduleData?.currentWeek?.days || []),
    ...(scheduleData?.nextWeek?.days || [])
  ];
  for (const day of allDays) {
    for (const assignment of (day.assignments || [])) {
      const jobNum = resolveAssignmentToJob(assignment, jobs);
      if (jobNum) scheduled.add(jobNum);
    }
  }
  return scheduled;
}

function isScheduledCurrently(job: any, scheduleData: any, jobs: any[]): boolean {
  const scheduledNums = getScheduledJobNumbers(scheduleData, jobs);
  return scheduledNums.has(job.Job_Number || '');
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
  scheduledJobs: any[],
  vehicles: any[]
) {
  // Display weather alerts for ALL active jobs, since schedule data might be missing current week
  const activeJobNums = new Set(jobs.filter(j => isJobScheduled(j)).map(j => j.Job_Number));
  const scheduledWeatherAlerts = weatherAlerts.filter((a: any) => activeJobNums.has(a.job));

  const risks: { level: 'critical' | 'warning' | 'info'; job?: string; message: string }[] = [];
  const now = new Date();
  // Use Eastern time — UTC can flip to next day after 8PM EDT
  const eastNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayISO = `${eastNow.getFullYear()}-${String(eastNow.getMonth()+1).padStart(2,'0')}-${String(eastNow.getDate()).padStart(2,'0')}`;

  const estHour = eastNow.getHours();
  const estMinute = eastNow.getMinutes();
  const timeStr12 = `${estHour > 12 ? estHour - 12 : estHour || 12}:${estMinute.toString().padStart(2, '0')} ${estHour >= 12 ? 'PM' : 'AM'}`;

  // ── CONDITION 1: Missing Field Report from YESTERDAY's schedule ─────────
  const yesterdayDate = new Date(eastNow);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth()+1).padStart(2,'0')}-${String(yesterdayDate.getDate()).padStart(2,'0')}`;
  const allDays = [
    ...(scheduleData?.currentWeek?.days || []),
    ...(((scheduleData as any)?.previousWeek?.days) || []),
  ];
  const yesterdaySchedule = allDays.find((d: any) => d.date === yesterdayStr);
  if (yesterdaySchedule) {
    for (const assignment of (yesterdaySchedule.assignments || [])) {
      if (assignment.decoded?.isOff) continue;
      const crewName = assignment.crew;
      const jobRef = (assignment.decoded?.jobRef || assignment.job || '').toLowerCase();
      const matchedJob = scheduledJobs.find((j: any) => {
        if (!j.Job_Name) return false;
        const jName = j.Job_Name.toLowerCase();
        return jName.length > 4 && jobRef.includes(jName.split(' ')[0]);
      });
      if (matchedJob && !reportMap[matchedJob.Job_Number]) {
        risks.push({ level: 'critical', job: matchedJob.Job_Number, message: `NO FIELD REPORT — ${matchedJob.Job_Name} (${crewName}). No report from yesterday. PM: ${matchedJob.Project_Manager || 'N/A'}.` });
      }
    }
  }

  // ── CONDITION 2: Material Overrun ─────────────────────────────────────────
  // Cumulative field report tonnage > estimated tonnage from Project Scorecards
  for (const [jobNum, report] of Object.entries(reportMap)) {
    const est = scorecardEstimates[jobNum];
    if (!est || est.estTons === 0) continue;
    const actualTons = (report.GAB_Tonnage || 0) + (report.Binder_Tonnage || 0) + (report.Topping_Tonnage || 0);
    if (actualTons > est.estTons) {
      const pctOver = Math.round(((actualTons - est.estTons) / est.estTons) * 100);
      const job = jobs.find(j => j.Job_Number === jobNum);
      if (job) risks.push({ level: 'warning', job: jobNum, message: `MATERIAL OVERRUN — ${job.Job_Name}: ${actualTons.toLocaleString()}t used / ${est.estTons.toLocaleString()}t budgeted (${pctOver}% over). PM: ${job.Project_Manager || 'N/A'}.` });
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
      if (job) risks.push({ level: 'warning', job: jobNum, message: `DAYS OVERRUN — ${job.Job_Name}: ${actualDays}d on site / ${est.estDays}d budgeted (${daysOver}d over). PM: ${job.Project_Manager || 'N/A'}.` });
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
        message: `⛈️ WEATHER — ${wx.jobName} (${todayTag.replace(' — ', '')}): ${wx.condition || 'Rain'}, ${wx.precipProb}% rain, ${wx.wind}mph wind. PM: ${wx.pm || 'N/A'}.`,
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
        risks.push({ level: 'warning', job: prep.Job_Number, message: `CREDIT HOLD — ${job.Job_Name}: ${bad} account not active. PM: ${job.Project_Manager || 'N/A'}. Resolve before mobilization.` });
      }
    }
  }

  // ── CONDITION 6: Schedule Deviation — truck GPS at wrong job ─────────────
  // Map crew schedule names to Samsara vehicle names (first name match)
  if (vehicles.length > 0) {
    const todayAssignments = scheduleData?.currentWeek?.days?.find((d: any) => d.isToday);
    if (todayAssignments) {
      for (const assignment of (todayAssignments.assignments || [])) {
        if (assignment.decoded?.isOff) continue;
        const crewName = (assignment.crew || '').toLowerCase().split(' ')[0]; // first name
        if (!crewName || crewName.length < 3) continue;
        // Find this crew's vehicle by first-name match
        const vehicle = vehicles.find((v: any) => {
          const vName = (v.name || '').toLowerCase();
          return new RegExp(`\\b${crewName}\\b`).test(vName);
        });
        if (!vehicle || !vehicle.lat || !vehicle.lng) continue;
        // Find what job this crew is scheduled at (use jobRef to avoid vendor matches)
        const jobRef = (assignment.decoded?.jobRef || assignment.job || '').toLowerCase();
        const scheduledJob = jobs.find((j: any) => {
          if (!j.Job_Name) return false;
          const jName = j.Job_Name.toLowerCase();
          return jName.length > 4 && jobRef.includes(jName.split(' ')[0]);
        });
        if (!scheduledJob || !scheduledJob.Lat || !scheduledJob.Lng) continue;
        const jLat = parseFloat(scheduledJob.Lat);
        const jLng = parseFloat(scheduledJob.Lng);
        if (isNaN(jLat) || isNaN(jLng)) continue;
        const distToScheduled = haversineDistance(vehicle.lat, vehicle.lng, jLat, jLng);
        if (distToScheduled > 2) {
          // Check if they're at a different job instead
          const atOtherJob = jobs.find((j: any) => {
            if (j.Job_Number === scheduledJob.Job_Number) return false;
            const oLat = parseFloat(j.Lat); const oLng = parseFloat(j.Lng);
            if (isNaN(oLat) || isNaN(oLng)) return false;
            return haversineDistance(vehicle.lat, vehicle.lng, oLat, oLng) <= 2;
          });
          if (atOtherJob) {
            risks.push({ level: 'warning', job: scheduledJob.Job_Number, message: `SCHEDULE DEVIATION — ${assignment.crew}: GPS at ${atOtherJob.Job_Name} but scheduled at ${scheduledJob.Job_Name}. PM: ${scheduledJob.Project_Manager || 'N/A'}.` });
          }
        }
      }
    }
  }

  return risks.slice(0, 15);
}

export default async function MasterDashboard() {
  // Fetch all data in parallel
  const [jobs, fieldReports, samsara, scheduleData] = await Promise.all([
    getLiveJobs(),
    getLiveFieldReports(),
    getSamsaraData(),
    fetchScheduleData(),
  ]);

  // Build report map first — needed by both crossCheck and weather
  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) reportMap[r.Job_Number] = r;

  // Run weather + cross-check with pre-loaded data (eliminates 4+ duplicate fetches)
  const [weatherAlerts, crossCheck] = await Promise.all([
    getWeatherAlerts(jobs),
    Promise.resolve(computeCrossCheck(samsara.vehicles || [], jobs, reportMap)),
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



  // ── Scheduled Jobs State Engine ──────────────────────────────────────────
  // ScheduledStatus = TRUE: appears on master schedule within ±7 days of today
  const scheduledJobs = jobs.filter((j: any) => isScheduledCurrently(j, scheduleData, jobs));

  // On schedule this week but no field report yet
  const scheduledNotMobilized = jobs.filter((j: any) =>
    isScheduledCurrently(j, scheduleData, jobs) && !reportMap[j.Job_Number]
  );

  // Not on current schedule window
  const upcomingJobs = jobs.filter((j: any) => !isScheduledCurrently(j, scheduleData, jobs));


  const totalPortfolio = jobs.reduce((sum: number, j: any) => sum + (j.Contract_Amount || 0), 0);
  const totalBilled = jobs.reduce((sum: number, j: any) => sum + (j.Billed_To_Date || 0), 0);
  const overallPct = totalPortfolio > 0 ? Math.round((totalBilled / totalPortfolio) * 100) : 0;

  // Scorecard aggregates
  const totalAsphaltLogged = fieldReports.reduce((s: number, r: any) => s + (r.Asphalt_Actual || 0), 0);
  const totalBaseLogged = fieldReports.reduce((s: number, r: any) => s + (r.Base_Actual || 0), 0);
  const totalManHours = fieldReports.reduce((s: number, r: any) => s + (r.Total_Man_Hours || 0), 0);
  const totalCrew = fieldReports.reduce((s: number, r: any) => s + (r.Crew_Count || 0), 0);

  // ── Fleet at Jobsites: trucks within 2 miles of any job ──────────────────
  const fleetAtJobsites = samsara.configured ? samsara.vehicles.filter((v: any) => {
    if (!v.lat || !v.lng) return false;
    return jobs.some((j: any) => {
      const jLat = parseFloat(j.Lat); const jLng = parseFloat(j.Lng);
      if (isNaN(jLat) || isNaN(jLng)) return false;
      return haversineDistance(v.lat, v.lng, jLat, jLng) <= 2;
    });
  }) : [];

  // ── Missing Reports: jobs assigned YESTERDAY with no field report ─────────
  const scheduledJobNames = scheduledJobs.map((j: any) => j.Job_Name).filter(Boolean);
  // Find yesterday's date in EST
  const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yesterday = new Date(estNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
  // Look through schedule weeks to find yesterday's assignments
  const allWeekDays = [
    ...(scheduleData?.currentWeek?.days || []),
    ...(((scheduleData as any)?.previousWeek?.days) || []),
  ];
  const yesterdayDay = allWeekDays.find((d: any) => d.date === yesterdayISO);
  const yesterdayJobNums = new Set<string>();
  if (yesterdayDay) {
    for (const assignment of (yesterdayDay.assignments || [])) {
      if (assignment.decoded?.isOff) continue;
      // Use jobRef (job name only) to avoid vendor false matches
      const jobRef = (assignment.decoded?.jobRef || assignment.job || '').toLowerCase();
      const matchedJob = jobs.find((j: any) => {
        if (!j.Job_Name) return false;
        const jName = j.Job_Name.toLowerCase();
        return jName.length > 4 && jobRef.includes(jName.split(' ')[0]);
      });
      if (matchedJob) yesterdayJobNums.add(matchedJob.Job_Number);
    }
  }
  const missingReportJobs = Array.from(yesterdayJobNums)
    .filter(jn => !reportMap[jn])
    .map(jn => jobs.find((j: any) => j.Job_Number === jn))
    .filter(Boolean);

  const risks = computeRisks(jobs, reportMap, scheduleData, weatherAlerts, scorecardEstimates, prepBoard, scheduledJobs, samsara.vehicles || []);


  const criticalCount = risks.filter(r => r.level === 'critical').length;
  const warningCount = risks.filter(r => r.level === 'warning').length;

  // Job health summary
  const healthCounts = { green: 0, amber: 0, red: 0 };
  scheduledJobs.forEach((j: any) => { healthCounts[getJobHealth(j, reportMap[j.Job_Number])]++; });

  const healthColor: Record<string, string> = { green: '#20BC64', amber: '#F5A623', red: '#E04343' };
  const riskColor: Record<string, string> = { critical: '#E04343', warning: '#F5A623', info: '#3C4043' };
  const riskBg: Record<string, string> = { critical: '#FDECEC', warning: '#FEF3DB', info: '#F1F3F4' };
  const riskBorder: Record<string, string> = { critical: 'rgba(224,67,67,0.3)', warning: 'rgba(245,166,35,0.3)', info: 'rgba(60,64,67,0.15)' };

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body flex flex-col pb-10 antialiased overflow-x-hidden">

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="flex flex-col w-full sticky top-0 z-50 shadow-md">
        <div className="px-8 py-4 bg-white flex justify-between items-center border-b border-[#F1F3F4]">
          <div className="flex items-center gap-4">
            <Image src="/sunbelt-sports-logo.png" alt="Sunbelt Sports" width={512} height={160} className="h-10 w-auto" priority unoptimized />
          </div>
          <div className="flex items-center gap-4">
            {criticalCount > 0 && (
              <a href="#risk-alerts" className="pill pill-danger cursor-pointer hover:opacity-80 transition-opacity">
                🔴 {criticalCount} Critical
              </a>
            )}
            {warningCount > 0 && (
              <a href="#risk-alerts" className="pill pill-warning cursor-pointer hover:opacity-80 transition-opacity">
                ⚠️ {warningCount} Warnings
              </a>
            )}
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#20BC64] animate-pulse"></div>
              <span className="text-xs text-[#757A7F] font-display font-bold uppercase tracking-widest">Live Data</span>
            </div>
          </div>
        </div>
        <div className="bg-white px-8 py-3 border-b-2 border-[#3C4043] flex justify-between items-center">
          <h1 className="font-display text-xl font-black uppercase tracking-wide text-[#3C4043]">Construction Management Portal</h1>
          <p className="text-xs text-[#757A7F] font-display font-bold">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>
      </header>

      <div className="flex flex-col gap-6 w-full max-w-[1920px] mx-auto p-6">

        {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Scheduled Jobs */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Scheduled Jobs</p>
            <p className="text-4xl font-display font-black text-[#20BC64]">{scheduledJobs.length}</p>
            <div className="text-xs text-[#757A7F] mt-1 leading-relaxed">{scheduledJobNames.length > 0 ? scheduledJobNames.slice(0, 8).map((name, i) => (<div key={i}>{name}</div>)) : 'None this week'}</div>
          </div>
          {/* Portfolio Value */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Portfolio Value</p>
            <p className="text-4xl font-display font-black text-[#3C4043]">${(totalPortfolio / 1000000).toFixed(1)}M</p>
            <p className="text-xs text-[#757A7F] mt-1">Total contract value</p>
          </div>
          {/* Billed To Date */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Billed To Date</p>
            <p className="text-4xl font-display font-black text-[#20BC64]">${(totalBilled / 1000000).toFixed(1)}M</p>
            <p className="text-xs text-[#757A7F] mt-1">{overallPct}% collected</p>
          </div>
          {/* Fleet Tracking */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Fleet at Jobsites</p><a href="#risk-alerts" className="text-[9px] text-[#757A7F]/50 mt-0.5 cursor-pointer block hover:underline">↑ See Live Map</a>
            <p className="text-4xl font-display font-black text-[#F5A623]">{samsara.configured ? fleetAtJobsites.length.toString() : '—'}</p>
            <p className="text-xs text-[#757A7F] mt-1">{samsara.configured ? `${samsara.vehicles.length} total tracking` : 'No API key'}</p>
          </div>
          {/* Missing Reports */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Missing Reports</p>
            <p className={`text-4xl font-display font-black ${missingReportJobs.length > 0 ? 'text-[#E04343]' : 'text-[#20BC64]'}`}>{missingReportJobs.length}</p>
            <p className="text-xs text-[#757A7F] mt-1 leading-relaxed">{missingReportJobs.length > 0 ? missingReportJobs.map((j: any) => j.Job_Name).join(' · ') : 'All yesterday\u2019s reports in'}</p>
          </div>
        </div>

        {/* ── ROW 2: MAP + RISK BOX ───────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* LIVE MAP */}
          <div className="col-span-12 lg:col-span-8 card overflow-hidden" style={{ minHeight: '500px' }}>
            <div className="p-5 border-b-2 border-[#3C4043] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <h2 className="font-display text-sm font-black uppercase tracking-widest text-[#3C4043]">Live Operations Map</h2>
                <div className="flex items-center gap-3 text-xs font-display font-bold">
                  <span className="flex items-center gap-1.5 text-[#3C4043]"><span className="w-3 h-3 rounded-full bg-[#20BC64] inline-block"></span>Job Site</span>
                  <span className="flex items-center gap-1.5 text-[#3C4043]"><span className="w-3 h-3 rounded bg-blue-500 inline-block"></span>Vehicle</span>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#20BC64] font-display font-bold">{scheduledJobs.filter((j:any) => j.Lat && j.Lng).length} Pinned</span>
                {samsara.configured && <span className="text-blue-500 font-display font-bold">{samsara.vehicles.length} Vehicles</span>}
              </div>
            </div>
            <div style={{ height: '460px' }}>
              <MapWrapper
                jobs={[...new Map(scheduledJobs.map((j: any) => [j.Job_Number, j])).values()].filter(Boolean).map((j: any) => {
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
          <div id="risk-alerts" className="col-span-12 lg:col-span-4 card flex flex-col overflow-hidden scroll-mt-32">
            <div className="p-5 border-b-2 border-[#3C4043] flex justify-between items-center flex-shrink-0">
              <h2 className="font-display text-sm font-black uppercase tracking-widest text-[#3C4043]">Risk & Alerts</h2>
              <div className="flex gap-2">
                {criticalCount > 0 && <span className="pill pill-danger">{criticalCount} Critical</span>}
                {warningCount > 0 && <span className="pill pill-warning">{warningCount} Warn</span>}
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-4 space-y-3 flex-1">
              {risks.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-4xl mb-2">✅</p>
                  <p className="text-[#20BC64] font-bold text-sm">All Clear</p>
                  <p className="text-[#757A7F] text-xs mt-1">No active risks detected</p>
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
                        <Link href={`/jobs/${risk.job}`} className="text-[10px] font-black uppercase tracking-widest mb-1 block hover:text-[#3C4043] transition-colors" style={{ color: riskColor[risk.level] }}>
                          {risk.job} {(() => { const j = jobs.find((jb: any) => jb.Job_Number === risk.job); return j?.Job_Name ? `· ${j.Job_Name}` : ''; })()} →
                        </Link>
                      )}
                      <p className="text-xs text-[#3C4043] leading-relaxed">{risk.message}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── LOWBOY COMMAND ─────────────────────────────────────────────── */}
        {(() => {
          const lowboyVehicle = samsara.configured
            ? samsara.vehicles.find((v: any) => (v.name || '').toLowerCase().includes('jose') || (v.name || '').toLowerCase().includes('lowboy'))
            : null;

          if (!lowboyVehicle && !samsara.configured) return null;

          return (
            <div className="bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">ð Lowboy Command — Jose De Lara</h2>
                  {lowboyVehicle && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${lowboyVehicle.speed > 2 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-[#F5A623] border border-amber-500/20'}`}>
                      {lowboyVehicle.speed > 2 ? `ð¢ EN ROUTE · ${lowboyVehicle.speed} mph` : 'ð¡ PARKED'}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold text-emerald-400 px-2 py-1 rounded bg-emerald-400/10 border border-emerald-400/20">✅ PERMANENT PERMIT</span>
              </div>
              {lowboyVehicle ? (
                <div className="p-5">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-black/20 rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Current Location</p>
                      <p className="text-xs font-bold text-[#3C4043] leading-relaxed">{lowboyVehicle.address || 'GPS Active'}</p>
                    </div>
                    <div className="bg-black/20 rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Speed</p>
                      <p className="text-2xl font-black text-white">{lowboyVehicle.speed}<span className="text-sm text-[#757A7F] ml-1">mph</span></p>
                    </div>
                    <div className="bg-black/20 rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Heading</p>
                      <p className="text-lg font-black text-[#3C4043]/70">{lowboyVehicle.heading || 0}Â°</p>
                    </div>
                    <div className="bg-black/20 rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Driver</p>
                      <p className="text-sm font-black text-[#3C4043]">Jose De Lara</p>
                    </div>
                  </div>
                  {lowboyVehicle.speed > 2 && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-3">
                      <span className="text-emerald-400">ð</span>
                      <p className="text-xs text-emerald-300/70 font-bold">Lowboy is currently in transit at {lowboyVehicle.speed} mph. ETA to next staging site updating live via Samsara.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 text-center">
                  <p className="text-[#757A7F] text-sm">Awaiting Samsara GPS signal for Jose De Lara&apos;s lowboy unit.</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── ROW 3: SCORECARD + JOB HEALTH ──────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* PORTFOLIO SCORECARD */}
          <div className="col-span-12 lg:col-span-5 bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[#F1F3F4]">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Portfolio Scorecard — Estimated vs. Actual</h2>
              <p className="text-xs text-[#757A7F] mt-1">Billing % · Production tonnage from field reports</p><p className="text-[9px] text-[#757A7F]/40 mt-0.5">ℹ️ Tonnage bars = actual field-reported tons vs. total estimated portfolio tons. Billing bar = billed $ vs. contract $.</p>
            </div>
            <div className="p-5 space-y-5">

              {/* Billing Progress */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Portfolio Billed</span>
                  <span className="text-xs font-bold text-[#20BC64]">${(totalBilled/1000000).toFixed(2)}M / ${(totalPortfolio/1000000).toFixed(2)}M</span>
                </div>
                <div className="relative h-6 bg-[#F1F3F4] rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#20BC64] to-[#16a558] rounded-full transition-all" style={{ width: `${overallPct}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{overallPct}% Billed</span>
                </div>
              </div>

              {/* Asphalt Tonnage */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Asphalt Tonnage (Live)</span>
                  <span className="text-xs font-bold text-blue-600">{totalAsphaltLogged.toLocaleString()} tons logged</span>
                </div>
                <div className="relative h-5 bg-[#F1F3F4] rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-blue-500/70 rounded-full" style={{ width: `${Math.min(100, (totalAsphaltLogged / Math.max(1, totalAsphaltLogged * 1.3)) * 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{totalAsphaltLogged.toLocaleString()} tons</span>
                </div>
              </div>

              {/* Base Tonnage */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Base / GAB Tonnage (Live)</span>
                  <span className="text-xs font-bold text-purple-400">{totalBaseLogged.toLocaleString()} tons logged</span>
                </div>
                <div className="relative h-5 bg-[#F1F3F4] rounded-full overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-purple-500/70 rounded-full" style={{ width: `${Math.min(100, (totalBaseLogged / Math.max(1, totalBaseLogged * 1.3)) * 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">{totalBaseLogged.toLocaleString()} tons</span>
                </div>
              </div>

              {/* Labour */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#F1F3F4]">
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-[#757A7F] font-bold uppercase mb-1">Total Man-Hours</p>
                  <p className="text-2xl font-black text-[#F5A623]">{totalManHours.toLocaleString()}</p>
                  <p className="text-[10px] text-[#757A7F]/60">from field reports</p>
                </div>
                <div className="bg-black/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-[#757A7F] font-bold uppercase mb-1">Reported Jobs</p>
                  <p className="text-2xl font-black text-[#20BC64]">{fieldReports.length}</p>
                  <p className="text-[10px] text-[#757A7F]/60">of {jobs.length} total</p>
                </div>
              </div>

              {/* Per-job billing vs activity mismatch summary */}
              <div className="pt-2 border-t border-[#F1F3F4]">
                <p className="text-xs font-black uppercase tracking-widest text-[#757A7F] mb-3">Billing vs. Activity Summary</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {(['green','amber','red'] as const).map(h => (
                    <div key={h} className="rounded-lg p-2" style={{ background: `${healthColor[h]}10`, border: `1px solid ${healthColor[h]}20` }}>
                      <p className="text-xl font-black" style={{ color: healthColor[h] }}>{healthCounts[h]}</p>
                      <p className="text-[10px] font-bold uppercase text-[#757A7F]">{h === 'green' ? 'On Track' : h === 'amber' ? 'Watch' : 'At Risk'}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* QUICK JOB HEALTH */}
          <div className="col-span-12 lg:col-span-7 bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-center">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Quick Job Health</h2>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[#20BC64] font-bold">● On Track</span>
                <span className="text-[#F5A623] font-bold">● Watch</span>
                <span className="text-[#E04343] font-bold">● At Risk</span>
              </div>
            </div>
            <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 overflow-y-auto custom-scrollbar" style={{ maxHeight: '380px' }}>
              {[...new Map(scheduledJobs.map((j: any) => [j.Job_Number, j])).values()].filter(Boolean).map((job: any) => {
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
                      <span className="text-[10px] font-black text-[#757A7F]">{job.Job_Number}</span>
                      <span className="text-[10px] font-black uppercase" style={{ color: healthColor[health] }}>
                        {health === 'green' ? '● OK' : health === 'amber' ? '● Watch' : '● Risk'}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-[#3C4043] leading-tight mb-2 line-clamp-1">{job.Job_Number} — {job.Job_Name}</p>
                    <div className="flex flex-col gap-1">
                      <div>
                        <div className="flex justify-between text-[9px] text-[#757A7F] mb-0.5">
                          <span>Billed</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="h-1 bg-[#F1F3F4] rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: healthColor[health] }} />
                        </div>
                      </div>
                      {(asphaltT > 0 || baseT > 0) && (
                        <div className="mt-1 flex gap-2 text-[9px] text-[#757A7F]/70">
                          {asphaltT > 0 && <span className="text-blue-600/60">{asphaltT.toLocaleString()}t asph</span>}
                          {baseT > 0 && <span className="text-purple-400/60">{baseT.toLocaleString()}t base</span>}
                        </div>
                      )}
                      {!report && <p className="text-[9px] text-[#E04343]/60 mt-1">No field reports</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── ROW 3.5: THROUGHPUT BOTTLENECK TRACKER ────────────────────── */}
        {(() => {
          // Compute velocity from scorecard data
          const scorecards: any[] = [];
          try {
            const scPath = path.join(process.cwd(), 'data', 'Project_Scorecards.csv');
            const scText = fs.readFileSync(scPath, 'utf-8');
            const scLines = scText.trim().split('\n');
            for (let i = 1; i < scLines.length; i++) {
              const cols = scLines[i].split(',');
              scorecards.push({
                actStone: parseFloat(cols[4] || '0') || 0,
                actBinder: parseFloat(cols[6] || '0') || 0,
                actTopping: parseFloat(cols[8] || '0') || 0,
                actDays: parseFloat(cols[10] || '0') || 0,
              });
            }
          } catch {}

          const activeJobs = scorecards.filter(sc => sc.actDays > 0);
          const totalStoneTons = activeJobs.reduce((s, sc) => s + sc.actStone, 0);
          const totalAsphaltTons = activeJobs.reduce((s, sc) => s + sc.actBinder + sc.actTopping, 0);
          const totalDays = activeJobs.reduce((s, sc) => s + sc.actDays, 0);

          const stoneVelocity = totalDays > 0 ? Math.round(totalStoneTons / totalDays) : 0;
          const asphaltVelocity = totalDays > 0 ? Math.round(totalAsphaltTons / totalDays) : 0;
          const isBehind = stoneVelocity > 0 && asphaltVelocity > 0 && stoneVelocity < asphaltVelocity * 1.2;
          const maxVelocity = Math.max(stoneVelocity, asphaltVelocity, 1);

          return (
            <div className="bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">⚡ Throughput Bottleneck Tracker <span className="text-[#757A7F]/40 text-xs font-normal normal-case tracking-normal" title="Velocity = total tons from field reports / calendar days. Ratio = base / asphalt velocity. Target: 1.20x+">(i)</span></h2>
                  {isBehind && (
                    <span className="text-[10px] font-black text-[#F5A623] bg-[#F5A623]/10 border border-amber-400/20 px-2 py-0.5 rounded-full animate-pulse">
                      ⚠️ BASE CREW BELOW PAVING THRESHOLD
                    </span>
                  )}
                </div>
                <span className="text-xs text-[#757A7F]/60 font-bold uppercase">Live Telemetry</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-6">
                  {/* Stone Base Velocity */}
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#F5A623]/80">Stone Base Velocity</p>
                        <p className="text-[9px] text-[#757A7F]/70 mt-0.5">Foremen: Juan · Martin · Julio</p>
                      </div>
                      <p className="text-3xl font-black text-[#F5A623]">{stoneVelocity}<span className="text-sm text-[#F5A623]/50 ml-1">t/day</span></p>
                    </div>
                    <div className="relative h-8 bg-[#F1F3F4] rounded-lg overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-lg transition-all bg-gradient-to-r from-amber-500/80 to-amber-400/60"
                        style={{ width: `${Math.min(100, (stoneVelocity / maxVelocity) * 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
                        {totalStoneTons.toLocaleString()} tons / {totalDays} days
                      </span>
                    </div>
                  </div>

                  {/* Asphalt Velocity */}
                  <div>
                    <div className="flex justify-between items-end mb-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/80">Asphalt Paving Velocity</p>
                        <p className="text-[9px] text-[#757A7F]/70 mt-0.5">Foreman: Rosendo Rubio</p>
                      </div>
                      <p className="text-3xl font-black text-blue-600">{asphaltVelocity}<span className="text-sm text-blue-600/50 ml-1">t/day</span></p>
                    </div>
                    <div className="relative h-8 bg-[#F1F3F4] rounded-lg overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full rounded-lg transition-all bg-gradient-to-r from-blue-500/80 to-blue-400/60"
                        style={{ width: `${Math.min(100, (asphaltVelocity / maxVelocity) * 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-xs font-black text-white">
                        {totalAsphaltTons.toLocaleString()} tons / {totalDays} days
                      </span>
                    </div>
                  </div>
                </div>

                {/* Alert Banner */}
                {isBehind && (
                  <div className="mt-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3">
                    <span className="text-[#F5A623] text-lg shrink-0">⚠️</span>
                    <div>
                      <p className="text-amber-300 font-black text-xs">BASE CREW VELOCITY BELOW PAVING THRESHOLD</p>
                      <p className="text-amber-200/50 text-[10px] mt-0.5">
                        Stone crews are producing {stoneVelocity} t/day vs. {asphaltVelocity} t/day asphalt demand.
                        Base must lead asphalt by ≥20% to prevent paving crew downtime. Contact Juan / Martin / Julio immediately.
                      </p>
                    </div>
                  </div>
                )}

                {/* Ratio indicator */}
                <div className="mt-4 pt-3 border-t border-[#F1F3F4] flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-[9px] text-[#757A7F]/70 font-bold uppercase">Ratio</p>
                      <p className={`text-lg font-black ${isBehind ? 'text-[#E04343]' : 'text-emerald-400'}`}>
                        {asphaltVelocity > 0 ? (stoneVelocity / asphaltVelocity).toFixed(2) : '—'}x
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-[#757A7F]/70 font-bold uppercase">Required</p>
                      <p className="text-lg font-black text-[#757A7F]">≥1.20x</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] text-[#757A7F]/70 font-bold uppercase">Status</p>
                      <p className={`text-xs font-black ${isBehind ? 'text-[#E04343]' : 'text-emerald-400'}`}>
                        {isBehind ? '🔴 BEHIND' : 'ð¢ ON TRACK'}
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] text-[#757A7F]/50 font-bold">{activeJobs.length} Active Jobs Reporting</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── ROW 4: JOB LIST + PORTFOLIO TABLE ─────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* LIVE MISSION PROGRESS */}
          <div className="col-span-12 lg:col-span-4 bg-white rounded-md border border-[#F1F3F4] shadow-sm flex flex-col overflow-hidden" style={{ maxHeight: '500px' }}>
            <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-center flex-shrink-0">
              <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">This Week&apos;s Jobs</h2>
              <span className="text-xs text-[#757A7F]/60 font-bold uppercase">Click a job</span>
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
                    className="block bg-black/30 rounded-xl p-4 border border-[#F1F3F4] hover:scale-[1.01] transition-all group"
                    style={{ borderLeftWidth: '3px', borderLeftColor: healthColor[health] }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-bold text-[#3C4043] text-sm leading-tight">{job.Job_Number} — {job.Job_Name}</p>
                        <p className="text-xs text-[#757A7F] mt-0.5">{job.General_Contractor} · {job.Project_Manager} PM · {job.State}</p>
                      </div>
                      <span className="text-xs font-black ml-2 flex-shrink-0" style={{ color: healthColor[health] }}>{pct}%</span>
                    </div>
                    <div className="flex gap-1 mb-1">
                      <span className="text-[10px] text-[#757A7F] w-14 flex-shrink-0">Billed</span>
                      <div className="flex-1 bg-[#F1F3F4] rounded-full h-1.5 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: healthColor[health] }} />
                      </div>
                    </div>
                    <div className="flex justify-between mt-2">
                      <span className="text-[10px] text-[#757A7F]/70">{job.Job_Number}</span>
                      <span className="text-[10px] text-[#757A7F]/70">${(job.Contract_Amount || 0).toLocaleString()}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* FULL PORTFOLIO — moved to /portfolio */}
          <div className="col-span-12 lg:col-span-8 bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
            <Link href="/portfolio" className="block p-5 hover:bg-[#F1F3F4] transition-colors group">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70 mb-2">Full Portfolio</h2>
                  <p className="text-3xl font-black text-[#20BC64]">{jobs.length} Jobs</p>
                  <p className="text-xs text-[#757A7F] mt-1">${jobs.reduce((s: number, j: any) => s + (j.Contract_Amount || 0), 0).toLocaleString()} total contract value</p>
                <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-[#F1F3F4]"><div><p className="text-[10px] font-bold uppercase text-[#757A7F]">Active</p><p className="text-lg font-black text-[#20BC64]">{scheduledJobs.length}</p></div><div><p className="text-[10px] font-bold uppercase text-[#757A7F]">States</p><p className="text-lg font-black text-[#3C4043]">{new Set(scheduledJobs.map((j: any)=>j.State)).size}</p></div><div><p className="text-[10px] font-bold uppercase text-[#757A7F]">Avg Billed</p><p className="text-lg font-black text-blue-500">{scheduledJobs.length ? Math.round(scheduledJobs.reduce((a: any,j: any)=>a+(parseFloat(String(j.Billed_Pct||0))),0)/scheduledJobs.length) : 0}%</p></div></div></div>
                <span className="text-2xl text-[#757A7F]/60 group-hover:text-[#757A7F] transition-colors">→</span>
              </div>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
