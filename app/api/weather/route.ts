import { NextResponse } from 'next/server';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

// Open-Meteo is free, no API key needed
async function fetchWeather(lat: number, lng: number): Promise<any> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weathercode,windspeed_10m_max&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=America%2FNew_York&forecast_days=14`;
    const res = await fetch(url, { next: { revalidate: 1800 } }); // cache 30 min
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// WMO weather codes to descriptions
function weatherDesc(code: number): { label: string; icon: string; severe: boolean } {
  if (code <= 1) return { label: 'Clear', icon: '☀️', severe: false };
  if (code <= 3) return { label: 'Partly Cloudy', icon: '⛅', severe: false };
  if (code <= 48) return { label: 'Foggy', icon: '🌫️', severe: false };
  if (code <= 55) return { label: 'Drizzle', icon: '🌦️', severe: false };
  if (code <= 57) return { label: 'Freezing Drizzle', icon: '🌧️', severe: true };
  if (code <= 65) return { label: 'Rain', icon: '🌧️', severe: true };
  if (code <= 67) return { label: 'Freezing Rain', icon: '❄️🌧️', severe: true };
  if (code <= 75) return { label: 'Snow', icon: '🌨️', severe: true };
  if (code <= 77) return { label: 'Snow Grains', icon: '🌨️', severe: true };
  if (code <= 82) return { label: 'Rain Showers', icon: '🌧️', severe: true };
  if (code <= 86) return { label: 'Snow Showers', icon: '❄️', severe: true };
  if (code === 95) return { label: 'Thunderstorm', icon: '⛈️', severe: true };
  if (code >= 96) return { label: 'Thunderstorm w/ Hail', icon: '⛈️🧊', severe: true };
  return { label: 'Unknown', icon: '❓', severe: false };
}

export async function GET() {
  try {
    // Get job data with coordinates
    const jobsRes = await fetch(`${getBaseUrl()}/api/sync/jobs`, { cache: 'no-store' });
    const jobsData = jobsRes.ok ? await jobsRes.json() : { data: [] };
    const jobs = jobsData.data || [];

    // Get unique locations (dedupe by rounding to 1 decimal = ~10 mile radius)
    const locationMap = new Map<string, { lat: number; lng: number; jobs: string[] }>();
    for (const job of jobs) {
      if (!job.Lat || !job.Lng) continue;
      const lat = parseFloat(job.Lat);
      const lng = parseFloat(job.Lng);
      if (isNaN(lat) || isNaN(lng)) continue;
      const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (!locationMap.has(key)) {
        locationMap.set(key, { lat, lng, jobs: [] });
      }
      locationMap.get(key)!.jobs.push(job.Job_Number);
    }

    // Fetch weather for each unique location (limit to 10 to avoid rate limits)
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
        const day = {
          date: daily.time[i],
          high: Math.round(daily.temperature_2m_max?.[i] || 0),
          low: Math.round(daily.temperature_2m_min?.[i] || 0),
          precip: daily.precipitation_sum?.[i] || 0,
          precipProb: daily.precipitation_probability_max?.[i] || 0,
          wind: Math.round(daily.windspeed_10m_max?.[i] || 0),
          code,
          ...desc,
        };
        forecasts.push(day);

        // Generate alerts for severe weather in the next 7 days
        if (i < 7 && (desc.severe || day.precipProb >= 60 || day.wind >= 30)) {
          for (const jobNum of loc.jobs) {
            const job = jobs.find((j: any) => j.Job_Number === jobNum);
            alerts.push({
              date: day.date,
              job: jobNum,
              jobName: job?.Job_Name || jobNum,
              pm: job?.Project_Manager || '',
              state: job?.State || '',
              weather: day.label,
              icon: day.icon,
              high: day.high,
              low: day.low,
              precip: day.precip,
              precipProb: day.precipProb,
              wind: day.wind,
              message: `${day.icon} ${day.label} at ${job?.Job_Name || jobNum} on ${day.date}: ${day.high}°F, ${day.precipProb}% chance of rain${day.precip > 0 ? ` (${day.precip}" expected)` : ''}, wind ${day.wind}mph`,
            });
          }
        }
      }

      weatherResults.push({
        location: key,
        lat: loc.lat,
        lng: loc.lng,
        jobs: loc.jobs,
        forecasts,
      });
    }));

    return NextResponse.json({
      locations: weatherResults,
      alerts: alerts.sort((a, b) => a.date.localeCompare(b.date)),
      alertCount: alerts.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[weather] Error:', error);
    return NextResponse.json({ locations: [], alerts: [], alertCount: 0, error: 'Weather fetch failed' }, { status: 500 });
  }
}
