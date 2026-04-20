import React from 'react';
import Link from 'next/link';
import { getPrepForJob, getRentalsForJob, getFieldReportForJob, getJobByNumber, getChangeOrdersForJob, getScorecardForJob, getJobFolder } from '@/lib/csv-parser';
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

// Map a free-form status string to a pill class + display label.
function statusPill(status: string): { cls: string; label: string } {
  const s = (status || '').toLowerCase();
  if (!s) return { cls: 'pill pill-neutral', label: 'No status' };
  if (s.includes('complete') || s.includes('done') || s.includes('closed')) return { cls: 'pill pill-success', label: status };
  if (s.includes('hold') || s.includes('pause')) return { cls: 'pill pill-warning', label: status };
  if (s.includes('risk') || s.includes('cancel') || s.includes('stop')) return { cls: 'pill pill-danger', label: status };
  if (s.includes('active') || s.includes('progress') || s.includes('in-progress')) return { cls: 'pill pill-success', label: status };
  if (s.includes('pending') || s.includes('upcoming') || s.includes('scheduled')) return { cls: 'pill pill-info', label: status };
  return { cls: 'pill pill-neutral', label: status };
}

export default async function JobSnapshot({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const jobNumber = decodeURIComponent(id);
  const [liveJob, liveReport] = await Promise.all([getLiveJobData(jobNumber), getLiveFieldReport(jobNumber)]);

  const csvJob = getJobByNumber(jobNumber);
  const prep = getPrepForJob(jobNumber);
  const rentals = getRentalsForJob(jobNumber);
  const csvReport = getFieldReportForJob(jobNumber);
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
      <div className="min-h-screen bg-mist-grey flex items-center justify-center">
        <div className="card card-padded text-center max-w-md">
          <p className="eyebrow mb-3">Job Not Found</p>
          <h1 className="font-display text-3xl text-iron-charcoal mb-2">Job {jobNumber}</h1>
          <p className="text-steel-grey text-sm mb-4">We could not find this job in the index.</p>
          <Link href="/dashboard" className="font-display tracking-widest uppercase text-sunbelt-green hover:underline">
            Back to Dashboard
          </Link>
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

  const pill = statusPill(job.Status || '');

  return (
    <div className="min-h-screen bg-mist-grey text-iron-charcoal font-body antialiased">

      {/* ── Sticky Header (light theme) ──────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-safety-white border-b border-line-grey">
        <div className="px-4 md:px-8 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <Link
                href="/dashboard"
                className="inline-block font-display tracking-widest uppercase text-xs text-sunbelt-green hover:text-sunbelt-green-hover transition-colors mb-2"
              >
                &larr; Dashboard
              </Link>
              <p className="eyebrow">Job · {jobNumber}</p>
              <h1 className="font-display text-2xl md:text-3xl text-iron-charcoal mt-2 truncate">
                {job.Job_Name}
              </h1>
              <p className="text-steel-grey text-sm mt-1">
                {job.Project_Manager && <span>PM: {job.Project_Manager}</span>}
                {job.Project_Manager && (job.General_Contractor || job.State) && <span className="mx-2">·</span>}
                {job.General_Contractor && <span>GC: {job.General_Contractor}</span>}
                {job.General_Contractor && job.State && <span className="mx-2">·</span>}
                {job.State && <span>{job.State}</span>}
              </p>
            </div>
            <div className="shrink-0 pt-1">
              <span className={pill.cls}>{pill.label}</span>
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
