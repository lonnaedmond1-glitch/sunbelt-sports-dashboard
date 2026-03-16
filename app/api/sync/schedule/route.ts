import { NextResponse } from 'next/server';

const SHEET_ID = '1WAxsAA7aSjA4OA6KLG1PvY34ImCuDixxiluN2-JRfzQ';
const SCHEDULE_GID = '416948597';
const GANTT_SHEET_ID = '178t9iioyveWqP6o8x2lQwMagexDP0W9FA4I2jfutJmw';
const GANTT_GID = '1949703319';

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

// Crew columns from the schedule header
const CREW_COLUMNS: { name: string; col: number; pmCol?: number; type: 'primary' | 'support' | 'sub' | 'logistics' }[] = [
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

const DELIVERY_COL = 7; // Deliveries column

function parseScheduleDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const cleaned = dateStr.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s*/i, '');
  const d = new Date(cleaned);
  return isNaN(d.getTime()) ? null : d;
}

// Decode schedule shorthand: "Mossy Creek - Pave - GA - CWM"
// → { jobRef: "Mossy Creek", activity: "Pave", state: "GA", supplier: "CWM" }
function decodeAssignment(text: string): { jobRef: string; activity: string; state: string; supplier: string; raw: string; isOff: boolean } {
  const raw = text;
  const lower = text.toLowerCase();
  const isOff = ['out of country', 'off', 'office', 'available', 'l-10', 'travel', 'meeting'].some(k => lower.includes(k));

  if (isOff) return { jobRef: text, activity: '', state: '', supplier: '', raw, isOff: true };

  const parts = text.split(' - ').map(p => p.trim());
  return {
    jobRef: parts[0] || text,
    activity: parts[1] || '',
    state: parts[2] || '',
    supplier: parts[3] || '',
    raw,
    isOff: false,
  };
}

// Supplier lookup
const SUPPLIER_MAP: Record<string, string> = {
  'CWM': 'CW Matthews', 'APAC': 'APAC-Atlantic', 'VMC': 'Vulcan Materials',
  'MM': 'Martin Marietta', 'WG': 'Wiregrass', 'Reeves': 'Reeves Construction',
};

