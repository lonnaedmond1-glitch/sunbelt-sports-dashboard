import React from 'react';
import Link from 'next/link';
import { fetchScheduleData, fetchLiveJobs } from '@/lib/sheets-data';

export const revalidate = 86400;

type Assignment = {
  crew: string;
  crewType: string;
  job: string;
  pm: string;
  decoded: { jobRef: string; activity: string; state: string; supplier: string; raw: string; isOff: boolean };
  supplierFull: string;
  ganttMatch: { jobNumber: string; projectType: string; start: string; end: string } | null;
};

type Day = { date: string; dateDisplay: string; dayOfWeek: string; assignments: Assignment[]; isToday: boolean };

const PRIMARY_CREWS = ['Rosendo / P1', 'Julio / B1', 'Martin / B2', 'Juan / B3', 'Cesar', 'Pedro', 'Giovany (NC)', 'Marcos (NC)'];

const activityPill = (activity: string): string => {
  const a = (activity || '').toLowerCase();
  if (a.includes('pav')) return 'pill pill-success';
  if (a.includes('stone') || a.includes('base')) return 'pill pill-warning';
  if (a.includes('mill') || a.includes('demo')) return 'pill pill-danger';
  if (a.includes('curb') || a.includes('concrete')) return 'pill pill-info';
  return 'pill pill-neutral';
};

