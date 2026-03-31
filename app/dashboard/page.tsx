import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import fs from 'fs';
import path from 'path';
import MapWrapper from '@/components/MapWrapper';
import { fetchLiveJobs, fetchLiveFieldReports, fetchScheduleData } from '@/lib/sheets-data';
import { 
  TrendingUp, 
  AlertTriangle, 
  Truck, 
  FileWarning, 
  DollarSign, 
  MapPin,
  Clock,
  Users,
  Activity,
  ChevronRight,
  CloudRain,
  AlertCircle,
  CheckCircle2,
  Gauge
} from 'lucide-react';

export const dynamic = 'force-dynamic';

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
    const KEY_NAMES = ['alex', 'sergio', 'martin', 'julio', 'juan', 'cesar', 'david moctezuma', 'rosendo', 'lowboy'];

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

  return { vehiclesOnSite, onSiteNoReport, configured: vehicles.length > 0 };
}

async function getWeatherAlerts(jobsPreloaded: any[]) {
  const THRESHOLD = 40;
  const eastNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayISO = `${eastNow.getFullYear()}-${String(eastNow.getMonth()+1).padStart(2,'0')}-${String(eastNow.getDate()).padStart(2,'0')}`;

  try {
    const seen = new Set<string>();
    const locationJobs: { lat: number; lng: number; job: any }[] = [];
    for (const job of jobsPreloaded) {
      if (!job?.Lat || !job?.Lng) continue;
      const lat = parseFloat(job.Lat);
      const lng = parseFloat(job.Lng);
      if (isNaN(lat) || isNaN(lng)) continue;
      const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (seen.has(key)) continue;
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
          const severe = code >= 51;
          const isToday = dateStr === todayISO;
          if (precipProb >= THRESHOLD || severe || wind >= 30) {
            const condLabel = code >= 95 ? 'Thunderstorm' : code >= 80 ? 'Rain Showers' : code >= 61 ? 'Rain' : code >= 51 ? 'Drizzle' : code >= 45 ? 'Fog' : 'Rain Risk';
            alerts.push({
              date: dateStr, isToday, severity: isToday ? 'critical' : 'warning',
              job: job?.Job_Number, jobName: job?.Job_Name,
              pm: job?.Project_Manager || '',
              precipProb, wind, condition: condLabel,
              message: `${condLabel} at ${job?.Job_Name || job?.Job_Number}: ${precipProb}% rain, wind ${wind}mph`,
            });
          }
        }
      } catch { /* skip */ }
    }));
    return alerts.sort((a, b) => (a.isToday === b.isToday ? a.date.localeCompare(b.date) : a.isToday ? -1 : 1));
  } catch { return []; }
}

function parseJobDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('/');
  if (parts.length < 3) return null;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
  return isNaN(d.getTime()) ? null : d;
}

