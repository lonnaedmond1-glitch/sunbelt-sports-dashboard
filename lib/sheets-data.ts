/**
 * Shared data-fetching functions that call Google Sheets directly.
 * Use these in Server Components instead of fetching internal API routes.
 * This fixes Vercel deployment where SSR can't call its own API endpoints.
 */

// ──────────────────────────── CSV PARSER ────────────────────────────

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

function parseCSV(text: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [];
  let currentWord = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') { currentWord += '"'; i++; }
        else inQuotes = false;
      } else { currentWord += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(currentWord); currentWord = ''; }
      else if (char === '\n' || char === '\r') {
        row.push(currentWord); result.push(row); row = []; currentWord = '';
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      } else { currentWord += char; }
    }
  }
  if (currentWord || row.length > 0) { row.push(currentWord); result.push(row); }
  return result;
}

function parseFloatSafe(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0;
}

function parseMoney(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,\s"]/g, '')) || 0;
}

// ──────────────────────────── IN-MEMORY CACHE ─────────────────────────────────
// Prevents redundant Google Sheets API calls across concurrent SSR renders.
// TTL = 5 minutes. Wiped on cold start / new deploy.
const _cache = new Map<string, { data: any; expires: number }>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const entry = _cache.get(key);
  if (entry && entry.expires > now) return Promise.resolve(entry.data as T);
  return fn().then(data => { _cache.set(key, { data, expires: now + ttlMs }); return data; });
}

// ──────────────────────────── JOBS (Google Sheets) ────────────────────────────

const JOB_LIST_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
const JOB_LIST_GID = '623969002';

