import React from 'react';
import Link from 'next/link';
import {
  fetchLiveJobs,
  fetchScheduleData,
  fetchProjectScorecards,
  fetchQboFinancials,
  fetchArAging,
} from '@/lib/sheets-data';
import { formatDollars, formatDollarsCompact } from '@/lib/format';

export const revalidate = 86400; // Daily ISR

// ──────────────────────────── Helpers ────────────────────────────

function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function tomorrowISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
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

// ──────────────────────────── Page ────────────────────────────

export default async function DashboardPage() {
  const [liveJobs, schedule, scorecards, qbo, ar] = await Promise.all([
    fetchLiveJobs(),
    fetchScheduleData(),
    fetchProjectScorecards(),
    fetchQboFinancials(),
    fetchArAging(),
  ]);
  // scorecards fetched to keep cache warm / data parity — not rendered in this view.
  void scorecards;

  // ── Jobs derived metrics ──
  const jobs = (liveJobs || []) as any[];
  const executedJobs = jobs.filter((j) => String(j.Status).toLowerCase() === 'executed');
  const totalContract = executedJobs.reduce((s, j) => s + (j.Contract_Amount || 0), 0);
  const totalBilled = executedJobs.reduce((s, j) => s + (j.Billed_To_Date || 0), 0);

  // ── AR aging totals ──
  const arTotal = ar.totals.total || 0;
  const arBuckets: { label: string; amount: number }[] = [
    { label: 'Current', amount: ar.totals.current },
    { label: '1–30 days', amount: ar.totals.d1_30 },
    { label: '31–60 days', amount: ar.totals.d31_60 },
    { label: '61–90 days', amount: ar.totals.d61_90 },
    { label: '91+ days', amount: ar.totals.d91Plus },
  ];

  // ── Margin (weighted by Act_Income) ──
  let weightedMargin: number | null = null;
  if (qbo.length > 0) {
    const totIncome = qbo.reduce((s, j) => s + (j.Act_Income || 0), 0);
    if (totIncome > 0) {
      const weighted = qbo.reduce((s, j) => s + (j.Profit_Margin || 0) * (j.Act_Income || 0), 0);
      weightedMargin = Math.round((weighted / totIncome) * 10) / 10;
    } else {
      const sum = qbo.reduce((s, j) => s + (j.Profit_Margin || 0), 0);
      weightedMargin = Math.round((sum / qbo.length) * 10) / 10;
    }
  }

  // ── Today's crews ──
  const tISO = todayISO();
  const today = (schedule.currentWeek?.days || []).find((d: any) => d.date === tISO);
  const todaysAssignments = (today?.assignments || []).filter((a: any) => !a.decoded?.isOff);

  // ── Deliveries today + tomorrow ──
  const tomISO = tomorrowISO();
  const nearDeliveries = (schedule.deliveries || [])
    .filter((d: any) => d.date === tISO || d.date === tomISO)
    .sort((a: any, b: any) => a.date.localeCompare(b.date));

  // ── Biggest jobs by contract ──
  const topJobs = [...executedJobs]
    .sort((a, b) => (b.Contract_Amount || 0) - (a.Contract_Amount || 0))
    .slice(0, 8);

  // ── Schedule counts ──
  const scheduledCount = schedule.scheduledJobCount || 0;
  const ganttCount = schedule.ganttJobCount || 0;
  const openCount = Math.max(0, ganttCount - scheduledCount);

  return (
    <div className="min-h-screen font-body">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <header className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-display tracking-wide">Sunbelt Sports</h1>
            <p className="text-sm text-steel-grey mt-1">
              Live snapshot — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <nav className="flex gap-3 text-sm font-display tracking-wider">
            <Link href="/portfolio" className="text-iron-charcoal hover:text-sunbelt-green">Portfolio</Link>
            <span className="text-line-grey">·</span>
            <Link href="/schedule" className="text-iron-charcoal hover:text-sunbelt-green">Schedule</Link>
            <span className="text-line-grey">·</span>
            <Link href="/scorecard" className="text-iron-charcoal hover:text-sunbelt-green">Scorecard</Link>
          </nav>
        </header>

        {/* ZONE 2 — AT-A-GLANCE */}
        <section className="mb-8">
          <div className="mb-3"><span className="eyebrow">At A Glance</span></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Portfolio */}
            <div className="card card-padded">
              <p className="stat-label">Total Portfolio</p>
              <p className="stat-value mt-2">{formatDollarsCompact(totalContract)}</p>
              <p className="stat-sub mt-2">
                {formatDollarsCompact(totalBilled)} billed · {executedJobs.length} active
              </p>
            </div>

            {/* Cash Out */}
            <div className="card card-padded">
              <p className="stat-label">Cash Out</p>
              <p className="stat-value mt-2">{formatDollarsCompact(arTotal)}</p>
              <p className="stat-sub mt-2">
                {formatDollarsCompact(ar.totals.d91Plus)} past 90 days
              </p>
            </div>

            {/* Schedule Health */}
            <div className="card card-padded">
              <p className="stat-label">Schedule Health</p>
              <p className="stat-value mt-2 font-mono">
                {scheduledCount} / {ganttCount}
              </p>
              <p className="stat-sub mt-2">
                {scheduledCount} booked · {openCount} open
              </p>
            </div>

            {/* Margin */}
            <div className="card card-padded">
              <p className="stat-label">Margin</p>
              {weightedMargin === null ? (
                <>
                  <p className="stat-value mt-2 text-steel-grey">—</p>
                  <p className="stat-sub mt-2">No data yet</p>
                </>
              ) : (
                <>
                  <p className="stat-value mt-2">{weightedMargin.toFixed(1)}%</p>
                  <p className="stat-sub mt-2">{qbo.length} jobs reporting</p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ZONE 3 — LIVE FIELD */}
        <section className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Today's Crews */}
            <div className="card card-padded">
              <div className="mb-4"><span className="eyebrow">Today In The Field</span></div>
              {todaysAssignments.length === 0 ? (
                <p className="font-display text-xl text-steel-grey text-center py-10">No crews booked today</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left py-2">Crew</th>
                      <th className="text-left py-2">Job</th>
                      <th className="text-left py-2">PM</th>
                      <th className="text-left py-2">Supplier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaysAssignments.map((a: any, i: number) => (
                      <tr key={i} className="border-b border-line-grey last:border-0">
                        <td className="py-2 pr-2 text-iron-charcoal">{a.crew}</td>
                        <td className="py-2 pr-2 text-iron-charcoal">{truncate(a.decoded?.jobRef || a.job, 28)}</td>
                        <td className="py-2 pr-2 text-slate">{a.pm || '—'}</td>
                        <td className="py-2 text-slate">{a.supplierFull || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Deliveries */}
            <div className="card card-padded">
              <div className="mb-4"><span className="eyebrow">Delivery Board</span></div>
              {nearDeliveries.length === 0 ? (
                <p className="font-display text-xl text-steel-grey text-center py-10">No deliveries scheduled</p>
              ) : (
                <ul>
                  {nearDeliveries.map((d: any, i: number) => (
                    <li key={i} className={`flex items-start gap-4 py-3 ${i === 0 ? '' : 'border-t border-line-grey'}`}>
                      <span className="font-bold text-iron-charcoal whitespace-nowrap w-28 shrink-0">
                        {d.date === tISO ? 'Today' : d.date === tomISO ? 'Tomorrow' : prettyDate(d.date)}
                      </span>
                      <span className="text-sm text-slate flex-1">{d.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* ZONE 4 — MONEY HEALTH */}
        <section className="mb-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* AR Aging */}
            <div className="card card-padded">
              <div className="mb-4"><span className="eyebrow">Aging Buckets</span></div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="text-left py-2">Bucket</th>
                    <th className="text-right py-2">Amount</th>
                    <th className="text-right py-2">% of total</th>
                  </tr>
                </thead>
                <tbody>
                  {arBuckets.map((b) => {
                    const pct = arTotal > 0 ? (b.amount / arTotal) * 100 : 0;
                    return (
                      <tr key={b.label} className="border-b border-line-grey">
                        <td className="py-2 text-iron-charcoal">{b.label}</td>
                        <td className="py-2 text-right font-mono text-iron-charcoal">{formatDollars(b.amount)}</td>
                        <td className="py-2 text-right font-mono text-xs text-steel-grey">{pct.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                  <tr className="hairline">
                    <td className="py-3 font-display tracking-wider">Total</td>
                    <td className="py-3 text-right font-mono font-bold text-iron-charcoal">{formatDollars(arTotal)}</td>
                    <td className="py-3 text-right font-mono text-xs text-steel-grey">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Top Jobs */}
            <div className="card card-padded">
              <div className="mb-4"><span className="eyebrow">Top Jobs</span></div>
              {topJobs.length === 0 ? (
                <p className="font-display text-xl text-steel-grey text-center py-10">No executed jobs</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="table-header">
                      <th className="text-left py-2">Job #</th>
                      <th className="text-left py-2">Name</th>
                      <th className="text-left py-2">GC</th>
                      <th className="text-right py-2">Contract</th>
                      <th className="text-right py-2">Billed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topJobs.map((j) => {
                      const pct = j.Contract_Amount > 0 ? (j.Billed_To_Date / j.Contract_Amount) * 100 : 0;
                      return (
                        <tr key={j.Job_Number} className="border-b border-line-grey last:border-0">
                          <td className="py-2 pr-2">
                            <Link href={`/jobs/${j.Job_Number}`} className="text-sunbelt-green font-mono">
                              {j.Job_Number}
                            </Link>
                          </td>
                          <td className="py-2 pr-2 text-iron-charcoal">{truncate(j.Job_Name || '', 30)}</td>
                          <td className="py-2 pr-2 text-slate">{truncate(j.General_Contractor || '', 20)}</td>
                          <td className="py-2 text-right font-mono text-iron-charcoal whitespace-nowrap">
                            {formatDollars(j.Contract_Amount)}
                          </td>
                          <td className="py-2 text-right font-mono text-xs text-steel-grey pl-2 whitespace-nowrap">
                            {pct.toFixed(0)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
