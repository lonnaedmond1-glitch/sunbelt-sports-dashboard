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
  return cached('level10Meeting', 24 * 60 * 60 * 1000, async () => {
    try {
      const L10_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
      const MEETING_GID = '683987594'; // Specifically the Level 10 meeting tabs sheet
      const url = `https://docs.google.com/spreadsheets/d/${L10_SHEET_ID}/export?format=csv&gid=${MEETING_GID}`;
      const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } });
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
  return cached('liveJobs', 24 * 60 * 60 * 1000, async () => {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${JOB_LIST_SHEET_ID}/export?format=csv&gid=${JOB_LIST_GID}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } });
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

    let iJobNum = col('job number');
    if (iJobNum < 0) iJobNum = col('job #');
    if (iJobNum < 0) iJobNum = 0; // Fallback: job numbers are always in column 0
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
  return cached('fleetAssets', 24 * 60 * 60 * 1000, async () => {
    try {
      const [assetsRes, vehiclesRes] = await Promise.all([
        fetch(`https://docs.google.com/spreadsheets/d/${FLEET_SHEET_ID}/export?format=csv&gid=${FLEET_ASSETS_GID}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 },
        }),
        fetch(`https://docs.google.com/spreadsheets/d/${FLEET_SHEET_ID}/export?format=csv&gid=${FLEET_VEHICLES_GID}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 },
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
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    return parseCSV(text);
  } catch { return []; }
}

export function fetchLiveRentals() {
  return cached('liveRentals', 24 * 60 * 60 * 1000, async () => {
    try {
      const RENTAL_SHEET_ID = '1eIwv3pK0BBH3n4Uds6YZu4GWdMrlS3SAEFzsU3OKS5I';
      const [sunbeltRows, unitedRows] = await Promise.all([
        fetchSheetByName(RENTAL_SHEET_ID, 'Sunbelt Rentals Live'),
        fetchSheetByName(RENTAL_SHEET_ID, 'United Rentals Live'),
      ]);

      const rentals: any[] = [];

      // Parse Sunbelt tab (standardized columns from our Apps Script):
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

      // ── CSV FALLBACK: if Google Sheet returned nothing, read local CSVs ──
      if (rentals.length === 0) {
        const fs = require('fs');
        const path = require('path');
        const dataDir = path.join(process.cwd(), 'data');

        // Equipment_On_Rent_Latest.csv — Sunbelt Rentals detailed export
        // Cols: OrderedBy,EquipmentModel,EquipmentClass,JobCity,JobState,JobName,TimeOut,Quantity,PurchaseOrderNumber,PickupDate,ContractNumber,TotalAmountBilled,MonthlyRate,WeeklyRate,DailyRate,DateOut,Days on Rent,AccruedAmount
        try {
          const latestPath = path.join(dataDir, 'Equipment_On_Rent_Latest.csv');
          if (fs.existsSync(latestPath)) {
            const text = fs.readFileSync(latestPath, 'utf-8');
            const rows = parseCSV(text);
            if (rows.length > 1) {
              const hdr = rows[0].map((h: string) => h.trim().toLowerCase().replace(/\s+/g, '_'));
              const col = (name: string) => hdr.findIndex((h: string) => h.includes(name));
              for (let i = 1; i < rows.length; i++) {
                const r = rows[i];
                if (!r || r.length < 5) continue;
                const g = (idx: number) => (idx >= 0 && idx < r.length) ? (r[idx] || '').trim() : '';
                const equipModel = g(col('equipmentmodel')) || g(col('model'));
                const equipClass = g(col('equipmentclass')) || g(col('class'));
                if (!equipModel && !equipClass) continue;
                rentals.push({
                  vendor: 'Sunbelt Rentals',
                  contractNumber: g(col('contractnumber')) || g(col('contract')),
                  jobName: g(col('jobname')) || g(col('job_name')),
                  jobLocation: `${g(col('jobcity'))}, ${g(col('jobstate'))}`.replace(/^, |, $/g, ''),
                  jobCity: g(col('jobcity')),
                  equipmentType: equipModel || equipClass,
                  className: equipClass,
                  dayRate: parseMoney(g(col('dailyrate')) || g(col('daily'))),
                  weekRate: parseMoney(g(col('weeklyrate')) || g(col('weekly'))),
                  fourWeekRate: parseMoney(g(col('monthlyrate')) || g(col('monthly'))),
                  dateRented: g(col('dateout')) || g(col('date_out')),
                  daysOnRent: parseInt(g(col('days_on_rent')) || g(col('days'))) || 0,
                  pickupDate: g(col('pickupdate')) || g(col('pickup')),
                  emailDate: '',
                });
              }
            }
          }
        } catch (e) { console.error('Rental CSV fallback error:', e); }

        // Equipment_On_Rent.csv — simple fallback (both vendors)
        // Cols: Job_Number,Equipment_Type,Vendor,Days_On_Site,Target_Off_Rent,Daily_Rate
        if (rentals.length === 0) {
          try {
            const simplePath = path.join(dataDir, 'Equipment_On_Rent.csv');
            if (fs.existsSync(simplePath)) {
              const text = fs.readFileSync(simplePath, 'utf-8');
              const rows = parseCSV(text);
              if (rows.length > 1) {
                for (let i = 1; i < rows.length; i++) {
                  const r = rows[i];
                  if (!r || r.length < 3) continue;
                  const equipType = (r[1] || '').trim();
                  if (!equipType) continue;
                  const vendor = (r[2] || '').trim() || 'Sunbelt Rentals';
                  rentals.push({
                    vendor,
                    contractNumber: '',
                    jobName: '',
                    jobLocation: '',
                    jobCity: '',
                    equipmentType: equipType,
                    className: '',
                    dayRate: parseMoney(r[5] || ''),
                    weekRate: 0,
                    fourWeekRate: 0,
                    dateRented: '',
                    daysOnRent: parseInt(r[3] || '') || 0,
                    pickupDate: (r[4] || '').trim(),
                    emailDate: '',
                  });
                }
              }
            }
          } catch (e) { console.error('Simple rental CSV fallback error:', e); }
        }
      }

      return rentals;
    } catch {
      return [];
    }
  });
}

// ──────────────────────────── VISIONLINK ASSETS (Live Sheet) ────────────────────────────
// Backed by Apps Scripts visionlink_aemp_sync.gs (CAT Digital API) and
// visionlink_email_bridge.gs (CAT scheduled email fallback). Both write to the
// `VisionLink_Live` tab of the Scorecard Hub sheet with this canonical schema:
//   synced_at | asset_id | asset_name | make | model | serial | hours |
//   last_reported | latitude | longitude | location_source | visionlink_geofence |
//   matched_job_id | matched_job_name | state | status | notes
//
// Dashboard reads the sheet (no API credentials needed in Vercel, no static CSV).

export interface VisionLinkAsset {
  Asset_ID: string;
  Asset_Name: string;
  Make: string;
  Model: string;
  Serial: string;
  Hours: number;
  Last_Reported: string;
  Latitude: number | null;
  Longitude: number | null;
  Location_Source: string;
  Geofence: string;
  Matched_Job_Id: string;
  Matched_Job_Name: string;
  State: string;
  Status: string;
  Notes: string;
  Synced_At: string;
}

export async function fetchVisionLinkAssets(): Promise<VisionLinkAsset[]> {
  try {
    // Try sheet first; fall back to local CSV (data/VisionLink_Live.csv)
    let rows: string[][] = [];
    try { rows = await fetchScorecardTabCsv('VisionLink_Live'); } catch {}
    // Validate: sheet tab might contain wrong data (e.g. scorecard rows instead of assets).
    // Real VisionLink_Live has 'asset_id' in header; if missing, discard and use local CSV.
    const sheetHdr = (rows[0] || []).map(c => c.trim().toLowerCase());
    if (!sheetHdr.includes('asset_id') && !sheetHdr.includes('asset_name')) {
      rows = []; // wrong data in sheet tab
    }
    if (rows.length < 2) {
      const fs = await import('fs');
      const pathMod = await import('path');
      const csvPath = pathMod.join(process.cwd(), 'data', 'VisionLink_Live.csv');
      if (fs.existsSync(csvPath)) {
        const text = fs.readFileSync(csvPath, 'utf-8');
        rows = text.split(/\r\n|\n|\r/).filter(l => l.trim()).map(l => parseCSVLine(l));
      }
    }
    if (rows.length < 2) return [];
    if (rows.length < 2) return [];
    const hdr = rows[0].map(c => c.trim().toLowerCase());
    const idx = (name: string) => hdr.indexOf(name);
    const iSync = idx('synced_at');
    const iId = idx('asset_id');
    const iName = idx('asset_name');
    const iMake = idx('make');
    const iModel = idx('model');
    const iSerial = idx('serial');
    const iHours = idx('hours');
    const iReported = idx('last_reported');
    const iLat = idx('latitude');
    const iLng = idx('longitude');
    const iLocSrc = idx('location_source');
    const iGeo = idx('visionlink_geofence');
    const iJobId = idx('matched_job_id');
    const iJobName = idx('matched_job_name');
    const iState = idx('state');
    const iStatus = idx('status');
    const iNotes = idx('notes');
    return rows.slice(1).map(r => {
      const lat = parseFloat((r[iLat] || '').trim());
      const lng = parseFloat((r[iLng] || '').trim());
      return {
        Asset_ID: (r[iId] || '').trim(),
        Asset_Name: (r[iName] || '').trim(),
        Make: (r[iMake] || '').trim(),
        Model: (r[iModel] || '').trim(),
        Serial: (r[iSerial] || '').trim(),
        Hours: parseFloat((r[iHours] || '0').trim()) || 0,
        Last_Reported: (r[iReported] || '').trim(),
        Latitude: isNaN(lat) ? null : lat,
        Longitude: isNaN(lng) ? null : lng,
        Location_Source: (r[iLocSrc] || '').trim(),
        Geofence: (r[iGeo] || '').trim(),
        Matched_Job_Id: (r[iJobId] || '').trim(),
        Matched_Job_Name: (r[iJobName] || '').trim(),
        State: (r[iState] || '').trim(),
        Status: (r[iStatus] || '').trim(),
        Notes: (r[iNotes] || '').trim(),
        Synced_At: (r[iSync] || '').trim(),
      };
    }).filter(a => a.Asset_ID || a.Serial);
  } catch { return []; }
}

// ──────────────────────────── FIELD REPORTS (Jotform Legacy + Google Forms New) ────────────
// DUAL SOURCE: Historical Jotform data is preserved. New Google Form submissions layer on top.
// Both sources are fetched in parallel and merged by job number.
// For overlapping jobs, totals are combined (tonnage, days active, etc.)

// ── Jotform (Legacy/Historical) ──────────────────────────────────────────────
const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY || 'c02f5c097f06c28304f3a766d48f51e6';
const FORM_ID = process.env.JOTFORM_FORM_ID || '240915802348154';

interface JotformSubmission {
  id: string; created_at: string;
  answers: Record<string, { name: string; text: string; answer: string | Record<string, string> }>;
}

function getAnswer(submission: JotformSubmission, questionName: string): string {
  const entry = Object.values(submission.answers).find(a => a.name === questionName);
  if (!entry) return '';
  if (typeof entry.answer === 'object') return Object.values(entry.answer).join(', ');
  return String(entry.answer || '');
}

function safeNum(val: string): number { const n = parseFloat(val?.replace(/[^0-9.-]/g, '') || '0'); return isNaN(n) ? 0 : n; }

async function fetchJotformReports(): Promise<Record<string, any>> {
  try {
    const url = `https://api.jotform.com/form/${FORM_ID}/submissions?apiKey=${JOTFORM_API_KEY}&limit=200&orderby=created_at,DESC`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return {};
    const json = await res.json();
    const submissions: JotformSubmission[] = json.content || [];
    const jobTotals: Record<string, any> = {};
    for (const sub of submissions) {
      const jobWidget = getAnswer(sub, 'typeA56');
      let jobNum = '', jobName = '';
      if (jobWidget && jobWidget !== 'Job Name Not Listed') { const parts = jobWidget.split('\t'); jobNum = parts[0]?.trim() || ''; jobName = parts.slice(1).join(' ').trim(); }
      if (!jobNum) jobNum = getAnswer(sub, 'jobNumber').trim();
      if (!jobNum) { const subName = getAnswer(sub, 'sjhb').trim(); if (subName && subName !== 'Job Name Not Listed') { const parts = subName.split('\t'); jobNum = parts[0]?.trim() || ''; jobName = parts.slice(1).join(' ').trim(); } }
      if (!jobNum || jobNum === 'Job Name Not Listed') continue;
      jobNum = jobNum.trim();
      if (!jobTotals[jobNum]) { jobTotals[jobNum] = { Job_Number: jobNum, Job_Name: jobName, GAB_Tonnage: 0, Binder_Tonnage: 0, Topping_Tonnage: 0, Concrete_CY: 0, Concrete_Curb_LF: 0, Milling_SY: 0, Total_Man_Hours: 0, Crew_Count: 0, Truck_Count: 0, Last_Report_Date: sub.created_at, Latest_Summary: '', Job_Difficulty: '', Days_Active: 0 }; }
      const entry = jobTotals[jobNum];
      entry.GAB_Tonnage += safeNum(getAnswer(sub, 'gabTonnage'));
      entry.Binder_Tonnage += safeNum(getAnswer(sub, 'tonnage27'));
      entry.Topping_Tonnage += safeNum(getAnswer(sub, 'tonnage28'));
      entry.Concrete_CY += safeNum(getAnswer(sub, 'concreteCy'));
      entry.Total_Man_Hours += safeNum(getAnswer(sub, 'totalMan'));
      entry.Truck_Count = Math.max(entry.Truck_Count, safeNum(getAnswer(sub, 'howMany')));
      entry.Crew_Count = Math.max(entry.Crew_Count, safeNum(getAnswer(sub, 'numberOf')));
      const summary = getAnswer(sub, 'jobSummary');
      if (summary && summary !== 'no' && !entry.Latest_Summary) entry.Latest_Summary = summary;
      const diff = getAnswer(sub, 'howDifficult');
      if (diff && !entry.Job_Difficulty) entry.Job_Difficulty = diff;
      entry.Days_Active++;
    }
    return jobTotals;
  } catch { return {}; }
}

async function fetchJotformFeed(jobNumber: string): Promise<any[]> {
  try {
    const url = `https://api.jotform.com/form/${FORM_ID}/submissions?apiKey=${JOTFORM_API_KEY}&limit=200&orderby=created_at,DESC`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const json = await res.json();
    const submissions: JotformSubmission[] = json.content || [];
    const feed: any[] = [];
    for (const sub of submissions) {
      const jobWidget = getAnswer(sub, 'typeA56');
      let jobNum = '';
      if (jobWidget && jobWidget !== 'Job Name Not Listed') { jobNum = jobWidget.split('\t')[0]?.trim() || ''; }
      if (!jobNum) jobNum = getAnswer(sub, 'jobNumber').trim();
      if (!jobNum) { const subName = getAnswer(sub, 'sjhb').trim(); if (subName && subName !== 'Job Name Not Listed') { jobNum = subName.split('\t')[0]?.trim() || ''; } }
      if (!jobNum || jobNum.trim() !== jobNumber.trim()) continue;
      feed.push({
        id: sub.id, date: sub.created_at, source: 'jotform',
        gabTons: safeNum(getAnswer(sub, 'gabTonnage')),
        binderTons: safeNum(getAnswer(sub, 'tonnage27')),
        toppingTons: safeNum(getAnswer(sub, 'tonnage28')),
        concreteCY: safeNum(getAnswer(sub, 'concreteCy')),
        crewCount: safeNum(getAnswer(sub, 'numberOf')),
        truckCount: safeNum(getAnswer(sub, 'howMany')),
        manHours: safeNum(getAnswer(sub, 'totalMan')),
        summary: getAnswer(sub, 'jobSummary') || '',
        difficulty: getAnswer(sub, 'howDifficult') || '',
      });
    }
    return feed;
  } catch { return []; }
}

// ── Google Forms (New — Form Responses 1 sheet) ──────────────────────────────
const FIELD_REPORT_SHEET_ID = '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY';
const FIELD_REPORT_TAB = 'Form Responses 1';

async function fetchFormResponseRows(): Promise<string[][]> {
  try {
    const gvizUrl = `https://docs.google.com/spreadsheets/d/${FIELD_REPORT_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(FIELD_REPORT_TAB)}`;
    const res = await fetch(gvizUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } });
    if (res.ok) {
      const text = await res.text();
      if (text && !text.includes('<!DOCTYPE')) return parseCSV(text);
    }
    const exportUrl = `https://docs.google.com/spreadsheets/d/${FIELD_REPORT_SHEET_ID}/export?format=csv&gid=0`;
    const res2 = await fetch(exportUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } });
    if (res2.ok) {
      const text2 = await res2.text();
      if (text2 && !text2.includes('<!DOCTYPE')) return parseCSV(text2);
    }
    return [];
  } catch { return []; }
}