function parseDateStr(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  try {
    // Fetch schedule tab and Gantt sheet in parallel
    const [schedRes, ganttRes] = await Promise.all([
      fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SCHEDULE_GID}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 120 },
      }),
      fetch(`https://docs.google.com/spreadsheets/d/${GANTT_SHEET_ID}/export?format=csv&gid=${GANTT_GID}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 120 },
      }),
    ]);

    // --- Parse Gantt sheet ---
    const ganttJobs: any[] = [];
    if (ganttRes.ok) {
      const ganttCSV = await ganttRes.text();
      const ganttLines = ganttCSV.split('\n').map(l => l.replace(/\r$/, ''));
      if (ganttLines.length > 1) {
        for (let i = 1; i < ganttLines.length; i++) {
          const cols = parseCSVLine(ganttLines[i]);
          const jobNum = cols[0]?.trim();
          if (!jobNum) continue;
          ganttJobs.push({
            Job_Number: jobNum,
            Job_Name: cols[1]?.trim() || '',
            Project_Type: cols[2]?.trim() || '',
            Start: cols[3]?.trim() || '',
            End: cols[4]?.trim() || '',
            startDate: parseDateStr(cols[3]?.trim() || ''),
            endDate: parseDateStr(cols[4]?.trim() || ''),
          });
        }
      }
    }

    // --- Parse schedule tab ---
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate current week Monday and next week Monday
    const dow = today.getDay();
    const monOffset = dow === 0 ? -6 : 1 - dow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + monOffset);

    const nextMonday = new Date(thisMonday);
    nextMonday.setDate(thisMonday.getDate() + 7);

    const endOfNextWeek = new Date(nextMonday);
    endOfNextWeek.setDate(nextMonday.getDate() + 7);

    if (!schedRes.ok) throw new Error('Schedule fetch failed');
    const csvText = await schedRes.text();
    const lines = csvText.split('\n').map(l => l.replace(/\r$/, ''));

    // ── FIRST PASS: Scan ALL rows to find every job's first/last occurrence ──
    const jobOccurrences = new Map<string, { firstDate: string; lastDate: string; jobRef: string; ganttJobNumber: string }>(); 
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const dateStr = cols[0];
      const date = parseScheduleDate(dateStr);
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
          const ganttMatch = ganttJobs.find(g =>
            ref.split(' ')[0] && g.Job_Name.toLowerCase().includes(ref.split(' ')[0])
          );
          jobOccurrences.set(ref, {
            firstDate: dateISO,
            lastDate: dateISO,
            jobRef: decoded.jobRef,
            ganttJobNumber: ganttMatch?.Job_Number || '',
          });
        } else if (dateISO > existing.lastDate) {
          existing.lastDate = dateISO;
        }
      }
    }

    // Convert to array for response
    const jobFirstOccurrences = Array.from(jobOccurrences.values());

    // ── SECOND PASS: Parse current/next week details ──
    const currentWeekDays: any[] = [];
    const nextWeekDays: any[] = [];
    const deliveries: any[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i]);
      const dateStr = cols[0];
      const date = parseScheduleDate(dateStr);
      if (!date) continue;

      // Only current week and next week
      if (date < thisMonday || date >= endOfNextWeek) continue;

      const isCurrentWeek = date < nextMonday;

      // Parse all crew assignments
      const assignments: any[] = [];
      for (const crew of CREW_COLUMNS) {
        const jobText = cols[crew.col] || '';
        const pm = crew.pmCol ? (cols[crew.pmCol] || '') : '';
        if (jobText) {
          const decoded = decodeAssignment(jobText);
          const supplierFull = SUPPLIER_MAP[decoded.supplier] || decoded.supplier;

          // Try to match to Gantt job
          const ganttMatch = ganttJobs.find(g =>
            decoded.jobRef.toLowerCase().split(' ')[0] &&
            g.Job_Name.toLowerCase().includes(decoded.jobRef.toLowerCase().split(' ')[0])
          );

          assignments.push({
            crew: crew.name,
            crewType: crew.type,
            job: jobText,
            pm,
            decoded,
            supplierFull,
            ganttMatch: ganttMatch ? {
              jobNumber: ganttMatch.Job_Number,
              projectType: ganttMatch.Project_Type,
              start: ganttMatch.Start,
              end: ganttMatch.End,
            } : null,
          });
        }
      }

      // Parse deliveries
      const deliveryText = cols[DELIVERY_COL] || '';
      if (deliveryText) {
        deliveries.push({
          date: date.toISOString().split('T')[0],
          dateDisplay: dateStr,
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
          description: deliveryText,
          isCurrentWeek,
        });
      }

      const dayData = {
        date: date.toISOString().split('T')[0],
        dateDisplay: dateStr,
        dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
        assignments,
        isToday: date.getTime() === today.getTime(),
      };

      if (isCurrentWeek) currentWeekDays.push(dayData);
      else nextWeekDays.push(dayData);
    }

    // Active Gantt jobs (start before end of next week, end after today)
    const activeGanttJobs = ganttJobs.filter(g =>
      g.startDate && g.endDate && g.startDate <= endOfNextWeek && g.endDate >= today
    );

    // Build unique jobs on schedule this/next week
    const scheduledJobs = new Set<string>();
    [...currentWeekDays, ...nextWeekDays].forEach(d =>
      d.assignments.forEach((a: any) => {
        if (!a.decoded.isOff) scheduledJobs.add(a.decoded.jobRef);
      })
    );

    return NextResponse.json({
      currentWeek: {
        weekOf: thisMonday.toISOString().split('T')[0],
        label: `Week of ${thisMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        days: currentWeekDays,
      },
      nextWeek: {
        weekOf: nextMonday.toISOString().split('T')[0],
        label: `Week of ${nextMonday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        days: nextWeekDays,
      },
      deliveries,
      activeGanttJobs,
      jobFirstOccurrences,
      scheduledJobCount: scheduledJobs.size,
      ganttJobCount: ganttJobs.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[sync/schedule] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch schedule', currentWeek: { days: [] }, nextWeek: { days: [] } }, { status: 500 });
  }
}
