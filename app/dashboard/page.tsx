import Link from 'next/link';
import MapWrapper from '@/components/MapWrapper';
import { AlertCard, EmptyState, HealthPill, KpiCard, PageShell, Section, moneyCompact } from '@/components/OperationsUI';
import {
  fetchArAging,
  fetchCrewDaysSold,
  fetchLiveFieldReports,
  fetchLiveJobs,
  fetchQboFinancials,
  fetchReworkLog,
  fetchScheduleData,
} from '@/lib/sheets-data';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';
import { getGlobalWeather } from '@/app/api/weather/route';
import { formatDollars } from '@/lib/format';
import { isTerminalJobStatus } from '@/lib/operations-contract';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

type AlertItem = {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  owner?: string;
  href?: string;
  actionLabel?: string;
};

function isClosed(job: any): boolean {
  return isTerminalJobStatus(job?.Job_Lifecycle_Status || job?.Status);
}

function parseDate(value: string): number {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatFreshness(value?: string): string {
  if (!value) return 'Live by source';
  const parsed = parseDate(value);
  return parsed ? new Date(parsed).toLocaleString('en-US') : value;
}

function latestDate(values: string[]): string {
  const newest = values.map(parseDate).filter(Boolean).sort((a, b) => b - a)[0];
  return newest ? new Date(newest).toISOString() : '';
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

function currentCrewAssignments(schedule: any) {
  const today = schedule?.currentWeek?.days?.find((day: any) => day.isToday) || schedule?.currentWeek?.days?.[0];
  const assignments = today?.assignments || [];
  return assignments
    .filter((assignment: any) => assignment?.crew && !assignment?.decoded?.isOff)
    .slice(0, 8)
    .map((assignment: any) => ({
      crew: assignment.crew,
      job: assignment.decoded?.jobRef || assignment.job || 'No job named',
      scope: assignment.decoded?.activity || 'Scheduled',
    }));
}

export default async function DashboardPage() {
  const [jobs, reports, qboRows, ar, rework, schedule, crewDays, samsara, weather] = await Promise.all([
    fetchLiveJobs(),
    fetchLiveFieldReports(),
    fetchQboFinancials(),
    fetchArAging(),
    fetchReworkLog(),
    fetchScheduleData(),
    fetchCrewDaysSold(),
    getGlobalSamsara(),
    getGlobalWeather(),
  ]);

  const activeJobs = jobs.filter((job: any) => !isClosed(job));
  const reportMap = latestReportByJob(reports);
  const reportsMissing = activeJobs.filter((job: any) => {
    const pct = Number(job.Pct_Complete || 0);
    return pct > 0 && !reportMap.has(job.Job_Number);
  });

  const qboNegative = qboRows.filter(row => row.Profit < 0);
  const marginAtRisk = qboNegative.reduce((sum, row) => sum + Math.abs(row.Profit), 0);
  const ar91 = ar.totals.d91Plus;
  const weatherToday = (weather.alerts || []).filter((alert: any) => alert.isToday);
  const reworkCost = rework.reduce((sum, row) => sum + (row.Cost || 0), 0);

  const alerts: AlertItem[] = [
    ...(ar91 > 0 ? [{
      severity: 'CRITICAL' as const,
      title: `${formatDollars(ar91)} in A/R over 91 days`,
      detail: 'Cash collection needs attention before more work is released without payment movement.',
      owner: 'Office Ops',
      href: '/project-scorecard',
      actionLabel: 'Open Scorecard',
    }] : []),
    ...(reportsMissing.length > 0 ? [{
      severity: 'HIGH' as const,
      title: `${reportsMissing.length} active jobs missing field report proof`,
      detail: 'Production and margin cannot be trusted until field proof is current.',
      owner: 'PM team',
      href: '/portfolio',
      actionLabel: 'Open Jobs',
    }] : []),
    ...(weatherToday.length > 0 ? [{
      severity: 'HIGH' as const,
      title: `${weatherToday.length} weather risks today`,
      detail: 'Check schedule, crews, and material timing before crews lose production time.',
      owner: 'Operations',
      href: '/schedule',
      actionLabel: 'Open Schedule',
    }] : []),
    ...(qboNegative.length > 0 ? [{
      severity: 'HIGH' as const,
      title: `${qboNegative.length} jobs show negative QBO profit`,
      detail: `${formatDollars(marginAtRisk)} of negative profit is currently showing in QBO.`,
      owner: 'Finance',
      href: '/project-scorecard',
      actionLabel: 'Open Scorecard',
    }] : []),
    ...(samsara.configured && (samsara.vehicles || []).length === 0 ? [{
      severity: 'MEDIUM' as const,
      title: 'No Samsara vehicles reporting',
      detail: 'Fleet map and lowboy status cannot be trusted until vehicle locations return.',
      owner: 'Fleet',
      href: '/fleet',
      actionLabel: 'Open Fleet',
    }] : []),
  ];

  const criticals = alerts.filter(alert => alert.severity === 'CRITICAL');
  const actionQueue = alerts.slice(0, 5);
  const crewAssignments = currentCrewAssignments(schedule);
  const latestQbo = latestDate(qboRows.map(row => row.Updated_At));
  const mapJobs = activeJobs
    .filter((job: any) => job.Lat && job.Lng)
    .slice(0, 80);
  const vehicles = samsara.vehicles || [];

  return (
    <PageShell
      title="Command Center"
      question="What needs my attention right now?"
      updatedAt={formatFreshness(latestQbo || schedule.timestamp || samsara.timestamp)}
    >
      {criticals.length > 0 ? (
        <div className="mb-6 space-y-3">
          {criticals.slice(0, 3).map((alert, index) => (
            <AlertCard key={`${alert.title}-${index}`} {...alert} />
          ))}
          {criticals.length > 3 ? (
            <p className="text-sm font-bold text-[#475569]">+{criticals.length - 3} more critical items in the action queue.</p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Critical Alerts" value={criticals.length} context={`${alerts.length} total issues in queue`} tone={criticals.length ? 'critical' : 'ok'} />
        <KpiCard label="Margin at Risk" value={moneyCompact(marginAtRisk)} context={`${qboNegative.length} negative-profit jobs`} tone={marginAtRisk ? 'critical' : 'ok'} />
        <KpiCard label="A/R 91+ Days" value={moneyCompact(ar91)} context={`${ar.rows.length} A/R rows read`} tone={ar91 ? 'critical' : 'ok'} />
        <KpiCard label="Reports Missing" value={reportsMissing.length} context={`${reports.length} reports read`} tone={reportsMissing.length ? 'warning' : 'ok'} />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
        <Section
          title="Live Map"
          kicker={`${mapJobs.length} active jobs with coordinates. ${vehicles.length} fleet pins from Samsara.`}
          className="min-h-[560px]"
        >
          <div className="h-[500px]">
            <MapWrapper jobs={mapJobs} vehicles={vehicles} />
          </div>
        </Section>

        <Section title="Today's Action Queue" kicker="Only items that need a decision or follow-up.">
          {actionQueue.length === 0 ? (
            <EmptyState title="Nothing needs attention" detail="No critical A/R, field report, weather, QBO, or fleet issue is currently showing." />
          ) : (
            <div className="divide-y divide-[rgba(31,41,55,0.15)]">
              {actionQueue.map((item, index) => (
                <div key={`${item.title}-${index}`} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <HealthPill label={item.severity} tone={item.severity === 'CRITICAL' ? 'critical' : item.severity === 'HIGH' ? 'warning' : 'neutral'} />
                    {item.href ? (
                      <Link href={item.href} className="rounded-full border border-[rgba(31,41,55,0.15)] px-3 py-1 text-xs font-extrabold text-[#0F172A]">
                        {item.actionLabel || 'Open'}
                      </Link>
                    ) : null}
                  </div>
                  <p className="mt-3 font-extrabold text-[#0F172A]">{item.title}</p>
                  <p className="mt-1 text-sm text-[#475569]">{item.detail}</p>
                  <p className="mt-2 text-xs font-bold text-[#64748B]">Owner: {item.owner || 'Owner missing'}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Crew Status Strip" kicker="Current schedule view from the live schedule source.">
        {crewAssignments.length === 0 ? (
          <EmptyState title="No crew assignments found for today" detail="The schedule source did not return a crew assignment row for today." />
        ) : (
          <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
            {crewAssignments.map((assignment: any) => (
              <div key={`${assignment.crew}-${assignment.job}`} className="rounded-lg border border-[rgba(31,41,55,0.15)] bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">{assignment.crew}</p>
                <p className="mt-2 font-extrabold text-[#0F172A]">{assignment.job}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-[#475569]">{assignment.scope}</span>
                  <HealthPill label="Scheduled" tone="ok" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <Section title="Money Board" kicker="Cash and profit items that can change decisions.">
          <div className="space-y-3 p-4 text-sm">
            <div className="flex justify-between"><span>A/R total</span><strong>{formatDollars(ar.totals.total)}</strong></div>
            <div className="flex justify-between"><span>Negative QBO profit</span><strong>{formatDollars(marginAtRisk)}</strong></div>
            <div className="flex justify-between"><span>Rework logged</span><strong>{formatDollars(reworkCost)}</strong></div>
          </div>
        </Section>
        <Section title="Capacity Signal" kicker="Moved to Schedule, summarized here.">
          <div className="space-y-3 p-4 text-sm">
            <div className="flex justify-between"><span>Base / site work days</span><strong>{crewDays.totals.stoneBaseDays + crewDays.totals.millMiscDays + crewDays.totals.curbDays}</strong></div>
            <div className="flex justify-between"><span>Paving days</span><strong>{crewDays.totals.pavingDays}</strong></div>
            <div className="flex justify-between"><span>Scheduled jobs</span><strong>{schedule.scheduledJobCount || 0}</strong></div>
          </div>
        </Section>
        <Section title="Source Proof" kicker="Main sources used on this page.">
          <div className="space-y-2 p-4 text-sm text-[#475569]">
            <p>Jobs: {activeJobs.length} active rows</p>
            <p>Reports: {reports.length} field report rows</p>
            <p>QBO: {qboRows.length} job financial rows</p>
            <p>Fleet: {vehicles.length} vehicle pins</p>
            <p>Weather: {(weather.alerts || []).length} risk alerts</p>
          </div>
        </Section>
      </div>
    </PageShell>
  );
}