function findFormCol(headers: string[], ...fragments: string[]): number {
  for (const frag of fragments) {
    const lower = frag.toLowerCase();
    const idx = headers.findIndex(h => h.toLowerCase().includes(lower));
    if (idx >= 0) return idx;
  }
  return -1;
}

function extractJobNum(jobLabel: string): string {
  const match = jobLabel.match(/\b(\d{2}-\d{3})\b/);
  return match ? match[1] : '';
}

function extractJobName(jobLabel: string): string {
  return jobLabel.replace(/^\d{2}-\d{3}\s*/, '').trim();
}

async function fetchGoogleFormsReports(): Promise<Record<string, any>> {
  try {
    const rows = await fetchFormResponseRows();
    if (rows.length < 2) return {};
    const headers = rows[0].map(h => h.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
    const iTimestamp = findFormCol(headers, 'timestamp');
    const iDate = findFormCol(headers, 'date of activity', 'fecha de actividad');
    const iForeman = findFormCol(headers, 'foreman name', 'nombre del capataz');
    const iJob = findFormCol(headers, 'job name', 'nombre del trabajo');
    const iCrew = findFormCol(headers, 'crew size', 'tamaño del equipo');
    const iGAB = findFormCol(headers, 'gab tons', 'toneladas gab');
    const iSoil = findFormCol(headers, 'soil tons', 'toneladas de suelo');
    const iBinder = findFormCol(headers, 'binder tons', 'toneladas de aglutinante');
    const iTopping = findFormCol(headers, 'topping tons', 'toneladas de capa superior');
    const iPatch = findFormCol(headers, 'patch tons', 'toneladas de parche');
    const iSummary = findFormCol(headers, 'job summary', 'resumen');
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
        jobTotals[jobNum] = { Job_Number: jobNum, Job_Name: jobName, GAB_Tonnage: 0, Binder_Tonnage: 0, Topping_Tonnage: 0, Soil_Tonnage: 0, Patch_Tonnage: 0, Concrete_CY: 0, Total_Man_Hours: 0, Crew_Count: 0, Truck_Count: 0, Last_Report_Date: timestamp, Latest_Summary: '', Job_Difficulty: '', Days_Active: 0, Foreman: '' };
      }
      const entry = jobTotals[jobNum];
      entry.GAB_Tonnage += safeNum(g(row, iGAB));
      entry.Soil_Tonnage += safeNum(g(row, iSoil));
      entry.Binder_Tonnage += safeNum(g(row, iBinder));
      entry.Topping_Tonnage += safeNum(g(row, iTopping));
      entry.Patch_Tonnage += safeNum(g(row, iPatch));
      entry.Crew_Count = Math.max(entry.Crew_Count, safeNum(g(row, iCrew)));
      const summary = g(row, iSummary);
      if (summary && summary.toLowerCase() !== 'no' && !entry.Latest_Summary) entry.Latest_Summary = summary;
      const foreman = g(row, iForeman);
      if (foreman && !entry.Foreman) entry.Foreman = foreman;
      if (timestamp && timestamp > entry.Last_Report_Date) entry.Last_Report_Date = timestamp;
      entry.Days_Active++;
    }
    return jobTotals;
  } catch { return {}; }
}

