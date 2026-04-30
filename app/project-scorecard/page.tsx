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

type IssueSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM';

type ScorecardIssue = {
  severity: IssueSeverity;
  label: string;
  detail: string;
  source: string;
  action: string;
};

type ScorecardRow = {
  jobNumber: string;
  jobName: string;
  pm: string;
  status: string;
  hasMasterRow: boolean;
  hasProductionRow: boolean;
  hasQboRow: boolean;
  hasQboMoney: boolean;
  hasProductionActivity: boolean;
  cleanForOperations: boolean;
  trustLabel: string;
  issues: ScorecardIssue[];
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

type ScorecardTotals = {
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
    const hasMasterRow = Boolean(master);
    const hasProductionRow = Boolean(actual);
    const hasQboRow = Boolean(qbo);
    const hasQboMoney = Boolean(qbo && (qbo.Act_Income || qbo.Act_Cost || qbo.Profit));
    const hasProductionActivity = Boolean(actual && (
      actual.Estimated_GAB_Tons ||
      actual.Actual_GAB_Tons ||
      actual.Estimated_Binder_Tons ||
      actual.Actual_Binder_Tons ||
      actual.Estimated_Topping_Tons ||
      actual.Actual_Topping_Tons ||
      actual.Estimated_Asphalt_Tons ||
      actual.Actual_Asphalt_Tons ||
      actual.Man_Hours
    ));
    const issues: ScorecardIssue[] = [];

    if (hasQboMoney && !hasProductionRow) {
      issues.push({
        severity: 'CRITICAL',
        label: 'QBO money only',
        detail: 'QBO has revenue, cost, or profit for this job, but the Est vs Actual production row is missing.',
        source: 'QBO Est vs Actuals + Est vs Actual',
        action: 'Reconcile the job number and add or repair the Est vs Actual production row.',
      });
    }

    if (hasQboMoney && hasProductionRow && !hasProductionActivity) {
      issues.push({
        severity: 'HIGH',
        label: 'Production blank with money',
        detail: 'QBO has money for this job, but production quantities and man hours are blank or zero.',
        source: 'QBO Est vs Actuals + Est vs Actual',
        action: 'Confirm whether production is missing from field reports or whether QBO is mapped to the wrong job.',
      });
    }

    if ((hasQboMoney || hasProductionRow) && !hasMasterRow) {
      issues.push({
        severity: 'HIGH',
        label: 'Missing master job row',
        detail: 'The job exists in QBO or production data, but not in MASTER JOB INDEX.',
        source: 'MASTER JOB INDEX',
        action: 'Add the job to MASTER JOB INDEX or correct the job number.',
      });
    }

    if ((hasQboMoney || hasProductionActivity) && hasMasterRow && !master?.Contract_Amount) {
      issues.push({
        severity: 'MEDIUM',
        label: 'Contract missing',
        detail: 'The job has activity, but MASTER JOB INDEX has no contract amount.',
        source: 'MASTER JOB INDEX',
        action: 'Enter the contract amount so billing and margin can be trusted.',
      });
    }

    if (!hasQboRow && (hasProductionActivity || Boolean(master?.Contract_Amount))) {
      issues.push({
        severity: 'MEDIUM',
        label: 'QBO missing',
        detail: 'The job has production or contract data, but no matching row in QBO Est vs Actuals.',
        source: 'QBO Est vs Actuals',
        action: 'Confirm whether QBO has not synced yet or whether the job number does not match.',
      });
    }

    const cleanForOperations = issues.length === 0;
    const trustLabel = cleanForOperations
      ? 'Verified'
      : hasQboMoney && !hasProductionRow
        ? 'QBO money only'
        : 'Unverified';

    return {
      jobNumber,
      jobName: master?.Job_Name || actual?.Job_Name || qbo?.Project_Name || 'Missing job name',
      pm: master?.PM || actual?.PM || '',
      status: trustLabel === 'QBO money only' ? 'QBO money only' : master?.Job_Status || actual?.Status || (qbo ? 'QBO' : ''),
      hasMasterRow,
      hasProductionRow,
      hasQboRow,
      hasQboMoney,
      hasProductionActivity,
      cleanForOperations,
      trustLabel,
      issues,
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

function emptyTotals(): ScorecardTotals {
  return {
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
  };
}

function sumRows(rows: ScorecardRow[]): ScorecardTotals {
  return rows.reduce(
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
    emptyTotals(),
  );
}

function trustTone(row: ScorecardRow): string {
  if (row.cleanForOperations) return 'bg-[#E8F8EF] text-[#0F8F47]';
  if (row.issues.some(issue => issue.severity === 'CRITICAL')) return 'bg-[#FDECEC] text-[#E04343]';
  return 'bg-[#FEF3DB] text-[#B7791F]';
}

function sourceValue(sourcePresent: boolean, value: number, formatter: (value: number) => string, className = '') {
  if (!sourcePresent) {
    return <span className="font-black uppercase tracking-widest text-[#E04343]">Missing</span>;
  }
  return <span className={className}>{formatter(value)}</span>;
}

function marginValue(row: ScorecardRow) {
  if (!row.qboIncome) return <span className="text-[#9CA3AF]">-</span>;
  if (!row.cleanForOperations) return <span className="font-black uppercase tracking-widest text-[#B7791F]">Unverified</span>;
  return <span className={marginTone(row.qboMargin)}>{pct(row.qboMargin)}</span>;
}

function issuePriorityTone(severity: IssueSeverity): string {
  if (severity === 'CRITICAL') return 'bg-[#FDECEC] text-[#E04343] border-[#F6B8B8]';
  if (severity === 'HIGH') return 'bg-[#FEF3DB] text-[#B7791F] border-[#F3D28A]';
  return 'bg-[#F1F3F4] text-[#3C4043] border-[#DDE2E5]';
}

export default async function ProjectScorecardPage() {
  const [masterRows, actualRows, qboRows] = await Promise.all([
    fetchMasterJobIndex(),
    fetchEstVsActual(),
    fetchQboFinancials(),
  ]);

  const rows = buildRows(masterRows, actualRows, qboRows);
  const cleanRows = rows.filter(row => row.cleanForOperations);
  const exceptionRows = rows.filter(row => !row.cleanForOperations);
  const qboOnlyRows = rows.filter(row => row.hasQboMoney && !row.hasProductionRow);
  const blankProductionMoneyRows = rows.filter(row => row.hasQboMoney && row.hasProductionRow && !row.hasProductionActivity);
  const missingContractRows = rows.filter(row => row.issues.some(issue => issue.label === 'Contract missing'));
  const missingQboRows = rows.filter(row => row.issues.some(issue => issue.label === 'QBO missing'));
  const qboUpdatedAt = qboRows.find(row => row.Updated_At)?.Updated_At || 'No QBO timestamp';
  const cleanTotals = sumRows(cleanRows);
  const exceptionTotals = sumRows(exceptionRows);
  const cleanPortfolioMargin = cleanTotals.qboIncome > 0 ? cleanTotals.qboProfit / cleanTotals.qboIncome : 0;

  const kpis = [
    { label: 'Clean Jobs', value: cleanRows.length.toLocaleString('en-US'), note: 'Rows with matching job, production, contract, and QBO context' },
    { label: 'Data Exceptions', value: exceptionRows.length.toLocaleString('en-US'), note: 'Rows not trusted for clean operating totals' },
    { label: 'QBO Money Only', value: qboOnlyRows.length.toLocaleString('en-US'), note: 'Money exists but production row is missing' },
    { label: 'Clean Revenue', value: money(cleanTotals.qboIncome), note: 'Verified rows only' },
    { label: 'Unverified Profit', value: money(exceptionTotals.qboProfit), note: 'Profit tied to exception rows' },
    { label: 'Clean Margin', value: cleanTotals.qboIncome ? pct(cleanPortfolioMargin) : 'Missing', note: 'Profit / revenue on verified rows only' },
  ];

  const decisions = [
    qboOnlyRows.length ? {
      title: 'Reconcile QBO-only jobs',
      detail: `${qboOnlyRows.length} job(s) have QBO money but no production row. These should not be read as complete scorecard rows.`,
      owner: 'Operations + Finance',
      action: 'Match the QBO job number to Est vs Actual or add the missing production row.',
    } : null,
    blankProductionMoneyRows.length ? {
      title: 'Confirm blank production with money',
      detail: `${blankProductionMoneyRows.length} job(s) have QBO money while production quantities and hours are blank.`,
      owner: 'Operations',
      action: 'Check field reports and production imports before trusting margin.',
    } : null,
    missingContractRows.length ? {
      title: 'Fill missing contract values',
      detail: `${missingContractRows.length} job(s) have activity but no contract amount in MASTER JOB INDEX.`,
      owner: 'Project admin',
      action: 'Update MASTER JOB INDEX so billing and margin have a real baseline.',
    } : null,
    missingQboRows.length ? {
      title: 'Match missing QBO rows',
      detail: `${missingQboRows.length} job(s) have production or contract data but no QBO financial row.`,
      owner: 'Finance',
      action: 'Confirm the QBO sync and job-number mapping before using margin totals.',
    } : null,
  ].filter(Boolean) as Array<{ title: string; detail: string; owner: string; action: string }>;

  const renderTableRows = (tableRows: ScorecardRow[]) => (
    <tbody>
      {tableRows.map(row => {
        const asphaltVariance = row.actualAsphaltTons - row.estimatedAsphaltTons;
        const estimateSourcePresent = row.hasProductionRow || row.hasMasterRow;
        return (
          <tr key={row.jobNumber} className={`border-t border-[#DDE2E5] ${row.cleanForOperations ? 'hover:bg-[#FAFCFB]' : 'bg-[#FFF8ED] hover:bg-[#FFF3DC]'}`}>
            <td className="px-3 py-2">
              <Link href={`/jobs/${row.jobNumber}`} className="text-xs font-black text-[#20BC64] hover:underline">
                {row.jobNumber} · {row.jobName}
              </Link>
              {!row.cleanForOperations && (
                <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-[#B7791F]">
                  {row.issues[0]?.label || 'Unverified'}
                </div>
              )}
            </td>
            <td className="px-3 py-2 text-[11px] font-bold text-[#757A7F]">{row.pm || 'Missing'}</td>
            <td className="px-3 py-2 text-[11px] font-bold text-[#757A7F]">{row.status || 'Missing'}</td>
            <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{sourceValue(row.hasMasterRow, row.contractAmount, money)}</td>
            <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{sourceValue(estimateSourcePresent, row.estimatedGabTons, tons)}</td>
            <td className="px-3 py-2 text-right text-[11px] font-bold text-[#2563EB]">{sourceValue(row.hasProductionRow, row.actualGabTons, tons)}</td>
            <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{sourceValue(estimateSourcePresent, row.estimatedBinderTons, tons)}</td>
            <td className="px-3 py-2 text-right text-[11px] font-bold text-[#2563EB]">{sourceValue(row.hasProductionRow, row.actualBinderTons, tons)}</td>
            <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{sourceValue(estimateSourcePresent, row.estimatedToppingTons, tons)}</td>
            <td className="px-3 py-2 text-right text-[11px] font-bold text-[#2563EB]">{sourceValue(row.hasProductionRow, row.actualToppingTons, tons)}</td>
            <td className={`px-3 py-2 text-right text-[11px] font-bold ${row.hasProductionRow ? varianceTone(asphaltVariance) : 'text-[#E04343]'}`}>
              {sourceValue(row.hasProductionRow, asphaltVariance, tons)}
            </td>
            <td className="px-3 py-2 text-right text-[11px] font-bold text-[#3C4043]">{sourceValue(row.hasProductionRow, row.manHours, hours)}</td>
            <td className="px-3 py-2 text-right text-[11px] text-[#757A7F]">{sourceValue(row.hasQboRow, row.qboIncome, money)}</td>
            <td className={`px-3 py-2 text-right text-[11px] font-bold ${row.qboProfit >= 0 ? 'text-[#0F8F47]' : 'text-[#E04343]'}`}>
              {sourceValue(row.hasQboRow, row.qboProfit, money)}
            </td>
            <td className="px-3 py-2 text-right text-[11px] font-bold">{marginValue(row)}</td>
            <td className="px-3 py-2 text-right">
              <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-widest ${trustTone(row)}`}>
                {row.trustLabel}
              </span>
            </td>
          </tr>
        );
      })}
    </tbody>
  );

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

      <section className="mb-6 rounded-xl border border-[#DDE2E5] bg-white p-5">
        <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">What&apos;s Going On</p>
        <h2 className="text-xl font-black text-[#202325]">
          {exceptionRows.length
            ? `${exceptionRows.length} scorecard row(s) need review before the totals are trusted.`
            : 'Scorecard sources are aligned for the current rows.'}
        </h2>
        <p className="mt-2 max-w-5xl text-sm leading-relaxed text-[#6D7478]">
          Clean totals now exclude rows where QBO, production, and the master job index do not line up.
          Missing source rows show as Missing instead of fake zeroes. QBO money can still be seen, but it is marked unverified until the production or contract source is fixed.
        </p>
      </section>

      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-6">
        {kpis.map(kpi => (
          <div key={kpi.label} className="rounded-xl border border-[#DDE2E5] bg-white p-4">
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{kpi.label}</p>
            <p className="text-xl font-black text-[#3C4043]">{kpi.value}</p>
            <p className="mt-1 text-[9px] text-[#757A7F]">{kpi.note}</p>
          </div>
        ))}
      </div>

      <section className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#DDE2E5] bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Decisions Needed</h2>
            <span className="rounded-full bg-[#F1F3F4] px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{decisions.length} open</span>
          </div>
          <div className="space-y-3">
            {decisions.length ? decisions.map(decision => (
              <div key={decision.title} className="rounded-lg border border-[#F3D28A] bg-[#FEF3DB] p-3">
                <p className="text-sm font-black text-[#202325]">{decision.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#6D7478]">{decision.detail}</p>
                <div className="mt-2 grid gap-1 text-[11px] text-[#3C4043]">
                  <p><span className="font-black uppercase tracking-widest text-[#757A7F]">Owner:</span> {decision.owner}</p>
                  <p><span className="font-black uppercase tracking-widest text-[#757A7F]">Next:</span> {decision.action}</p>
                </div>
              </div>
            )) : (
              <p className="rounded-lg border border-[#DDE2E5] bg-[#FAFCFB] p-3 text-sm text-[#6D7478]">No scorecard decisions are blocked by source conflicts.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[#DDE2E5] bg-white p-5">
          <h2 className="mb-4 text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Source Proof</h2>
          <div className="grid gap-2 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-[#DDE2E5] p-3"><span>MASTER JOB INDEX</span><strong>{masterRows.length} rows</strong></div>
            <div className="flex items-center justify-between rounded-lg border border-[#DDE2E5] p-3"><span>Est vs Actual production</span><strong>{actualRows.length} rows</strong></div>
            <div className="flex items-center justify-between rounded-lg border border-[#DDE2E5] p-3"><span>QBO Est vs Actuals</span><strong>{qboRows.length} rows</strong></div>
            <div className="flex items-center justify-between rounded-lg border border-[#DDE2E5] p-3"><span>All joined rows</span><strong>{rows.length} rows</strong></div>
            <div className="rounded-lg border border-[#DDE2E5] p-3 text-xs text-[#6D7478]">QBO updated {qboUpdatedAt}. Clean totals use only rows where these sources agree.</div>
          </div>
        </div>
      </section>

      <section className="mb-6 overflow-hidden rounded-xl border border-[#DDE2E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#DDE2E5] px-5 py-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Data Exceptions</h2>
          <span className="text-[10px] font-bold uppercase text-[#757A7F]">{exceptionRows.length} rows</span>
        </div>
        {exceptionRows.length ? (
          <div className="divide-y divide-[#F1F3F4]">
            {exceptionRows.slice(0, 20).map(row => (
              <div key={row.jobNumber} className="grid gap-3 p-4 lg:grid-cols-[280px_1fr_auto]">
                <div>
                  <Link href={`/jobs/${row.jobNumber}`} className="text-sm font-black text-[#20BC64] hover:underline">{row.jobNumber} · {row.jobName}</Link>
                  <p className="mt-1 text-xs text-[#757A7F]">
                    PM: {row.pm || 'Missing'} · QBO {row.hasQboRow ? `revenue ${money(row.qboIncome)} / cost ${money(row.qboCost)} / profit ${money(row.qboProfit)}` : 'Missing'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {row.issues.map(issue => (
                    <div key={`${row.jobNumber}-${issue.label}`} className={`rounded-lg border px-3 py-2 ${issuePriorityTone(issue.severity)}`}>
                      <p className="text-[10px] font-black uppercase tracking-widest">{issue.severity} · {issue.label}</p>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed">{issue.detail}</p>
                      <p className="mt-1 text-[11px]"><strong>Fix:</strong> {issue.action}</p>
                    </div>
                  ))}
                </div>
                <Link href={`/jobs/${row.jobNumber}`} className="h-fit rounded-md border border-[#3C4043] px-3 py-2 text-center text-[10px] font-black uppercase tracking-widest text-[#3C4043] hover:bg-[#F1F3F4]">
                  Open Job
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-[#6D7478]">No data exceptions found.</p>
        )}
      </section>

      <div className="overflow-hidden rounded-xl border border-[#DDE2E5] bg-white">
        <div className="flex items-center justify-between border-b border-[#DDE2E5] px-5 py-4">
          <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">Clean Scorecard Data</h2>
          <span className="text-[10px] font-bold uppercase text-[#757A7F]">{cleanRows.length} verified jobs</span>
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
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Trust</th>
              </tr>
            </thead>
            {renderTableRows(cleanRows)}
          </table>
        </div>
      </div>

      <details className="mt-6 overflow-hidden rounded-xl border border-[#DDE2E5] bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-black uppercase tracking-widest text-[#3C4043]/70">
          Raw Joined Data - includes unverified rows
        </summary>
        <div className="overflow-x-auto border-t border-[#DDE2E5]">
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
                <th className="px-3 py-3 text-right text-[10px] font-black uppercase tracking-widest text-[#757A7F]">Trust</th>
              </tr>
            </thead>
            {renderTableRows(rows)}
          </table>
        </div>
      </details>
    </div>
  );
}