// ──────────────────────────── LEVEL 10 MEETING ────────────────────────────
export function fetchLevel10Meeting() {
  return cached('level10Meeting', 15 * 60 * 1000, async () => {
    try {
      const L10_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
      const MEETING_GID = '683987594'; // Specifically the Level 10 meeting tabs sheet
      const url = `https://docs.google.com/spreadsheets/d/${L10_SHEET_ID}/export?format=csv&gid=${MEETING_GID}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
      if (!response.ok) return { screaming: [], looseEnds: [] };
      const csvText = await response.text();
      const lines = csvText.split('\r\n');
      
      let screaming: string[] = [];
      let looseEnds: { task: string, who: string, details: string }[] = [];
      
      let inScreaming = false;
      let inLooseEnds = false;
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = parseCSVLine(line);
        if (cols.length < 2) continue;
        
        // Screaming Customers Section
        if (cols[1] === 'Customer / Employee / Company Headlines') inScreaming = true;
        if (inScreaming && cols[1] === 'On Rent') inScreaming = false;
        if (inScreaming && cols[1] && cols[1] !== 'What customers are screaming?' && cols[1] !== 'Customer / Employee / Company Headlines' && cols[1] !== 'Any rain days for crews this week? Recorded on daily report?') {
           screaming.push(cols[1]); // It appears in col B for headlines sometimes
        }
        if (inScreaming && cols[2] && cols[2].trim() && cols[2] !== 'What customers are screaming?') {
           screaming.push(cols[2]);
        }
        
        // Loose Ends Section
        if (cols[2] === 'Long Term To-do List') inLooseEnds = true;
        if (inLooseEnds && (cols[1] === '30 Minutes' || cols.join('').includes('Internal Scorecard'))) inLooseEnds = false;
        
        if (inLooseEnds && cols[2] === 'Tie Up Loose Ends') {
          looseEnds.push({
            task: cols[2].replace(/"/g, ''),
            who: cols[3]?.replace(/"/g, '') || '',
            details: cols[4]?.replace(/"/g, '') || ''
          });
        }
      }
      
      return { 
        screaming: Array.from(new Set(screaming)).filter(Boolean),
        looseEnds 
      };
    } catch (err) {
      console.error('Error fetching Level10:', err);
      return { screaming: [], looseEnds: [] };
    }
  });
}

export function fetchLiveJobs() {
  return cached('liveJobs', 5 * 60 * 1000, async () => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${JOB_LIST_SHEET_ID}/export?format=csv&gid=${JOB_LIST_GID}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!response.ok) return [];
    const csvText = await response.text();
    const lines = csvText.split('\r\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    // Header-based column lookup (resilient to column reordering)
    const headerCols = parseCSVLine(lines[0]);
    const hdr: Record<string, number> = {};
    headerCols.forEach((h, i) => {
      const clean = h.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
      hdr[clean] = i;
    });

    // Find column indices by header name (case-insensitive, flexible matching)
    const col = (name: string): number => {
      // Exact match first
      if (hdr[name.toLowerCase()] !== undefined) return hdr[name.toLowerCase()];
      // Partial match
      const key = Object.keys(hdr).find(k => k.includes(name.toLowerCase()));
      return key !== undefined ? hdr[key] : -1;
    };

    const iJobNum = col('job number');
    const iCoords = col('coordinates');
    const iState = col('state');
    const iStatus = col('contract status');
    const iStart = col('pending start');
    const iFinish = col('finish');
    const iGC = col('contractor');
    const iContact = col('contractor scheduling');
    const iPM = col('pm');
    const iAmount = col('contract amount');
    const iBilled = col('actual to date');
    const iPct = col('% complete');
    const iField = col('field events');
    const iTrack = col('track surface');
    const iMicromill = col('micromill');

    // Job Name: check "job name" first, then "unhide", then fallback to col 1
    let iName = col('job name');
    if (iName < 0) iName = col('unhide');
    if (iName < 0) iName = 2; // last resort

    const g = (cols: string[], idx: number): string => (idx >= 0 && idx < cols.length) ? (cols[idx]?.trim() || '') : '';

    return lines.slice(2).map(line => {
      const cols = parseCSVLine(line);
      const jobNumber = g(cols, iJobNum);
      if (!jobNumber || !jobNumber.match(/^\d{2}-\d{3}/)) return null;
      const coordsRaw = g(cols, iCoords).replace(/"/g, '');
      let lat = '', lng = '';
      if (coordsRaw) { const parts = coordsRaw.split(','); lat = parts[0]?.trim() || ''; lng = parts[1]?.trim() || ''; }
      return {
        Job_Number: jobNumber, Job_Name: g(cols, iName), Lat: lat, Lng: lng,
        State: g(cols, iState), Status: g(cols, iStatus) || 'Pending',
        Start_Date: g(cols, iStart), Finish_Date: g(cols, iFinish),
        General_Contractor: g(cols, iGC), Point_Of_Contact: g(cols, iContact),
        Project_Manager: g(cols, iPM),
        Contract_Amount: parseFloat((g(cols, iAmount) || '0').replace(/[$,\s]/g, '')) || 0,
        Billed_To_Date: parseFloat((g(cols, iBilled) || '0').replace(/[$,\s]/g, '')) || 0,
        Pct_Complete: parseFloat((g(cols, iPct) || '0%').replace('%', '').trim()) || 0,
        Location: g(cols, iState),
        Field_Events: g(cols, iField), Track_Surface: g(cols, iTrack), Micromill: g(cols, iMicromill),
      };
    }).filter(Boolean);
  } catch { return []; }
  });
}

// ──────────────────────────── FLEET ASSETS (Google Sheets) ─────────────────────

const FLEET_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
const FLEET_ASSETS_GID = '852503706';   // Sports Fleet Assets tab
const FLEET_VEHICLES_GID = '1839763446'; // Sports Vehicle Fleet tab

export function fetchFleetAssets() {
  return cached('fleetAssets', 5 * 60 * 1000, async () => {
    try {
      const [assetsRes, vehiclesRes] = await Promise.all([
        fetch(`https://docs.google.com/spreadsheets/d/${FLEET_SHEET_ID}/export?format=csv&gid=${FLEET_ASSETS_GID}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 },
        }),
        fetch(`https://docs.google.com/spreadsheets/d/${FLEET_SHEET_ID}/export?format=csv&gid=${FLEET_VEHICLES_GID}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 },
        }),
      ]);

      const equipment: any[] = [];
      const vehicles: any[] = [];

      // Parse Sports Fleet Assets (columns: [owner], Category, Asset#, Year, Make, Model, Driver, Serial, ESN, Description)
      if (assetsRes.ok) {
        const text = await assetsRes.text();
        const rows = parseCSV(text);
        if (rows.length > 1) {
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 7) continue;
            const category = (r[2] || '').trim();
            const assetNum = (r[3] || '').trim();
            const year = (r[4] || '').trim();
            const make = (r[5] || '').trim();
            const model = (r[6] || '').trim();
            const driver = (r[7] || '').trim();
            const serial = (r[8] || '').trim();
            const description = (r[10] || '').trim();
            if (!category && !assetNum && !make) continue;
            const isRental = /rent/i.test(assetNum) || /sunbelt|united rental/i.test(description);
            equipment.push({
              category, assetNum, year, make, model, driver, serial, description, isRental,
              displayName: `${year ? year + ' ' : ''}${make} ${model}`.trim(),
            });
          }
        }
      }

      // Parse Sports Vehicle Fleet (columns: [county/location], Vehicles, YR, Make, Model, Driver, VIN)
      if (vehiclesRes.ok) {
        const text = await vehiclesRes.text();
        const rows = parseCSV(text);
        if (rows.length > 1) {
          for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 6) continue;
            const location = (r[1] || '').trim();
            const yr = (r[2] || '').trim();
            const make = (r[3] || '').trim();
            const model = (r[4] || '').trim();
            const driver = (r[5] || '').trim();
            const vin = (r[6] || '').trim();
            if (!make && !model) continue;
            vehicles.push({
              location, year: yr, make, model, driver, vin,
              displayName: `${yr ? yr + ' ' : ''}${make} ${model}`.trim(),
            });
          }
        }
      }

      return { equipment, vehicles };
    } catch {
      return { equipment: [], vehicles: [] };
    }
  });
}

// ──────────────────────────── LIVE RENTALS (Gmail → Google Sheets) ─────────────

// These tab GIDs will be auto-created by the Gmail Apps Script.
// Until then, we try to fetch by tab name using gid=0 as placeholder.
// The Apps Script writes to tabs named "Sunbelt Rentals Live" and "United Rentals Live".

async function fetchSheetByName(sheetId: string, tabName: string): Promise<string[][]> {
  // Try fetching export with tab name — Google Sheets export by gid only,
  // so we fetch the full spreadsheet metadata to find the gid dynamically.
  // Simpler approach: export entire spreadsheet and filter, or use known gids.
  // For now, we'll export specific gids once user runs the setup.
  try {
    // Use a direct sheets URL with the sheet name encoded
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 300 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseCSV(text);
  } catch { return []; }
}

export function fetchLiveRentals() {
  return cached('liveRentals', 5 * 60 * 1000, async () => {
    try {
      const RENTAL_SHEET_ID = '1eIwv3pK0BBH3n4Uds6YZu4GWdMrlS3SAEFzsU3OKS5I';
      const [sunbeltRows, unitedRows] = await Promise.all([
        fetchSheetByName(RENTAL_SHEET_ID, 'Sunbelt Rentals Live'),
        fetchSheetByName(RENTAL_SHEET_ID, 'United Rentals Live'),
      ]);

      const rentals: any[] = [];

      // Parse Sunbelt tab (standardized columns from our Apps Script):
      // Vendor, Contract_Number, Branch, Job_Name, Job_Location, Job_City, State,
      // Ordered_By, Equipment_Type, Class_Name, Day_Rate, Week_Rate, FourWeek_Rate,
      // Date_Rented, Days_On_Rent, Pickup_Date, Email_Date, Synced_At
      if (sunbeltRows.length > 1) {
        const headers = sunbeltRows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
        for (let i = 1; i < sunbeltRows.length; i++) {
          const r = sunbeltRows[i];
          if (!r || r.length < 5) continue;
          const getCol = (name: string) => {
            const idx = headers.indexOf(name);
            return idx >= 0 ? (r[idx] || '').trim() : '';
          };
          const equipType = getCol('equipment_type') || getCol('class_name');
          if (!equipType) continue;
          rentals.push({
            vendor: 'Sunbelt Rentals',
            contractNumber: getCol('contract_number'),
            jobName: getCol('job_name'),
            jobLocation: getCol('job_location'),
            jobCity: getCol('job_city'),
            equipmentType: equipType,
            className: getCol('class_name'),
            dayRate: parseMoney(getCol('day_rate')),
            weekRate: parseMoney(getCol('week_rate')),
            fourWeekRate: parseMoney(getCol('fourweek_rate')),
            dateRented: getCol('date_rented'),
            daysOnRent: parseInt(getCol('days_on_rent')) || 0,
            pickupDate: getCol('pickup_date'),
            emailDate: getCol('email_date'),
          });
        }
      }

      // Parse United Rentals tab (columns may vary — we handle dynamically)
      if (unitedRows.length > 1) {
        const headers = unitedRows[0].map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
        for (let i = 1; i < unitedRows.length; i++) {
          const r = unitedRows[i];
          if (!r || r.every(c => !c?.trim())) continue;
          const getCol = (name: string) => {
            const idx = headers.findIndex(h => h.includes(name));
            return idx >= 0 ? (r[idx] || '').trim() : '';
          };
          const equipType = getCol('description') || getCol('equipment') || getCol('class') || r[2]?.trim() || '';
          if (!equipType) continue;
          rentals.push({
            vendor: 'United Rentals',
            contractNumber: getCol('contract') || getCol('order') || r[0]?.trim() || '',
            jobName: getCol('job') || getCol('site') || '',
            jobLocation: getCol('location') || getCol('address') || '',
            jobCity: '',
            equipmentType: equipType,
            className: '',
            dayRate: parseMoney(getCol('daily') || getCol('day_rate') || getCol('rate') || ''),
            weekRate: parseMoney(getCol('weekly') || getCol('week_rate') || ''),
            fourWeekRate: parseMoney(getCol('monthly') || getCol('4_week') || ''),
            dateRented: getCol('start') || getCol('rent_date') || getCol('date') || '',
            daysOnRent: parseInt(getCol('days')) || 0,
            pickupDate: '',
            emailDate: getCol('email_date') || '',
          });
        }
      }

      return rentals;
    } catch {
      return [];
    }
  });
}

// ──────────────────────────── VISIONLINK ASSETS (CSV) ────────────────────────────

export async function fetchVisionLinkAssets() {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const csvPath = path.join(process.cwd(), 'data', 'VisionLink_Assets.csv');
    if (!fs.existsSync(csvPath)) return [];
    const csvText = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvText.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1).map(line => {
      const cols = parseCSVLine(line);
      return {
        Asset_ID: cols[0]?.trim() || '',
        Make: cols[1]?.trim() || '',
        Model: cols[2]?.trim() || '',
        Serial: cols[3]?.trim() || '',
        Hours: parseFloat(cols[4]?.trim() || '0') || 0,
        Last_Reported: cols[5]?.trim() || '',
      };
    }).filter(a => a.Asset_ID || a.Serial);
  } catch { return []; }
}

// ──────────────────────────── FIELD REPORTS (Google Forms → Google Sheets) ────────────
// Source: Google Form "Sunbelt Sports Daily Field Report" responses
// Spreadsheet: 1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY
// Tab: "Form Responses 1"

const FIELD_REPORT_SHEET_ID = '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY';
const FIELD_REPORT_TAB = 'Form Responses 1';

function safeNum(val: string): number { const n = parseFloat(val?.replace(/[^0-9.-]/g, '') || '0'); return isNaN(n) ? 0 : n; }

// Fetch all rows from the Google Form response sheet
async function fetchFormResponseRows(): Promise<string[][]> {
  try {
    // Try gviz endpoint first (works for sheets shared "anyone with link")
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${FIELD_REPORT_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(FIELD_REPORT_TAB)}`;
    const res = await fetch(gvizUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (res.ok) {
      const text = await res.text();
      if (text && !text.includes('<!DOCTYPE')) {
        return parseCSV(text);
      }
    }
    // Fallback: try direct CSV export
    const exportUrl = `https://docs.google.com/spreadsheets/d/${FIELD_REPORT_SHEET_ID}/export?format=csv&gid=0`;
    const res2 = await fetch(exportUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      cache: 'no-store',
    });
    if (res2.ok) {
      const text2 = await res2.text();
      if (text2 && !text2.includes('<!DOCTYPE')) {
        return parseCSV(text2);
      }
    }
    return [];
  } catch { return []; }
}

// Header-based column finder for form responses
function findFormCol(headers: string[], ...fragments: string[]): number {
  for (const frag of fragments) {
    const lower = frag.toLowerCase();
    const idx = headers.findIndex(h => h.toLowerCase().includes(lower));
    if (idx >= 0) return idx;
  }
  return -1;
}

// Extract job number from form job label (e.g. "26-040 Chateau Elan" → "26-040")
function extractJobNum(jobLabel: string): string {
  const match = jobLabel.match(/\b(\d{2}-\d{3})\b/);
  return match ? match[1] : '';
}

// Extract job name from form job label (e.g. "26-040 Chateau Elan" → "Chateau Elan")
function extractJobName(jobLabel: string): string {
  return jobLabel.replace(/^\d{2}-\d{3}\s*/, '').trim();
}

export function fetchLiveFieldReports() {
  return cached('liveFieldReports', 5 * 60 * 1000, async () => {
    try {
      const rows = await fetchFormResponseRows();
      if (rows.length < 2) return [];

      const headers = rows[0].map(h => h.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());

      // Find columns by header fragments
      const iTimestamp = findFormCol(headers, 'timestamp');
      const iDate = findFormCol(headers, 'date of activity', 'fecha de actividad');
      const iForeman = findFormCol(headers, 'foreman name', 'nombre del capataz');
      const iJob = findFormCol(headers, 'job name', 'nombre del trabajo');
      const iActivity = findFormCol(headers, 'activity type', 'tipo de actividad');
      const iCrew = findFormCol(headers, 'crew size', 'tamaño del equipo');
      const iGAB = findFormCol(headers, 'gab tons', 'toneladas gab');
      const iSoil = findFormCol(headers, 'soil tons', 'toneladas de suelo');
      const iBinder = findFormCol(headers, 'binder tons', 'toneladas de aglutinante');
      const iTopping = findFormCol(headers, 'topping tons', 'toneladas de capa superior');
      const iPatch = findFormCol(headers, 'patch tons', 'toneladas de parche');
      const iSummary = findFormCol(headers, 'job summary', 'resumen');
      const iWentWrong = findFormCol(headers, 'go wrong', 'algo salió mal');

      const g = (row: string[], idx: number): string => (idx >= 0 && idx < row.length) ? (row[idx]?.trim() || '') : '';

      const jobTotals: Record<string, any> = {};

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const jobLabel = g(row, iJob);
        if (!jobLabel) continue;

        const jobNum = extractJobNum(jobLabel);
        if (!jobNum) continue;

        const jobName = extractJobName(jobLabel);
        const timestamp = g(row, iTimestamp) || g(row, iDate);

        if (!jobTotals[jobNum]) {
          jobTotals[jobNum] = {
            Job_Number: jobNum, Job_Name: jobName,
            GAB_Tonnage: 0, Binder_Tonnage: 0, Topping_Tonnage: 0,
            Soil_Tonnage: 0, Patch_Tonnage: 0,
            Concrete_CY: 0, Concrete_Curb_LF: 0, Milling_SY: 0,
            Total_Man_Hours: 0, Crew_Count: 0, Truck_Count: 0,
            Last_Report_Date: timestamp, Latest_Summary: '',
            Job_Difficulty: '', Days_Active: 0,
            Foreman: '',
          };
        }

        const entry = jobTotals[jobNum];
        entry.GAB_Tonnage += safeNum(g(row, iGAB));
        entry.Soil_Tonnage += safeNum(g(row, iSoil));
        entry.Binder_Tonnage += safeNum(g(row, iBinder));
        entry.Topping_Tonnage += safeNum(g(row, iTopping));
        entry.Patch_Tonnage += safeNum(g(row, iPatch));

        const crewSize = safeNum(g(row, iCrew));
        entry.Crew_Count = Math.max(entry.Crew_Count, crewSize);

        const summary = g(row, iSummary);
        if (summary && summary.toLowerCase() !== 'no' && !entry.Latest_Summary) {
          entry.Latest_Summary = summary;
        }

        const foreman = g(row, iForeman);
        if (foreman && !entry.Foreman) entry.Foreman = foreman;

        // Update last report date to most recent
        if (timestamp && timestamp > entry.Last_Report_Date) {
          entry.Last_Report_Date = timestamp;
        }

        entry.Days_Active++;
      }

      return Object.values(jobTotals).map((r: any) => ({
        ...r,
        Base_Actual: r.GAB_Tonnage + r.Soil_Tonnage,
        Asphalt_Actual: r.Binder_Tonnage + r.Topping_Tonnage + r.Patch_Tonnage,
        Concrete_Actual: r.Concrete_CY,
      }));
    } catch { return []; }
  });
}