async function fetchGoogleFormsFeed(jobNumber: string): Promise<any[]> {
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
    const g = (row: string[], idx: number): string => (idx >= 0 && idx < row.length) ? (row[idx]?.trim() || '') : '';
    const feed: any[] = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const jobLabel = g(row, iJob);
      const jobNum = extractJobNum(jobLabel);
      if (!jobNum || jobNum.trim() !== jobNumber.trim()) continue;
      feed.push({
        id: `gf-${i}`, date: g(row, iTimestamp) || g(row, iDate), source: 'google-forms',
        foreman: g(row, iForeman), activity: g(row, iActivity),
        gabTons: safeNum(g(row, iGAB)), soilTons: safeNum(g(row, iSoil)),
        binderTons: safeNum(g(row, iBinder)), toppingTons: safeNum(g(row, iTopping)),
        patchTons: safeNum(g(row, iPatch)), concreteCY: 0,
        crewCount: safeNum(g(row, iCrew)), truckCount: 0, manHours: 0,
        summary: g(row, iSummary) || '', difficulty: '',
      });
    }
    return feed;
  } catch { return []; }
}

// ── MERGED: Jotform + Google Forms combined ──────────────────────────────────
// Fetches both sources in parallel, merges per-job totals by adding tonnage together

function mergeJobTotals(jotform: Record<string, any>, gforms: Record<string, any>): any[] {
  const merged: Record<string, any> = {};
  // Start with all Jotform data
  for (const [jobNum, jf] of Object.entries(jotform)) {
    merged[jobNum] = { ...jf };
  }
  // Layer Google Forms data on top (additive for tonnage, max for crew)
  for (const [jobNum, gf] of Object.entries(gforms)) {
    if (!merged[jobNum]) {
      merged[jobNum] = { ...gf };
    } else {
      const m = merged[jobNum];
      m.GAB_Tonnage += (gf.GAB_Tonnage || 0);
      m.Binder_Tonnage += (gf.Binder_Tonnage || 0);
      m.Topping_Tonnage += (gf.Topping_Tonnage || 0);
      m.Concrete_CY += (gf.Concrete_CY || 0);
      m.Total_Man_Hours += (gf.Total_Man_Hours || 0);
      m.Crew_Count = Math.max(m.Crew_Count || 0, gf.Crew_Count || 0);
      m.Truck_Count = Math.max(m.Truck_Count || 0, gf.Truck_Count || 0);
      m.Days_Active += (gf.Days_Active || 0);
      // Use Google Forms summary if Jotform didn't have one
      if (gf.Latest_Summary && !m.Latest_Summary) m.Latest_Summary = gf.Latest_Summary;
      // Use most recent report date
      if (gf.Last_Report_Date && gf.Last_Report_Date > (m.Last_Report_Date || '')) {
        m.Last_Report_Date = gf.Last_Report_Date;
      }
      if (gf.Job_Name && !m.Job_Name) m.Job_Name = gf.Job_Name;
    }
  }
  return Object.values(merged).map((r: any) => ({
    ...r,
    Base_Actual: (r.GAB_Tonnage || 0) + (r.Soil_Tonnage || 0),
    Asphalt_Actual: (r.Binder_Tonnage || 0) + (r.Topping_Tonnage || 0) + (r.Patch_Tonnage || 0),
    Concrete_Actual: r.Concrete_CY || 0,
  }));
}

