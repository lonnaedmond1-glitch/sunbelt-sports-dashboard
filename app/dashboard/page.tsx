import React from 'react';
import Link from 'next/link';
import { ClickableKpiTile } from '@/components/EvidenceDrawer';
import fs from 'fs';
import path from 'path';
import MapWrapper from '@/components/MapWrapper';
import { fetchLiveJobs, fetchLiveFieldReports, fetchScheduleData, fetchQboFinancials, fetchArAging, fetchReworkLog, fetchCrewDaysSold, fetchEstVsActual } from '@/lib/sheets-data';
import { formatDollars, formatDollarsCompact } from '@/lib/format';

export const revalidate = 300;

const getLiveJobs = fetchLiveJobs;
const getLiveFieldReports = fetchLiveFieldReports;

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
    const hosParsed: any[] = [];
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

function hasJobMapCoords(job: any): boolean {
  const lat = parseFloat(String(job?.Lat || ''));
  const lng = parseFloat(String(job?.Lng || ''));
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function hasFleetMapCoords(vehicle: any): boolean {
  const lat = Number(vehicle?.lat);
  const lng = Number(vehicle?.lng);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function getScheduleCapacityFromAssignments(scheduleData: any) {
  const totals = { baseDays: 0, pavingDays: 0 };
  const days = [
    ...(scheduleData?.currentWeek?.days || []),
    ...(scheduleData?.nextWeek?.days || []),
  ];

  for (const day of days) {
    for (const assignment of (day.assignments || [])) {
      if (assignment?.decoded?.isOff) continue;
      if (!['primary', 'sub'].includes(String(assignment?.crewType || '').toLowerCase())) continue;

      const text = [
        assignment?.decoded?.activity || '',
        assignment?.decoded?.jobRef || '',
        assignment?.job || '',
      ].join(' ').toLowerCase();

      const surfaceRemoval = /surface\s+removal/.test(text);
      const isPaving = !surfaceRemoval && /\b(pav(e|ing)?|binder|asphalt)\b/.test(text);
      const isBaseOrSite = surfaceRemoval || /\b(base|mill|milling|grind|grinding|curb|concrete|field event|grading|clip|radius|misc|site)\b/.test(text);

      if (isPaving) totals.pavingDays += 1;
      else if (isBaseOrSite) totals.baseDays += 1;
    }
  }

  return totals;
}


// Closed jobs: hidden from dashboard per Jackie 4/9 — should only focus on open jobs.
// Source sheet has a separate 'closed jobs' tab; when a job moves there its status becomes COMPLETE/Closed.
function isJobClosed(job: any): boolean {
  const s = String(job?.Status || '').trim().toLowerCase();
  return s === 'complete' || s === 'closed';
}

function parseSheetDate(value: string): Date | null {
  if (!value) return null;
  const serial = Number(value);
  if (Number.isFinite(serial) && serial > 30000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function latestSheetDate(values: string[]): Date | null {
  return values
    .map(parseSheetDate)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] || null;
}

function formatSheetDate(date: Date | null): string {
  if (!date) return 'no timestamp';
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function materialOverrun(row: any): { label: string; estimated: number; actual: number; pctOver: number } | null {
  const candidates = [
    { label: 'GAB', estimated: row.Estimated_GAB_Tons || 0, actual: row.Actual_GAB_Tons || 0 },
    { label: 'Binder', estimated: row.Estimated_Binder_Tons || 0, actual: row.Actual_Binder_Tons || 0 },
    { label: 'Topping', estimated: row.Estimated_Topping_Tons || 0, actual: row.Actual_Topping_Tons || 0 },
    { label: 'Asphalt', estimated: row.Estimated_Asphalt_Tons || 0, actual: row.Actual_Asphalt_Tons || 0 },
  ].filter(c => c.estimated > 0 && c.actual > c.estimated)
   .map(c => ({ ...c, pctOver: ((c.actual - c.estimated) / c.estimated) * 100 }))
   .sort((a, b) => (b.actual - b.estimated) - (a.actual - a.estimated));

  return candidates[0] || null;
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
  estVsActualByJob: Map<string, any>,
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
  // Uses the live Scorecard "Est vs Actual" tab.
  for (const [jobNum, row] of estVsActualByJob.entries()) {
    const overrun = materialOverrun(row);
    if (!overrun) continue;
    const job = jobs.find(j => j.Job_Number === jobNum);
    if (job) {
      risks.push({
        level: 'warning',
        job: jobNum,
        message: `MATERIAL OVERRUN — ${job.Job_Number} · ${job.Job_Name}: ${overrun.label} ${overrun.actual.toLocaleString()}t actual / ${overrun.estimated.toLocaleString()}t estimated (${overrun.pctOver.toFixed(2)}% over). PM: ${job.Project_Manager || 'N/A'}.`,
      });
    }
  }

  // ── CONDITION 3: Days on Site Overrun ────────────────────────────────────
  // No live estimated-days column exists in the exported Scorecard tabs now.

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

function CommandMetric({
  label,
  value,
  note,
  tone = 'green',
}: {
  label: string;
  value: React.ReactNode;
  note: React.ReactNode;
  tone?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
}) {
  const toneColor = {
    green: '#20BC64',
    red: '#E04343',
    amber: '#F5A623',
    blue: '#2B6CB0',
    gray: '#A7AFB5',
  }[tone];

  return (
    <div className="relative min-h-[116px] overflow-hidden rounded-[18px] border border-[#DDE2E5] bg-white/90 p-4 shadow-[0_14px_35px_rgba(21,24,26,0.08)]">
      <p className="mb-2 text-[11px] font-black uppercase tracking-[0.08em] text-[#6D7478]">{label}</p>
      <div className="text-[30px] font-black leading-none tracking-[-0.04em] text-[#15181A]">{value}</div>
      <div className="mt-2 text-xs leading-snug text-[#6D7478]">{note}</div>
      <div className="absolute inset-x-0 bottom-0 h-[5px]" style={{ backgroundColor: toneColor }} />
    </div>
  );
}

function Panel({
  title,
  subtitle,
  badge,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[18px] border border-[#DDE2E5] bg-white/90 p-5 shadow-[0_14px_35px_rgba(21,24,26,0.08)] ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="m-0 text-lg font-black leading-tight tracking-[-0.02em] text-[#15181A]">{title}</h2>
          {subtitle && <p className="mt-1 text-sm leading-snug text-[#6D7478]">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

function Chip({
  children,
  tone = 'green',
}: {
  children: React.ReactNode;
  tone?: 'green' | 'red' | 'amber' | 'blue' | 'gray';
}) {
  const styles = {
    green: 'bg-[#E8F8EF] text-[#0F8F47]',
    red: 'bg-[#FDEAEA] text-[#C53030]',
    amber: 'bg-[#FFF4DB] text-[#B7791F]',
    blue: 'bg-[#EAF3FF] text-[#2B6CB0]',
    gray: 'bg-[#EEF1F2] text-[#4B5458]',
  }[tone];

  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.06em] ${styles}`}>
      {children}
    </span>
  );
}

function statusTone(health: string): 'green' | 'red' | 'amber' | 'gray' {
  if (health === 'green') return 'green';
  if (health === 'red') return 'red';
  if (health === 'amber') return 'amber';
  return 'gray';
}

function healthLabel(health: string): string {
  if (health === 'green') return 'On Track';
  if (health === 'red') return 'At Risk';
  if (health === 'amber') return 'Watch';
  return 'Not Started';
}

export default async function MasterDashboard() {
  // Fetch all data in parallel
  const [jobs, fieldReports, samsara, scheduleData, qboFinancials, arAging, reworkLog, crewDays, estVsActualRows] = await Promise.all([
    getLiveJobs(),
    getLiveFieldReports(),
    getSamsaraData(),
    fetchScheduleData(),
    fetchQboFinancials(),
    fetchArAging(),
    fetchReworkLog(),
    fetchCrewDaysSold(),
    fetchEstVsActual(),
  ]);

  // Build report map first — needed by weather/risk checks
  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) reportMap[r.Job_Number] = r;

  // Run weather with pre-loaded data (eliminates duplicate job fetches)
  const weatherAlerts = await getWeatherAlerts(jobs);

  const estVsActualByJob = new Map(estVsActualRows.map(row => [row.Job_Number, row]));

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

  const totalPortfolio = qboFinancials.reduce((sum: number, q: any) => sum + (q.Act_Income || 0), 0);

  // FY starts Oct 1 (per Jackie 4/9). If today is before Oct 1, FY started Oct 1 last year.
  const _now = new Date();
  const _fyStart = _now.getMonth() >= 9 /* Oct=9 */
    ? new Date(_now.getFullYear(), 9, 1)
    : new Date(_now.getFullYear() - 1, 9, 1);
  const _fyStartISO = _fyStart.toISOString().slice(0, 10);

  // ── Missing Reports: jobs assigned YESTERDAY with no field report ─────────
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
  // Margin at Risk: sum of negative profits
  const lossJobs = qboWip.filter(q => q.Profit < 0);
  const marginAtRiskDollars = lossJobs.reduce((s, q) => s + Math.abs(q.Profit), 0);

  // Top money loser (worst single job by dollar loss)
  const topLoser = [...qboWip].sort((a, b) => a.Profit - b.Profit)[0] || null;

  // Average portfolio margin across active jobs with contract or income > 0
  const qboActive = qboWip.filter(q => q.Est_Income > 0);
  const totalAct = qboActive.reduce((s, q) => s + q.Est_Income, 0);
  const totalProf = qboActive.reduce((s, q) => s + q.Profit, 0);
  const avgMargin = totalAct > 0 ? totalProf / totalAct : 0;

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


  const qboUpdatedAt = latestSheetDate([...qboFinancials.map(q => q.Updated_At), ...arAging.rows.map(r => r.Updated_At)]);
  // Server-rendered status needs request time, but the React purity rule cannot tell this is a Server Component.
  // eslint-disable-next-line react-hooks/purity
  const qboStale = qboFinancials.length === 0 || !qboUpdatedAt || (Date.now() - qboUpdatedAt.getTime()) > 36 * 60 * 60 * 1000;
  const qboStatusLabel = qboStale ? `QBO stale — ${formatSheetDate(qboUpdatedAt)}` : `QBO synced — ${formatSheetDate(qboUpdatedAt)}`;

  // ── Evidence payloads for ClickableKpiTile drawers ──────────
  const _qboUpdated = qboFinancials[0]?.Updated_At || '';
  const _arUpdated = arAging.rows[0]?.Updated_At || '';

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

  const arOverdueEvidence = {
    title: 'A/R Overdue (91+ days)',
    headlineValue: `$${(arAging.totals.d91Plus / 1000).toFixed(0)}K`,
    headlineCaption: `${arAging.totals.total > 0 ? ((arAging.totals.d91Plus / arAging.totals.total) * 100).toFixed(1) : '0.0'}% of total A/R is past 90 days — chase these.`,
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


  const risks = computeRisks(jobs, reportMap, scheduleData, weatherAlerts, estVsActualByJob, prepBoard, scheduledJobs, samsara.vehicles || []);


  const criticalCount = risks.filter(r => r.level === 'critical').length;
  const warningCount = risks.filter(r => r.level === 'warning').length;

  const healthColor: Record<string, string> = { green: '#20BC64', amber: '#F5A623', red: '#E04343', gray: '#9CA3AF' };

  const openJobs = jobs.filter((j: any) => !isJobClosed(j));
  const scheduledUniqueJobs = [...new Map(scheduledJobs.map((j: any) => [j.Job_Number, j])).values()].filter(Boolean) as any[];
  const arOverduePct = arAging.totals.total > 0 ? (arAging.totals.d91Plus / arAging.totals.total) * 100 : 0;

  const crewTotals = crewDays.totals;
  const sheetBaseCapacity = crewTotals.stoneBaseDays + crewTotals.millMiscDays + crewTotals.curbDays;
  const sheetPavingCapacity = crewTotals.pavingDays;
  const scheduledCapacity = getScheduleCapacityFromAssignments(scheduleData);
  const baseCapacity = sheetBaseCapacity || scheduledCapacity.baseDays;
  const pavingCapacity = sheetPavingCapacity || scheduledCapacity.pavingDays;
  const capacityRatio = pavingCapacity > 0 ? baseCapacity / pavingCapacity : null;
  const capacityOnTrack = capacityRatio == null || capacityRatio >= 1.2;

  const actionItems = [
    ...risks.map((risk) => {
      const job = risk.job ? jobs.find((j: any) => j.Job_Number === risk.job) : null;
      return {
        key: `risk-${risk.job || risk.message}`,
        level: risk.level,
        label: risk.level === 'critical' ? 'Critical' : risk.level === 'warning' ? 'Warning' : 'Info',
        title: job ? `${job.Job_Number} · ${job.Job_Name}` : risk.message.split(' — ')[0],
        meta: job ? `PM: ${job.Project_Manager || 'N/A'} · ${job.State || 'No state'}` : 'Ops review',
        next: risk.message,
        href: risk.job ? `/jobs/${risk.job}` : undefined,
      };
    }),
    ...worstOffenders.map((item: any) => ({
      key: `money-${item.Job_Number}`,
      level: item._isRealLoss ? 'critical' as const : 'warning' as const,
      label: item._isRealLoss ? 'Loss' : 'Budget Burn',
      title: `${item.Job_Number} · ${item.Project_Name || 'Financial risk'}`,
      meta: `QBO cost ${formatDollars(item.Act_Cost)} · contract ${formatDollars(item._contract)}`,
      next: item._reason,
      href: item.Job_Number ? `/jobs/${item.Job_Number}` : undefined,
    })),
  ].slice(0, 6);

  const fleetExceptionRisks = risks.filter(r => r.message.startsWith('SCHEDULE DEVIATION')).slice(0, 5);
  const mapSourceJobs = [...new Map([...openJobs, ...scheduledUniqueJobs].map((j: any) => [j.Job_Number, j])).values()];
  const mapJobs = mapSourceJobs.map((j: any) => {
    const jobLat = parseFloat(j.Lat);
    const jobLng = parseFloat(j.Lng);
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
  });
  const pinnedJobCount = mapJobs.filter(hasJobMapCoords).length;
  const pinnedFleetCount = (samsara.vehicles || []).filter(hasFleetMapCoords).length;
  const pinnedMapCount = pinnedJobCount + pinnedFleetCount;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ffffff_0,#F7F8F6_36%,#EEF1EE_100%)] text-[#15181A] font-body pb-10 antialiased overflow-x-hidden">
      <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 p-5 lg:p-6">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="mb-1.5 text-xs font-black uppercase tracking-[0.12em] text-[#0F8F47]">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {qboStatusLabel}
            </p>
            <h1 className="m-0 text-[34px] font-black leading-none tracking-[-0.04em] text-[#15181A] md:text-[46px]">Command Center</h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#6D7478] md:text-base">
              Exceptions first: risk, money, crew mismatch, field data, and capacity. Every number below is pulled from the live Scorecard path already wired into the app.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#DDE2E5] bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.06em] text-[#2F3437] shadow-[0_14px_35px_rgba(21,24,26,0.08)]">
            <span className="h-2.5 w-2.5 rounded-full bg-[#20BC64] shadow-[0_0_0_5px_rgba(32,188,100,0.14)]" />
            Scorecard · QBO · Schedule · Fleet · Weather
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <CommandMetric
            label="Critical Alerts"
            value={criticalCount}
            tone={criticalCount > 0 ? 'red' : 'green'}
            note={criticalCount > 0 ? 'Needs owner review now.' : 'No critical alerts detected.'}
          />
          <CommandMetric
            label="Warnings"
            value={warningCount}
            tone={warningCount > 0 ? 'amber' : 'green'}
            note={warningCount > 0 ? 'Schedule, weather, or money exposure.' : 'No warnings detected.'}
          />
          <CommandMetric
            label="Active Jobs"
            value={qboActive.length}
            note="Revenue-producing jobs in QBO."
          />
          <CommandMetric
            label="Portfolio Value"
            value={formatDollarsCompact(totalPortfolio)}
            tone="blue"
            note="QBO Act_Income sum."
          />
          <CommandMetric
            label="A/R 91+ Days"
            value={formatDollarsCompact(arAging.totals.d91Plus, 0)}
            tone={arOverduePct >= 20 ? 'red' : arOverduePct >= 10 ? 'amber' : 'green'}
            note={`${arOverduePct.toFixed(1)}% of total A/R.`}
          />
          <CommandMetric
            label="Margin at Risk"
            value={formatDollarsCompact(marginAtRiskDollars, 0)}
            tone={marginAtRiskDollars > 0 ? 'red' : 'green'}
            note={`${lossJobs.length} losing job${lossJobs.length === 1 ? '' : 's'}.`}
          />
          <CommandMetric
            label="Reports Missing"
            value={missingReportJobs.length}
            tone={missingReportJobs.length > 0 ? 'red' : 'green'}
            note={missingReportJobs.length > 0 ? 'Missing yesterday field reports.' : 'Yesterday reports are in.'}
          />
        </section>

        <section className="grid items-start gap-5 xl:grid-cols-[minmax(380px,1.2fr)_minmax(360px,1fr)_minmax(330px,0.9fr)]">
          <Panel
            title="Action Queue"
            subtitle="Live alerts converted into ownership, next step, and job link."
            badge={<Chip tone={criticalCount > 0 ? 'red' : warningCount > 0 ? 'amber' : 'green'}>{criticalCount} critical</Chip>}
          >
            <div className="grid gap-3">
              {actionItems.length === 0 ? (
                <div className="rounded-2xl border border-[#DDE2E5] bg-white p-4">
                  <p className="font-black text-[#0F8F47]">No active exception queue.</p>
                  <p className="mt-1 text-sm text-[#6D7478]">The live checks did not find field report, material, weather, schedule, or financial action items.</p>
                </div>
              ) : actionItems.map((item) => {
                const tone = item.level === 'critical' ? 'red' : item.level === 'warning' ? 'amber' : 'blue';
                const border = item.level === 'critical' ? '#C53030' : item.level === 'warning' ? '#D69E2E' : '#2B6CB0';
                const body = (
                  <div className="rounded-2xl border border-[#DDE2E5] border-l-[6px] bg-white p-3" style={{ borderLeftColor: border }}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="m-0 text-sm font-black leading-snug text-[#15181A]">{item.title}</h3>
                        <p className="mt-1 text-xs text-[#6D7478]">{item.meta}</p>
                      </div>
                      <Chip tone={tone}>{item.label}</Chip>
                    </div>
                    <p className="mt-2 text-sm leading-snug text-[#2F3437]">{item.next}</p>
                  </div>
                );
                return item.href ? <Link key={item.key} href={item.href} className="block hover:opacity-90">{body}</Link> : <div key={item.key}>{body}</div>;
              })}
            </div>
          </Panel>

          <Panel
            title="This Week's Jobs"
            subtitle="Job cards show health logic, not just billing percent."
            badge={<Chip tone="gray">{scheduledUniqueJobs.length} scheduled</Chip>}
          >
            <div className="grid gap-3 md:grid-cols-2">
              {scheduledUniqueJobs.slice(0, 8).map((job: any) => {
                const health = getJobHealth(job, reportMap[job.Job_Number]);
                const pct = Math.round(job.Pct_Complete || 0);
                const color = healthColor[health];
                return (
                  <Link
                    key={job.Job_Number}
                    href={`/jobs/${job.Job_Number}`}
                    className="rounded-2xl border border-[#DDE2E5] bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-[0_14px_22px_rgba(21,24,26,0.08)]"
                  >
                    <Chip tone={statusTone(health)}>{healthLabel(health)}</Chip>
                    <h3 className="mb-1 mt-2 text-sm font-black leading-tight text-[#15181A]">{job.Job_Number} · {job.Job_Name}</h3>
                    <p className="text-xs leading-snug text-[#6D7478]">{job.General_Contractor || 'No customer'} · {job.Project_Manager || 'No PM'} · {job.State || 'No state'}</p>
                    <div className="my-2 h-2.5 overflow-hidden rounded-full bg-[#E8ECEE]">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(Math.min(pct, 100), 3)}%`, backgroundColor: color }} />
                    </div>
                    <p className="text-xs text-[#6D7478]"><strong>{pct}% billed</strong> · {reportMap[job.Job_Number] ? 'field data present' : 'awaiting field data'}</p>
                  </Link>
                );
              })}
            </div>
          </Panel>

          <div className="grid gap-5">
            <Panel title="Money Board" subtitle="Cash and margin are split so risk does not get hidden.">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-[#DDE2E5] bg-white p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.07em] text-[#6D7478]">Cash Now</p>
                  <div className="mt-2 text-[28px] font-black leading-none tracking-[-0.04em]">{formatDollarsCompact(arAging.totals.total)}</div>
                  <p className="mt-1 text-xs text-[#6D7478]">A/R outstanding · {formatDollarsCompact(arAging.totals.current)} current.</p>
                </div>
                <ClickableKpiTile evidence={arOverdueEvidence} className="rounded-2xl border border-[#DDE2E5] bg-white p-4 text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.07em] text-[#6D7478]">Cash Risk</p>
                  <div className="mt-2 text-[28px] font-black leading-none tracking-[-0.04em]">{formatDollarsCompact(arAging.totals.d91Plus, 0)}</div>
                  <p className="mt-1 text-xs text-[#6D7478]">91+ days overdue.</p>
                </ClickableKpiTile>
                <ClickableKpiTile evidence={topLoserEvidence} className="rounded-2xl border border-[#DDE2E5] bg-white p-4 text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.07em] text-[#6D7478]">Margin Risk</p>
                  <div className="mt-2 text-[28px] font-black leading-none tracking-[-0.04em]">{formatDollarsCompact(marginAtRiskDollars, 0)}</div>
                  <p className="mt-1 text-xs text-[#6D7478]">{lossJobs.length} losing job{lossJobs.length === 1 ? '' : 's'}.</p>
                </ClickableKpiTile>
                <ClickableKpiTile evidence={avgMarginEvidence} className="rounded-2xl border border-[#DDE2E5] bg-white p-4 text-left">
                  <p className="text-[11px] font-black uppercase tracking-[0.07em] text-[#6D7478]">Avg Margin</p>
                  <div className="mt-2 text-[28px] font-black leading-none tracking-[-0.04em]">{(avgMargin * 100).toFixed(1)}%</div>
                  <p className="mt-1 text-xs text-[#6D7478]">{qboActive.length} active jobs · target 25%.</p>
                </ClickableKpiTile>
              </div>
            </Panel>

            <Panel
              title="Capacity Signal"
              subtitle="Plain-English readout of the throughput tracker."
              badge={<Chip tone={capacityOnTrack ? 'green' : 'amber'}>{capacityOnTrack ? 'On Track' : 'Watch'}</Chip>}
            >
              <div className="divide-y divide-[#DDE2E5]">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 first:pt-0">
                  <div><strong className="block text-sm">Base / Site Work Capacity</strong><span className="text-xs text-[#6D7478]">Stone base + mill/misc + curb install</span></div>
                  <div className="text-[22px] font-black">{baseCapacity}d</div>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                  <div><strong className="block text-sm">Paving Capacity</strong><span className="text-xs text-[#6D7478]">Asphalt paving days booked</span></div>
                  <div className="text-[22px] font-black">{pavingCapacity}d</div>
                </div>
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 py-3 last:pb-0">
                  <div><strong className="block text-sm">Capacity Ratio</strong><span className="text-xs text-[#6D7478]">Base/site work must stay ahead of paving demand.</span></div>
                  <div className="text-[22px] font-black">{capacityRatio == null ? '—' : `${capacityRatio.toFixed(2)}x`}</div>
                </div>
              </div>
            </Panel>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel
            title="Live Operations Map"
            subtitle="All active jobs with live fleet pins. Green means aligned. Amber/red means schedule, material, or weather risk."
            badge={<Chip tone={criticalCount > 0 ? 'red' : warningCount > 0 ? 'amber' : 'green'}>{pinnedMapCount} pinned</Chip>}
            className="p-0"
          >
            <div className="px-5 pb-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <Chip tone="red">Exceptions</Chip>
                <Chip tone="gray">Jobs</Chip>
                <Chip tone="gray">Fleet</Chip>
              </div>
              <div className="overflow-hidden rounded-[18px] border border-[#DDE2E5]">
                <div className="h-[430px]">
                  <MapWrapper jobs={mapJobs} vehicles={samsara.vehicles || []} />
                </div>
              </div>
              <p className="mt-3 rounded-xl border border-[#DDE2E5] bg-white p-3 text-xs leading-relaxed text-[#6D7478]">
                <strong className="text-[#2F3437]">Map Mode:</strong> showing all active jobs with coordinates, plus fleet pins. Source: live Scorecard, schedule, Samsara, and weather checks.
              </p>
            </div>
          </Panel>

          <Panel
            title="Fleet Exceptions"
            subtitle="GPS is treated as proof against the schedule."
            badge={<Chip tone={fleetExceptionRisks.length > 0 ? 'amber' : 'green'}>{fleetExceptionRisks.length} mismatches</Chip>}
          >
            <div className="grid gap-3">
              {fleetExceptionRisks.length === 0 ? (
                <div className="rounded-2xl border border-[#DDE2E5] bg-white p-4">
                  <p className="font-black text-[#0F8F47]">No GPS schedule mismatch found.</p>
                  <p className="mt-1 text-sm text-[#6D7478]">
                    {pinnedFleetCount > 0 ? 'Fleet GPS and schedule checks are currently aligned.' : 'No fleet GPS pins are available for this check.'}
                  </p>
                </div>
              ) : fleetExceptionRisks.map((risk, index) => (
                <Link key={`${risk.job}-${index}`} href={risk.job ? `/jobs/${risk.job}` : '/fleet'} className="block rounded-2xl border border-[#DDE2E5] border-l-[6px] border-l-[#D69E2E] bg-white p-3 hover:opacity-90">
                  <h3 className="text-sm font-black text-[#15181A]">{risk.message.split(' — ')[0]}</h3>
                  <p className="mt-1 text-xs leading-snug text-[#6D7478]">{risk.message}</p>
                </Link>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel title="Scorecard Health" subtitle="Fast read of field, billing, schedule, and financial risk.">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-[#DDE2E5] bg-white p-4"><div className="text-[34px] font-black tracking-[-0.05em]">{fieldReports.length > 0 ? 100 : 0}</div><strong>Field Reporting</strong><p className="mt-1 text-xs text-[#6D7478]">{missingReportJobs.length} missing report alerts.</p></div>
              <div className="rounded-2xl border border-[#DDE2E5] bg-white p-4"><div className="text-[34px] font-black tracking-[-0.05em]">{Math.max(0, 100 - Math.round(arOverduePct))}</div><strong>Billing Health</strong><p className="mt-1 text-xs text-[#6D7478]">{arOverduePct.toFixed(1)}% of A/R is 91+ days.</p></div>
              <div className="rounded-2xl border border-[#DDE2E5] bg-white p-4"><div className="text-[34px] font-black tracking-[-0.05em]">{fleetExceptionRisks.length === 0 ? 100 : Math.max(0, 100 - fleetExceptionRisks.length * 15)}</div><strong>Schedule Integrity</strong><p className="mt-1 text-xs text-[#6D7478]">{fleetExceptionRisks.length} GPS mismatch alerts.</p></div>
              <ClickableKpiTile evidence={reworkEvidence} className="rounded-2xl border border-[#DDE2E5] bg-white p-4 text-left"><div className="text-[34px] font-black tracking-[-0.05em]">{marginAtRiskDollars > 0 ? 68 : 100}</div><strong>Financial Risk</strong><p className="mt-1 text-xs text-[#6D7478]">{formatDollarsCompact(marginAtRiskDollars, 0)} margin risk · {formatDollarsCompact(reworkCost, 0)} rework.</p></ClickableKpiTile>
            </div>
          </Panel>

          <Panel title="Portfolio Register" subtitle="Top live jobs ranked for quick owner scan." badge={<Link href="/portfolio" className="text-xs font-black uppercase tracking-[0.06em] text-[#0F8F47] hover:underline">Open portfolio</Link>}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] overflow-hidden rounded-2xl bg-white text-sm">
                <thead>
                  <tr className="bg-[#F1F3F4] text-left text-[11px] font-black uppercase tracking-[0.08em] text-[#4E565A]">
                    <th className="px-3 py-3">Job</th>
                    <th className="px-3 py-3">Customer</th>
                    <th className="px-3 py-3">PM</th>
                    <th className="px-3 py-3">Contract</th>
                    <th className="px-3 py-3">Billed</th>
                    <th className="px-3 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {openJobs.slice(0, 8).map((job: any) => {
                    const health = getJobHealth(job, reportMap[job.Job_Number]);
                    return (
                      <tr key={job.Job_Number} className="border-b border-[#DDE2E5] last:border-b-0 hover:bg-[#FAFCFB]">
                        <td className="px-3 py-3"><Link href={`/jobs/${job.Job_Number}`} className="font-black text-[#15181A] hover:underline">{job.Job_Number}</Link><br /><span className="text-xs text-[#6D7478]">{job.Job_Name}</span></td>
                        <td className="px-3 py-3 text-[#2F3437]">{job.General_Contractor || '—'}</td>
                        <td className="px-3 py-3 text-[#2F3437]">{job.Project_Manager || '—'}</td>
                        <td className="px-3 py-3 text-[#2F3437]">{formatDollars(job.Contract_Amount || job.QBO_Act_Income || 0)}</td>
                        <td className="px-3 py-3 text-[#2F3437]">{Math.round(job.Pct_Complete || 0)}%</td>
                        <td className="px-3 py-3"><Chip tone={statusTone(health)}>{healthLabel(health)}</Chip></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        </section>
      </div>
    </div>
  );
}
