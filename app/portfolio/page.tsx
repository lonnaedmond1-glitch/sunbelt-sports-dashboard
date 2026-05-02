import Link from 'next/link';
import { HealthPill, KpiCard, PageShell, ProgressBar, Section, moneyCompact } from '@/components/OperationsUI';
import { fetchLiveFieldReports, fetchLiveJobs } from '@/lib/sheets-data';
import { formatDollars } from '@/lib/format';
import { isTerminalJobStatus } from '@/lib/operations-contract';

export const revalidate = 300;

type SearchParams = {
  status?: string;
  pm?: string;
  state?: string;
  q?: string;
  showClosed?: string;
  view?: string;
};

function isClosed(job: any): boolean {
  return isTerminalJobStatus(job?.Job_Lifecycle_Status || job?.Status);
}

function clean(value: unknown, fallback = 'Missing'): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function latestReportByJob(reports: any[]) {
  const map = new Map<string, any>();
  reports.forEach(report => {
    const jobNumber = String(report.Job_Number || '').trim();
    if (!jobNumber) return;
    const existing = map.get(jobNumber);
    if (!existing || String(report.Date || '') > String(existing.Date || '')) map.set(jobNumber, report);
  });
  return map;
}

function getHealth(job: any, report: any): { label: string; tone: 'ok' | 'warning' | 'critical' | 'neutral'; rank: number } {
  const pct = Number(job.Pct_Complete || 0);
  const status = String(job.Status || '');
  if (/pending|signed|bid/i.test(status) || pct === 0) return { label: 'Not Started', tone: 'neutral', rank: 3 };
  if (!report) return { label: 'At Risk', tone: 'warning', rank: 1 };
  if (pct >= 95) return { label: 'Complete', tone: 'ok', rank: 4 };
  return { label: 'On Track', tone: 'ok', rank: 2 };
}

function queryLink(params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) q.set(key, value);
  });
  const s = q.toString();
  return s ? `/portfolio?${s}` : '/portfolio';
}