export function fetchLiveFieldReports() {
  return cached('liveFieldReports', 24 * 60 * 60 * 1000, async () => {
    // Fetch BOTH sources in parallel — historical Jotform + new Google Forms
    const [jotformData, gformsData] = await Promise.all([
      fetchJotformReports(),
      fetchGoogleFormsReports(),
    ]);
    return mergeJobTotals(jotformData, gformsData);
  });
}

// ──────────────────────────── FIELD REPORT FEED (Individual Submissions) ────────────
// Returns individual submissions from BOTH Jotform and Google Forms for a specific job
// Merged and sorted newest first

export async function fetchFieldReportFeed(jobNumber: string): Promise<any[]> {
  const [jotformFeed, gformsFeed] = await Promise.all([
    fetchJotformFeed(jobNumber),
    fetchGoogleFormsFeed(jobNumber),
  ]);
  const combined = [...jotformFeed, ...gformsFeed];
  combined.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  return combined;
}

// ──────────────────────────── ESTIMATING (Google Sheets) ────────────────────────────

const EST_SHEET_ID = '1uvHDu3GmBpJhXLNw_bm-rYqXGcQxO1tbBUBSvhsz2zw';
const BID_LOG_GID = '928358188';
const BACKLOG_GID = '1136500140';

export async function fetchEstimatingData() {
  try {
    const [bidLogRes, backlogRes] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${EST_SHEET_ID}/export?format=csv&gid=${BID_LOG_GID}`, { next: { revalidate: 86400 } }),
      fetch(`https://docs.google.com/spreadsheets/d/${EST_SHEET_ID}/export?format=csv&gid=${BACKLOG_GID}`, { next: { revalidate: 86400 } }),
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
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 } });
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

