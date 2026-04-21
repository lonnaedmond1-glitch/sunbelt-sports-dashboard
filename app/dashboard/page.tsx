import React from 'react';
import Link from 'next/link';
import {
  fetchMasterJobs,
  fetchScheduleData,
  fetchArAging,
} from '@/lib/sheets-data';
import { formatDollars, formatDollarsCompact } from '@/lib/format';

export const revalidate = 300; // 5-min ISR

function todayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}
function tomorrowISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}
function truncate(s: string, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
function prettyDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default async function DashboardPage() {
  const [masterJobs, schedule, ar] = await Promise.all([
    fetchMasterJobs(),
    fetchScheduleData(),
    fetchArAging(),
  ]);

  // ── Portfolio metrics (from Master Jobs Sheet Jobs tab) ──
  const activeJobs = masterJobs.filter(j => {
    const s = j.Status.toLowerCase();
    return s === 'active' || s === 'executed' || s === 'in progress';
  });
  const totalPortfolio = activeJobs.reduce((s, j) => s + (j.Est_Cost || 0), 0);

  // ── AR metrics ──
  const arTotal = ar.totals.total || 0;
  const arPast90 = ar.rows.filter(r => r.Days_Outstanding > 90);
  const arAlerts = ar.rows
    .filter(r => r.Days_Outstanding > 60)
    .sort((a, b) => b.Days_Outstanding - a.Days_Outstanding);

  // ── Today's crews ──
  const tISO = todayISO();
  const tomISO = tomorrowISO();
  const today = (schedule.currentWeek?.days || []).find((d: any) => d.date === tISO);
  const todaysAssignments = (today?.assignments || []).filter((a: any) => !a.decoded?.isOff);

  // ── Deliveries today + tomorrow ──
  const nearDeliveries = (schedule.deliveries || [])
    .filter((d: any) => d.date === tISO || d.date === tomISO)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  // ── Job health table (active jobs sorted by Est_Cost desc, top 10) ──
  const healthJobs = [...activeJobs]
    .sort((a, b) => (b.Est_Cost || 0) - (a.Est_Cost || 0))
    .slice(0, 10);

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="min-h-screen font-body">
      <div className="max-w-[1400px] mx-auto px-6 py-8">

        {/* Header */}
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-display tracking-wide">Sunbelt Sports Construction</h1>
            <p className="text-sm text-steel-grey mt-1">{dateLabel}</p>
          </div>
          <nav className="flex gap-3 text-sm font-display tracking-wider">
            <Link href="/portfolio" className="text-iron-charcoal hover:text-sunbelt-green">Portfolio</Link>
            <span className="text-line-grey">·</span>
            <Link href="/schedule" className="text-iron-charcoal hover:text-sunbelt-green">Schedule</Link>
            <span className="text-line-grey">·</span>
            <Link href="/scorecard" className="text-iron-charcoal hover:text-sunbelt-green">Scorecard</Link>
          </nav>
        </header>

        {/* Stat pills */}
        <div className="flex flex-wrap gap-6 mb-8 text-sm">
          <div>
            <span className="font-display text-2xl tracking-wide text-iron-charcoal">
              {totalPortfolio > 0 ? formatDollarsCompact(totalPortfolio) : '—'}
            </span>
            <span className="text-steel-grey ml-2">portfolio</span>
          </div>
          <span className="text-line-grey self-center">·</span>
          <div>
            <span className="font-display text-2xl tracking-wide text-iron-charcoal">
              {activeJobs.length}
            </span>
            <span className="text-steel-grey ml-2">active jobs</span>
          </div>
          <span className="text-line-grey self-center">·</span>
          <div>
            <span className="font-display text-2xl tracking-wide text-iron-charcoal">
              {arTotal > 0 ? formatDollarsCompact(arTotal) : '—'}
            </span>
            <span className="text-steel-grey ml-2">AR out</span>
          </div>
          <span className="text-line-grey self-center">·</span>
          <div>
            <span className="font-display text-2xl tracking-wide"
              style={{ color: arPast90.length > 0 ? '#D8392B' : 'inherit' }}>
              {arPast90.length}
            </span>
            <span className="text-steel-grey ml-2">invoices past 90d</span>
          </div>
        </div>

        {/* TODAY IN THE FIELD */}
        <section className="mb-8">
          <div className="mb-3"><span className="eyebrow">Today In The Field</span></div>
          <div className="card overflow-hidden">
            {todaysAssignments.length === 0 ? (
              <p className="font-display text-lg text-steel-grey text-center py-10">No crews scheduled today</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="text-left px-4 py-3">Crew</th>
                    <th className="text-left px-4 py-3">Job</th>
                    <th className="text-left px-4 py-3">PM</th>
                    <th className="text-left px-4 py-3">Supplier</th>
                  </tr>
                </thead>
                <tbody>
                  {todaysAssignments.map((a: any, i: number) => (
                    <tr key={i} className="border-b border-line-grey last:border-0">
                      <td className="px-4 py-2 font-display tracking-wider text-iron-charcoal">{a.crew}</td>
                      <td className="px-4 py-2 text-iron-charcoal">{truncate(a.decoded?.jobRef || a.job, 36)}</td>
                      <td className="px-4 py-2 text-slate">{a.pm || '—'}</td>
                      <td className="px-4 py-2 text-slate">{a.supplierFull || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* JOB HEALTH + AR ALERTS + DELIVERIES */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* JOB HEALTH */}
          <section>
            <div className="mb-3"><span className="eyebrow">Job Health</span></div>
            <div className="card overflow-hidden">
              {healthJobs.length === 0 ? (
                <p className="font-display text-lg text-steel-grey text-center py-10">No active jobs</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left px-4 py-3">Job #</th>
                      <th className="text-left px-4 py-3">Name</th>
                      <th className="text-left px-4 py-3">PM</th>
                      <th className="text-right px-4 py-3">Est. Cost</th>
                      <th className="text-right px-4 py-3">Progress</th>
                    </tr>
                  </thead>
                  <tbody>
                    {healthJobs.map((j) => {
                      const pct = j.Est_Cost > 0 ? Math.min(100, Math.round((j.Actual_Cost / j.Est_Cost) * 100)) : 0;
                      const hasActual = j.Actual_Cost > 0;
                      return (
                        <tr key={j.Job_Number} className="border-b border-line-grey last:border-0">
                          <td className="px-4 py-2">
                            <Link href={`/jobs/${j.Job_Number}`} className="text-sunbelt-green font-mono text-xs">
                              {j.Job_Number}
                            </Link>
                          </td>
                          <td className="px-4 py-2 text-iron-charcoal">{truncate(j.Job_Name, 26)}</td>
                          <td className="px-4 py-2 text-slate text-xs">{j.PM || '—'}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-iron-charcoal whitespace-nowrap">
                            {formatDollarsCompact(j.Est_Cost)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {hasActual ? (
                              <div className="flex items-center gap-2 justify-end">
                                <div className="w-14 h-1.5 bg-mist-grey rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-sunbelt-green" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="font-mono text-xs text-steel-grey w-8 text-right">{pct}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-steel-grey">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN */}
          <div className="flex flex-col gap-6">

            {/* AR ALERTS */}
            <section>
              <div className="mb-3"><span className="eyebrow">AR Alerts</span></div>
              <div className="card overflow-hidden">
                {arAlerts.length === 0 ? (
                  <p className="font-display text-lg text-steel-grey text-center py-8">
                    No invoices past 60 days
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="table-header">
                        <th className="text-left px-4 py-3">Days</th>
                        <th className="text-left px-4 py-3">Customer</th>
                        <th className="text-left px-4 py-3">Invoice #</th>
                        <th className="text-right px-4 py-3">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {arAlerts.slice(0, 6).map((r, i) => (
                        <tr key={i} className="border-b border-line-grey last:border-0">
                          <td className="px-4 py-2">
                            <span className="font-mono text-xs font-bold"
                              style={{ color: r.Days_Outstanding > 90 ? '#D8392B' : '#E8892B' }}>
                              {r.Days_Outstanding}d
                            </span>
                          </td>
                          <td className="px-4 py-2 text-iron-charcoal">{truncate(r.Customer, 22)}</td>
                          <td className="px-4 py-2 text-steel-grey font-mono text-xs">{r.Invoice_Number || '—'}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-iron-charcoal whitespace-nowrap">
                            {formatDollars(r.Amount_Due)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            {/* DELIVERIES */}
            <section>
              <div className="mb-3"><span className="eyebrow">Delivery Board</span></div>
              <div className="card card-padded">
                {nearDeliveries.length === 0 ? (
                  <p className="font-display text-lg text-steel-grey text-center py-6">No deliveries scheduled</p>
                ) : (
                  <ul>
                    {nearDeliveries.map((d: any, i: number) => (
                      <li key={i} className={`flex items-start gap-4 py-3 ${i === 0 ? '' : 'border-t border-line-grey'}`}>
                        <span className="font-display tracking-wider text-iron-charcoal whitespace-nowrap w-24 shrink-0 text-sm">
                          {d.date === tISO ? 'Today' : d.date === tomISO ? 'Tomorrow' : prettyDate(d.date)}
                        </span>
                        <span className="text-sm text-slate flex-1">{d.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

          </div>
        </div>

      </div>
    </div>
  );
}