function resolveAssignmentToJob(assignment: any, jobs: any[]): string | null {
  if (assignment.decoded?.isOff) return null;
  const raw = (assignment.job || assignment.decoded?.raw || assignment.decoded?.jobRef || '').toLowerCase();
  if (!raw) return null;
  const jobRef = (assignment.decoded?.jobRef || '').toLowerCase();
  const numMatch = jobs.find((j: any) => j.Job_Number && raw.includes(j.Job_Number.toLowerCase()));
  if (numMatch) return numMatch.Job_Number;
  if (assignment.ganttMatch?.jobNumber) return assignment.ganttMatch.jobNumber;
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

function getScheduledJobNumbers(scheduleData: any, jobs: any[]): Set<string> {
  const scheduled = new Set<string>();
  const allDays = [...(scheduleData?.currentWeek?.days || []), ...(scheduleData?.nextWeek?.days || [])];
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

function getJobHealth(job: any, report: any): 'green' | 'amber' | 'red' {
  const pct = job.Pct_Complete || 0;
  const hasReport = !!report;
  const scheduled = isJobScheduled(job);
  if (!scheduled) return 'green';
  if (pct === 0 && !hasReport) return 'red';
  if (pct > 0 && pct < 30 && !hasReport) return 'amber';
  if (pct >= 80 && report && (report.Base_Actual + report.Asphalt_Actual) === 0) return 'amber';
  return 'green';
}

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
  const activeJobNums = new Set(jobs.filter(j => isJobScheduled(j)).map(j => j.Job_Number));
  const scheduledWeatherAlerts = weatherAlerts.filter((a: any) => activeJobNums.has(a.job));

  const risks: { level: 'critical' | 'warning' | 'info'; job?: string; jobName?: string; pm?: string; message: string; type: string }[] = [];
  const eastNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayISO = `${eastNow.getFullYear()}-${String(eastNow.getMonth()+1).padStart(2,'0')}-${String(eastNow.getDate()).padStart(2,'0')}`;

  // Missing Field Reports from yesterday
  const yesterdayDate = new Date(eastNow);
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth()+1).padStart(2,'0')}-${String(yesterdayDate.getDate()).padStart(2,'0')}`;
  const allDays = [...(scheduleData?.currentWeek?.days || []), ...((scheduleData as any)?.previousWeek?.days || [])];
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
        risks.push({ 
          level: 'critical', 
          job: matchedJob.Job_Number, 
          jobName: matchedJob.Job_Name,
          pm: matchedJob.Project_Manager,
          message: `No field report from ${crewName} yesterday`, 
          type: 'report' 
        });
      }
    }
  }

  // Material Overrun
  for (const [jobNum, report] of Object.entries(reportMap)) {
    const est = scorecardEstimates[jobNum];
    if (!est || est.estTons === 0) continue;
    const actualTons = (report.GAB_Tonnage || 0) + (report.Binder_Tonnage || 0) + (report.Topping_Tonnage || 0);
    if (actualTons > est.estTons) {
      const pctOver = Math.round(((actualTons - est.estTons) / est.estTons) * 100);
      const job = jobs.find(j => j.Job_Number === jobNum);
      if (job) risks.push({ 
        level: 'warning', 
        job: jobNum, 
        jobName: job.Job_Name,
        pm: job.Project_Manager,
        message: `Material overrun: ${actualTons.toLocaleString()}t / ${est.estTons.toLocaleString()}t budget (+${pctOver}%)`, 
        type: 'material' 
      });
    }
  }

  // Days on Site Overrun
  for (const [jobNum, report] of Object.entries(reportMap)) {
    const est = scorecardEstimates[jobNum];
    if (!est || est.estDays === 0) continue;
    const actualDays = report.Days_Active || 0;
    if (actualDays > est.estDays) {
      const daysOver = actualDays - est.estDays;
      const job = jobs.find(j => j.Job_Number === jobNum);
      if (job) risks.push({ 
        level: 'warning', 
        job: jobNum, 
        jobName: job.Job_Name,
        pm: job.Project_Manager,
        message: `Schedule overrun: ${actualDays}d on site / ${est.estDays}d budget (+${daysOver}d)`, 
        type: 'schedule' 
      });
    }
  }

  // Weather Risk
  const yesterdayISO = new Date(eastNow.getTime() - 86400000).toISOString().split('T')[0];
  const threeDaysOut = new Date(eastNow.getTime() + 3 * 86400000).toISOString().split('T')[0];
  scheduledWeatherAlerts
    .filter((a: any) => a.date >= yesterdayISO && a.date <= threeDaysOut)
    .slice(0, 6)
    .forEach((wx: any) => {
      const lvl = (wx.isToday || wx.severity === 'critical' || (wx.precipProb || 0) >= 70) ? 'critical' as const : 'warning' as const;
      risks.push({
        level: lvl,
        job: wx.job,
        jobName: wx.jobName,
        pm: wx.pm,
        message: `${wx.isToday ? 'TODAY: ' : ''}${wx.condition}, ${wx.precipProb}% rain, ${wx.wind}mph wind`,
        type: 'weather',
      });
    });

  // Vendor/Credit Account Missing
  for (const prep of prepBoard) {
    const creditStatus = (prep.Asphalt_Plant_Credit || prep.Plant_Credit || '').toLowerCase();
    const quarryStatus = (prep.Quarry_Credit || prep.Stone_Credit || '').toLowerCase();
    const isBad = (s: string) => s && ['pending', 'missing', 'not approved', 'inactive', 'hold'].some(k => s.includes(k));
    if (isBad(creditStatus) || isBad(quarryStatus)) {
      const job = jobs.find(j => j.Job_Number === prep.Job_Number);
      if (job) {
        const bad = [isBad(creditStatus) ? 'Asphalt Plant' : '', isBad(quarryStatus) ? 'Quarry' : ''].filter(Boolean).join(' & ');
        risks.push({ 
          level: 'warning', 
          job: prep.Job_Number, 
          jobName: job.Job_Name,
          pm: job.Project_Manager,
          message: `Credit hold: ${bad} account not active`, 
          type: 'credit' 
        });
      }
    }
  }

  return risks.slice(0, 12);
}

export default async function FieldOperationsDashboard() {
  const [jobs, fieldReports, samsara, scheduleData] = await Promise.all([
    fetchLiveJobs(),
    fetchLiveFieldReports(),
    getSamsaraData(),
    fetchScheduleData(),
  ]);

  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) reportMap[r.Job_Number] = r;

  const [weatherAlerts, crossCheck] = await Promise.all([
    getWeatherAlerts(jobs),
    Promise.resolve(computeCrossCheck(samsara.vehicles || [], jobs, reportMap)),
  ]);

  const scorecardEstimates = loadScorecardEstimates();

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

  const scheduledJobs = jobs.filter((j: any) => isScheduledCurrently(j, scheduleData, jobs));
  const scheduledJobNames = scheduledJobs.map((j: any) => j.Job_Name).filter(Boolean);

  const totalPortfolio = jobs.reduce((sum: number, j: any) => sum + (j.Contract_Amount || 0), 0);
  const totalBilled = jobs.reduce((sum: number, j: any) => sum + (j.Billed_To_Date || 0), 0);
  const overallPct = totalPortfolio > 0 ? Math.round((totalBilled / totalPortfolio) * 100) : 0;

  const totalAsphaltLogged = fieldReports.reduce((s: number, r: any) => s + (r.Asphalt_Actual || 0), 0);
  const totalBaseLogged = fieldReports.reduce((s: number, r: any) => s + (r.Base_Actual || 0), 0);

  const fleetAtJobsites = samsara.configured ? samsara.vehicles.filter((v: any) => {
    if (!v.lat || !v.lng) return false;
    return jobs.some((j: any) => {
      const jLat = parseFloat(j.Lat); const jLng = parseFloat(j.Lng);
      if (isNaN(jLat) || isNaN(jLng)) return false;
      return haversineDistance(v.lat, v.lng, jLat, jLng) <= 2;
    });
  }) : [];

  // Missing Reports
  const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const yesterday = new Date(estNow);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,'0')}-${String(yesterday.getDate()).padStart(2,'0')}`;
  const allWeekDays = [...(scheduleData?.currentWeek?.days || []), ...((scheduleData as any)?.previousWeek?.days || [])];
  const yesterdayDay = allWeekDays.find((d: any) => d.date === yesterdayISO);
  const yesterdayJobNums = new Set<string>();
  if (yesterdayDay) {
    for (const assignment of (yesterdayDay.assignments || [])) {
      if (assignment.decoded?.isOff) continue;
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

  // Throughput calculations
  let scorecards: any[] = [];
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

  const activeScJobs = scorecards.filter(sc => sc.actDays > 0);
  const totalStoneTons = activeScJobs.reduce((s, sc) => s + sc.actStone, 0);
  const totalAsphaltTons = activeScJobs.reduce((s, sc) => s + sc.actBinder + sc.actTopping, 0);
  const totalDays = activeScJobs.reduce((s, sc) => s + sc.actDays, 0);
  const stoneVelocity = totalDays > 0 ? Math.round(totalStoneTons / totalDays) : 0;
  const asphaltVelocity = totalDays > 0 ? Math.round(totalAsphaltTons / totalDays) : 0;
  const velocityRatio = asphaltVelocity > 0 ? (stoneVelocity / asphaltVelocity) : 0;
  const isBottleneck = stoneVelocity > 0 && asphaltVelocity > 0 && velocityRatio < 1.2;

  const estTotalAsphalt = Object.values(scorecardEstimates).reduce((s, e) => s + e.estTons, 0);

  return (
    <div className="min-h-screen bg-[#0a0a0a] pb-8">
      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#0a0a0a]/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Image 
              src="/sunbelt-sports-logo.svg" 
              alt="Sunbelt Sports" 
              width={140} 
              height={40} 
              className="h-9 w-auto"
              priority 
            />
            <div className="h-6 w-px bg-white/10" />
            <div>
              <h1 className="text-sm font-semibold text-white">Field Operations Dashboard</h1>
              <p className="text-[11px] text-zinc-500">8 States • Southeast Region</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {criticalCount > 0 && (
              <a href="#alerts" className="risk-badge risk-critical">
                <AlertCircle className="w-3.5 h-3.5" />
                {criticalCount} Critical
              </a>
            )}
            {warningCount > 0 && (
              <a href="#alerts" className="risk-badge risk-warning">
                <AlertTriangle className="w-3.5 h-3.5" />
                {warningCount} Warnings
              </a>
            )}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="relative">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-500 animate-ping opacity-75"></div>
              </div>
              <span className="text-[11px] font-medium text-emerald-500">LIVE</span>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-400">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              <p className="text-[10px] text-zinc-600">{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="p-6 space-y-6">
        {/* ── KPI SUMMARY ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Scheduled Jobs */}
          <div className="card p-4 hover:border-orange-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Calendar className="w-4 h-4 text-orange-500" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Scheduled Jobs</span>
            </div>
            <p className="text-3xl font-mono font-bold text-white">{scheduledJobs.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Active this week</p>
          </div>

          {/* Portfolio Value */}
          <div className="card p-4 hover:border-emerald-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <DollarSign className="w-4 h-4 text-emerald-500" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Portfolio Value</span>
            </div>
            <p className="text-3xl font-mono font-bold text-white">${(totalPortfolio / 1000000).toFixed(1)}<span className="text-lg text-zinc-500">M</span></p>
            <p className="text-xs text-zinc-500 mt-1">Total contract value</p>
          </div>

          {/* Billed To Date */}
          <div className="card p-4 hover:border-blue-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Billed To Date</span>
            </div>
            <p className="text-3xl font-mono font-bold text-white">${(totalBilled / 1000000).toFixed(1)}<span className="text-lg text-zinc-500">M</span></p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${overallPct}%` }} />
              </div>
              <span className="text-xs font-mono text-blue-500">{overallPct}%</span>
            </div>
          </div>

          {/* Fleet at Jobsites */}
          <div className="card p-4 hover:border-amber-500/30 transition-colors">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Truck className="w-4 h-4 text-amber-500" />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Fleet at Jobsites</span>
            </div>
            <p className="text-3xl font-mono font-bold text-white">{samsara.configured ? fleetAtJobsites.length : '—'}</p>
            <p className="text-xs text-zinc-500 mt-1">{samsara.configured ? `${samsara.vehicles.length} total tracked` : 'GPS not configured'}</p>
          </div>

          {/* Missing Reports */}
          <div className={`card p-4 transition-colors ${missingReportJobs.length > 0 ? 'border-red-500/30 hover:border-red-500/50' : 'hover:border-emerald-500/30'}`}>
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${missingReportJobs.length > 0 ? 'bg-red-500/10' : 'bg-emerald-500/10'}`}>
                <FileWarning className={`w-4 h-4 ${missingReportJobs.length > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Missing Reports</span>
            </div>
            <p className={`text-3xl font-mono font-bold ${missingReportJobs.length > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{missingReportJobs.length}</p>
            <p className="text-xs text-zinc-500 mt-1">{missingReportJobs.length > 0 ? 'From yesterday' : 'All reports filed'}</p>
          </div>
        </div>

        {/* ── MAP + ALERTS ROW ──────────────────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">
          {/* Live Map */}
          <div className="col-span-12 lg:col-span-8 card overflow-hidden">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="w-4 h-4 text-orange-500" />
                <h2 className="text-sm font-semibold text-white">Live Operations Map</h2>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span className="text-zinc-400">Job Sites</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded bg-blue-500"></span>
                  <span className="text-zinc-400">Vehicles</span>
                </div>
                <span className="text-zinc-600">|</span>
                <span className="text-emerald-500 font-medium">{scheduledJobs.filter((j:any) => j.Lat && j.Lng).length} pinned</span>
                {samsara.configured && <span className="text-blue-500 font-medium">{samsara.vehicles.length} vehicles</span>}
              </div>
            </div>
            <div style={{ height: '480px' }}>
              <MapWrapper
                jobs={[...new Map(scheduledJobs.map((j: any) => [j.Job_Number, j])).values()].filter(Boolean).map((j: any) => {
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
                })}
                vehicles={samsara.vehicles || []}
              />
            </div>
          </div>

          {/* Risk & Alerts */}
          <div id="alerts" className="col-span-12 lg:col-span-4 card flex flex-col overflow-hidden scroll-mt-20">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-white">Risk & Alerts</h2>
              </div>
              <div className="flex gap-2">
                {criticalCount > 0 && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-500/20 text-red-400">{criticalCount}</span>}
                {warningCount > 0 && <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400">{warningCount}</span>}
              </div>
            </div>
            <div className="overflow-y-auto custom-scrollbar p-3 space-y-2 flex-1" style={{ maxHeight: '432px' }}>
              {risks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
                  <p className="text-emerald-500 font-semibold">All Clear</p>
                  <p className="text-xs text-zinc-500 mt-1">No active risks detected</p>
                </div>
              ) : risks.map((risk, i) => (
                <Link
                  key={i}
                  href={risk.job ? `/jobs/${risk.job}` : '#'}
                  className={`block rounded-lg p-3 border transition-all hover:scale-[1.01] ${
                    risk.level === 'critical' 
                      ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/40' 
                      : risk.level === 'warning'
                      ? 'bg-amber-500/5 border-amber-500/20 hover:border-amber-500/40'
                      : 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      risk.level === 'critical' ? 'bg-red-500/20' : risk.level === 'warning' ? 'bg-amber-500/20' : 'bg-blue-500/20'
                    }`}>
                      {risk.type === 'weather' ? (
                        <CloudRain className={`w-3 h-3 ${risk.level === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                      ) : risk.type === 'report' ? (
                        <FileWarning className="w-3 h-3 text-red-400" />
                      ) : (
                        <AlertTriangle className={`w-3 h-3 ${risk.level === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {risk.jobName && (
                        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                          risk.level === 'critical' ? 'text-red-400' : risk.level === 'warning' ? 'text-amber-400' : 'text-blue-400'
                        }`}>
                          {risk.jobName}
                        </p>
                      )}
                      <p className="text-xs text-zinc-300 leading-relaxed">{risk.message}</p>
                      {risk.pm && <p className="text-[10px] text-zinc-500 mt-1">PM: {risk.pm}</p>}
                    </div>
                    <ChevronRight className="w-4 h-4 text-zinc-600 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* ── FLEET TRACKER ──────────────────────────────────────────────── */}
        {samsara.configured && samsara.vehicles.length > 0 && (
          <div className="card overflow-hidden">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Truck className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-white">Fleet Tracker</h2>
              </div>
              <span className="text-xs text-zinc-500">{samsara.vehicles.length} vehicles tracked via Samsara</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th className="table-header text-left">Vehicle</th>
                    <th className="table-header text-left">Driver</th>
                    <th className="table-header text-left">Location</th>
                    <th className="table-header text-center">Speed</th>
                    <th className="table-header text-center">Heading</th>
                    <th className="table-header text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {samsara.vehicles.slice(0, 8).map((v: any, i: number) => (
                    <tr key={v.id || i} className="table-row">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-white">{v.name?.replace(/\s*\(.*\)/, '') || 'Unknown'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-400">{v.driver !== 'Unassigned' ? v.driver : '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-400 truncate max-w-[200px] block">{v.address || 'GPS Active'}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-sm font-mono font-semibold ${v.speed > 5 ? 'text-emerald-400' : 'text-zinc-500'}`}>
                          {v.speed} mph
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-sm font-mono text-zinc-400">{v.heading || 0}°</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold ${
                          v.speed > 5 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${v.speed > 5 ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
                          {v.speed > 5 ? 'Moving' : 'Parked'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── PORTFOLIO SCORECARD + THROUGHPUT ────────────────────────────── */}
        <div className="grid grid-cols-12 gap-6">
          {/* Portfolio Scorecard */}
          <div className="col-span-12 lg:col-span-5 card overflow-hidden">
            <div className="p-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <Activity className="w-4 h-4 text-emerald-500" />
                <h2 className="text-sm font-semibold text-white">Portfolio Scorecard</h2>
              </div>
              <p className="text-xs text-zinc-500 mt-1">Billing % vs contract value • Tonnage est. vs actual</p>
            </div>
            <div className="p-4 space-y-5">
              {/* Billing Progress */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-400">Portfolio Billed</span>
                  <span className="text-xs font-mono text-emerald-400">${(totalBilled/1000000).toFixed(2)}M / ${(totalPortfolio/1000000).toFixed(2)}M</span>
                </div>
                <div className="relative h-6 rounded-lg bg-white/5 overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg transition-all" style={{ width: `${overallPct}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{overallPct}%</span>
                </div>
              </div>

              {/* Asphalt vs Estimated */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-400">Asphalt Tonnage</span>
                  <span className="text-xs font-mono text-blue-400">{totalAsphaltLogged.toLocaleString()}t actual</span>
                </div>
                <div className="relative h-5 rounded bg-white/5 overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-blue-500/70 rounded" style={{ width: `${Math.min(100, estTotalAsphalt > 0 ? (totalAsphaltLogged / estTotalAsphalt) * 100 : 50)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">{totalAsphaltLogged.toLocaleString()} tons</span>
                </div>
              </div>

              {/* Base Tonnage */}
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-400">Base / GAB Tonnage</span>
                  <span className="text-xs font-mono text-purple-400">{totalBaseLogged.toLocaleString()}t actual</span>
                </div>
                <div className="relative h-5 rounded bg-white/5 overflow-hidden">
                  <div className="absolute left-0 top-0 h-full bg-purple-500/70 rounded" style={{ width: `${Math.min(100, (totalBaseLogged / Math.max(1, totalBaseLogged * 1.3)) * 100)}%` }} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-white">{totalBaseLogged.toLocaleString()} tons</span>
                </div>
              </div>

              {/* Billing vs Activity Summary */}
              <div className="pt-4 border-t border-white/[0.08]">
                <p className="text-xs font-medium text-zinc-400 mb-3">Billing vs Activity Status</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg p-3 text-center bg-emerald-500/10 border border-emerald-500/20">
                    <p className="text-xl font-mono font-bold text-emerald-400">{healthCounts.green}</p>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase">On Track</p>
                  </div>
                  <div className="rounded-lg p-3 text-center bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xl font-mono font-bold text-amber-400">{healthCounts.amber}</p>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase">Watch</p>
                  </div>
                  <div className="rounded-lg p-3 text-center bg-red-500/10 border border-red-500/20">
                    <p className="text-xl font-mono font-bold text-red-400">{healthCounts.red}</p>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase">At Risk</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Throughput Bottleneck Tracker */}
          <div className="col-span-12 lg:col-span-7 card overflow-hidden">
            <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Gauge className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-white">Throughput Bottleneck Tracker</h2>
                {isBottleneck && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/20 text-amber-400 animate-pulse">
                    BASE CREW BELOW THRESHOLD
                  </span>
                )}
              </div>
              <span className="text-xs text-zinc-500">Stone base velocity vs asphalt paving</span>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-6">
                {/* Stone Base */}
                <div>
                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">Stone Base Velocity</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Juan • Martin • Julio</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-amber-400">{stoneVelocity}<span className="text-sm text-zinc-500 ml-1">t/day</span></p>
                  </div>
                  <div className="relative h-7 rounded-lg bg-white/5 overflow-hidden">
                    <div className="absolute left-0 top-0 h-full rounded-lg bg-gradient-to-r from-amber-600 to-amber-500" style={{ width: `${Math.min(100, (stoneVelocity / Math.max(stoneVelocity, asphaltVelocity, 1)) * 100)}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{totalStoneTons.toLocaleString()} tons / {totalDays} days</span>
                  </div>
                </div>

                {/* Asphalt */}
                <div>
                  <div className="flex justify-between items-end mb-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Asphalt Paving Velocity</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Rosendo Rubio</p>
                    </div>
                    <p className="text-2xl font-mono font-bold text-blue-400">{asphaltVelocity}<span className="text-sm text-zinc-500 ml-1">t/day</span></p>
                  </div>
                  <div className="relative h-7 rounded-lg bg-white/5 overflow-hidden">
                    <div className="absolute left-0 top-0 h-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-500" style={{ width: `${Math.min(100, (asphaltVelocity / Math.max(stoneVelocity, asphaltVelocity, 1)) * 100)}%` }} />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-white">{totalAsphaltTons.toLocaleString()} tons / {totalDays} days</span>
                  </div>
                </div>
              </div>

              {/* Ratio Indicators */}
              <div className="mt-5 pt-4 border-t border-white/[0.08] flex items-center justify-between">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-medium">Ratio</p>
                    <p className={`text-lg font-mono font-bold ${isBottleneck ? 'text-red-400' : 'text-emerald-400'}`}>
                      {velocityRatio.toFixed(2)}x
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-medium">Required</p>
                    <p className="text-lg font-mono font-bold text-zinc-500">≥1.20x</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 uppercase font-medium">Status</p>
                    <p className={`text-sm font-semibold ${isBottleneck ? 'text-red-400' : 'text-emerald-400'}`}>
                      {isBottleneck ? 'Behind' : 'On Track'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] text-zinc-600">{activeScJobs.length} jobs reporting</span>
              </div>

              {isBottleneck && (
                <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-300">Base crew velocity below paving threshold</p>
                    <p className="text-[10px] text-amber-200/60 mt-0.5">
                      Stone crews producing {stoneVelocity} t/day vs {asphaltVelocity} t/day asphalt demand. Base must lead by ≥20%.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── QUICK JOB HEALTH ──────────────────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-white/[0.08] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users className="w-4 h-4 text-emerald-500" />
              <h2 className="text-sm font-semibold text-white">Quick Job Health</h2>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span><span className="text-zinc-400">On Track</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span><span className="text-zinc-400">Watch</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span><span className="text-zinc-400">At Risk</span></span>
            </div>
          </div>
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar">
            {[...new Map(scheduledJobs.map((j: any) => [j.Job_Number, j])).values()].filter(Boolean).map((job: any) => {
              const health = getJobHealth(job, reportMap[job.Job_Number]);
              const pct = Math.round(job.Pct_Complete || 0);
              const report = reportMap[job.Job_Number];
              const healthColor = health === 'green' ? 'emerald' : health === 'amber' ? 'amber' : 'red';
              
              return (
                <Link
                  key={job.Job_Number}
                  href={`/jobs/${job.Job_Number}`}
                  className={`rounded-lg p-3 border transition-all hover:scale-[1.02] bg-${healthColor}-500/5 border-${healthColor}-500/20 hover:border-${healthColor}-500/40`}
                  style={{
                    backgroundColor: health === 'green' ? 'rgba(34, 197, 94, 0.05)' : health === 'amber' ? 'rgba(245, 158, 11, 0.05)' : 'rgba(239, 68, 68, 0.05)',
                    borderColor: health === 'green' ? 'rgba(34, 197, 94, 0.2)' : health === 'amber' ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                    borderLeftWidth: '3px',
                    borderLeftColor: health === 'green' ? '#22c55e' : health === 'amber' ? '#f59e0b' : '#ef4444',
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-zinc-500">{job.Job_Number}</span>
                    <span className={`text-[10px] font-semibold uppercase ${health === 'green' ? 'text-emerald-400' : health === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
                      {health === 'green' ? 'OK' : health === 'amber' ? 'Watch' : 'Risk'}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-white leading-tight mb-2 line-clamp-1">{job.Job_Name}</p>
                  <div className="space-y-1.5">
                    <div>
                      <div className="flex justify-between text-[9px] text-zinc-500 mb-0.5">
                        <span>Billed</span>
                        <span className="font-mono">{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                        <div 
                          className="h-full rounded-full" 
                          style={{ 
                            width: `${pct}%`, 
                            backgroundColor: health === 'green' ? '#22c55e' : health === 'amber' ? '#f59e0b' : '#ef4444' 
                          }} 
                        />
                      </div>
                    </div>
                    {report ? (
                      <div className="flex gap-2 text-[9px]">
                        {report.Asphalt_Actual > 0 && <span className="text-blue-400/70">{report.Asphalt_Actual.toLocaleString()}t asph</span>}
                        {report.Base_Actual > 0 && <span className="text-purple-400/70">{report.Base_Actual.toLocaleString()}t base</span>}
                      </div>
                    ) : (
                      <p className="text-[9px] text-red-400/60">No field reports</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Re-import Calendar icon since we're using it in the KPI section
import { Calendar } from 'lucide-react';
