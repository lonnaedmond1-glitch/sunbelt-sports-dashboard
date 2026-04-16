import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ClickableKpiTile } from '@/components/EvidenceDrawer';
import fs from 'fs';
import path from 'path';
import MapWrapper from '@/components/MapWrapper';
import { fetchLiveJobs, fetchLiveFieldReports, fetchScheduleData, fetchProjectScorecards, fetchQboFinancials, fetchArAging, fetchReworkLog, fetchGanttSchedule, fetchCrewDaysSold } from '@/lib/sheets-data';
import { formatDollars } from '@/lib/format';

export const revalidate = 86400; // Daily ISR

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
  if (!SAMSARA_API_KEY) return { vehicles: [], crews: [], hos: [], configured: false };
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


    // HOS daily-logs requires startDate + endDate (YYYY-MM-DD).
    // endDate must be on or before YESTERDAY (today's day-in-progress is not
    // returnable). Use a 7-day window ending yesterday so we have enough rows
    // to compute a 7-day cycle total per driver.
    const toYMD = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    const hosEndDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const hosStartDate = new Date(hosEndDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hosUrl = `https://api.samsara.com/fleet/hos/daily-logs?startDate=${toYMD(hosStartDate)}&endDate=${toYMD(hosEndDate)}&limit=512`;

    const [vehicleRes, driverRes, hosRes] = await Promise.all([
      fetch('https://api.samsara.com/fleet/vehicles/locations', { headers, next: { revalidate: 86400 } }),
      fetch('https://api.samsara.com/fleet/drivers?driverActivationStatus=active', { headers, next: { revalidate: 86400 } }),
      fetch(hosUrl, { headers, next: { revalidate: 300 } }),
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

    // DOT Hours of Service — compute remaining legal hours per driver.
    // Samsara /fleet/hos/daily-logs response shape (verified live):
    //   data: [{
    //     driver: { id, name, eldSettings: { rulesets: [{ cycle, shift, ... }] } },
    //     startTime, endTime,
    //     dutyStatusDurations: { driveDurationMs, onDutyDurationMs, ... }
    //   }, ...one row per driver per day...]
    //
    // Samsara does NOT return *Remaining fields on daily-logs. We compute remaining
    // ourselves from caps minus used:
    //   - Drive Time:  11h cap  − today's driveDurationMs
    //   - On-Duty:     14h cap  − today's onDutyDurationMs (on-duty + drive)
    //   - Cycle:       60h or 70h cap (per ruleset) − sum of last 7d on-duty+drive
    const MS_PER_HR = 3_600_000;
    const DRIVE_CAP_HRS = 11;
    const SHIFT_CAP_HRS = 14;
    const cycleCapForDriver = (d: any): number => {
      // ELD cycle defaults to 60h/7d (passenger) unless ruleset names "70 hour".
      const rulesets = d?.eldSettings?.rulesets || [];
      for (const r of rulesets) {
        const cyc = (r?.cycle || '').toLowerCase();
        if (cyc.includes('70')) return 70;
      }
      return 60;
    };
    let hosParsed: any[] = [];
    if (hosRes.ok) {
      const rawJson = await hosRes.json();
      const rawRows: any[] = rawJson?.data || [];

      // Group rows by driverId so we can sum last-7d for cycle and pick latest day for shift/drive
      const byDriverRows: Record<string, any[]> = {};
      const driverMeta: Record<string, any> = {};
      for (const row of rawRows) {
        const drv = row?.driver;
        const id = drv?.id;
        if (!id) continue;
        if (!byDriverRows[id]) { byDriverRows[id] = []; driverMeta[id] = drv; }
        byDriverRows[id].push(row);
      }

      for (const [driverId, rows] of Object.entries(byDriverRows)) {
        // Sort ascending by startTime; latest = most recent day
        rows.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        const latest = rows[rows.length - 1];
        const drv = driverMeta[driverId];

        const driveUsedMs = latest?.dutyStatusDurations?.driveDurationMs ?? 0;
        const onDutyUsedMs = (latest?.dutyStatusDurations?.onDutyDurationMs ?? 0)
                           + (latest?.dutyStatusDurations?.driveDurationMs ?? 0);

        // Cycle = sum of (onDuty + drive) across the window (last 7 or 8 days)
        const cycleCapHrs = cycleCapForDriver(drv);
        const cycleWindowDays = cycleCapHrs === 70 ? 8 : 7;
        const recentRows = rows.slice(-cycleWindowDays);
        const cycleUsedMs = recentRows.reduce((sum, r) =>
          sum + (r?.dutyStatusDurations?.driveDurationMs ?? 0)
              + (r?.dutyStatusDurations?.onDutyDurationMs ?? 0), 0);

        const driveRemainingHrs = Math.max(0, DRIVE_CAP_HRS - driveUsedMs / MS_PER_HR);
        const shiftRemainingHrs = Math.max(0, SHIFT_CAP_HRS - onDutyUsedMs / MS_PER_HR);
        const cycleRemainingHrs = Math.max(0, cycleCapHrs - cycleUsedMs / MS_PER_HR);

        hosParsed.push({
          driverId,
          driverName: drv?.name || '',
          logDate: (latest?.startTime || '').slice(0, 10),
          driveRemainingHrs,
          shiftRemainingHrs,
          cycleRemainingHrs,
          cycleCapHrs,
          currentStatus: '', // not provided on daily-logs endpoint
        });
      }
    }
    const hos = hosParsed;

    return { vehicles, crews, hos, configured: true, timestamp: new Date().toISOString() };
  } catch { return { vehicles: [], crews: [], hos: [], configured: false }; }
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
        const res = await fetch(url, { next: { revalidate: 86400 } });
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


// Closed jobs: hidden from dashboard per Jackie 4/9 — should only focus on open jobs.
// Source sheet has a separate 'closed jobs' tab; when a job moves there its status becomes COMPLETE/Closed.
function isJobClosed(job: any): boolean {
  const s = String(job?.Status || '').trim().toLowerCase();
  return s === 'complete' || s === 'closed';
}

function isJobScheduled(job: any): boolean {
  const start = parseJobDate(job.Start_Date);
  if (!start) return false;
  return start <= new Date();
}

// ─── Health scoring ──────────────────────────────────────────────────────────
// Returns one of: 'green' (On Track), 'amber' (Watch), 'red' (At Risk), 'gray' (Not Started).
// Per Jackie 4/9 review: unstarted jobs (0% billed, no reports) should NOT be flagged as At Risk.
function getJobHealth(job: any, report: any): 'green' | 'amber' | 'red' | 'gray' {
  const pct = job.Pct_Complete || 0;
  const hasReport = !!report;
  const scheduled = isJobScheduled(job);

  // Not Started: billed % = 0 AND no field reports submitted.
  if (pct === 0 && !hasReport) return 'gray';

  // Pre-construction (start date in the future) but with some billing → on track
  if (!scheduled) return 'green';

  // Scheduled and active — check real overrun indicators
  if (pct > 0 && pct < 30 && !hasReport) return 'amber';
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
        risks.push({ level: 'critical', job: matchedJob.Job_Number, message: `NO FIELD REPORT — ${matchedJob.Job_Number} · ${matchedJob.Job_Name} (${crewName}). No report from yesterday. PM: ${matchedJob.Project_Manager || 'N/A'}.` });
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
      if (job) risks.push({ level: 'warning', job: jobNum, message: `MATERIAL OVERRUN — ${job.Job_Number} · ${job.Job_Name}: ${actualTons.toLocaleString()}t used / ${est.estTons.toLocaleString()}t budgeted (${pctOver}% over). PM: ${job.Project_Manager || 'N/A'}.` });
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
      if (job) risks.push({ level: 'warning', job: jobNum, message: `DAYS OVERRUN — ${job.Job_Number} · ${job.Job_Name}: ${actualDays}d on site / ${est.estDays}d budgeted (${daysOver}d over). PM: ${job.Project_Manager || 'N/A'}.` });
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
        risks.push({ level: 'warning', job: prep.Job_Number, message: `CREDIT HOLD — ${job.Job_Number} · ${job.Job_Name}: ${bad} account not active. PM: ${job.Project_Manager || 'N/A'}. Resolve before mobilization.` });
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
            risks.push({ level: 'warning', job: scheduledJob.Job_Number, message: `SCHEDULE DEVIATION — ${assignment.crew}: GPS at ${atOtherJob.Job_Number} · ${atOtherJob.Job_Name} but scheduled at ${scheduledJob.Job_Number} · ${scheduledJob.Job_Name}. PM: ${scheduledJob.Project_Manager || 'N/A'}.` });
          }
        }
      }
    }
  }

  return risks.slice(0, 15);
}

