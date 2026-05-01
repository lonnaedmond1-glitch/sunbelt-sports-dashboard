import Link from 'next/link';
import { EmptyState, HealthPill, KpiCard, PageShell, ProgressBar, Section } from '@/components/OperationsUI';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';
import { getGlobalWeather } from '@/app/api/weather/route';
import { fetchCrewDaysSold, fetchLiveJobs, fetchScheduleData } from '@/lib/sheets-data';

export const revalidate = 300;

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function clean(value: unknown, fallback = 'Missing'): string {
  const text = String(value || '').trim();
  return text || fallback;
}

function assignmentLabel(assignment: any): { job: string; scope: string; jobNumber?: string } | null {
  if (!assignment || assignment.decoded?.isOff) return null;
  return {
    job: clean(assignment.decoded?.jobRef || assignment.job, 'Unassigned'),
    scope: clean(assignment.decoded?.activity || assignment.decoded?.state, 'Scheduled'),
    jobNumber: assignment.ganttMatch?.jobNumber || '',
  };
}

function weatherForJob(weather: any, jobs: any[], jobText: string, date?: string) {
  const text = jobText.toLowerCase();
  for (const loc of weather.locations || []) {
    const locJobs = (loc.jobs || []).map((jobNumber: string) => {
      const job = jobs.find((j: any) => j.Job_Number === jobNumber);
      return `${jobNumber} ${job?.Job_Name || ''}`.toLowerCase();
    });
    if (!locJobs.some((label: string) => text.includes(label.split(' ')[0]) || label.includes(text.split(' ')[0]))) continue;
    const forecast = date ? (loc.forecasts || []).find((f: any) => f.date === date) : (loc.forecasts || [])[0];
    if (!forecast) return null;
    return forecast;
  }
  return null;
}

function renderHours(value: number | null | undefined, cap: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { label: 'Not reporting', pct: 0, tone: 'warning' as const };
  const pct = Math.round((value / cap) * 100);
  return {
    label: `${value.toFixed(1)}h left`,
    pct,
    tone: value <= 2 ? 'critical' as const : value <= 4 ? 'warning' as const : 'ok' as const,
  };
}

