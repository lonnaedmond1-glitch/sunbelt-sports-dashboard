import { fetchScheduleData } from './lib/sheets-data';

async function main() {
  const res = await fetch('https://docs.google.com/spreadsheets/d/1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ/export?format=csv&gid=436573801', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const text = await res.text();
  console.log("HEADERS:");
  console.log(text.split('\n')[0]);
}

main().catch(console.error);