// ──────────────────────────── FIELD REPORT FEED (Individual Submissions) ────────────
// Returns individual Google Form submissions for a specific job, sorted chronologically
// Used by the Job Snapshot Production tab to show a daily report review feed

export async function fetchFieldReportFeed(jobNumber: string): Promise<any[]> {
  try {
    const rows = await fetchFormResponseRows();
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());

    const iTimestamp = findFormCol(headers, 'timestamp');
    const iDate = findFormCol(headers, 'date of activity', 'fecha de actividad');
    const iForeman = findFormCol(headers, 'foreman name', 'nombre del capataz');
    const iJob = findFormCol(headers, 'job name', 'nombre del trabajo');
    const iActivity = findFormCol(headers, 'activity type', 'tipo de actividad');
    const iCrew = findFormCol(headers, 'crew size', 'tamaño del equipo');
    const iGAB = findFormCol(headers, 'gab tons', 'toneladas gab');
    const iSoil = findFormCol(headers, 'soil tons', 'toneladas de suelo');
    const iBinder = findFormCol(headers, 'binder tons', 'toneladas de aglutinante');
    const iTopping = findFormCol(headers, 'topping tons', 'toneladas de capa superior');
    const iPatch = findFormCol(headers, 'patch tons', 'toneladas de parche');
    const iSummary = findFormCol(headers, 'job summary', 'resumen');
    const iWentWrong = findFormCol(headers, 'go wrong', 'algo salió mal');

    const g = (row: string[], idx: number): string => (idx >= 0 && idx < row.length) ? (row[idx]?.trim() || '') : '';

    const feed: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const jobLabel = g(row, iJob);
      const jobNum = extractJobNum(jobLabel);
      if (!jobNum || jobNum.trim() !== jobNumber.trim()) continue;

      feed.push({
        id: `gf-${i}`,
        date: g(row, iTimestamp) || g(row, iDate),
        foreman: g(row, iForeman),
        activity: g(row, iActivity),
        gabTons: safeNum(g(row, iGAB)),
        soilTons: safeNum(g(row, iSoil)),
        binderTons: safeNum(g(row, iBinder)),
        toppingTons: safeNum(g(row, iTopping)),
        patchTons: safeNum(g(row, iPatch)),
        concreteCY: 0,
        crewCount: safeNum(g(row, iCrew)),
        truckCount: 0,
        manHours: 0,
        summary: g(row, iSummary) || '',
        wentWrong: g(row, iWentWrong) || '',
        difficulty: '',
      });
    }

    // Sort newest first
    feed.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return feed;
  } catch { return []; }
}