export default async function MasterDashboard() {
  // Fetch all data in parallel
  const [jobs, fieldReports, samsara, scheduleData, projectScorecards, qboFinancials, arAging, reworkLog, ganttRows, crewDays] = await Promise.all([
    getLiveJobs(),
    getLiveFieldReports(),
    getSamsaraData(),
    fetchScheduleData(),
    fetchProjectScorecards(),
    fetchQboFinancials(),
    fetchArAging(),
    fetchReworkLog(),
    fetchGanttSchedule(),
    fetchCrewDaysSold(),
  ]);

  // Build report map first — needed by both crossCheck and weather
  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) reportMap[r.Job_Number] = r;

  // Run weather + cross-check with pre-loaded data (eliminates 4+ duplicate fetches)
  const [weatherAlerts, crossCheck] = await Promise.all([
    getWeatherAlerts(jobs),
    Promise.resolve(computeCrossCheck(samsara.vehicles || [], jobs, reportMap)),
  ]);

  // Live scorecard throughput from API (replaces CSV fallback)
  const liveActiveJobs = (projectScorecards as any[]).map((sc: any) => ({
    actStone: parseFloat(sc.Act_Stone_Tons || '0') || 0,
    actBinder: parseFloat(sc.Act_Binder_Tons || '0') || 0,
    actTopping: parseFloat(sc.Act_Topping_Tons || '0') || 0,
    actDays: parseFloat(sc.Act_Days_On_Site || '0') || 0,
  })).filter((sc: any) => sc.actDays > 0);

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
  const scheduledJobs = jobs.filter((j: any) => !isJobClosed(j) && isScheduledCurrently(j, scheduleData, jobs));

  // On schedule this week but no field report yet
  const scheduledNotMobilized = jobs.filter((j: any) =>
    !isJobClosed(j) && isScheduledCurrently(j, scheduleData, jobs) && !reportMap[j.Job_Number]
  );

  // Not on current schedule window
  const upcomingJobs = jobs.filter((j: any) => !isJobClosed(j) && !isScheduledCurrently(j, scheduleData, jobs));


  const totalPortfolio = jobs.reduce((sum: number, j: any) => sum + (j.Contract_Amount || 0), 0);
  const totalBilled = jobs.reduce((sum: number, j: any) => sum + (j.Billed_To_Date || 0), 0);
  const overallPct = totalPortfolio > 0 ? Math.round((totalBilled / totalPortfolio) * 100) : 0;

  // Scorecard aggregates
  const totalAsphaltLogged = fieldReports.reduce((s: number, r: any) => s + (r.Asphalt_Actual || 0), 0);
  const totalBaseLogged = fieldReports.reduce((s: number, r: any) => s + (r.Base_Actual || 0), 0);
  // FYTD man-hours: FY starts Oct 1 (per Jackie 4/9). If today is before Oct 1, FY started Oct 1 last year.
  const _now = new Date();
  const _fyStart = _now.getMonth() >= 9 /* Oct=9 */
    ? new Date(_now.getFullYear(), 9, 1)
    : new Date(_now.getFullYear() - 1, 9, 1);
  const _fyStartISO = _fyStart.toISOString().slice(0, 10);
  const totalManHours = fieldReports.reduce((s: number, r: any) => {
    const lastDate = (r.Last_Report_Date || '').slice(0, 10);
    if (lastDate && lastDate >= _fyStartISO) return s + (r.Total_Man_Hours || 0);
    return s;
  }, 0);
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
  const scheduledJobNames = scheduledJobs.map((j: any) => ({ num: j.Job_Number, name: j.Job_Name })).filter((x: any) => x.name);
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

    // ── Portfolio Financials (QBO daily sync + WIP Contract Amounts) ───────────
  // QBO "Est vs Actuals" sheet has Est_Cost=0 and Est_Income=0 because estimates
  // don't come from QuickBooks — they come from the WIP (Contract_Amount).
  // We enrich each QBO row with the WIP contract value so Profit and Margin
  // reflect reality: Profit = Contract_Amount − Act_Cost.
  const wipJobNums = new Set((jobs as any[]).map((j: any) => j.Job_Number));
  const wipLookup = new Map<string, any>((jobs as any[]).map((j: any) => [j.Job_Number, j]));

  const qboWip = qboFinancials
    .filter(q => q.Job_Number && wipJobNums.has(q.Job_Number))
    .map(q => {
      const wip = wipLookup.get(q.Job_Number);
      const contract = wip?.Contract_Amount || 0;
      // Use Contract_Amount as Est_Income if QBO didn't provide one
      const estIncome = q.Est_Income > 0 ? q.Est_Income : contract;
      // Recompute profit: what we're contracted for minus what we've spent
      const profit = estIncome > 0 ? estIncome - q.Act_Cost : q.Profit;
      const margin = estIncome > 0 ? profit / estIncome : q.Profit_Margin;
      return {
        ...q,
        Est_Income: estIncome,
        Profit: profit,
        Profit_Margin: margin,
        _contract: contract,
      };
    });
  const qboOverhead = qboFinancials.filter(q => !q.Job_Number || !wipJobNums.has(q.Job_Number));

  // Margin at Risk: sum of negative profits + jobs under 15% margin
  const UNDER_MARGIN = 0.15;
  const lossJobs = qboWip.filter(q => q.Profit < 0);
  const underMarginJobs = qboWip.filter(q => q.Est_Income > 0 && q.Profit_Margin < UNDER_MARGIN);
  const marginAtRiskDollars = lossJobs.reduce((s, q) => s + Math.abs(q.Profit), 0);

  // Top money loser (worst single job by dollar loss)
  const topLoser = [...qboWip].sort((a, b) => a.Profit - b.Profit)[0] || null;

  // Average portfolio margin across active jobs with contract or income > 0
  const qboActive = qboWip.filter(q => q.Est_Income > 0);
  const totalAct = qboActive.reduce((s, q) => s + q.Est_Income, 0);
  const totalProf = qboActive.reduce((s, q) => s + q.Profit, 0);
  const avgMargin = totalAct > 0 ? totalProf / totalAct : 0;

  // Change Orders FYTD from WIP sheet (if Change_Orders column present)
  const fyCoTotal = (jobs as any[]).reduce((s: number, j: any) => {
    const raw = j.Change_Orders || j.CO_Added || j['CO Added'] || 0;
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,\s]/g, '')) || 0;
    return s + n;
  }, 0);

  // ── Worst Offenders — combined (real losses + budget-burn risk) ─────────────
  // QBO sheet doesn't carry estimates yet, so we cross-join WIP Contract_Amount
  // (the proposal/contract dollar value) to surface jobs that are burning through
  // contract value faster than they're billing.
  //
  // A job is flagged if EITHER:
  //   (1) Profit < 0  — actually losing money right now (real loss)
  //   (2) Act_Cost > 75% of Contract_Amount AND Pct_Complete < 90%  — burning
  //       through contract too fast, will likely overrun before close-out
  //
  // Each row gets a reason label so user knows WHY it's on the list.
  const wipByJob = new Map<string, any>(
    (jobs as any[]).map((j: any) => [j.Job_Number, j])
  );
  const COST_BURN_THRESHOLD = 0.75; // 75% of contract value spent
  const COMPLETE_THRESHOLD = 90;    // and not yet 90% billed/done

  const worstOffenderCandidates = qboWip.map(q => {
    const wip = wipByJob.get(q.Job_Number) || null;
    const contract = wip?.Contract_Amount || 0;
    const pctComplete = wip?.Pct_Complete || 0;
    const burnRatio = contract > 0 ? q.Act_Cost / contract : 0;

    const isRealLoss = q.Profit < 0;
    const isBudgetBurn = contract > 0
      && burnRatio > COST_BURN_THRESHOLD
      && pctComplete < COMPLETE_THRESHOLD
      && !isRealLoss;

    if (!isRealLoss && !isBudgetBurn) return null;

    // Severity score: real losses ranked first by dollar amount;
    // budget-burn jobs ranked by how far past 75% they are
    const severity = isRealLoss
      ? -q.Profit + 1_000_000           // floor real losses above all burn jobs
      : (burnRatio - COST_BURN_THRESHOLD) * (contract || 1);

    return {
      ...q,
      _wip: wip,
      _contract: contract,
      _pctComplete: pctComplete,
      _burnRatio: burnRatio,
      _isRealLoss: isRealLoss,
      _isBudgetBurn: isBudgetBurn,
      _severity: severity,
      _reason: isRealLoss
        ? `Losing money: $${Math.abs(q.Profit / 1000).toFixed(0)}K loss`
        : `Cost is ${(burnRatio * 100).toFixed(0)}% of $${(contract / 1000).toFixed(0)}K contract · ${pctComplete}% billed`,
    };
  }).filter((x): x is NonNullable<typeof x> => x !== null);

  const worstOffenders = worstOffenderCandidates
    .sort((a, b) => b._severity - a._severity)
    .slice(0, 5);

  // Rework aggregates (FYTD from Oct 1)
  const _fyReworkStart = _fyStartISO;
  const reworkFytd = reworkLog.filter(r => (r.Date || '') >= _fyReworkStart);
  const reworkCost = reworkFytd.reduce((s, r) => s + (r.Cost || 0), 0);
  const reworkHours = reworkFytd.reduce((s, r) => s + (r.Hours || 0), 0);
  const reworkJobs = new Set(reworkFytd.map(r => r.Job_Number).filter(Boolean)).size;


  const qboStale = qboFinancials.length === 0 || !qboFinancials[0]?.Updated_At;

  // ── Evidence payloads for ClickableKpiTile drawers ──────────
  const _qboUpdated = qboFinancials[0]?.Updated_At || '';
  const _arUpdated = arAging.rows[0]?.Updated_At || '';

  const _marginAtRiskRows = lossJobs
    .sort((a, b) => a.Profit - b.Profit)
    .map(q => ({
      label: `${q.Job_Number}${q.Project_Name ? ' · ' + q.Project_Name : ''}`,
      value: `-$${Math.abs(q.Profit / 1000).toFixed(0)}K`,
      detail: `${(q.Profit_Margin * 100).toFixed(0)}% margin · $${(q.Act_Cost / 1000).toFixed(0)}K cost on $${(q.Act_Income / 1000).toFixed(0)}K revenue`,
      href: q.Job_Number ? `/jobs/${q.Job_Number}` : undefined,
    }));

  const _topLoserRows = topLoser ? [{
    label: `${topLoser.Job_Number}${topLoser.Project_Name ? ' · ' + topLoser.Project_Name : ''}`,
    value: `$${(topLoser.Profit / 1000).toFixed(0)}K`,
    detail: `Revenue $${(topLoser.Act_Income / 1000).toFixed(0)}K − Cost $${(topLoser.Act_Cost / 1000).toFixed(0)}K = ${(topLoser.Profit_Margin * 100).toFixed(0)}% margin`,
    href: topLoser.Job_Number ? `/jobs/${topLoser.Job_Number}` : undefined,
  }] : [];

  const _arOverdueRows = arAging.rows
    .filter(r => r.Days_91_Plus > 0)
    .sort((a, b) => b.Days_91_Plus - a.Days_91_Plus)
    .map(r => ({
      label: `${r.Job_Number || r.Project_Name}${r.Customer ? ' · ' + r.Customer : ''}`,
      value: `$${(r.Days_91_Plus / 1000).toFixed(1)}K`,
      detail: r.Project_Name && r.Project_Name !== r.Job_Number ? r.Project_Name : '',
      href: r.Job_Number && /^\d{2,3}-\d{3}/.test(r.Job_Number) ? `/jobs/${r.Job_Number}` : undefined,
    }));

  const _arAllRows = arAging.rows
    .sort((a, b) => b.Total - a.Total)
    .map(r => ({
      label: `${r.Job_Number || r.Project_Name}${r.Customer ? ' · ' + r.Customer : ''}`,
      value: `$${(r.Total / 1000).toFixed(1)}K`,
      detail: `Current $${(r.Current / 1000).toFixed(1)}K · 1–30d $${(r.Days_1_30 / 1000).toFixed(1)}K · 31–60d $${(r.Days_31_60 / 1000).toFixed(1)}K · 61–90d $${(r.Days_61_90 / 1000).toFixed(1)}K · 91+d $${(r.Days_91_Plus / 1000).toFixed(1)}K`,
      href: r.Job_Number && /^\d{2,3}-\d{3}/.test(r.Job_Number) ? `/jobs/${r.Job_Number}` : undefined,
    }));

  const _marginRows = qboActive
    .sort((a, b) => b.Profit_Margin - a.Profit_Margin)
    .map(q => ({
      label: `${q.Job_Number}${q.Project_Name ? ' · ' + q.Project_Name : ''}`,
      value: `${(q.Profit_Margin * 100).toFixed(1)}%`,
      detail: `$${(q.Profit / 1000).toFixed(0)}K profit on $${(q.Act_Income / 1000).toFixed(0)}K revenue`,
      href: q.Job_Number ? `/jobs/${q.Job_Number}` : undefined,
    }));

  const _reworkRows = reworkFytd
    .sort((a, b) => (b.Cost || 0) - (a.Cost || 0))
    .map(r => ({
      label: `${r.Date} · ${r.Job_Number || '(no job)'}${r.Job_Name ? ' · ' + r.Job_Name : ''}`,
      value: `$${(r.Cost / 1000).toFixed(1)}K`,
      detail: `${r.Hours.toFixed(0)} hrs · ${r.Crew || 'unassigned'}${r.Note ? ' · ' + r.Note : ''}`,
      href: r.Job_Number ? `/jobs/${r.Job_Number}` : undefined,
    }));

  const _coRows = (jobs as any[])
    .map((j: any) => ({ job: j, co: (() => {
      const raw = j.Change_Orders || j.CO_Added || j['CO Added'] || 0;
      return typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[$,\s]/g, '')) || 0;
    })() }))
    .filter(x => x.co > 0)
    .sort((a, b) => b.co - a.co)
    .map(x => ({
      label: `${x.job.Job_Number}${x.job.Job_Name ? ' · ' + x.job.Job_Name : ''}`,
      value: `+$${(x.co / 1000).toFixed(1)}K`,
      detail: `PM ${x.job.Project_Manager || 'N/A'} · ${x.job.State || ''}`,
      href: `/jobs/${x.job.Job_Number}`,
    }));

  const marginAtRiskEvidence = {
    title: 'Margin at Risk',
    headlineValue: `$${(marginAtRiskDollars / 1000).toFixed(0)}K`,
    headlineCaption: `${lossJobs.length} active job${lossJobs.length === 1 ? '' : 's'} currently losing money (actual cost exceeds actual revenue).`,
    source: 'QBO Est vs Actuals daily email',
    sourceUpdatedAt: _qboUpdated,
    explanation: 'Sum of the absolute loss from every job where actual profit is negative in QBO. A job counts as "losing money" when booked costs have already exceeded booked revenue. Admin/overhead jobs are included if billed as a project in QBO.',
    formula: 'marginAtRisk = sum( abs(Profit) ) for each job where Profit < 0',
    rows: _marginAtRiskRows,
  };

  const topLoserEvidence = {
    title: 'Top Money Loser',
    headlineValue: topLoser && topLoser.Profit < 0 ? `$${(topLoser.Profit / 1000).toFixed(0)}K` : 'None',
    headlineCaption: topLoser && topLoser.Profit < 0
      ? `Worst single job by dollar loss. ${topLoser.Job_Number} · ${topLoser.Project_Name}.`
      : 'No active jobs currently profitable in QBO.',
    source: 'QBO Est vs Actuals daily email',
    sourceUpdatedAt: _qboUpdated,
    explanation: 'The single active job with the most negative actual profit in QBO today. Click through to the job detail page for the full breakdown. The goal is always to have this tile read "None".',
    formula: 'topLoser = min( Profit ) across active WIP jobs',
    rows: _topLoserRows,
  };

  const coEvidence = {
    title: 'Change Orders FYTD',
    headlineValue: `+$${(fyCoTotal / 1000).toFixed(0)}K`,
    headlineCaption: `Incremental revenue captured through approved change orders since Oct 1, ${_fyStart.getFullYear()}.`,
    source: 'WIP sheet · Change_Orders column',
    explanation: 'Sum of the Change_Orders column across the WIP sheet. Populate this column in your WIP as change orders get approved. Value flows in on the next ISR refresh.',
    formula: 'FYTD CO = sum( Change_Orders ) across all active jobs',
    rows: _coRows,
  };

  const arOutstandingEvidence = {
    title: 'A/R Outstanding',
    headlineValue: `$${(arAging.totals.total / 1000000).toFixed(2)}M`,
    headlineCaption: 'Total outstanding receivables per QBO A/R Aging Summary.',
    source: 'QBO A/R Aging daily email',
    sourceUpdatedAt: _arUpdated,
    explanation: 'Sum of every outstanding invoice across all customers, broken into aging buckets (Current / 1–30 / 31–60 / 61–90 / 91+ days). Click a row to go to that job\'s detail page if it\'s in the WIP.',
    formula: 'A/R = sum( Current + 1-30 + 31-60 + 61-90 + 91+ ) across all customers',
    rows: _arAllRows,
  };

  const arOverdueEvidence = {
    title: 'A/R Overdue (91+ days)',
    headlineValue: `$${(arAging.totals.d91Plus / 1000).toFixed(0)}K`,
    headlineCaption: `${arAging.totals.total > 0 ? ((arAging.totals.d91Plus / arAging.totals.total) * 100).toFixed(0) : 0}% of total A/R is past 90 days — chase these.`,
    source: 'QBO A/R Aging daily email',
    sourceUpdatedAt: _arUpdated,
    explanation: 'Invoices past 90 days without payment. Anything here is a collection-risk item — money on the books but not in the bank. Orange tone kicks in above 10%, red above 20% of total A/R.',
    formula: 'Overdue = sum( Days_91_Plus ) across all customers',
    rows: _arOverdueRows,
  };

  const avgMarginEvidence = {
    title: 'Avg Job Margin',
    headlineValue: `${(avgMargin * 100).toFixed(1)}%`,
    headlineCaption: `Weighted average across ${qboActive.length} active jobs with revenue in QBO. Target 25%.`,
    source: 'QBO Est vs Actuals daily email',
    sourceUpdatedAt: _qboUpdated,
    explanation: 'Weighted by revenue, not by job count — larger jobs move the number more. Green if ≥20%, amber 10–20%, red below 10%. Goal is to hit 25%+ on every active job.',
    formula: 'Avg Margin = sum( Profit ) / sum( Act_Income ) across all active jobs',
    rows: _marginRows,
  };

  const reworkEvidence = {
    title: 'Rework FYTD',
    headlineValue: `$${(reworkCost / 1000).toFixed(0)}K`,
    headlineCaption: `${reworkHours.toFixed(0)} hours across ${reworkJobs} job${reworkJobs === 1 ? '' : 's'} since Oct 1.`,
    source: 'REWORK_LOG sheet tab',
    explanation: 'Labor and cost logged in the REWORK_LOG tab of the Scorecard Hub. Flag a field report as rework to track the cost separately from production labor. Stays $0 / green until something gets logged.',
    formula: 'Rework FYTD = sum( Cost ) from REWORK_LOG where Date >= Oct 1',
    rows: _reworkRows,
  };


  const risks = computeRisks(jobs, reportMap, scheduleData, weatherAlerts, scorecardEstimates, prepBoard, scheduledJobs, samsara.vehicles || []);


  const criticalCount = risks.filter(r => r.level === 'critical').length;
  const warningCount = risks.filter(r => r.level === 'warning').length;

  // Job health summary
  const healthCounts = { green: 0, amber: 0, red: 0, gray: 0 };
  scheduledJobs.forEach((j: any) => { healthCounts[getJobHealth(j, reportMap[j.Job_Number])]++; });

  const healthColor: Record<string, string> = { green: '#20BC64', amber: '#F5A623', red: '#E04343', gray: '#9CA3AF' };
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {/* Total Jobs */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Total Jobs</p>
            <p className="text-4xl font-display font-black text-[#3C4043]">{jobs.filter((j: any) => !isJobClosed(j)).length}</p>
            <p className="text-xs text-[#757A7F] mt-1">Live — WIP sheet</p>
          </div>
          {/* Active Jobs */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Active Jobs</p>
            <p className="text-4xl font-display font-black text-[#10BE66]">{qboActive.length}</p>
            <p className="text-xs text-[#757A7F] mt-1">Generating revenue (QBO)</p>
          </div>
          {/* Scheduled Jobs */}
          <div className="card p-5">
            <p className="text-[10px] font-display font-bold uppercase tracking-widest text-[#757A7F] mb-2">Scheduled Jobs</p>
            <p className="text-4xl font-display font-black text-[#20BC64]">{scheduledJobs.length}</p>
            <div className="text-xs text-[#757A7F] mt-1 leading-relaxed">{scheduledJobNames.length > 0 ? scheduledJobNames.slice(0, 8).map((j: any, i: number) => (<div key={i}>{j.num ? `${j.num} — ${j.name}` : j.name}</div>)) : 'None this week'}</div>
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

        {/* ── ROW 3: SCORECARD + JOB HEALTH ──────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">

          {/* PORTFOLIO SCORECARD */}
          <div className="col-span-12 lg:col-span-5 bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
            <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-start">
              <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Portfolio Health — Financials</h2>
                <p className="text-xs text-[#757A7F] mt-1">Live job P&amp;L, margin & receivables</p>
              </div>
              <span className="text-[10px] font-bold uppercase text-[#757A7F]/70 tracking-widest">{qboStale ? 'Awaiting QBO Sync' : 'QBO Daily Sync'}</span>
            </div>
            <div className="p-5 space-y-4">

              {/* ── 6 FINANCIAL KPI TILES (QBO daily sync) ───────────────────── */}
              {qboStale ? (
                <div className="rounded-xl p-5 bg-amber-500/10 border border-amber-500/30 text-center">
                  <p className="text-xs font-black uppercase tracking-widest text-amber-600 mb-1">Awaiting QBO Sync</p>
                  <p className="text-xs text-[#757A7F]">Financials populate once the daily QBO email reports are parsed. Run <code className="font-mono text-[10px]">scripts/gmail-qbo-sync.gs</code> in Google Apps Script.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Margin at Risk */}
                    <div className="bg-[#E04343]/5 border border-[#E04343]/20 rounded-xl p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#E04343]/80 mb-1">Margin at Risk</p>
                      <p className="text-xl font-black text-[#E04343]">${(marginAtRiskDollars/1000).toFixed(0)}K</p>
                      <p className="text-[10px] text-[#757A7F]/70 mt-0.5">{lossJobs.length} job{lossJobs.length === 1 ? '' : 's'} losing money</p>
                    </div>
                    {/* Top Money Loser */}
                    <ClickableKpiTile evidence={topLoserEvidence} className="bg-[#E04343]/5 border border-[#E04343]/20 rounded-xl p-3 block">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#E04343]/80 mb-1">Top Money Loser</p>
                      {topLoser && topLoser.Profit < 0 ? (
                        <>
                          <p className="text-xl font-black text-[#E04343]">${(topLoser.Profit/1000).toFixed(0)}K</p>
                          <p className="text-[10px] text-[#757A7F]/70 mt-0.5 truncate" title={`${topLoser.Job_Number} · ${topLoser.Project_Name}`}>
                            {topLoser.Job_Number || '—'} · {(topLoser.Profit_Margin * 100).toFixed(0)}%
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-xl font-black text-[#20BC64]">None 🎉</p>
                          <p className="text-[10px] text-[#757A7F]/70 mt-0.5">All active jobs profitable</p>
                        </>
                      )}
                    </ClickableKpiTile>
                    {/* Change Orders FYTD */}
                    <div className="bg-[#20BC64]/5 border border-[#20BC64]/20 rounded-xl p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#20BC64]/80 mb-1">Change Orders FYTD</p>
                      <p className="text-xl font-black text-[#20BC64]">+${(fyCoTotal/1000).toFixed(0)}K</p>
                      <p className="text-[10px] text-[#757A7F]/70 mt-0.5">From WIP sheet</p>
                    </div>
                    {/* A/R Outstanding */}
                    <div className="bg-[#60a5fa]/5 border border-[#60a5fa]/25 rounded-xl p-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#60a5fa] mb-1">A/R Outstanding</p>
                      <p className="text-xl font-black text-[#60a5fa]">${(arAging.totals.total/1000000).toFixed(2)}M</p>
                      <p className="text-[10px] text-[#757A7F]/70 mt-0.5">${(arAging.totals.current/1000).toFixed(0)}K current</p>
                    </div>
                    {/* A/R Overdue (91+) */}
                    {(() => {
                      const overduePct = arAging.totals.total > 0 ? (arAging.totals.d91Plus / arAging.totals.total) * 100 : 0;
                      const tone = overduePct >= 20 ? '[#E04343]' : overduePct >= 10 ? '[#F5A623]' : '[#20BC64]';
                      return (
                        <ClickableKpiTile evidence={arOverdueEvidence} className={`bg-${tone}/5 border border-${tone}/25 rounded-xl p-3 block`}>
                          <p className={`text-[10px] font-black uppercase tracking-widest text-${tone}/80 mb-1`}>A/R Overdue (91+ d)</p>
                          <p className={`text-xl font-black text-${tone}`}>${(arAging.totals.d91Plus/1000).toFixed(0)}K</p>
                          <p className="text-[10px] text-[#757A7F]/70 mt-0.5">{overduePct.toFixed(0)}% of total AR</p>
                        </ClickableKpiTile>
                      );
                    })()}
                    {/* Average Job Margin */}
                    {(() => {
                      const pct = avgMargin * 100;
                      const tone = pct >= 20 ? '[#20BC64]' : pct >= 10 ? '[#F5A623]' : '[#E04343]';
                      return (
                        <ClickableKpiTile evidence={avgMarginEvidence} className={`bg-${tone}/5 border border-${tone}/25 rounded-xl p-3 block`}>
                          <p className={`text-[10px] font-black uppercase tracking-widest text-${tone}/80 mb-1`}>Avg Job Margin</p>
                          <p className={`text-xl font-black text-${tone}`}>{pct.toFixed(1)}%</p>
                          <p className="text-[10px] text-[#757A7F]/70 mt-0.5">{qboActive.length} active jobs · target 25%</p>
                        </ClickableKpiTile>
                      );
                    })()}
                    {/* Rework Spend FYTD */}
                    {(() => {
                      const tone = reworkCost > 0 ? '[#E04343]' : '[#20BC64]';
                      return (
                        <ClickableKpiTile evidence={reworkEvidence} className={`bg-${tone}/5 border border-${tone}/25 rounded-xl p-3 block`}>
                          <p className={`text-[10px] font-black uppercase tracking-widest text-${tone}/80 mb-1`}>Rework FYTD</p>
                          <p className={`text-xl font-black text-${tone}`}>${(reworkCost / 1000).toFixed(0)}K</p>
                          <p className="text-[10px] text-[#757A7F]/70 mt-0.5">{reworkHours.toFixed(0)} hrs · {reworkJobs} jobs</p>
                        </ClickableKpiTile>
                      );
                    })()}
                  </div>

                  {/* Worst Offenders list — real losses + budget-burn risk */}
                  {worstOffenders.length > 0 && (
                    <div className="pt-3 border-t border-[#F1F3F4]">
                      <div className="flex justify-between items-baseline mb-2">
                        <p className="text-xs font-black uppercase tracking-widest text-[#757A7F]">Worst Offenders — Active Jobs at Financial Risk</p>
                        <span className="text-[9px] text-[#757A7F]/60 font-bold uppercase">Loss + Cost ≥ 75% Contract</span>
                      </div>
                      <div className="space-y-1.5">
                        {worstOffenders.map(q => {
                          const tone = q._isRealLoss ? '#E04343' : '#F5A623'; // red = loss, amber = burn
                          const tag = q._isRealLoss ? 'LOSS' : 'BUDGET BURN';
                          return (
                            <Link key={q.Job_Number} href={`/jobs/${q.Job_Number}`} className="flex items-center justify-between px-3 py-2 rounded-lg border hover:opacity-90 transition" style={{ background: `${tone}08`, borderColor: `${tone}25` }}>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: `${tone}20`, color: tone }}>{tag}</span>
                                  <p className="text-xs font-bold text-[#3C4043] truncate">
                                    {q.Job_Number}{q.Project_Name ? ` · ${q.Project_Name}` : ''}
                                  </p>
                                </div>
                                <p className="text-[10px] text-[#757A7F]/80 truncate">{q._reason}</p>
                              </div>
                              <div className="text-right ml-3 flex-shrink-0">
                                {q._isRealLoss ? (
                                  <>
                                    <p className="text-sm font-black" style={{ color: tone }}>-${Math.abs(q.Profit/1000).toFixed(0)}K</p>
                                    <p className="text-[10px]" style={{ color: `${tone}b3` }}>{(q.Profit_Margin * 100).toFixed(0)}% margin</p>
                                  </>
                                ) : (
                                  <>
                                    <p className="text-sm font-black" style={{ color: tone }}>{(q._burnRatio * 100).toFixed(0)}%</p>
                                    <p className="text-[10px]" style={{ color: `${tone}b3` }}>cost / contract</p>
                                  </>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Per-job billing vs activity mismatch summary (kept from old card) */}
              <div className="pt-2 border-t border-[#F1F3F4]">
                <p className="text-xs font-black uppercase tracking-widest text-[#757A7F] mb-3">Billing vs. Activity Summary</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {(['green','amber','red','gray'] as const).map(h => (
                    <div key={h} className="rounded-lg p-2" style={{ background: `${healthColor[h]}10`, border: `1px solid ${healthColor[h]}20` }}>
                      <p className="text-xl font-black" style={{ color: healthColor[h] }}>{healthCounts[h]}</p>
                      <p className="text-[10px] font-bold uppercase text-[#757A7F]">{h === 'green' ? 'On Track' : h === 'amber' ? 'Watch' : h === 'red' ? 'At Risk' : 'Not Started'}</p>
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
                <span className="text-[#9CA3AF] font-bold">● Not Started</span>
              </div>
            </div>
            {/* Watch / Risk summary */}
            {(() => {
              const watchRed = [...new Map(scheduledJobs.map((j: any) => [j.Job_Number, j])).values()]
                .filter(Boolean)
                .map((job: any) => ({ job, health: getJobHealth(job, reportMap[job.Job_Number]) }))
                .filter(x => x.health === 'amber' || x.health === 'red');
              if (watchRed.length === 0) return null;
              return (
                <div className="px-4 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F] mb-2">Needs Attention</p>
                  <ul className="space-y-1.5">
                    {watchRed.map(({ job, health }) => {
                      const report = reportMap[job.Job_Number];
                      const pct = Math.round(job.Pct_Complete || 0);
                      const reason = health === 'red'
                        ? (report ? `Material trending over estimate · ${pct}% billed` : `${pct}% billed · no field activity yet`)
                        : (report ? `Approaching budget · ${pct}% billed` : `${pct}% billed · awaiting field data`);
                      const toneColor = health === 'red' ? '#E04343' : '#F5A623';
                      return (
                        <li key={job.Job_Number}>
                          <Link href={`/jobs/${job.Job_Number}`} className="flex items-start gap-2 px-2 py-1.5 rounded-lg hover:bg-[#F1F3F4]/60 transition-colors">
                            <span className="text-xs font-black mt-0.5" style={{ color: toneColor }}>●</span>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-[#3C4043] truncate">{job.Job_Number} — {job.Job_Name}</p>
                              <p className="text-[10px] text-[#757A7F]">{reason}</p>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })()}
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
                        {health === 'green' ? '● OK' : health === 'amber' ? '● Watch' : health === 'red' ? '● Risk' : '● N/S'}
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
                      {!report && health !== 'gray' && <p className="text-[9px] text-[#E04343]/60 mt-1">No field reports</p>}
                      {health === 'gray' && <p className="text-[9px] text-[#9CA3AF]/80 mt-1">Awaiting first field report</p>}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* ROW 3.5: THROUGHPUT BOTTLENECK TRACKER */}
        {(() => {
          // Uses booked crew days from the "25-26 Crew Days Sold" tab of the Gantt workbook.
          // Base capacity = Stone Base Days + Mill/Misc Days + Curb Days.
          // Paving capacity = Asphalt Paving Days.
          // Target base-to-paving ratio: >= 1.2x so base crews stay ahead of paving.
          const t = crewDays.totals;
          const baseCapacity = t.stoneBaseDays + t.millMiscDays + t.curbDays;
          const paveCapacity = t.pavingDays;
          const ratio = paveCapacity > 0 ? baseCapacity / paveCapacity : null;
          const hasData = crewDays.jobs.length > 0 && (baseCapacity > 0 || paveCapacity > 0);
          const isBehind = ratio != null && ratio < 1.2;
          const maxCap = Math.max(baseCapacity, paveCapacity, 1);

          // Evidence rows for the drawer
          const topBaseJobs = [...crewDays.jobs]
            .sort((a, b) => (b.Stone_Base_Days + b.Mill_Misc_Days + b.Curb_Days) - (a.Stone_Base_Days + a.Mill_Misc_Days + a.Curb_Days))
            .slice(0, 10)
            .map(j => ({
              label: `${j.Job_Number} · ${j.Job_Name}`,
              value: `${j.Stone_Base_Days + j.Mill_Misc_Days + j.Curb_Days} days`,
              detail: `Stone ${j.Stone_Base_Days} · Mill/Misc ${j.Mill_Misc_Days} · Curb ${j.Curb_Days}`,
              href: `/jobs/${j.Job_Number}`,
            }));
          const topPaveJobs = [...crewDays.jobs]
            .sort((a, b) => b.Asphalt_Paving_Days - a.Asphalt_Paving_Days)
            .slice(0, 10)
            .map(j => ({
              label: `${j.Job_Number} · ${j.Job_Name}`,
              value: `${j.Asphalt_Paving_Days} days`,
              detail: `${j.Project_Type}`,
              href: `/jobs/${j.Job_Number}`,
            }));

          const baseEvidence = {
            title: 'Base / Site Work Capacity Sold',
            headlineValue: `${baseCapacity} days`,
            headlineCaption: `Booked across ${crewDays.jobs.length} active jobs. Includes stone base (${t.stoneBaseDays}d), mill/misc (${t.millMiscDays}d), and curb install (${t.curbDays}d).`,
            source: '25-26 Crew Days Sold',
            explanation: 'Total days of base/site work sold across active jobs. This represents capacity you already have revenue for.',
            formula: 'Base capacity = Stone Base + Mill/Misc + Curb Install days (summed across active jobs)',
            rows: topBaseJobs,
          };

          const paveEvidence = {
            title: 'Paving Capacity Sold',
            headlineValue: `${paveCapacity} days`,
            headlineCaption: `Asphalt paving booked across ${crewDays.jobs.filter(j => j.Asphalt_Paving_Days > 0).length} jobs.`,
            source: '25-26 Crew Days Sold',
            explanation: 'Total days of asphalt paving work sold across active jobs. Each day requires base prep to be complete first.',
            formula: 'Paving capacity = Asphalt Paving Days (summed across active jobs)',
            rows: topPaveJobs,
          };

          const ratioEvidence = {
            title: 'Base-to-Paving Ratio',
            headlineValue: ratio != null ? `${ratio.toFixed(2)}x` : '—',
            headlineCaption: `Target ≥ 1.20x. Below that, base crews can\'t keep up and paving crew sits idle.`,
            source: 'Computed from 25-26 Crew Days Sold',
            explanation: 'Ratio of base days to paving days. Base work must be done before asphalt can be laid; if base capacity falls below 1.2x the paving capacity, the paving crew will have nothing to pave.',
            formula: 'Ratio = (Stone Base + Mill/Misc + Curb) / Asphalt Paving days',
            rows: [
              { label: 'Stone Base Days', value: `${t.stoneBaseDays}` },
              { label: 'Mill / Misc Days', value: `${t.millMiscDays}` },
              { label: 'Curb Install Days', value: `${t.curbDays}` },
              { label: 'Base subtotal', value: `${baseCapacity}` },
              { label: 'Paving Days', value: `${paveCapacity}` },
              { label: 'Field Events Days', value: `${t.fieldEventsDays}`, detail: 'Not counted in ratio' },
              { label: 'Total Weeks Booked', value: `${t.totalWeeks}`, detail: `$${(t.totalContract/1000000).toFixed(1)}M contract value` },
            ],
          };

          return (
            <div className="bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Throughput Bottleneck Tracker <span className="text-[#757A7F]/40 text-xs font-normal normal-case tracking-normal" title="Uses booked crew days from the 25-26 Crew Days Sold tab. Base must stay >= 1.20x paving capacity.">(i)</span></h2>
                  {!hasData && (
                    <span className="text-[10px] font-black text-[#9CA3AF] bg-[#9CA3AF]/10 border border-[#9CA3AF]/20 px-2 py-0.5 rounded-full">AWAITING CREW DAYS SOLD DATA</span>
                  )}
                  {isBehind && (
                    <span className="text-[10px] font-black text-[#F5A623] bg-[#F5A623]/10 border border-amber-400/20 px-2 py-0.5 rounded-full">BASE CAPACITY BELOW PAVING THRESHOLD</span>
                  )}
                </div>
                <span className="text-xs text-[#757A7F]/60 font-bold uppercase">Source: 25-26 Crew Days Sold</span>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-6">
                  <ClickableKpiTile evidence={baseEvidence} className="block rounded-xl p-0 bg-transparent border-0">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#F5A623]/80">Base / Site Work Capacity</p>
                          <p className="text-[10px] text-[#757A7F]/70">Stone base + mill/misc + curb install</p>
                        </div>
                        <p className="text-3xl font-black text-[#F5A623]">{baseCapacity}<span className="text-sm text-[#F5A623]/50 ml-1">days</span></p>
                      </div>
                      <div className="h-3 bg-[#F1F3F4] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-[#F5A623] to-[#e19213] rounded-full" style={{ width: `${(baseCapacity / maxCap) * 100}%` }} />
                      </div>
                      <p className="text-[9px] text-[#757A7F]/60 mt-1">Stone {t.stoneBaseDays} · Mill/Misc {t.millMiscDays} · Curb {t.curbDays}</p>
                    </div>
                  </ClickableKpiTile>
                  <ClickableKpiTile evidence={paveEvidence} className="block rounded-xl p-0 bg-transparent border-0">
                    <div>
                      <div className="flex justify-between items-end mb-2">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600/80">Paving Capacity</p>
                          <p className="text-[10px] text-[#757A7F]/70">Asphalt paving days</p>
                        </div>
                        <p className="text-3xl font-black text-blue-600">{paveCapacity}<span className="text-sm text-blue-600/50 ml-1">days</span></p>
                      </div>
                      <div className="h-3 bg-[#F1F3F4] rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-blue-700 rounded-full" style={{ width: `${(paveCapacity / maxCap) * 100}%` }} />
                      </div>
                      <p className="text-[9px] text-[#757A7F]/60 mt-1">{crewDays.jobs.filter(j => j.Asphalt_Paving_Days > 0).length} jobs with paving days booked</p>
                    </div>
                  </ClickableKpiTile>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-4 pt-4 border-t border-[#F1F3F4]">
                  <ClickableKpiTile evidence={ratioEvidence} className="block text-left p-0 bg-transparent border-0">
                    <div>
                      <p className="text-[9px] font-black uppercase text-[#757A7F]">Ratio</p>
                      <p className={`text-xl font-black ${!hasData ? 'text-[#9CA3AF]' : isBehind ? 'text-[#E04343]' : 'text-emerald-500'}`}>{ratio != null ? ratio.toFixed(2) + 'x' : '—'}</p>
                    </div>
                  </ClickableKpiTile>
                  <div>
                    <p className="text-[9px] font-black uppercase text-[#757A7F]">Required</p>
                    <p className="text-xl font-black text-[#757A7F]">≥1.20x</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-[#757A7F]">Status</p>
                    <p className={`text-xs font-black ${!hasData ? 'text-[#9CA3AF]' : isBehind ? 'text-[#E04343]' : 'text-emerald-400'}`}>{!hasData ? 'NO DATA' : isBehind ? 'BEHIND' : 'ON TRACK'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase text-[#757A7F]">Contract Value</p>
                    <p className="text-xs font-bold text-[#3C4043]">${(t.totalContract / 1000000).toFixed(2)}M sold</p>
                    <p className="text-[9px] text-[#757A7F]">${(t.totalLeftToBill / 1000000).toFixed(2)}M left to bill</p>
                  </div>
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
                      <span className="text-[10px] text-[#757A7F]/70">{formatDollars(job.Contract_Amount)}</span>
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
                  <p className="text-xs text-[#757A7F] mt-1">{formatDollars(jobs.reduce((s: number, j: any) => s + (j.Contract_Amount || 0), 0))} total contract value</p>
                <div className="grid grid-cols-3 gap-4 mt-3 pt-3 border-t border-[#F1F3F4]"><div><p className="text-[10px] font-bold uppercase text-[#757A7F]">Active</p><p className="text-lg font-black text-[#20BC64]">{scheduledJobs.length}</p></div><div><p className="text-[10px] font-bold uppercase text-[#757A7F]">States</p><p className="text-lg font-black text-[#3C4043]">{new Set(scheduledJobs.map((j: any)=>j.State)).size}</p></div><div><p className="text-[10px] font-bold uppercase text-[#757A7F]">Avg Billed</p><p className="text-lg font-black text-blue-500">{scheduledJobs.length ? Math.round(scheduledJobs.reduce((a: any,j: any)=>a+(parseFloat(String(j.Pct_Complete||j.Billed_Pct||0))),0)/scheduledJobs.length) : 0}%</p></div></div></div>
                <span className="text-2xl text-[#757A7F]/60 group-hover:text-[#757A7F] transition-colors">→</span>
              </div>
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
