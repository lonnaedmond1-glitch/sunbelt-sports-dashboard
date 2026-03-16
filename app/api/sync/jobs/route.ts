import { NextResponse } from 'next/server';

const JOB_LIST_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
const JOB_LIST_GID = '623969002';

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim()); current = '';
    } else { current += char; }
  }
  result.push(current.trim());
  return result;
}

export async function GET() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${JOB_LIST_SHEET_ID}/export?format=csv&gid=${JOB_LIST_GID}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!response.ok) throw new Error(`Google Sheets fetch failed: ${response.status}`);

    const csvText = await response.text();
    const lines = csvText.split('\r\n').filter(l => l.trim());

    const jobs = lines.slice(2).map(line => {
      const cols = parseCSVLine(line);
      const jobNumber = cols[0]?.trim();
      if (!jobNumber || !jobNumber.match(/^\d{2}-\d{3}/)) return null;

      const coordsRaw = cols[2]?.replace(/"/g, '').trim();
      let lat = '', lng = '';
      if (coordsRaw) {
        const parts = coordsRaw.split(',');
        lat = parts[0]?.trim() || '';
        lng = parts[1]?.trim() || '';
      }

      return {
        Job_Number: jobNumber,
        Job_Name: cols[1]?.trim() || '',
        Lat: lat, Lng: lng,
        State: cols[3]?.trim() || '',
        Status: cols[5]?.trim() || 'Pending',
        Start_Date: cols[6]?.trim() || '',
        Finish_Date: cols[7]?.trim() || '',
        General_Contractor: cols[8]?.trim() || '',
        Point_Of_Contact: cols[9]?.trim() || '',
        Project_Manager: cols[10]?.trim() || '',
        Contract_Amount: parseFloat((cols[13] || '0').replace(/[$,\s]/g, '')) || 0,
        Billed_To_Date: parseFloat((cols[14] || '0').replace(/[$,\s]/g, '')) || 0,
        Pct_Complete: parseFloat((cols[16] || '0%').replace('%', '').trim()) || 0,
        Location: cols[3]?.trim() || '',
        Field_Events: cols[18]?.trim() || '',
        Track_Surface: cols[20]?.trim() || '',
        Micromill: cols[22]?.trim() || '',
      };
    }).filter(Boolean);

    return NextResponse.json({ data: jobs, count: jobs.length, source: 'google_sheets', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[sync/jobs] Error:', error);
    return NextResponse.json({ error: 'Failed to sync job list', data: [] }, { status: 500 });
  }
}