// ──────────────────────────── ESTIMATING (Google Sheets) ────────────────────────────

const EST_SHEET_ID = '1uvHDu3GmBpJhXLNw_bm-rYqXGcQxO1tbBUBSvhsz2zw';
const BID_LOG_GID = '928358188';
const BACKLOG_GID = '1136500140';

export async function fetchEstimatingData() {
  try {
    const [bidLogRes, backlogRes] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${EST_SHEET_ID}/export?format=csv&gid=${BID_LOG_GID}`, { next: { revalidate: 60 } }),
      fetch(`https://docs.google.com/spreadsheets/d/${EST_SHEET_ID}/export?format=csv&gid=${BACKLOG_GID}`, { next: { revalidate: 60 } }),
    ]);
    const bidLogData = parseCSV(await bidLogRes.text());
    const backlogData = parseCSV(await backlogRes.text());
    const bids: any[] = [];
    const commitments: any[] = [];
    let bidHeaderIdx = 1;
    for (let i = 0; i < Math.min(10, bidLogData.length); i++) {
      if (bidLogData[i].includes('Win / Loss / Pending') || bidLogData[i].includes('Customer')) { bidHeaderIdx = i; break; }
    }
    for (let i = bidHeaderIdx + 1; i < bidLogData.length; i++) {
      const row = bidLogData[i];
      if (!row || row.length < 5) continue;
      const jobName = row[3]?.trim();
      if (!jobName) continue;
      bids.push({ jobNo: row[0]?.trim(), dateBid: row[1]?.trim(), customer: row[2]?.trim(), jobName, location: row[4]?.trim(), status: row[5]?.trim() || 'Pending', feedback: row[6]?.trim(), probability: row[7]?.trim(), proposal: parseFloatSafe(row[8]), awarded: parseFloatSafe(row[9]) });
    }
    for (let i = 2; i < backlogData.length; i++) {
      const row = backlogData[i];
      if (!row || row.length < 13) continue;
      const jobName = row[12]?.trim() || row[16]?.trim();
      if (!jobName || (jobName.toLowerCase().includes('high school') === false && jobName.length < 5)) continue;
      const contractAmount = parseFloatSafe(row[14]?.trim() || row[17]?.trim() || row[15]?.trim() || '0');
      if (!jobName && contractAmount === 0) continue;
      commitments.push({ jobNo: row[7]?.trim() || '', jobName, status: 'Active', state: '', contractAmount, billedToDate: 0, pctBilled: '0%', projectedStart: '' });
    }
    return { bids, commitments };
  } catch { return { bids: [], commitments: [] }; }
}

