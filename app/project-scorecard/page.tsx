export const revalidate = 300;

import Link from 'next/link';
import {
  fetchEstVsActual,
  fetchMasterJobIndex,
  fetchQboFinancials,
  type EstVsActualRow,
  type MasterJobIndexRow,
  type QboJobFinancials,
} from '@/lib/sheets-data';

function money(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function tons(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function hours(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function varianceTone(variance: number): string {
  if (variance > 0) return 'text-[#E04343]';
  if (variance < 0) return 'text-[#0F8F47]';
  return 'text-[#757A7F]';
}

function marginTone(value: number): string {
  if (value >= 0.2) return 'text-[#0F8F47]';
  if (value >= 0.1) return 'text-[#B7791F]';
  return 'text-[#E04343]';
}

type ScorecardRow = {
  jobNumber: string;
  jobName: string;
  pm: string;
  status: string;
  contractAmount: number;
  estimatedGabTons: number;
  actualGabTons: number;
  estimatedBinderTons: number;
  actualBinderTons: number;
  estimatedToppingTons: number;
  actualToppingTons: number;
  estimatedAsphaltTons: number;
  actualAsphaltTons: number;
  manHours: number;
  qboIncome: number;
  qboCost: number;
  qboProfit: number;
  qboMargin: number;
};

function mapByJob<T extends { Job_Number: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  rows.forEach(row => {
    const jobNumber = row.Job_Number?.trim();
    if (jobNumber) map.set(jobNumber, row);
  });
  return map;
}

function buildRows(
  masterRows: MasterJobIndexRow[],
  actualRows: EstVsActualRow[],
  qboRows: QboJobFinancials[],
): ScorecardRow[] {
  const masterByJob = mapByJob(masterRows);
  const actualByJob = mapByJob(actualRows);
  const qboByJob = mapByJob(qboRows);
  const masterOrder = new Map(masterRows.map((row, index) => [row.Job_Number, index]));

  const jobNumbers = new Set<string>();
  masterRows.forEach(row => jobNumbers.add(row.Job_Number));
  actualRows.forEach(row => jobNumbers.add(row.Job_Number));
  qboRows.forEach(row => {
    if (/^\d{2,3}-\d{3}/.test(row.Job_Number)) jobNumbers.add(row.Job_Number);
  });

  return Array.from(jobNumbers).map(jobNumber => {
    const master = masterByJob.get(jobNumber);
    const actual = actualByJob.get(jobNumber);
    const qbo = qboByJob.get(jobNumber);

    return {
      jobNumber,
      jobName: master?.Job_Name || actual?.Job_Name || qbo?.Project_Name || 'Missing job name',
      pm: master?.PM || actual?.PM || '',
      status: master?.Job_Status || actual?.Status || (qbo ? 'QBO' : ''),
      contractAmount: master?.Contract_Amount || 0,
      estimatedGabTons: actual?.Estimated_GAB_Tons ?? master?.Estimated_GAB_Tons ?? 0,
      actualGabTons: actual?.Actual_GAB_Tons || 0,
      estimatedBinderTons: actual?.Estimated_Binder_Tons ?? master?.Estimated_Binder_Tons ?? 0,
      actualBinderTons: actual?.Actual_Binder_Tons || 0,
      estimatedToppingTons: actual?.Estimated_Topping_Tons ?? master?.Estimated_Topping_Tons ?? 0,
      actualToppingTons: actual?.Actual_Topping_Tons || 0,
      estimatedAsphaltTons: actual?.Estimated_Asphalt_Tons ?? master?.Estimated_Asphalt_Tons ?? 0,
      actualAsphaltTons: actual?.Actual_Asphalt_Tons || 0,
      manHours: actual?.Man_Hours || 0,
      qboIncome: qbo?.Act_Income || 0,
      qboCost: qbo?.Act_Cost || 0,
      qboProfit: qbo?.Profit || 0,
      qboMargin: qbo?.Act_Income ? qbo.Profit / qbo.Act_Income : 0,
    };
  }).sort((a, b) => {
    const aOrder = masterOrder.get(a.jobNumber) ?? 9999;
    const bOrder = masterOrder.get(b.jobNumber) ?? 9999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.jobNumber.localeCompare(b.jobNumber);
  });
}

export default async function ProjectScorecardPage() {
  const [masterRows, actualRows, qboRows] = await Promise.all([
    fetchMasterJobIndex(),
    fetchEstVsActual(),
    fetchQboFinancials(),
  ]);

  const rows = buildRows(masterRows, actualRows, qboRows);
  const qboUpdatedAt = qboRows.find(row => row.Updated_At)?.Updated_At || 'No QBO timestamp';
  const totals = rows.reduce(
    (acc, row) => ({
      contractAmount: acc.contractAmount + row.contractAmount,
      estimatedGabTons: acc.estimatedGabTons + row.estimatedGabTons,
      actualGabTons: acc.actualGabTons + row.actualGabTons,
      estimatedBinderTons: acc.estimatedBinderTons + row.estimatedBinderTons,
      actualBinderTons: acc.actualBinderTons + row.actualBinderTons,
      estimatedToppingTons: acc.estimatedToppingTons + row.estimatedToppingTons,
      actualToppingTons: acc.actualToppingTons + row.actualToppingTons,
      estimatedAsphaltTons: acc.estimatedAsphaltTons + row.estimatedAsphaltTons,
      actualAsphaltTons: acc.actualAsphaltTons + row.actualAsphaltTons,
      manHours: acc.manHours + row.manHours,
      qboIncome: acc.qboIncome + row.qboIncome,
      qboCost: acc.qboCost + row.qboCost,
      qboProfit: acc.qboProfit + row.qboProfit,
    }),
    {
      contractAmount: 0,
      estimatedGabTons: 0,
      actualGabTons: 0,
      estimatedBinderTons: 0,
      actualBinderTons: 0,
      estimatedToppingTons: 0,
      actualToppingTons: 0,
      estimatedAsphaltTons: 0,
      actualAsphaltTons: 0,
      manHours: 0,
      qboIncome: 0,
      qboCost: 0,
      qboProfit: 0,
    },
  );
  const portfolioMargin = totals.qboIncome > 0 ? totals.qboProfit / totals.qboIncome : 0;

  const kpis = [
    { label: 'Scorecard Jobs', value: rows.length.toLocaleString('en-US'), note: 'Master + production + QBO' },
    { label: 'Contract Value', value: money(totals.contractAmount), note: 'MASTER JOB INDEX sum' },
    { label: 'QBO Revenue', value: money(totals.qboIncome), note: 'Act_Income sum' },
    { label: 'QBO Profit', value: money(totals.qboProfit), note: 'Profit sum' },
    { label: 'QBO Margin', value: pct(portfolioMargin), note: 'Profit / revenue' },
    { label: 'Man Hours', value: hours(totals.manHours), note: 'Est vs Actual sum' },
  ];

  return (
    <div className="min-h-screen bg-[#F1F3F4] p-8 font-sans text-[#3C4043]">
      <header className="mb-6">
        <h1 className="mb-1 text-2xl font-black uppercase tracking-tight text-[#3C4043]">Project Scorecard</h1>
        <p className="text-sm text-[#757A7F]">
          Live job production and QBO money from the Scorecard Hub.
        </p>
      </header>

      <div className="mb-6 flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
        <span className="mt-0.5 text-lg text-[#20BC64]">●</span>
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-[#0F8F47]">Live — Scorecard Hub tabs</p>
          <p className="mt-0.5 text-xs text-[#757A7F]">
            Sources: MASTER JOB INDEX, Est vs Actual, and QBO Est vs Actuals. Refreshes every 5 minutes. QBO updated {qboUpdatedAt}.
          </p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-[#DDE2E5] bg-white p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{kpi.label}</p>
            <p className="text-xl font-black text-[#3C4043]">{kpi.value}</p>
            <p className="mt-1 text-[9px] text-[#757A7F]">{kpi.note}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#DDE2E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#DDE2E5] px-5 py-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Job-by-Job Scorecard</h2>
          <span className="text-[10px] font-bold uppercase text-[#757A7F]">{rows.length} jobs</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F1F3F4]">
              <tr>
                <th className="min-w-[260px] px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Job</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-[#757A7F]">PM</th>
                <th className="px-3 py-3 text-left text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Status</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Contract</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">GAB Est</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">GAB Act</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Binder Est</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Binder Act</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Topping Est</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Topping Act</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Asphalt Var</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Hours</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">QBO Revenue</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">QBO Profit</th>
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const asphaltVariance = row.actualAsphaltTons - row.estimatedAsphaltTons;
                return (
                  <tr key={row.jobNumber} className="border-t border-[#DDE2E5] hover:bg-[#FAFCFB]">
                    <td className="px-3 py-2">
                      <Link href={`/jobs/${row.jobNumber}`} className="text-xs font-black text-[#20BC64] hover:underline">
                        {row.jobNumber} · {row.jobName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-[11px] font-bold text-[#757A7F]">{row.pm || '—'}</td>
                    <td className="px-3 py-2 text-[11px] font-bold text-[#757A7F]">{row.status || '—'}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{money(row.contractAmount)}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{tons(row.estimatedGabTons)}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-bold text-[#2563EB]">{tons(row.actualGabTons)}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{tons(row.estimatedBinderTons)}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-bold text-[#2563EB]">{tons(row.actualBinderTons)}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{tons(row.estimatedToppingTons)}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-bold text-[#2563EB]">{tons(row.actualToppingTons)}</td>
                    <td className={`px-3 py-2 text-right text-[11px] font-bold ${varianceTone(asphaltVariance)}`}>{tons(asphaltVariance)}</td>
                    <td className="px-3 py-2 text-right text-[11px] font-bold text-[#3C4043]">{hours(row.manHours)}</td>
                    <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{money(row.qboIncome)}</td>
                    <td className={`px-3 py-2 text-right text-[11px] font-bold ${row.qboProfit >= 0 ? 'text-[#0F8F47]' : 'text-[#E04343]'}`}>{money(row.qboProfit)}</td>
                    <td className={`px-3 py-2 text-right text-[11px] font-bold ${row.qboIncome ? marginTone(row.qboMargin) : 'text-[#9CA3AF]'}`}>{row.qboIncome ? pct(row.qboMargin) : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
