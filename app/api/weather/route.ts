import { NextResponse } from 'next/server';
import { fetchLiveJobs } from '@/lib/sheets-data';

// Open-Meteo — free, no API key needed
async function fetchWeather(lat: number, lng: number): Promise<any> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=7`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// WMO weather codes
function weatherDesc(code: number): { label: string; icon: string; severe: boolean } {
  if (code <= 1)  return { label: 'Clear', icon: '☀️', severe: false };
  if (code <= 3)  return { label: 'Partly Cloudy', icon: '⛅', severe: false };
  if (code <= 48) return { label: 'Foggy', icon: '🌫️', severe: false };
  if (code <= 55) return { label: 'Drizzle', icon: '🌦️', severe: true };
  if (code <= 57) return { label: 'Freezing Drizzle', icon: '🌧️', severe: true };
  if (code <= 65) return { label: 'Rain', icon: '🌧️', severe: true };
  if (code <= 67) return { label: 'Freezing Rain', icon: '❄️🌧️', severe: true };
  if (code <= 75) return { label: 'Snow', icon: '🌨️', severe: true };
  if (code <= 77) return { label: 'Snow Grains', icon: '🌨️', severe: true };
  if (code <= 82) return { label: 'Rain Showers', icon: '🌧️', severe: true };
  if (code <= 86) return { label: 'Snow Showers', icon: '❄️', severe: true };
  if (code === 95) return { label: 'Thunderstorm', icon: '⛈️', severe: true };
  if (code >= 96)  return { label: 'Thunderstorm w/ Hail', icon: '⛈️🧊', severe: true };
  return { label: 'Unknown', icon: '❓', severe: false };
}

// Alert fires if precip chance >= 40% OR severe weather code — matches operational Cancel threshold
const WEATHER_ALERT_THRESHOLD = 40;

export async function GET() {
  try {
    // Direct data fetch — bypasses unreliable HTTP self-call in serverless
    const jobs = await fetchLiveJobs();

    // Dedupe locations (round to 1 decimal = ~10 mile radius)
    const locationMap = new Map<string, { lat: number; lng: number; jobs: any[] }>();
    for (const job of jobs) {
      if (!job) continue;
      if (!job.Lat || !job.Lng) continue;
      const lat = parseFloat(job.Lat);
      const lng = parseFloat(job.Lng);
      if (isNaN(lat) || isNaN(lng)) continue;
      const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (!locationMap.has(key)) locationMap.set(key, { lat, lng, jobs: [] });
      locationMap.get(key)!.jobs.push(job);
    }

    const todayISO = new Date().toISOString().split('T')[0];
    const locations = Array.from(locationMap.entries()).slice(0, 10);
    const weatherResults: any[] = [];
    const alerts: any[] = [];

    await Promise.all(locations.map(async ([key, loc]) => {
      const weather = await fetchWeather(loc.lat, loc.lng);
      if (!weather?.daily) return;

      const daily = weather.daily;
      const forecasts: any[] = [];

      for (let i = 0; i < (daily.time?.length || 0); i++) {
        const code = daily.weathercode?.[i] || 0;
        const desc = weatherDesc(code);
        const precipProb = daily.precipitation_probability_max?.[i] || 0;
        const wind = Math.round(daily.windspeed_10m_max?.[i] || 0);
        const precip = daily.precipitation_sum?.[i] || 0;
        const dateStr = daily.time[i];
        const isToday = dateStr === todayISO;

        const day = {
          date: dateStr,
          isToday,
          high: Math.round(daily.temperature_2m_max?.[i] || 0),
          low: Math.round(daily.temperature_2m_min?.[i] || 0),
          precip, precipProb, wind, code, ...desc,
        };
        forecasts.push(day);

        // Fire alert if: ANY rain risk >= 40% OR severe weather code in next 7 days
        const shouldAlert = desc.severe || precipProb >= WEATHER_ALERT_THRESHOLD || wind >= 30;
        if (shouldAlert) {
          for (const job of loc.jobs) {
            alerts.push({
              date: dateStr,
              isToday,
              // Today's alerts are elevated to 'critical', future days are 'warning'
              severity: isToday ? 'critical' : 'warning',
              job: job.Job_Number,
              jobName: job.Job_Name || job.Job_Number,
              pm: job.Project_Manager || '',
              state: job.State || '',
              weather: desc.label,
              icon: desc.icon,
              high: day.high,
              low: day.low,
              precip,
              precipProb,
              wind,
              message: `${desc.icon} WEATHER${isToday ? ' TODAY' : ` on ${dateStr}`} — ${desc.label} at ${job.Job_Name || job.Job_Number}: ${day.high}°F, ${precipProb}% rain${precip > 0 ? ` (${precip}" expected)` : ''}, wind ${wind}mph`,
            });
          }
        }
      }

      weatherResults.push({ location: key, lat: loc.lat, lng: loc.lng, jobs: loc.jobs.map((j: any) => j.Job_Number), forecasts });
    }));

    return NextResponse.json({
      locations: weatherResults,
      alerts: alerts.sort((a, b) => {
        // Today first, then by date
        if (a.isToday && !b.isToday) return -1;
        if (!a.isToday && b.isToday) return 1;
        return a.date.localeCompare(b.date);
      }),
      alertCount: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[weather] Error:', error);
    return NextResponse.json({ locations: [], alerts: [], alertCount: 0, error: 'Weather fetch failed' }, { status: 500 });
  }
}