// ──────────────────────────── SCORECARD (QuickBooks via Google Sheets) ────────────────────────────

const QB_SHEET_ID = '1LYmHPUfoSW_UQq0mtQ7s9APvDJlymh_9trYRxc3lSss';
const PL_GID = '0';
const BS_GID = '1219933569';
const AR_GID = '811286112';
const CS_GID = '1255706057';

async function fetchTab(sheetId: string, gid: string): Promise<string[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!res.ok) return [];
    const text = await res.text();
    return text.split('\n').map(l => l.replace(/\r$/, ''));
  } catch { return []; }
}

function findRow(lines: string[], label: string): string[] {
  for (const line of lines) {
    if (line.toLowerCase().includes(label.toLowerCase())) {
      return parseCSVLine(line);
    }
  }
  return [];
}

function findRowValue(lines: string[], label: string, col = 1): number {
  const row = findRow(lines, label);
  return row.length > col ? parseMoney(row[col]) : 0;
}

export async function fetchScorecardData() {
  try {
    const [plLines, bsLines, arLines, csLines] = await Promise.all([
      fetchTab(QB_SHEET_ID, PL_GID), fetchTab(QB_SHEET_ID, BS_GID),
      fetchTab(QB_SHEET_ID, AR_GID), fetchTab(QB_SHEET_ID, CS_GID),
    ]);

    // ─── P&L Data ───
    const totalIncome = findRowValue(plLines, 'Total for Income');
    const constructionIncome = findRowValue(plLines, 'Total for 4000 Construction Income');
    const totalCOGS = findRowValue(plLines, 'Total for Cost of Goods Sold');
    const grossProfit = findRowValue(plLines, 'Gross Profit');
    const totalExpenses = findRowValue(plLines, 'Total for Expenses');
    const netIncome = findRowValue(plLines, 'Net Income');
    const directJobCost = findRowValue(plLines, 'Total for 5000 Direct Job Cost');

    // Income breakdown
    const incomeBreakdown: { category: string; amount: number }[] = [];
    for (const line of plLines) {
      const cols = parseCSVLine(line);
      const label = cols[0] || '';
      if (label.startsWith('4') && !label.startsWith('Total') && cols[1]) {
        const amt = parseMoney(cols[1]);
        if (amt !== 0) incomeBreakdown.push({ category: label, amount: amt });
      }
    }

    // ─── Balance Sheet Data ───
    const bankTotal = findRowValue(bsLines, 'Total for Bank Accounts');
    const arTotal = findRowValue(bsLines, 'Total for Accounts Receivable');
    const apTotal = findRowValue(bsLines, 'Total for Accounts Payable');
    const currentAssets = findRowValue(bsLines, 'Total for Current Assets');
    const currentLiabilities = findRowValue(bsLines, 'Total for Current Liabilities');
    const arApRatio = apTotal > 0 ? Math.round((arTotal / apTotal) * 100) / 100 : 0;

    // ─── AR Aging Data ───
    let arTotalRow: string[] = [];
    for (const line of arLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.trim() === 'TOTAL') { arTotalRow = cols; break; }
    }
    const arAging = {
      current: arTotalRow.length > 1 ? parseMoney(arTotalRow[1]) : 0,
      '1_30': arTotalRow.length > 2 ? parseMoney(arTotalRow[2]) : 0,
      '31_60': arTotalRow.length > 3 ? parseMoney(arTotalRow[3]) : 0,
      '61_90': arTotalRow.length > 4 ? parseMoney(arTotalRow[4]) : 0,
      over90: arTotalRow.length > 5 ? parseMoney(arTotalRow[5]) : 0,
      total: arTotalRow.length > 6 ? parseMoney(arTotalRow[6]) : 0,
    };

    // Top AR customers
    const arByCustomer: any[] = [];
    for (const line of arLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.startsWith('Total for ') && cols[6]) {
        arByCustomer.push({
          customer: cols[0].replace('Total for ', ''),
          current: parseMoney(cols[1]), d1_30: parseMoney(cols[2]),
          d31_60: parseMoney(cols[3]), d61_90: parseMoney(cols[4]),
          over90: parseMoney(cols[5]), total: parseMoney(cols[6]),
        });
      }
    }
    arByCustomer.sort((a: any, b: any) => b.total - a.total);

    // ─── Sales by Customer ───
    let csTotalRow: string[] = [];
    for (const line of csLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.trim() === 'TOTAL') { csTotalRow = cols; break; }
    }
    const totalSales = csTotalRow.length > 1 ? parseMoney(csTotalRow[1]) : 0;
    const salesByCustomer: any[] = [];
    for (const line of csLines) {
      const cols = parseCSVLine(line);
      if (cols[0]?.startsWith('Total for ') && cols[1]) {
        salesByCustomer.push({ customer: cols[0].replace('Total for ', ''), amount: parseMoney(cols[1]) });
      }
    }
    salesByCustomer.sort((a: any, b: any) => b.amount - a.amount);

    // ─── Computed Metrics ───
    const grossMarginPct = totalIncome > 0 ? Math.round((grossProfit / totalIncome) * 1000) / 10 : 0;
    const netMarginPct = totalIncome > 0 ? Math.round((netIncome / totalIncome) * 1000) / 10 : 0;
    const currentRatio = currentLiabilities > 0 ? Math.round((currentAssets / currentLiabilities) * 100) / 100 : 0;
    const reportPeriod = plLines[2]?.replace(/"/g, '').trim() || 'Unknown';

    // Return in the EXACT format the scorecard page expects (nested { current: value })
    return {
      reportPeriod,
      cashFlow: { current: bankTotal },
      accountsReceivable: { current: arTotal },
      accountsPayable: { current: apTotal },
      arApRatio: { current: arApRatio },
      currentRatio: { current: currentRatio },
      currentAssets: { current: currentAssets },
      currentLiabilities: { current: currentLiabilities },
      totalRevenueFY: { current: totalIncome },
      constructionIncome: { current: constructionIncome },
      totalSales: { current: totalSales },
      grossProfit: { current: grossProfit },
      grossMarginPct: { current: grossMarginPct },
      netIncome: { current: netIncome },
      netMarginPct: { current: netMarginPct },
      totalCOGS: { current: totalCOGS },
      directJobCost: { current: directJobCost },
      totalExpenses: { current: totalExpenses },
      arAging,
      arByCustomer: arByCustomer.slice(0, 15),
      salesByCustomer: salesByCustomer.slice(0, 15),
      numCustomers: salesByCustomer.length,
      incomeBreakdown,
    };
  } catch { return {}; }
}

