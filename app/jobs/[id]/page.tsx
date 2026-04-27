import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getPrepForJob, getRentalsForJob, getJobByNumber, getChangeOrdersForJob, getScorecardForJob, getJobFolder } from '@/lib/csv-parser';
import { fetchLiveJobs, fetchLiveFieldReports, fetchFieldReportFeed, fetchVisionLinkAssets, fetchFleetAssets, fetchLiveRentals, fetchScheduleData } from '@/lib/sheets-data';
import JobTabs from '@/components/JobTabs';

export const revalidate = 86400; // Daily ISR

async function getLiveJobData(jobNumber: string) {
  try {
    const jobs = await fetchLiveJobs();
    return jobs.find((j: any) => j.Job_Number?.trim() === jobNumber.trim()) || null;
  } catch { return null; }
}

async function getLiveFieldReport(jobNumber: string) {
  try {
    const reports = await fetchLiveFieldReports();
    return reports.find((r: any) => r.Job_Number?.trim() === jobNumber.trim()) || null;
  } catch { return null; }
}

async function getWeatherPeriods(lat: string, lng: string): Promise<any[]> {
  if (!lat || !lng) return [];
  try {
    const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, { next: { revalidate: 86400 } });
    if (!pointRes.ok) return [];
    const pointData = await pointRes.json();
    const forecastUrl = pointData?.properties?.forecast;
    if (!forecastUrl) return [];
    const fcRes = await fetch(forecastUrl, { next: { revalidate: 86400 } });
    if (!fcRes.ok) return [];
    const fcData = await fcRes.json();
    const periods = fcData?.properties?.periods || [];
    // Daytime only, next 5 days
    return periods.filter((_: any, i: number) => i % 2 === 0).slice(0, 5);
  } catch { return []; }
}

// Haversine distance in miles
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getNearbyVehicles(lat: string, lng: string): Promise<any[]> {
  const SAMSARA_API_KEY = process.env.SAMSARA_API_KEY || '';
  if (!SAMSARA_API_KEY || !lat || !lng) return [];
  const jobLat = parseFloat(lat);
  const jobLng = parseFloat(lng);
  if (isNaN(jobLat) || isNaN(jobLng)) return [];

  try {
    const res = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
      headers: { Authorization: `Bearer ${SAMSARA_API_KEY}` },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const KEY_NAMES = ['alex', 'sergio', 'martin', 'julio', 'juan', 'cesar', 'david moctezuma', 'rosendo', 'lowboy'];
    return (data.data || [])
      .filter((v: any) => v.location?.latitude && v.location?.longitude)
      .filter((v: any) => {
        const nameLower = (v.name || '').toLowerCase();
        return KEY_NAMES.some(k => new RegExp(`\\b${k}\\b`).test(nameLower));
      })
      .map((v: any) => ({
        id: v.id,
        name: v.name,
        lat: v.location.latitude,
        lng: v.location.longitude,
        speed: v.location?.speed || 0,
        address: v.location?.reverseGeo?.formattedLocation || '',
        driver: v.staticAssignedDriver?.name || 'Unassigned',
        miles: distanceMiles(jobLat, jobLng, v.location.latitude, v.location.longitude),
      }))
      .filter((v: any) => v.miles <= 0.5)
      .sort((a: any, b: any) => a.miles - b.miles);
  } catch { return []; }
}

export default async function JobSnapshot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobNumber = decodeURIComponent(id);
  const [liveJob, liveReport] = await Promise.all([getLiveJobData(jobNumber), getLiveFieldReport(jobNumber)]);

  const csvJob = getJobByNumber(jobNumber);
  const prep = getPrepForJob(jobNumber);
  const rentals = getRentalsForJob(jobNumber);
  const changeOrders = getChangeOrdersForJob(jobNumber);
  const scorecard = getScorecardForJob(jobNumber);
  const jobFolder = getJobFolder(jobNumber);

  const job = liveJob || (csvJob ? {
    Job_Name: csvJob.Job_Name, General_Contractor: '', Point_Of_Contact: '',
    Project_Manager: csvJob.Project_Manager, State: csvJob.Location, Status: csvJob.Status,
    Start_Date: csvJob.Start_Date, Contract_Amount: 0, Billed_To_Date: 0, Pct_Complete: 0,
    Lat: '', Lng: '', Track_Surface: '', Field_Events: '', Micromill: '',
  } : null);

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

  const [weatherDays, vehicles, fieldReportFeed, vlAssets, fleetAssets, liveRentals, scheduleData] = await Promise.all([
    getWeatherPeriods(job.Lat || '', job.Lng || ''),
    getNearbyVehicles(job.Lat || '', job.Lng || ''),
    fetchFieldReportFeed(jobNumber),
    fetchVisionLinkAssets(),
    fetchFleetAssets(),
    fetchLiveRentals(),
    fetchScheduleData(),
  ]);

    // Only use live field reports -- CSV fallback removed to avoid showing placeholder zeros
  const report = liveReport || null;

  const asphaltCredit = prep?.Asphalt_Credit_Status || 'Unknown';
  const baseCredit = prep?.Base_Credit_Status || 'Unknown';
  const hasCreditFlag = asphaltCredit === 'Pending' || asphaltCredit === 'Missing' || baseCredit === 'Pending' || baseCredit === 'Missing';

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans antialiased">

      {/* ── Global Sticky Header ──────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 shadow-2xl">
        {/* Top bar: nav + live indicator */}
        <div className="px-4 md:px-8 py-3 bg-[#2A2D31] flex justify-between items-center border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <Image src="/sunbelt-sports-logo.png" alt="Sunbelt Sports" width={128} height={28} className="h-7 w-auto" style={{ filter: 'brightness(0) invert(1)' }} />
            <span className="text-white/60 font-bold text-xs uppercase tracking-wide">← Dashboard</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-xs font-black text-white/50 bg-white/5 px-3 py-1 rounded-full">{jobNumber}</span>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#20BC64] animate-pulse"></div>
              <span className="text-xs text-white/40 font-bold uppercase tracking-widest">Live</span>
            </div>
          </div>
        </div>

        {/* Job title bar */}
        <div className="bg-[#1e2023] px-4 md:px-8 py-3 border-b border-white/5">
          <div className="flex justify-between items-center">
            <div className="flex-1 min-w-0">
              <h1 className="text-lg md:text-2xl font-black uppercase tracking-tight text-white truncate">{job.Job_Name}</h1>
              <p className="text-white/40 text-xs mt-0.5">
                {job.Project_Manager && <span className="mr-3">PM: {job.Project_Manager}</span>}
                {job.General_Contractor && <span className="mr-3">GC: {job.General_Contractor}</span>}
                {job.State && <span>{job.State}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 ml-4 flex-shrink-0">
              {job.Status && (
                <span className="text-xs font-black px-2 py-1 rounded-full bg-white/5 text-white/50">{job.Status}</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab UI (client component handles state) ───────────────────────── */}
      <JobTabs
        jobNumber={jobNumber}
        job={job}
        report={report}
        prep={prep}
        rentals={rentals}
        changeOrders={changeOrders}
        scorecard={scorecard}
        jobFolder={jobFolder}
        vehicles={vehicles}
        weatherDays={weatherDays}
        asphaltCredit={asphaltCredit}
        baseCredit={baseCredit}
        hasCreditFlag={hasCreditFlag}
        fieldReportFeed={fieldReportFeed}
        vlAssets={vlAssets}
        fleetAssets={fleetAssets}
        liveRentals={liveRentals}
        scheduleData={scheduleData}
      />
    </div>
  );
}