export default async function SchedulePage() {
  const [schedule, samsara, weather, jobs, crewDays] = await Promise.all([
    fetchScheduleData(),
    getGlobalSamsara(),
    getGlobalWeather(),
    fetchLiveJobs(),
    fetchCrewDaysSold(),
  ]);

  const lowboyVehicle = (samsara.vehicles || []).find((vehicle: any) => /lowboy|david/i.test(`${vehicle.name} ${vehicle.driver}`));
  const lowboyHos = (samsara.hos || []).find((hos: any) => /david|hudson/i.test(hos.driverName || ''));
  const drive = renderHours(lowboyHos?.driveRemainingHrs, 11);
  const shift = renderHours(lowboyHos?.shiftRemainingHrs, 14);
  const cycle = renderHours(lowboyHos?.cycleRemainingHrs, 60);
  const lowboyAssignments = [...(schedule.currentWeek?.days || []), ...(schedule.nextWeek?.days || [])]
    .flatMap((day: any) => (day.assignments || []).map((assignment: any) => ({ day, assignment })))
    .filter((row: any) => /lowboy|david/i.test(row.assignment?.crew || row.assignment?.job || ''))
    .slice(0, 4);
  const currentCrews = new Set<string>();
  (schedule.currentWeek?.days || []).forEach((day: any) => {
    (day.assignments || []).forEach((assignment: any) => {
      if (assignment?.crew && !assignment?.decoded?.isOff) currentCrews.add(assignment.crew);
    });
  });

  const renderWeek = (week: any, label: string) => {
    const crews = Array.from(new Set<string>((week?.days || []).flatMap((day: any) => (day.assignments || []).map((assignment: any) => String(assignment.crew || '')).filter(Boolean)))).sort();
    if (!week?.days?.length || crews.length === 0) {
      return <EmptyState title={`${label} has no schedule rows`} detail="The schedule source returned no crew assignments for this week." />;
    }

    return (
      <div className="overflow-x-auto">
        <table className="ops-table w-full min-w-[1000px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 px-4 py-3 text-left">Crew</th>
              {dayNames.map(day => {
                const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                return (
                  <th key={day} className="px-4 py-3 text-left">
                    <span>{day}</span>
                    <span className="block text-[11px] font-medium normal-case text-[#94A3B8]">{dayData?.dateDisplay || ''}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {crews.map(crew => (
              <tr key={crew}>
                <td className="sticky left-0 z-10 bg-white px-4 py-3 font-extrabold">{crew}</td>
                {dayNames.map(day => {
                  const dayData = week.days.find((d: any) => d.dayOfWeek === day);
                  const assignment = dayData?.assignments?.find((a: any) => a.crew === crew);
                  const label = assignmentLabel(assignment);
                  const wx = label ? weatherForJob(weather, jobs, label.job, dayData?.date) : null;
                  return (
                    <td key={`${crew}-${day}`} className={dayData?.isToday ? 'bg-[#DCFCE7]/35 px-4 py-3 align-top' : 'px-4 py-3 align-top'}>
                      {label ? (
                        <div className="max-w-[180px]">
                          <p className="font-extrabold text-[#0F172A]">{label.jobNumber || label.job}</p>
                          <p className="mt-1 text-xs font-semibold text-[#475569]">{label.scope}</p>
                          {wx ? (
                            <p className={`mt-2 text-xs font-bold ${wx.severe || wx.precipProb >= 40 ? 'text-[#DC2626]' : 'text-[#64748B]'}`}>
                              {wx.precipProb}% rain · {wx.high}/{wx.low}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-sm text-[#94A3B8]">No assignment</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <PageShell title="Schedule" question="Where is every crew, every day, this week and next?" updatedAt={schedule.timestamp ? new Date(schedule.timestamp).toLocaleString('en-US') : 'Live schedule'}>
      <Section title="Lowboy Command" kicker="David Hudson. One lowboy driver means this card cannot be empty.">
        <div className="grid gap-4 p-4 lg:grid-cols-4">
          <div className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">Current location</p>
            <p className="mt-2 font-extrabold text-[#0F172A]">{lowboyVehicle?.address || 'No lowboy GPS signal'}</p>
            <p className="mt-1 text-sm text-[#475569]">{lowboyVehicle ? `${Math.round(lowboyVehicle.speed || 0)} mph` : 'Samsara did not return lowboy location.'}</p>
          </div>
          {[{ title: 'Drive', data: drive }, { title: 'Shift', data: shift }, { title: 'Cycle', data: cycle }].map(item => (
            <div key={item.title} className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">{item.title}</p>
                <HealthPill label={item.data.label} tone={item.data.tone} />
              </div>
              <ProgressBar value={item.data.pct} tone={item.data.tone} />
            </div>
          ))}
        </div>
        <div className="border-t border-[rgba(31,41,55,0.15)] p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">Next lowboy moves</p>
          {lowboyAssignments.length === 0 ? (
            <p className="text-sm text-[#475569]">No lowboy moves found in the schedule source.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {lowboyAssignments.map((row: any) => (
                <div key={`${row.day.date}-${row.assignment.job}`} className="rounded-lg border border-[rgba(31,41,55,0.15)] p-3">
                  <p className="text-xs font-bold text-[#0BBE63]">{row.day.dayOfWeek} · {row.day.dateDisplay}</p>
                  <p className="mt-1 text-sm font-extrabold text-[#0F172A]">{row.assignment.decoded?.jobRef || row.assignment.job}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      <div className="my-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Crews Scheduled" value={currentCrews.size} context="This week" />
        <KpiCard label="Base / Site Work" value={crewDays.totals.stoneBaseDays + crewDays.totals.millMiscDays + crewDays.totals.curbDays} context="Booked crew days" />
        <KpiCard label="Paving Capacity" value={crewDays.totals.pavingDays} context="Booked paving days" />
        <KpiCard label="Weather Risks" value={(weather.alerts || []).length} context="Next 7 days" tone={(weather.alerts || []).length ? 'warning' : 'ok'} />
      </div>

      <div className="grid gap-6">
        <Section title="This Week" kicker={schedule.currentWeek?.label || 'Current week schedule'}>
          {renderWeek(schedule.currentWeek, 'This Week')}
        </Section>
        <Section title="Next Week" kicker={schedule.nextWeek?.label || 'Next week schedule'}>
          {renderWeek(schedule.nextWeek, 'Next Week')}
        </Section>
        <Section title="Loose Ends" kicker="Schedule items that still need a decision.">
          {(schedule.looseEnds || []).length === 0 ? (
            <EmptyState title="Nothing loose in the schedule" detail="No loose-end rows came back from the schedule source." />
          ) : (
            <div className="divide-y divide-[rgba(31,41,55,0.15)]">
              {(schedule.looseEnds || []).slice(0, 10).map((item: any, index: number) => (
                <div key={`${item.job || item.note}-${index}`} className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <p className="font-extrabold text-[#0F172A]">{clean(item.job || item.task || item.note, 'Schedule item')}</p>
                    <p className="text-sm text-[#475569]">{clean(item.owner || item.who, 'Owner missing')}</p>
                  </div>
                  {item.jobNumber ? <Link href={`/jobs/${item.jobNumber}`} className="rounded-full border border-[rgba(31,41,55,0.15)] px-3 py-1 text-xs font-extrabold">Open job</Link> : null}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