// ──────────────────────────── SCHEDULE (Google Sheets) ────────────────────────────

const SCHEDULE_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
const SCHEDULE_GID = '416948597';
const GANTT_SHEET_ID = '178t9iioyveWqP6o8x2lQwMagexDP0W9FA4I2jfutJmw';
const GANTT_GID = '1949703319';

const CREW_COLUMNS: { name: string; col: number; pmCol?: number; type: string }[] = [
  { name: 'Rosendo / P1', col: 8, pmCol: 9, type: 'primary' },
  { name: 'Julio / B1', col: 21, pmCol: 22, type: 'primary' },
  { name: 'Martin / B2', col: 24, pmCol: 25, type: 'primary' },
  { name: 'Juan / B3', col: 26, pmCol: 28, type: 'primary' },
  { name: 'Cesar', col: 29, type: 'primary' },
  { name: 'Pedro', col: 30, type: 'primary' },
  { name: 'Jeff', col: 2, type: 'support' },
  { name: 'David', col: 5, type: 'support' },
  { name: 'Lowboy 1', col: 3, type: 'logistics' },
  { name: 'Lowboy 2', col: 4, type: 'logistics' },
  { name: 'Sergio', col: 11, type: 'support' },
  { name: 'Shawn', col: 13, type: 'support' },
  { name: 'Giovany (NC)', col: 15, pmCol: 16, type: 'primary' },
  { name: 'Marcos (NC)', col: 18, pmCol: 19, type: 'primary' },
  { name: 'Concrete Sub 1', col: 37, type: 'sub' },
  { name: 'Concrete Sub 2', col: 38, type: 'sub' },
  { name: 'Bud', col: 49, type: 'support' },
];
const DELIVERY_COL = 7;