export default async function PortfolioPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const [allJobs, reports] = await Promise.all([fetchLiveJobs(), fetchLiveFieldReports()]);
  const reportMap = latestReportByJob(reports);
  const showClosed = params.showClosed === '1';
  const baseJobs = showClosed ? allJobs : allJobs.filter((job: any) => !isClosed(job));
  const decorated = baseJobs.map((job: any) => ({
    job,
    health: getHealth(job, reportMap.get(job.Job_Number)),
    state: clean(job.State, 'Unknown state'),
    pm: clean(job.Project_Manager, 'Owner missing'),
  }));

  const filtered = decorated.filter(({ job, health, state, pm }) => {
    const q = String(params.q || '').toLowerCase().trim();
    if (params.status && health.label !== params.status) return false;
    if (params.pm && pm !== params.pm) return false;
    if (params.state && state !== params.state) return false;
    if (q && !`${job.Job_Number} ${job.Job_Name}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const totalValue = baseJobs.reduce((sum: number, job: any) => sum + Number(job.Contract_Amount || 0), 0);
  const totalBilled = baseJobs.reduce((sum: number, job: any) => sum + Number(job.Billed_To_Date || 0), 0);
  const atRisk = decorated.filter(row => row.health.label === 'At Risk');
  const pmList = Array.from(new Set(decorated.map(row => row.pm))).sort();
  const stateList = Array.from(new Set(decorated.map(row => row.state))).sort();
  const view = params.view === 'table' ? 'table' : 'grid';

  return (
    <PageShell title="Portfolio" question="Which jobs are healthy and which are not?" updatedAt={`${reports.length} reports read`}>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Total Active Jobs" value={baseJobs.length} context={`${allJobs.length - baseJobs.length} closed hidden`} />
        <KpiCard label="Total Contract Value" value={moneyCompact(totalValue)} context="From live job source" />
        <KpiCard label="Billed To Date" value={moneyCompact(totalBilled)} context={`${totalValue ? Math.round((totalBilled / totalValue) * 100) : 0}% billed`} />
        <KpiCard label="At-Risk Jobs" value={atRisk.length} context="Started jobs missing report proof" tone={atRisk.length ? 'warning' : 'ok'} />
      </div>

      <Section title="Filters" kicker="Use these to narrow the job list before acting.">
        <div className="flex flex-wrap gap-3 p-4">
          {['All', 'Not Started', 'On Track', 'At Risk', 'Complete'].map(status => (
            <Link
              key={status}
              href={queryLink({ ...params, status: status === 'All' ? undefined : status })}
              className={`rounded-full border px-4 py-2 text-sm font-extrabold ${
                (status === 'All' && !params.status) || params.status === status
                  ? 'border-[#0BBE63] text-[#047857]'
                  : 'border-[rgba(31,41,55,0.15)] text-[#475569]'
              }`}
            >
              {status}
            </Link>
          ))}
          <Link href={queryLink({ ...params, view: view === 'grid' ? 'table' : 'grid' })} className="ml-auto rounded-full border border-[rgba(31,41,55,0.15)] px-4 py-2 text-sm font-extrabold text-[#0F172A]">
            {view === 'grid' ? 'Table View' : 'Card View'}
          </Link>
          <Link href={queryLink({ ...params, showClosed: showClosed ? undefined : '1' })} className="rounded-full border border-[rgba(31,41,55,0.15)] px-4 py-2 text-sm font-extrabold text-[#0F172A]">
            {showClosed ? 'Hide closed jobs' : 'Show closed jobs'}
          </Link>
        </div>
        <div className="grid gap-3 border-t border-[rgba(31,41,55,0.15)] p-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">PM</p>
            <div className="flex flex-wrap gap-2">
              {pmList.map(pm => <Link key={pm} href={queryLink({ ...params, pm })} className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#475569]">{pm}</Link>)}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">State</p>
            <div className="flex flex-wrap gap-2">
              {stateList.map(state => <Link key={state} href={queryLink({ ...params, state })} className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#475569]">{state}</Link>)}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Job Health" kicker={`${filtered.length} jobs shown. Click a job to open the detail page.`} className="mt-6">
        {view === 'grid' ? (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.sort((a, b) => a.health.rank - b.health.rank).map(({ job, health, state, pm }) => {
              const pct = Math.round(Number(job.Pct_Complete || 0));
              const gc = clean(job.General_Contractor, '');
              return (
                <Link key={job.Job_Number} href={`/jobs/${job.Job_Number}`} className="rounded-lg border border-[rgba(31,41,55,0.15)] bg-white p-4 hover:border-[#0BBE63]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="ops-display text-[24px] font-extrabold leading-none text-[#0BBE63]">{job.Job_Number}</p>
                      <p className="mt-1 font-extrabold text-[#0F172A]">{clean(job.Job_Name)}</p>
                    </div>
                    <HealthPill label={health.label} tone={health.tone} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs font-bold uppercase text-[#94A3B8]">GC</p>{gc ? <p>{gc}</p> : <HealthPill label="GC not assigned" tone="critical" />}</div>
                    <div><p className="text-xs font-bold uppercase text-[#94A3B8]">PM</p><p>{pm}</p></div>
                    <div><p className="text-xs font-bold uppercase text-[#94A3B8]">State</p><p>{state}</p></div>
                    <div><p className="text-xs font-bold uppercase text-[#94A3B8]">Contract</p><p className="font-extrabold">{formatDollars(job.Contract_Amount)}</p></div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-2 flex justify-between text-xs font-bold text-[#475569]"><span>Billed</span><span>{pct}%</span></div>
                    <ProgressBar value={pct} tone={health.tone} />
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ops-table w-full">
              <thead>
                <tr>
                  {['Job', 'Name', 'GC', 'PM', 'State', 'Status', 'Contract', 'Billed %', 'Health'].map(header => (
                    <th key={header} className="px-4 py-3 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ job, health, state, pm }) => (
                  <tr key={job.Job_Number}>
                    <td className="px-4 py-3"><Link href={`/jobs/${job.Job_Number}`} className="font-extrabold text-[#0BBE63]">{job.Job_Number}</Link></td>
                    <td className="px-4 py-3 font-bold">{clean(job.Job_Name)}</td>
                    <td className="px-4 py-3">{clean(job.General_Contractor, '') || <HealthPill label="GC not assigned" tone="critical" />}</td>
                    <td className="px-4 py-3">{pm}</td>
                    <td className="px-4 py-3">{state}</td>
                    <td className="px-4 py-3">{clean(job.Status)}</td>
                    <td className="ops-money px-4 py-3 font-bold">{formatDollars(job.Contract_Amount)}</td>
                    <td className="px-4 py-3">{Math.round(Number(job.Pct_Complete || 0))}%</td>
                    <td className="px-4 py-3"><HealthPill label={health.label} tone={health.tone} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </PageShell>
  );
}