// Schedule column layout — verified live against Schedule tab header row.
// Header row 0:
//   0 Job Name | 1 Scope | 2 Location | 3 Vendor | 4 Field Display
//   5 David - Lowboy | 6 Loose Ends | 7 Deliveries
//   8 Rosendo / P1 | 9 PM | 10 Trucks
//   11 Sergio Sifuentes | 12 Trucks Needed
//   13 Shawn | 14 Trucks Needed
//   15 Giovany (NC) | 16 PM | 17 Trucks/Equipment
//   18 Marcos (NC) | 19 PM | 20 Trucks Needed
//   21 Julio / B1 | 22 PM | 23 Trucks Needed
//   24 Martin / B2 | 25 PM
//   26 Juan / B3 | 27 Jason | 28 PM
//   29 Cesar - Misc | 30 Pedro
//   38-43 Concrete Subs | 49 Jeff | 51 Bud
const CREW_COLUMNS: { name: string; col: number; pmCol?: number; type: string }[] = [
  { name: 'Rosendo / P1', col: 8, pmCol: 9, type: 'primary' },
  { name: 'Julio / B1', col: 21, pmCol: 22, type: 'primary' },
  { name: 'Martin / B2', col: 24, pmCol: 25, type: 'primary' },
  { name: 'Juan / B3', col: 26, pmCol: 28, type: 'primary' },
  { name: 'Cesar', col: 29, type: 'primary' },
  { name: 'Pedro', col: 30, type: 'primary' },
  { name: 'Sergio', col: 11, type: 'support' },
  { name: 'Shawn', col: 13, type: 'support' },
  { name: 'Giovany (NC)', col: 15, pmCol: 16, type: 'primary' },
  { name: 'Marcos (NC)', col: 18, pmCol: 19, type: 'primary' },
  { name: 'David - Lowboy', col: 5, type: 'logistics' },
  { name: 'Jeff', col: 49, type: 'support' },
  { name: 'Bud', col: 51, type: 'support' },
  { name: 'Concrete Sub 1', col: 38, type: 'sub' },
  { name: 'Concrete Sub 2', col: 39, type: 'sub' },
];
const DELIVERY_COL = 7;
const LOOSE_ENDS_COLS = [6, 35];

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
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 },
      }),
      fetch(`https://docs.google.com/spreadsheets/d/${GANTT_SHEET_ID}/export?format=csv&gid=${GANTT_GID}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 86400 },
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
    const looseEndsRaw: { date: string; text: string }[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const dateStr = cols[0];
      const date = parseScheduleDate(dateStr);
      if (!date || date < thisMonday || date >= endOfNextWeek) continue;
      const isCurrentWeek = date < nextMonday;

      // Collect loose ends from cols 6 + 35
      for (const lec of LOOSE_ENDS_COLS) {
        const txt = (cols[lec] || '').trim();
        if (txt && txt !== '-' && txt !== '\u2014') {
          looseEndsRaw.push({ date: date.toISOString().split('T')[0], text: txt });
        }
      }

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

    // Dedup loose ends
    const seenLE = new Set<string>();
    const looseEnds = looseEndsRaw.filter(le => {
      const k = le.text.toLowerCase();
      if (seenLE.has(k)) return false;
      seenLE.add(k);
      return true;
    });

    return {
      currentWeek: { weekOf: thisMonday.toISOString().split('T')[0], label: `Week of ${thisMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, days: currentWeekDays },
      nextWeek: { weekOf: nextMonday.toISOString().split('T')[0], label: `Week of ${nextMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, days: nextWeekDays },
      deliveries, activeGanttJobs, jobFirstOccurrences, looseEnds,
      scheduledJobCount: scheduledJobs.size, ganttJobCount: ganttJobs.length,
      timestamp: new Date().toISOString(),
    };
  } catch { return { currentWeek: { days: [] }, nextWeek: { days: [] }, deliveries: [], activeGanttJobs: [], jobFirstOccurrences: [], looseEnds: [], scheduledJobCount: 0, ganttJobCount: 0 }; }
}
// ──────────────────────────── PROJECT SCORECARDS (Google Sheets Hub) ────────────────────────────
const SCORECARD_HUB_SHEET_ID = '1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY';

export async function fetchProjectScorecards(): Promise<Record<string, string>[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SCORECARD_HUB_SHEET_ID}/export?format=csv&gid=0`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = text.split(/\r\n|\n|\r/).filter(function(l) { return l.trim(); });
    if (rows.length < 2) return [];
    const headers = parseCSVLine(rows[0]);
    return rows.slice(1).map(function(line) {
      const cols = parseCSVLine(line);
      const row: Record<string, string> = {};
      headers.forEach(function(h: string, i: number) { row[h] = cols[i] !== undefined ? cols[i] : ''; });
      return row;
    });
  } catch {
    return [];
  }
}


// ──────────────────────────── QBO FINANCIALS (Google Sheets Hub) ────────────────────────────
// Populated by scripts/gmail-qbo-sync.gs which auto-pulls daily QBO email reports.
// Tabs: "QBO Est vs Actuals" (job-level profit/margin) and "QBO AR Aging" (receivables).

export interface QboJobFinancials {
  Job_Number: string;
  Project_Name: string;
  Est_Cost: number;
  Act_Cost: number;
  Est_Income: number;
  Act_Income: number;
  Profit: number;
  Profit_Margin: number;
  Updated_At: string;
}

export interface QboArJob {
  Job_Number: string;
  Project_Name: string;
  Customer: string;
  Current: number;
  Days_1_30: number;
  Days_31_60: number;
  Days_61_90: number;
  Days_91_Plus: number;
  Total: number;
  Updated_At: string;
}

export interface QboArSummary {
  rows: QboArJob[];
  totals: { current: number; d1_30: number; d31_60: number; d61_90: number; d91Plus: number; total: number };
}

async function fetchScorecardTabCsv(tabName: string): Promise<string[][]> {
  const url = `https://docs.google.com/spreadsheets/d/${SCORECARD_HUB_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tabName)}`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  return text
    .split(/\r\n|\n|\r/)
    .filter(l => l.trim())
    .map(l => parseCSVLine(l));
}