const SUPPLIER_MAP: Record<string, string> = {
  'CWM': 'CW Matthews', 'APAC': 'APAC-Atlantic', 'VMC': 'Vulcan Materials',
  'MM': 'Martin Marietta', 'WG': 'Wiregrass', 'Reeves': 'Reeves Construction',
};

function parseScheduleDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

function decodeAssignment(text: string) {
  const lower = text.toLowerCase();
  const isOff = ['out of country', 'off', 'office', 'available', 'l-10', 'travel', 'meeting'].some(k => lower.includes(k));
  if (isOff) return { jobRef: text, activity: '', state: '', supplier: '', raw: text, isOff: true };
  const parts = text.split(' - ').map(p => p.trim());
  return { jobRef: parts[0] || text, activity: parts[1] || '', state: parts[2] || '', supplier: parts[3] || '', raw: text, isOff: false };
}

function parseDateStr(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function fetchScheduleData() {
  try {
    const [schedRes, ganttRes] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${SCHEDULE_SHEET_ID}/export?format=csv&gid=${SCHEDULE_GID}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 120 },
      }),
      fetch(`https://docs.google.com/spreadsheets/d/${GANTT_SHEET_ID}/export?format=csv&gid=${GANTT_GID}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 120 },
      }),
    ]);

    // Parse Gantt
    const ganttJobs: any[] = [];
    if (ganttRes.ok) {
      const ganttCSV = await ganttRes.text();
      const ganttLines = ganttCSV.split('\n').map(l => l.replace(/\r$/, ''));
      for (let i = 1; i < ganttLines.length; i++) {
        const cols = parseCSVLine(ganttLines[i]);
        const jobNum = cols[0]?.trim();
        if (!jobNum) continue;
        ganttJobs.push({
          Job_Number: jobNum, Job_Name: cols[1]?.trim() || '',
          Project_Type: cols[2]?.trim() || '', Start: cols[3]?.trim() || '', End: cols[4]?.trim() || '',
          startDate: parseDateStr(cols[3]?.trim() || ''), endDate: parseDateStr(cols[4]?.trim() || ''),
        });
      }
    }

    // Parse schedule
    if (!schedRes.ok) return { currentWeek: { days: [] }, nextWeek: { days: [] }, deliveries: [], activeGanttJobs: [], jobFirstOccurrences: [], scheduledJobCount: 0, ganttJobCount: ganttJobs.length };
    const csvText = await schedRes.text();
    const lines = csvText.split('\n').map(l => l.replace(/\r$/, ''));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dow = today.getDay();
    const monOffset = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today); thisMonday.setDate(today.getDate() + monOffset);
    const nextMonday = new Date(thisMonday); nextMonday.setDate(thisMonday.getDate() + 7);
    const endOfNextWeek = new Date(nextMonday); endOfNextWeek.setDate(nextMonday.getDate() + 7);

    // First pass: job occurrences
    const jobOccurrences = new Map<string, { firstDate: string; lastDate: string; jobRef: string; ganttJobNumber: string }>();
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const date = parseScheduleDate(cols[0]);
      if (!date) continue;
      const dateISO = date.toISOString().split('T')[0];
      for (const crew of CREW_COLUMNS) {
        const jobText = cols[crew.col] || '';
        if (!jobText) continue;
        const decoded = decodeAssignment(jobText);
        if (decoded.isOff) continue;
        const ref = decoded.jobRef.toLowerCase();
        const existing = jobOccurrences.get(ref);
        if (!existing || dateISO < existing.firstDate) {
          const ganttMatch = ganttJobs.find((g: any) => ref.split(' ')[0] && g.Job_Name.toLowerCase().includes(ref.split(' ')[0]));
          jobOccurrences.set(ref, { firstDate: dateISO, lastDate: dateISO, jobRef: decoded.jobRef, ganttJobNumber: ganttMatch?.Job_Number || '' });
        } else if (dateISO > existing.lastDate) { existing.lastDate = dateISO; }
      }
    }
    const jobFirstOccurrences = Array.from(jobOccurrences.values());

    // Second pass: current/next week
    const currentWeekDays: any[] = [];
    const nextWeekDays: any[] = [];
    const deliveries: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const dateStr = cols[0];
      const date = parseScheduleDate(dateStr);
      if (!date || date < thisMonday || date >= endOfNextWeek) continue;
      const isCurrentWeek = date < nextMonday;

      const assignments: any[] = [];
      for (const crew of CREW_COLUMNS) {
        const jobText = cols[crew.col] || '';
        const pm = crew.pmCol ? (cols[crew.pmCol] || '') : '';
        if (jobText) {
          const decoded = decodeAssignment(jobText);
          const supplierFull = SUPPLIER_MAP[decoded.supplier] || decoded.supplier;
          // Match against jobRef ONLY (not full cell text which includes vendor/activity)
          // Using full text caused false matches e.g. "paving" from "Scruggs Paving" matching
          // in "Chateau Elan - Paving - GA - Scruggs"
          const refLower = decoded.jobRef.toLowerCase();
          let ganttMatch = null;
          let bestLen = 0;
          for (const g of ganttJobs) {
            const gName = g.Job_Name.toLowerCase();
            // Check if any significant word from the gantt job name appears in the jobRef
            const gWords = gName.split(/\s+/).filter((w: string) => w.length > 3);
            for (const w of gWords) {
              if (refLower.includes(w) && w.length > bestLen) {
                bestLen = w.length;
                ganttMatch = g;
              }
            }
          }
          assignments.push({ crew: crew.name, crewType: crew.type, job: jobText, pm, decoded, supplierFull, ganttMatch: ganttMatch ? { jobNumber: ganttMatch.Job_Number, projectType: ganttMatch.Project_Type, start: ganttMatch.Start, end: ganttMatch.End } : null });
        }
      }

      const deliveryText = cols[DELIVERY_COL] || '';
      if (deliveryText) { deliveries.push({ date: date.toISOString().split('T')[0], dateDisplay: dateStr, dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }), description: deliveryText, isCurrentWeek }); }

      const dayData = { date: date.toISOString().split('T')[0], dateDisplay: dateStr, dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }), assignments, isToday: date.getTime() === today.getTime() };
      if (isCurrentWeek) currentWeekDays.push(dayData); else nextWeekDays.push(dayData);
    }

    const activeGanttJobs = ganttJobs.filter((g: any) => g.startDate && g.endDate && g.startDate <= endOfNextWeek && g.endDate >= today);
    const scheduledJobs = new Set<string>();
    [...currentWeekDays, ...nextWeekDays].forEach(d => d.assignments.forEach((a: any) => { if (!a.decoded.isOff) scheduledJobs.add(a.decoded.jobRef); }));

    return {
      currentWeek: { weekOf: thisMonday.toISOString().split('T')[0], label: `Week of ${thisMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, days: currentWeekDays },
      nextWeek: { weekOf: nextMonday.toISOString().split('T')[0], label: `Week of ${nextMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, days: nextWeekDays },
      deliveries, activeGanttJobs, jobFirstOccurrences,
      scheduledJobCount: scheduledJobs.size, ganttJobCount: ganttJobs.length,
      timestamp: new Date().toISOString(),
    };
  } catch { return { currentWeek: { days: [] }, nextWeek: { days: [] }, deliveries: [], activeGanttJobs: [], jobFirstOccurrences: [], scheduledJobCount: 0, ganttJobCount: 0 }; }
}