function groupByWeek(days: Day[]): { label: string; start: string; days: Day[] }[] {
  if (!days.length) return [];
  const byWeek = new Map<string, Day[]>();
  for (const d of days) {
    const date = new Date(d.date + 'T00:00:00');
    const day = date.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(date);
    monday.setDate(date.getDate() + mondayOffset);
    const key = monday.toISOString().split('T')[0];
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(d);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([start, wkDays]) => {
      const m = new Date(start + 'T00:00:00');
      return { start, label: `Week of ${m.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, days: wkDays.sort((a, b) => a.date.localeCompare(b.date)) };
    });
}

export default async function SchedulePage() {
  const [schedule, jobs] = await Promise.all([fetchScheduleData(), fetchLiveJobs()]);

  const todayISO = new Date().toISOString().split('T')[0];
  const allDays: Day[] = (schedule as any).allDays || [];
  const futureDays = allDays.filter(d => d.date >= todayISO);

  const todayEntry = allDays.find(d => d.date === todayISO);
  const todayAssignments = (todayEntry?.assignments || []).filter(a => !a.decoded?.isOff);

  const weeks = groupByWeek(futureDays);

  const totalScheduledDays = allDays.length;
  const scheduledJobCount = (schedule as any).scheduledJobCount || 0;
  const ganttJobCount = (schedule as any).ganttJobCount || 0;
  const unscheduledJobs = Math.max(0, ganttJobCount - scheduledJobCount);

  const jobNumberByRef = new Map<string, string>();
  for (const j of jobs as any[]) {
    if (j?.Job_Name) jobNumberByRef.set(j.Job_Name.toLowerCase(), j.Job_Number);
  }

  const resolveJobNumber = (a: Assignment): string | null => {
    if (a.ganttMatch?.jobNumber) return a.ganttMatch.jobNumber;
    const ref = (a.decoded?.jobRef || '').toLowerCase();
    for (const [name, num] of jobNumberByRef) {
      if (name && ref.includes(name.split(' ')[0])) return num;
    }
    return null;
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Schedule</span>
            <h1 className="text-4xl font-display mt-2">Who Is Where</h1>
            <p className="text-steel-grey text-sm mt-1">
              Source: Sports Level 10 → Schedule tab. {totalScheduledDays} days in the rolling window.
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="card card-padded">
            <p className="stat-label">Booked Today</p>
            <p className="stat-value font-mono">{todayAssignments.length}</p>
            <p className="stat-sub">{todayEntry?.dateDisplay || new Date().toDateString()}</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Days On Books</p>
            <p className="stat-value font-mono">{futureDays.length}</p>
            <p className="stat-sub">from today forward</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Jobs Scheduled</p>
            <p className="stat-value font-mono">{scheduledJobCount}</p>
            <p className="stat-sub">of {ganttJobCount} open</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Not Yet Booked</p>
            <p className="stat-value font-mono" style={{ color: unscheduledJobs > 0 ? '#E8892B' : '#198754' }}>{unscheduledJobs}</p>
            <p className="stat-sub">jobs without dates</p>
          </div>
        </div>

        {todayEntry && (
          <section className="mb-8">
            <span className="eyebrow">Today</span>
            <div className="card card-padded mt-3">
              <h2 className="text-2xl font-display mb-4">{todayEntry.dayOfWeek} · {todayEntry.dateDisplay}</h2>
              {todayAssignments.length === 0 ? (
                <p className="text-steel-grey text-sm py-8 text-center">No crews booked today.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header text-left px-4 py-2">Crew</th>
                      <th className="table-header text-left px-4 py-2">Job</th>
                      <th className="table-header text-left px-4 py-2">Activity</th>
                      <th className="table-header text-left px-4 py-2">Supplier</th>
                      <th className="table-header text-left px-4 py-2">PM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todayAssignments.map((a, i) => {
                      const jobNum = resolveJobNumber(a);
                      return (
                        <tr key={i} className="table-row-zebra border-b border-line-grey">
                          <td className="px-4 py-3 font-medium">{a.crew}</td>
                          <td className="px-4 py-3">
                            {jobNum ? (
                              <Link href={`/jobs/${jobNum}`} className="text-sunbelt-green font-display tracking-wider hover:underline">{jobNum}</Link>
                            ) : null}
                            <span className="ml-2">{a.decoded?.jobRef}</span>
                          </td>
                          <td className="px-4 py-3">
                            {a.decoded?.activity && <span className={activityPill(a.decoded.activity)}>{a.decoded.activity}</span>}
                          </td>
                          <td className="px-4 py-3 text-steel-grey text-xs">{a.supplierFull || a.decoded?.supplier}</td>
                          <td className="px-4 py-3 text-steel-grey text-xs">{a.pm}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        )}

        {weeks.map(week => (
          <section key={week.start} className="mb-8">
            <span className="eyebrow">{week.label}</span>
            <div className="card mt-3 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <th className="table-header text-left px-4 py-2 w-28">Day</th>
                      {PRIMARY_CREWS.map(c => (
                        <th key={c} className="table-header text-left px-3 py-2 whitespace-nowrap">{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {week.days.map(day => {
                      const byCrew = new Map<string, Assignment>();
                      for (const a of day.assignments) {
                        if (!byCrew.has(a.crew)) byCrew.set(a.crew, a);
                      }
                      return (
                        <tr key={day.date} className={`border-b border-line-grey ${day.isToday ? 'bg-sunbelt-green-light/50' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="font-display tracking-wider text-sm">{day.dayOfWeek}</span>
                            <span className="block text-xs text-steel-grey font-mono">{day.dateDisplay}</span>
                          </td>
                          {PRIMARY_CREWS.map(c => {
                            const a = byCrew.get(c);
                            if (!a || a.decoded?.isOff) {
                              return <td key={c} className="px-3 py-3 text-steel-grey/50 text-xs">—</td>;
                            }
                            const jobNum = resolveJobNumber(a);
                            return (
                              <td key={c} className="px-3 py-3">
                                <div className="text-xs font-medium truncate max-w-[150px]" title={a.job}>
                                  {jobNum ? (
                                    <Link href={`/jobs/${jobNum}`} className="text-sunbelt-green">{jobNum}</Link>
                                  ) : null}{' '}
                                  <span>{a.decoded?.jobRef}</span>
                                </div>
                                {a.decoded?.activity && (
                                  <span className={`${activityPill(a.decoded.activity)} mt-1`}>{a.decoded.activity}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}

        {weeks.length === 0 && (
          <div className="card card-padded text-center py-16">
            <p className="text-steel-grey text-sm">No future days scheduled in the window.</p>
          </div>
        )}
      </div>
    </div>
  );
}