function n(v: string | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[$,\s"]/g, '').replace(/%$/, '');
  const x = parseFloat(s);
  return isNaN(x) ? 0 : x;
}

export async function fetchQboFinancials(): Promise<QboJobFinancials[]> {
  try {
    const rows = await fetchScorecardTabCsv('QBO Est vs Actuals');
    if (rows.length < 2) return [];
    const hdr = rows[0].map(c => c.trim());
    const idx = (name: string) => hdr.indexOf(name);
    const iJob   = idx('Job_Number');
    const iName  = idx('Project_Name');
    const iEstC  = idx('Est_Cost');
    const iActC  = idx('Act_Cost');
    const iEstI  = idx('Est_Income');
    const iActI  = idx('Act_Income');
    const iProf  = idx('Profit');
    const iMarg  = idx('Profit_Margin');
    const iUpd   = idx('Updated_At');
    return rows.slice(1).map(r => ({
      Job_Number: (r[iJob] || '').trim(),
      Project_Name: (r[iName] || '').trim(),
      Est_Cost: n(r[iEstC]),
      Act_Cost: n(r[iActC]),
      Est_Income: n(r[iEstI]),
      Act_Income: n(r[iActI]),
      Profit: n(r[iProf]),
      Profit_Margin: n(r[iMarg]),
      Updated_At: (r[iUpd] || '').trim(),
    })).filter(r => r.Job_Number || r.Project_Name);
  } catch {
    return [];
  }
}

export async function fetchArAging(): Promise<QboArSummary> {
  const empty: QboArSummary = { rows: [], totals: { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91Plus: 0, total: 0 } };
  try {
    const rows = await fetchScorecardTabCsv('QBO AR Aging');
    if (rows.length < 2) return empty;
    const hdr = rows[0].map(c => c.trim());
    const idx = (name: string) => hdr.indexOf(name);
    const iJob    = idx('Job_Number');
    const iName   = idx('Project_Name');
    const iCust   = idx('Customer');
    const iCurr   = idx('Current');
    const iD1     = idx('Days_1_30');
    const iD31    = idx('Days_31_60');
    const iD61    = idx('Days_61_90');
    const iD91    = idx('Days_91_Plus');
    const iTot    = idx('Total');
    const iUpd    = idx('Updated_At');

    const parsed: QboArJob[] = rows.slice(1).map(r => ({
      Job_Number: (r[iJob] || '').trim(),
      Project_Name: (r[iName] || '').trim(),
      Customer: (r[iCust] || '').trim(),
      Current: n(r[iCurr]),
      Days_1_30: n(r[iD1]),
      Days_31_60: n(r[iD31]),
      Days_61_90: n(r[iD61]),
      Days_91_Plus: n(r[iD91]),
      Total: n(r[iTot]),
      Updated_At: (r[iUpd] || '').trim(),
    }));

    const totalRow = parsed.find(r => r.Job_Number === '__TOTAL__');
    const lines = parsed.filter(r => r.Job_Number !== '__TOTAL__');
    if (totalRow) {
      return {
        rows: lines,
        totals: {
          current: totalRow.Current,
          d1_30: totalRow.Days_1_30,
          d31_60: totalRow.Days_31_60,
          d61_90: totalRow.Days_61_90,
          d91Plus: totalRow.Days_91_Plus,
          total: totalRow.Total,
        },
      };
    }
    // No synthetic total row — recompute
    const totals = lines.reduce(
      (acc, r) => ({
        current: acc.current + r.Current,
        d1_30: acc.d1_30 + r.Days_1_30,
        d31_60: acc.d31_60 + r.Days_31_60,
        d61_90: acc.d61_90 + r.Days_61_90,
        d91Plus: acc.d91Plus + r.Days_91_Plus,
        total: acc.total + r.Total,
      }),
      { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d91Plus: 0, total: 0 }
    );
    return { rows: lines, totals };
  } catch {
    return empty;
  }
}

// ──────────────────────────── REWORK LOG (Google Sheets) ────────────────────────────
// Populated manually or via a Rework flag on the field-report form.
// Tab: "REWORK_LOG" columns: Date | Job_Number | Job_Name | Crew | Hours | Cost | Note

export interface ReworkEntry {
  Date: string;
  Job_Number: string;
  Job_Name: string;
  Crew: string;
  Hours: number;
  Cost: number;
  Note: string;
}

export async function fetchReworkLog(): Promise<ReworkEntry[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SCORECARD_HUB_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('REWORK_LOG')}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = text.split(/\r\n|\n|\r/).filter(l => l.trim()).map(l => parseCSVLine(l));
    if (rows.length < 2) return [];
    const hdr = rows[0].map(c => c.trim());
    const idx = (s: string) => hdr.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '') === s.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    const iDate = idx('Date');
    const iJob  = idx('Job_Number');
    const iName = idx('Job_Name');
    const iCrew = idx('Crew');
    const iHrs  = idx('Hours');
    const iCost = idx('Cost');
    const iNote = idx('Note');
    return rows.slice(1)
      .map(r => ({
        Date: (r[iDate] || '').trim(),
        Job_Number: (r[iJob] || '').trim(),
        Job_Name: (r[iName] || '').trim(),
        Crew: (r[iCrew] || '').trim(),
        Hours: parseFloat(String(r[iHrs] || '0').replace(/[^0-9.\-]/g, '')) || 0,
        Cost: parseFloat(String(r[iCost] || '0').replace(/[^0-9.\-]/g, '')) || 0,
        Note: (r[iNote] || '').trim(),
      }))
      .filter(r => r.Date || r.Job_Number);
  } catch { return []; }
}

// ──────────────────────────── SALES PIPELINE ────────────────────────────
export interface PipelineDeal {
  Job_Number: string;
  Client: string;
  Project_Name: string;
  Stage: string;
  Value: number;
  State: string;
  PM: string;
  Bid_Date: string;
  Days_In_Stage: number;
}

export async function fetchSalesPipeline(): Promise<PipelineDeal[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SCORECARD_HUB_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Sales_Pipeline')}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = text.split(/\r\n|\n|\r/).filter(l => l.trim()).map(l => parseCSVLine(l));
    if (rows.length < 2) return [];
    const hdr = rows[0].map(c => c.trim());
    const idx = (s: string) => hdr.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '') === s.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    return rows.slice(1).map(r => ({
      Job_Number: (r[idx('Job_Number')] || '').trim(),
      Client: (r[idx('Client')] || '').trim(),
      Project_Name: (r[idx('Project_Name')] || '').trim(),
      Stage: (r[idx('Stage')] || 'Proposal Sent').trim(),
      Value: parseFloat(String(r[idx('Value')] || '0').replace(/[^0-9.\-]/g, '')) || 0,
      State: (r[idx('State')] || '').trim(),
      PM: (r[idx('PM')] || '').trim(),
      Bid_Date: (r[idx('Bid_Date')] || '').trim(),
      Days_In_Stage: parseInt(String(r[idx('Days_In_Stage')] || '0'), 10) || 0,
    })).filter(r => r.Client || r.Project_Name);
  } catch { return []; }
}

// ──────────────────────────── MARKETING LEADS ────────────────────────────
export interface MarketingLead {
  Date: string;
  Source: string;
  Contact: string;
  Project: string;
  Status: string;
  Owner: string;
}

export async function fetchMarketingLeads(): Promise<MarketingLead[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SCORECARD_HUB_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Marketing_Leads')}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = text.split(/\r\n|\n|\r/).filter(l => l.trim()).map(l => parseCSVLine(l));
    if (rows.length < 2) return [];
    const hdr = rows[0].map(c => c.trim());
    const idx = (s: string) => hdr.findIndex(h => h.toLowerCase().replace(/[^a-z0-9]+/g, '') === s.toLowerCase().replace(/[^a-z0-9]+/g, ''));
    return rows.slice(1).map(r => ({
      Date: (r[idx('Date')] || '').trim(),
      Source: (r[idx('Source')] || '').trim(),
      Contact: (r[idx('Contact')] || '').trim(),
      Project: (r[idx('Project')] || '').trim(),
      Status: (r[idx('Status')] || 'New').trim(),
      Owner: (r[idx('Owner')] || '').trim(),
    })).filter(r => r.Date || r.Contact);
  } catch { return []; }
}

// ──────────────────────────── PROJECT SCORECARD (Live sheet) ────────────────────────────
// Reads est-vs-actual rows from the "Project_Scorecards_Live" tab of the Scorecard Hub.
// Falls back to empty array if the tab doesn't exist yet.
export interface LiveScorecardRow {
  Job_Number: string;
  Est_Man_Hours: number;
  Act_Man_Hours: number;
  Est_Stone_Tons: number;
  Act_Stone_Tons: number;
  Est_Binder_Tons: number;
  Act_Binder_Tons: number;
  Est_Topping_Tons: number;
  Act_Topping_Tons: number;
  Est_Days_On_Site: number;
  Act_Days_On_Site: number;
  Weather_Days: number;
  Updated_At: string;
}

