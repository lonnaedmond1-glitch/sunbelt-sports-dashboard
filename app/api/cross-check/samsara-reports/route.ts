import { NextResponse } from 'next/server';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

// Haversine distance in miles
function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const PROXIMITY_MILES = 0.5; // ~0.5 mile radius for "on site"

export async function GET() {
  try {
    const [samsaraRes, jobsRes, reportsRes] = await Promise.all([
      fetch(`${getBaseUrl()}/api/telematics/samsara`, { cache: 'no-store' }),
      fetch(`${getBaseUrl()}/api/sync/jobs`, { cache: 'no-store' }),
      fetch(`${getBaseUrl()}/api/sync/field-reports`, { cache: 'no-store' }),
    ]);

    const samsara = samsaraRes.ok ? await samsaraRes.json() : { vehicles: [], configured: false };
    const jobsData = jobsRes.ok ? await jobsRes.json() : { data: [] };
    const reportsData = reportsRes.ok ? await reportsRes.json() : { data: [] };

    const vehicles = samsara.vehicles || [];
    const jobs = jobsData.data || [];
    const reports = reportsData.data || [];

    // Build a set of job numbers that have field reports
    const reportedJobs = new Set(reports.map((r: any) => r.Job_Number));

    // Jobs with valid coordinates
    const geoJobs = jobs
      .filter((j: any) => j.Lat && j.Lng && !isNaN(parseFloat(j.Lat)))
      .map((j: any) => ({
        Job_Number: j.Job_Number,
        Job_Name: j.Job_Name,
        lat: parseFloat(j.Lat),
        lng: parseFloat(j.Lng),
        PM: j.Project_Manager,
        GC: j.General_Contractor,
        Status: j.Status,
        Pct_Complete: j.Pct_Complete || 0,
        Start_Date: j.Start_Date,
        hasReport: reportedJobs.has(j.Job_Number),
      }));

    // Cross-check: which vehicles are near which job sites?
    const vehiclesOnSite: any[] = [];
    const onSiteNoReport: any[] = [];
    const scheduledNoActivity: any[] = [];

    for (const vehicle of vehicles) {
      if (!vehicle.lat || !vehicle.lng) continue;

      for (const job of geoJobs) {
        const dist = distanceMiles(vehicle.lat, vehicle.lng, job.lat, job.lng);
        if (dist <= PROXIMITY_MILES) {
          const match = {
            vehicle: vehicle.name,
            vehicleAddress: vehicle.address,
            job: job.Job_Number,
            jobName: job.Job_Name,
            pm: job.PM,
            distance: Math.round(dist * 5280), // feet
            hasReport: job.hasReport,
          };

          vehiclesOnSite.push(match);

          if (!job.hasReport) {
            onSiteNoReport.push({
              ...match,
              alert: `${vehicle.name} is ${match.distance}ft from ${job.Job_Name} (${job.Job_Number}) but NO Jotform field report has been filed. PM: ${job.PM}`,
            });
          }
        }
      }
    }

    // Schedule deviation: jobs past their start date with no Samsara or field activity
    const today = new Date();
    for (const job of geoJobs) {
      if (!job.Start_Date) continue;
      const parts = job.Start_Date.split('/');
      if (parts.length < 3) continue;
      let year = parseInt(parts[2]);
      if (year < 100) year += 2000; // handle 2-digit years: 26 → 2026
      const startDate = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
      if (isNaN(startDate.getTime())) continue;
      if (startDate > today) continue; // hasn't started yet

      // Check if any vehicle is near this job
      const hasVehicle = vehiclesOnSite.some(v => v.job === job.Job_Number);
      if (!hasVehicle && !job.hasReport) {
        const daysPast = Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
        scheduledNoActivity.push({
          job: job.Job_Number,
          jobName: job.Job_Name,
          pm: job.PM,
          startDate: job.Start_Date,
          daysPastStart: daysPast,
          alert: `${job.Job_Name} (${job.Job_Number}) was scheduled to start ${job.Start_Date} (${daysPast}d ago) but has no Samsara vehicle on site and no field reports. PM: ${job.PM}`,
        });
      }
    }

    return NextResponse.json({
      configured: samsara.configured,
      vehiclesTracked: vehicles.length,
      jobSitesChecked: geoJobs.length,
      vehiclesOnSite,          // all vehicles matched to a job site
      onSiteNoReport,          // vehicles on site but no field report filed
      scheduledNoActivity,     // jobs past start date with no activity
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[cross-check] Error:', error);
    return NextResponse.json({ error: 'Cross-check failed', vehiclesOnSite: [], onSiteNoReport: [], scheduledNoActivity: [] }, { status: 500 });
  }
}
