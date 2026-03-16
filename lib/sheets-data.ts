/**
 * Shared data-fetching functions that call Google Sheets / Jotform directly.
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

// ──────────────────────────── JOBS (Google Sheets) ────────────────────────────

const JOB_LIST_SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
const JOB_LIST_GID = '623969002';

export async function fetchLiveJobs() {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${JOB_LIST_SHEET_ID}/export?format=csv&gid=${JOB_LIST_GID}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 300 } });
    if (!response.ok) return [];
    const csvText = await response.text();
    const lines = csvText.split('\r\n').filter(l => l.trim());
    return lines.slice(2).map(line => {
      const cols = parseCSVLine(line);
      const jobNumber = cols[0]?.trim();
      if (!jobNumber || !jobNumber.match(/^\d{2}-\d{3}/)) return null;
      const coordsRaw = cols[2]?.replace(/"/g, '').trim();
      let lat = '', lng = '';
      if (coordsRaw) { const parts = coordsRaw.split(','); lat = parts[0]?.trim() || ''; lng = parts[1]?.trim() || ''; }
      return {
        Job_Number: jobNumber, Job_Name: cols[1]?.trim() || '', Lat: lat, Lng: lng,
        State: cols[3]?.trim() || '', Status: cols[5]?.trim() || 'Pending',
        Start_Date: cols[6]?.trim() || '', Finish_Date: cols[7]?.trim() || '',
        General_Contractor: cols[8]?.trim() || '', Point_Of_Contact: cols[9]?.trim() || '',
        Project_Manager: cols[10]?.trim() || '',
        Contract_Amount: parseFloat((cols[13] || '0').replace(/[$,\s]/g, '')) || 0,
        Billed_To_Date: parseFloat((cols[14] || '0').replace(/[$,\s]/g, '')) || 0,
        Pct_Complete: parseFloat((cols[16] || '0%').replace('%', '').trim()) || 0,
        Location: cols[3]?.trim() || '',
        Field_Events: cols[18]?.trim() || '', Track_Surface: cols[20]?.trim() || '', Micromill: cols[22]?.trim() || '',
      };
    }).filter(Boolean);
  } catch { return []; }
}

// ──────────────────────────── FIELD REPORTS (Jotform) ────────────────────────────

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

export async function fetchLiveFieldReports() {
  try {
    const url = `https://api.jotform.com/form/${FORM_ID}/submissions?apiKey=${JOTFORM_API_KEY}&limit=200&orderby=created_at,DESC`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
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
    return Object.values(jobTotals).map((r: any) => ({ ...r, Base_Actual: r.GAB_Tonnage, Asphalt_Actual: r.Binder_Tonnage + r.Topping_Tonnage, Concrete_Actual: r.Concrete_CY }));
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

export async function fetchScorecardData() {
  try {
    const [plRes, bsRes, arRes, csRes] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${QB_SHEET_ID}/export?format=csv&gid=${PL_GID}`, { next: { revalidate: 300 } }),
      fetch(`https://docs.google.com/spreadsheets/d/${QB_SHEET_ID}/export?format=csv&gid=${BS_GID}`, { next: { revalidate: 300 } }),
      fetch(`https://docs.google.com/spreadsheets/d/${QB_SHEET_ID}/export?format=csv&gid=${AR_GID}`, { next: { revalidate: 300 } }),
      fetch(`https://docs.google.com/spreadsheets/d/${QB_SHEET_ID}/export?format=csv&gid=${CS_GID}`, { next: { revalidate: 300 } }),
    ]);
    const plText = await plRes.text();
    const bsText = await bsRes.text();
    const arText = await arRes.text();
    const csText = await csRes.text();
    
    // P&L parsing
    const plLines = plText.split('\n').filter(l => l.trim());
    let revenue = 0, cogs = 0, operating = 0, otherIncome = 0, otherExpense = 0;
    const revenueAccounts: any[] = [];
    let section = '';
    for (const line of plLines) {
      const cols = parseCSVLine(line);
      const label = cols[0]?.trim().toLowerCase() || '';
      const val = parseMoney(cols[1] || '');
      if (label.includes('total income')) { revenue = val; section = ''; }
      else if (label.includes('total cost of goods')) cogs = val;
      else if (label.includes('total expenses')) operating = val;
      else if (label === 'income' || label.includes('ordinary income')) section = 'income';
      else if (section === 'income' && val > 0 && !label.includes('total') && label.length > 2) {
        revenueAccounts.push({ name: cols[0]?.trim(), amount: val });
      }
      if (label.includes('other income')) otherIncome = val;
      if (label.includes('other expense')) otherExpense = val;
    }
    
    // Balance Sheet parsing
    const bsLines = bsText.split('\n').filter(l => l.trim());
    let totalAssets = 0, totalLiabilities = 0, totalEquity = 0, cash = 0, currentAssets = 0, currentLiabs = 0;
    for (const line of bsLines) {
      const cols = parseCSVLine(line);
      const label = cols[0]?.trim().toLowerCase() || '';
      const val = parseMoney(cols[1] || '');
      if (label.includes('total assets')) totalAssets = val;
      else if (label.includes('total liabilities')) totalLiabilities = val;
      else if (label.includes('total equity')) totalEquity = val;
      else if (label.includes('checking') || label.includes('savings')) cash += val;
      else if (label.includes('total current assets')) currentAssets = val;
      else if (label.includes('total current liabilities')) currentLiabs = val;
    }
    
    // AR Aging parsing
    const arLines = arText.split('\n').filter(l => l.trim());
    const arBuckets: any = { current: 0, '1-30': 0, '31-60': 0, '61-90': 0, over90: 0, total: 0 };
    for (const line of arLines) {
      const cols = parseCSVLine(line);
      const label = cols[0]?.trim().toLowerCase() || '';
      if (label === 'total' || label.includes('total')) {
        arBuckets.current = parseMoney(cols[1] || '');
        arBuckets['1-30'] = parseMoney(cols[2] || '');
        arBuckets['31-60'] = parseMoney(cols[3] || '');
        arBuckets['61-90'] = parseMoney(cols[4] || '');
        arBuckets.over90 = parseMoney(cols[5] || '');
        arBuckets.total = parseMoney(cols[6] || cols[5] || '');
      }
    }
    
    // Customer Sales parsing
    const csLines = csText.split('\n').filter(l => l.trim());
    const customerSales: any[] = [];
    for (const line of csLines) {
      const cols = parseCSVLine(line);
      const name = cols[0]?.trim();
      const amount = parseMoney(cols[1] || '');
      if (name && amount > 0 && !name.toLowerCase().includes('total') && name.length > 2) {
        customerSales.push({ name, amount });
      }
    }
    customerSales.sort((a: any, b: any) => b.amount - a.amount);
    
    const grossProfit = revenue - cogs;
    const netIncome = grossProfit - operating + otherIncome - otherExpense;
    
    return {
      revenue, cogs, grossProfit, operating, otherIncome, otherExpense, netIncome,
      grossMargin: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
      netMargin: revenue > 0 ? (netIncome / revenue) * 100 : 0,
      revenueAccounts,
      totalAssets, totalLiabilities, totalEquity, cash, currentAssets, currentLiabs,
      currentRatio: currentLiabs > 0 ? currentAssets / currentLiabs : 0,
      arBuckets, customerSales,
    };
  } catch { return {}; }
}

// ──────────────────────────── SCHEDULE (Google Sheets) ────────────────────────────

const SCHEDULE_GID = '416948597';
const GANTT_SHEET_ID = '178t9iioyveWqP6o8x2lQwMagexDP0W9FA4I2jfutJmw';
const GANTT_GID = '1949703319';

// Re-export the schedule API's URL for fetching (schedule has complex logic, keep using the API route)
export function getScheduleApiUrl(): string {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/sync/schedule`;
  return 'http://localhost:3000/api/sync/schedule';
}