export async function fetchProjectScorecardsEstVsAct(): Promise<LiveScorecardRow[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${SCORECARD_HUB_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Project_Scorecards_Live')}`;
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return [];
    const text = await res.text();
    const rows = text.split(/\r\n|\n|\r/).filter(l => l.trim()).map(l => parseCSVLine(l));
    if (rows.length < 2) return [];
    const hdr = rows[0].map(c => c.trim());
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const idx = (name: string) => hdr.findIndex(h => norm(h) === norm(name));
    const n = (v: string | undefined): number => {
      if (!v) return 0;
      const x = parseFloat(String(v).replace(/[$,\s"]/g, '').replace(/%$/, ''));
      return isNaN(x) ? 0 : x;
    };
    return rows.slice(1).map(r => ({
      Job_Number: (r[idx('Job_Number')] || '').trim(),
      Est_Man_Hours: n(r[idx('Est_Man_Hours')]),
      Act_Man_Hours: n(r[idx('Act_Man_Hours')]),
      Est_Stone_Tons: n(r[idx('Est_Stone_Tons')]),
      Act_Stone_Tons: n(r[idx('Act_Stone_Tons')]),
      Est_Binder_Tons: n(r[idx('Est_Binder_Tons')]),
      Act_Binder_Tons: n(r[idx('Act_Binder_Tons')]),
      Est_Topping_Tons: n(r[idx('Est_Topping_Tons')]),
      Act_Topping_Tons: n(r[idx('Act_Topping_Tons')]),
      Est_Days_On_Site: n(r[idx('Est_Days_On_Site')]),
      Act_Days_On_Site: n(r[idx('Act_Days_On_Site')]),
      Weather_Days: n(r[idx('Weather_Days')]),
      Updated_At: (r[idx('Updated_At')] || '').trim(),
    })).filter(r => r.Job_Number);
  } catch { return []; }
}

// ──────────────────────────── 2026 GANTT SCHEDULE ────────────────────────────
// Source: https://docs.google.com/spreadsheets/d/178t9iioyveWqP6o8x2lQwMagexDP0W9FA4I2jfutJmw
// Columns: Job_Number | Job_Name | Project_Type | Start | End | (weekly flags...)

export interface GanttRow {
  Job_Number: string;
  Job_Name: string;
  Project_Type: string;
  Start_Date: string;
  End_Date: string;
}

export async function fetchGanttSchedule(): Promise<GanttRow[]> {
  try {
    let text = '';
    const res = await fetch(`https://docs.google.com/spreadsheets/d/${GANTT_SHEET_ID}/export?format=csv&gid=0`, { next: { revalidate: 86400 } }).catch(() => null);
    if (res && res.ok) text = await res.text();
    if (!text || text.includes('<!DOCTYPE') || text.includes('<HTML')) {
      const fs2 = await import('fs'); const path2 = await import('path');
      const p = path2.join(process.cwd(), 'data', '2026_Gantt.csv');
      if (fs2.existsSync(p)) text = fs2.readFileSync(p, 'utf-8');
    }
    if (!text) return [];
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    if (lines.length < 3) return [];
    // Row 0 is header ("Job #, Job Name, Project Type, Start, End, ...weeks").
    // Row 1 may be empty/state row. Data starts at row 2+.
    return lines.slice(1).map(l => {
      const cols = parseCSVLine(l);
      return {
        Job_Number: (cols[0] || '').trim(),
        Job_Name: (cols[1] || '').trim(),
        Project_Type: (cols[2] || '').trim(),
        Start_Date: (cols[3] || '').trim(),
        End_Date: (cols[4] || '').trim(),
      };
    }).filter(r => /^\d{2,3}-\d{3}/.test(r.Job_Number));
  } catch { return []; }
}

// ──────────────────────────── BUD'S 2026 BID LOG ────────────────────────────
// Source: https://docs.google.com/spreadsheets/d/1RhHIJooRFj-ChTwQlIl-EYx8IIcW02QT
// Sheet tab "2026_Bid_Log" has a top dashboard section; bid rows start later.

const BID_LOG_SHEET_ID = '1RhHIJooRFj-ChTwQlIl-EYx8IIcW02QT';

export interface BidLogRow {
  Bid_Number: string;
  Date_Bid: string;
  Customer: string;
  Job_Name: string;
  Location: string;
  Feedback: string;
  Probability: number;  // percent 0..100
  Proposal: number;
  Awarded: number;
  Pipe: number;
  Lost: number;
  Status: string;  // WIN, LOSS, UNDER REVIEW, BUDGETARY
  Expected_Start: string;
  Risk_Score: string;
}

function _parseDollar(v: string | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[$,\s"]/g, '').replace(/%$/, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

export async function fetchBidLog(): Promise<BidLogRow[]> {
  try {
    // Try live Google Sheet first; fall back to local CSV in /data
    let text = '';
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${BID_LOG_SHEET_ID}/export?format=csv&gid=0`;
    const res = await fetch(sheetUrl, { next: { revalidate: 86400 } }).catch(() => null);
    if (res && res.ok) {
      text = await res.text();
    }
    // Fallback: local CSV (updated manually or by upload)
    if (!text || text.includes('<!DOCTYPE') || text.includes('<HTML')) {
      const fs = await import('fs');
      const path = await import('path');
      const csvPath = path.join(process.cwd(), 'data', '2026_Bid_Log.csv');
      if (fs.existsSync(csvPath)) text = fs.readFileSync(csvPath, 'utf-8');
    }
    if (!text) return [];
    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    // Find the header row that starts with "Job #" (bid rows follow).
    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 40); i++) {
      const cells = parseCSVLine(lines[i]);
      if (cells[0] && /job\s*#/i.test(cells[0])) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return [];
    const hdr = parseCSVLine(lines[headerIdx]).map(c => c.trim());
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const col = (name: string) => hdr.findIndex(h => norm(h) === norm(name));
    const iBid    = col('Job #');
    const iDate   = col('Date Bid');
    const iCust   = col('Customer');
    const iName   = col('Job Name');
    const iLoc    = col('Location');
    const iFeed   = col('Feedback');
    const iProb   = col('Probability');
    const iProp   = col('Proposal');
    const iAward  = col('Awarded');
    const iPipe   = col('Pipe');
    const iLost   = col('Lost - 0%');
    const iStat   = hdr.findIndex(h => /win.*loss.*review/i.test(h));
    const iStart  = col('expected start date');
    const iRisk   = col('Job risk score');

    const rows: BidLogRow[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const bidNo = (cells[iBid] || '').trim();
      if (!/^2\d{3}-\d{3}$/.test(bidNo)) continue;
      rows.push({
        Bid_Number: bidNo,
        Date_Bid: (cells[iDate] || '').trim(),
        Customer: (cells[iCust] || '').trim(),
        Job_Name: (cells[iName] || '').trim(),
        Location: (cells[iLoc] || '').trim(),
        Feedback: (cells[iFeed] || '').trim(),
        Probability: _parseDollar(cells[iProb]),
        Proposal: _parseDollar(cells[iProp]),
        Awarded: _parseDollar(cells[iAward]),
        Pipe: _parseDollar(cells[iPipe]),
        Lost: _parseDollar(cells[iLost]),
        Status: (iStat >= 0 ? cells[iStat] || '' : '').trim().toUpperCase(),
        Expected_Start: (cells[iStart] || '').trim(),
        Risk_Score: (cells[iRisk] || '').trim(),
      });
    }
    return rows;
  } catch { return []; }
}

// ──────────────────────────── CREW DAYS SOLD (2026 Gantt workbook) ────────────────────────────
// Tab "25-26 Crew Days Sold" of the Gantt sheet has booked crew days per job broken
// into Mill/Misc, Curb, Stone Base, Paving, Field Events. We use this to compute
// real throughput balance (base vs paving capacity).

export interface CrewDaysJob {
  Job_Number: string;
  Job_Name: string;
  State: string;
  Project_Type: string;
  Contract_Amount: number;
  Actual_To_Date: number;
  Left_To_Bill: number;
  Mill_Misc_Days: number;
  Curb_Days: number;
  Stone_Base_Days: number;
  Asphalt_Paving_Days: number;
  Field_Events_Days: number;
  Total_Weeks: number;
}

export interface CrewDaysSummary {
  jobs: CrewDaysJob[];
  totals: {
    millMiscDays: number;
    curbDays: number;
    stoneBaseDays: number;
    pavingDays: number;
    fieldEventsDays: number;
    totalWeeks: number;
    totalContract: number;
    totalBilled: number;
    totalLeftToBill: number;
  };
}

export async function fetchCrewDaysSold(): Promise<CrewDaysSummary> {
  const empty: CrewDaysSummary = {
    jobs: [],
    totals: { millMiscDays: 0, curbDays: 0, stoneBaseDays: 0, pavingDays: 0, fieldEventsDays: 0, totalWeeks: 0, totalContract: 0, totalBilled: 0, totalLeftToBill: 0 },
  };
  try {
    // Read local CSV FIRST (guaranteed to work on Vercel), then try sheet as override
    const fs5 = await import('fs'); const path5 = await import('path');
    let text = '';
    const csvPath = path5.join(process.cwd(), 'data', 'crew_days_sold.csv');
    if (fs5.existsSync(csvPath)) {
      text = fs5.readFileSync(csvPath, 'utf-8');
    }
    // If no local CSV, try sheet
    if (!text) {
      const url = `https://docs.google.com/spreadsheets/d/${GANTT_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('25-26 Crew Days Sold')}`;
      const res = await fetch(url, { next: { revalidate: 86400 } }).catch(() => null);
      if (res && res.ok) text = await res.text();
    }
    if (!text || text.includes('<!DOCTYPE')) return empty;

    const lines = text.split(/\r\n|\n|\r/).filter(l => l.trim());
    if (lines.length < 3) return empty;

    const n = (v: string | undefined): number => {
      if (!v) return 0;
      const s = String(v).replace(/[$,"\s]/g, '').replace(/%$/, '');
      const x = parseFloat(s);
      return isNaN(x) ? 0 : x;
    };
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 10); i++) {
      const cells = parseCSVLine(lines[i]);
      if ((cells[0] || '').trim().toLowerCase().startsWith('job')) { headerIdx = i; break; }
    }
    if (headerIdx < 0) return empty;

    const hdr = parseCSVLine(lines[headerIdx]).map(c => c.trim());
    const findCol = (...names: string[]) => {
      for (const name of names) {
        const k = norm(name);
        const i = hdr.findIndex(h => norm(h) === k);
        if (i >= 0) return i;
      }
      return -1;
    };

    const iJob = findCol('Job #');
    const iName = findCol('JOB NAME and MAP', 'Job Name');
    const iState = findCol('State');
    const iType = findCol('Project type');
    const iContract = findCol('CONTRACT AMOUNT', 'Contract Amount');
    const iActual = findCol('Actual To Date');
    const iLeft = findCol('LEFT TO BILL', 'Left To Bill');
    const iMill = findCol('Mill / Misc. Days', 'Mill Misc Days');
    const iCurb = findCol('Curb Installation Days', 'Curb Days');
    const iStone = findCol('Stone Base Days');
    const iPave = findCol('Asphalt Paving Days');
    const iFE = findCol('Field Events Days');

    const jobs: CrewDaysJob[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = parseCSVLine(lines[i]);
      const jobNum = (cells[iJob] || '').trim();
      if (!/^\d{2,3}-\d{3}/.test(jobNum)) continue;
      jobs.push({
        Job_Number: jobNum,
        Job_Name: (cells[iName] || '').trim(),
        State: (cells[iState] || '').trim(),
        Project_Type: (cells[iType] || '').trim(),
        Contract_Amount: n(cells[iContract]),
        Actual_To_Date: n(cells[iActual]),
        Left_To_Bill: n(cells[iLeft]),
        Mill_Misc_Days: n(cells[iMill]),
        Curb_Days: n(cells[iCurb]),
        Stone_Base_Days: n(cells[iStone]),
        Asphalt_Paving_Days: n(cells[iPave]),
        Field_Events_Days: n(cells[iFE]),
        Total_Weeks: 0,
      });
    }

    const totals = {
      millMiscDays: jobs.reduce((s, j) => s + j.Mill_Misc_Days, 0),
      curbDays: jobs.reduce((s, j) => s + j.Curb_Days, 0),
      stoneBaseDays: jobs.reduce((s, j) => s + j.Stone_Base_Days, 0),
      pavingDays: jobs.reduce((s, j) => s + j.Asphalt_Paving_Days, 0),
      fieldEventsDays: jobs.reduce((s, j) => s + j.Field_Events_Days, 0),
      totalWeeks: 0,
      totalContract: jobs.reduce((s, j) => s + j.Contract_Amount, 0),
      totalBilled: jobs.reduce((s, j) => s + j.Actual_To_Date, 0),
      totalLeftToBill: jobs.reduce((s, j) => s + j.Left_To_Bill, 0),
    };

    return { jobs, totals };
  } catch { return empty; }
}

