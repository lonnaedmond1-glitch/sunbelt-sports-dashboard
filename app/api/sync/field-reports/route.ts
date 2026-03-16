import { NextResponse } from 'next/server';

const JOTFORM_API_KEY = process.env.JOTFORM_API_KEY || 'c02f5c097f06c28304f3a766d48f51e6';
const FORM_ID = process.env.JOTFORM_FORM_ID || '240915802348154';

interface JotformSubmission {
  id: string;
  created_at: string;
  answers: Record<string, { name: string; text: string; answer: string | Record<string, string> }>;
}

function getAnswer(submission: JotformSubmission, questionName: string): string {
  const entry = Object.values(submission.answers).find(a => a.name === questionName);
  if (!entry) return '';
  if (typeof entry.answer === 'object') return Object.values(entry.answer).join(', ');
  return String(entry.answer || '');
}

function safeNum(val: string): number {
  const n = parseFloat(val?.replace(/[^0-9.-]/g, '') || '0');
  return isNaN(n) ? 0 : n;
}

export async function GET() {
  try {
    const url = `https://api.jotform.com/form/${FORM_ID}/submissions?apiKey=${JOTFORM_API_KEY}&limit=200&orderby=created_at,DESC`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Jotform API error: ${res.status}`);

    const json = await res.json();
    const submissions: JotformSubmission[] = json.content || [];

    const jobTotals: Record<string, any> = {};

    for (const sub of submissions) {
      const jobWidget = getAnswer(sub, 'typeA56');
      let jobNum = '', jobName = '';

      if (jobWidget && jobWidget !== 'Job Name Not Listed') {
        const parts = jobWidget.split('\t');
        jobNum = parts[0]?.trim() || '';
        jobName = parts.slice(1).join(' ').trim();
      }
      if (!jobNum) jobNum = getAnswer(sub, 'jobNumber').trim();
      if (!jobNum) {
        const subName = getAnswer(sub, 'sjhb').trim();
        if (subName && subName !== 'Job Name Not Listed') {
          const parts = subName.split('\t');
          jobNum = parts[0]?.trim() || '';
          jobName = parts.slice(1).join(' ').trim();
        }
      }
      if (!jobNum || jobNum === 'Job Name Not Listed') continue;
      jobNum = jobNum.trim();

      if (!jobTotals[jobNum]) {
        jobTotals[jobNum] = { Job_Number: jobNum, Job_Name: jobName, GAB_Tonnage: 0, Binder_Tonnage: 0, Topping_Tonnage: 0, Concrete_CY: 0, Concrete_Curb_LF: 0, Milling_SY: 0, Total_Man_Hours: 0, Crew_Count: 0, Truck_Count: 0, Last_Report_Date: sub.created_at, Latest_Summary: '', Job_Difficulty: '', Days_Active: 0 };
      }

      const entry = jobTotals[jobNum];
      entry.GAB_Tonnage += safeNum(getAnswer(sub, 'gabTonnage'));
      entry.Binder_Tonnage += safeNum(getAnswer(sub, 'tonnage27'));
      entry.Topping_Tonnage += safeNum(getAnswer(sub, 'tonnage28'));
      entry.Concrete_CY += safeNum(getAnswer(sub, 'concreteCy'));
      entry.Concrete_Curb_LF += safeNum(getAnswer(sub, 'concreteCurb'));
      entry.Milling_SY += safeNum(getAnswer(sub, 'loads36'));
      entry.Total_Man_Hours += safeNum(getAnswer(sub, 'totalMan'));
      entry.Truck_Count = Math.max(entry.Truck_Count, safeNum(getAnswer(sub, 'howMany')));
      entry.Crew_Count = Math.max(entry.Crew_Count, safeNum(getAnswer(sub, 'numberOf')));
      const summary = getAnswer(sub, 'jobSummary');
      if (summary && summary !== 'no' && !entry.Latest_Summary) entry.Latest_Summary = summary;
      const diff = getAnswer(sub, 'howDifficult');
      if (diff && !entry.Job_Difficulty) entry.Job_Difficulty = diff;
      entry.Days_Active++;
    }

    const fieldReports = Object.values(jobTotals).map((r: any) => ({ ...r, Base_Actual: r.GAB_Tonnage, Asphalt_Actual: r.Binder_Tonnage + r.Topping_Tonnage, Concrete_Actual: r.Concrete_CY }));

    return NextResponse.json({ data: fieldReports, count: fieldReports.length, source: 'jotform', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[sync/field-reports] Error:', error);
    return NextResponse.json({ error: 'Failed to sync field reports', data: [] }, { status: 500 });
  }
}
