import React from 'react';
import Link from 'next/link';
import {
  fetchLiveJobs,
  fetchLiveFieldReports,
  fetchScheduleData,
  fetchProjectScorecards,
  fetchQboFinancials,
  fetchArAging,
  fetchReworkLog,
} from '@/lib/sheets-data';
export const revalidate = 3600;

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers kept inside the file so this page is a clean, standalone V1
// preview that doesn't touch the existing /dashboard code path.
// ─────────────────────────────────────────────────────────────────────────────

function fmtDollars(n: number): string {
  if (!n) return '$0';
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtPct(n: number): string {
  if (!isFinite(n)) return '—';
  return `${Math.round(n * 100)}%`;
}

function daysSince(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function todayISO(): string {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isJobClosed(j: any): boolean {
  const s = (j.Job_Status || j.Status || '').toLowerCase();
  return s.includes('closed') || s.includes('complete') || s.includes('done');
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function DashboardRedesign() {
  const [jobs, fieldReports, scheduleData, scorecards, qbo, arAging, reworkLog] = await Promise.all([
    fetchLiveJobs(),
    fetchLiveFieldReports(),
    fetchScheduleData(),
    fetchProjectScorecards(),
    fetchQboFinancials(),
    fetchArAging(),
    fetchReworkLog(),
  ]);

  // ── Derive: report map ────────────────────────────────────────────────────
  const reportMap: Record<string, any> = {};
  for (const r of fieldReports) reportMap[r.Job_Number] = r;

  // ── Derive: active jobs + portfolio totals ────────────────────────────────
  const activeJobs = (jobs as any[]).filter((j) => !isJobClosed(j));
  const activeContractTotal = activeJobs.reduce(
    (s, j) => s + (Number(j.Contract_Amount) || 0),
    0,
  );
  const totalPortfolio = (jobs as any[]).reduce(
    (s, j) => s + (Number(j.Contract_Amount) || 0),
    0,
  );
  const totalBilled = (jobs as any[]).reduce(
    (s, j) => s + (Number(j.Billed_To_Date) || 0),
    0,
  );
  const billedPct = totalPortfolio > 0 ? totalBilled / totalPortfolio : 0;

  // ── Derive: A/R at risk (91+ days) ────────────────────────────────────────
  const arRows = arAging?.rows || [];
  const arOver90 = arAging?.totals?.d91Plus || 0;
  const arTotal = arAging?.totals?.total || 0;
  const arOver90Count = arRows.filter((r) => (Number(r.Days_91_Plus) || 0) > 0).length;

  // ── Derive: portfolio margin (QBO + WIP contract) ─────────────────────────
  const wipLookup = new Map<string, any>(
    (jobs as any[]).map((j) => [j.Job_Number, j]),
  );
  const qboWip = (qbo as any[])
    .filter((q) => q.Job_Number && wipLookup.has(q.Job_Number))
    .map((q) => {
      const wip = wipLookup.get(q.Job_Number);
      const contract = Number(wip?.Contract_Amount) || 0;
      const estIncome = q.Est_Income > 0 ? q.Est_Income : contract;
      const profit = estIncome > 0 ? estIncome - q.Act_Cost : q.Profit;
      const margin = estIncome > 0 ? profit / estIncome : q.Profit_Margin;
      return { ...q, Est_Income: estIncome, Profit: profit, Profit_Margin: margin };
    });
  const qboActive = qboWip.filter((q) => q.Est_Income > 0);
  const totalIncome = qboActive.reduce((s, q) => s + q.Est_Income, 0);
  const totalProfit = qboActive.reduce((s, q) => s + q.Profit, 0);
  const avgMargin = totalIncome > 0 ? totalProfit / totalIncome : 0;

  const lossJobs = qboWip.filter((q) => q.Profit < 0);
  const marginAtRiskDollars = lossJobs.reduce((s, q) => s + Math.abs(q.Profit), 0);

  // ── Derive: rework totals ─────────────────────────────────────────────────
  const reworkYtd = reworkLog.reduce((s, r) => s + (Number(r.Cost) || 0), 0);
  const reworkCount = reworkLog.length;

  // ── Derive: live field view per active job ────────────────────────────────
  const today = todayISO();
  const todaySchedule = (scheduleData?.currentWeek?.days || []).find(
    (d: any) => d.date === today,
  );
  const scheduledTodayJobRefs: string[] = [];
  if (todaySchedule) {
    for (const a of todaySchedule.assignments || []) {
      if (a.decoded?.isOff) continue;
      scheduledTodayJobRefs.push((a.decoded?.jobRef || a.job || '').toLowerCase());
    }
  }
  function isOnScheduleToday(job: any): boolean {
    const name = (job.Job_Name || '').toLowerCase();
    if (!name || name.length < 4) return false;
    const firstWord = name.split(' ')[0];
    return scheduledTodayJobRefs.some((ref) => ref.includes(firstWord));
  }

  // Attention cards: actionable items only
  type AttentionCard = {
    severity: 'danger' | 'warning';
    title: string;
    detail: string;
    cta?: string;
    href?: string;
  };
  const attention: AttentionCard[] = [];

  // Trigger 1: A/R over 90 days > $50K
  if (arOver90 > 50_000) {
    attention.push({
      severity: 'danger',
      title: `${fmtDollars(arOver90)} unpaid over 90 days`,
      detail: `${arOver90Count} customer${arOver90Count === 1 ? '' : 's'} past due`,
      cta: 'Open A/R',
      href: '/portfolio',
    });
  }

  // Trigger 2: jobs scheduled today with no field report yet
  const scheduledNoReport = activeJobs.filter(
    (j) => isOnScheduleToday(j) && !reportMap[j.Job_Number],
  );
  if (scheduledNoReport.length > 0) {
    attention.push({
      severity: 'warning',
      title: `${scheduledNoReport.length} job${scheduledNoReport.length === 1 ? '' : 's'} on schedule today — no field report yet`,
      detail: scheduledNoReport
        .slice(0, 3)
        .map((j) => j.Job_Name)
        .join(' · '),
      cta: 'See schedule',
      href: '/schedule',
    });
  }

  // Trigger 3: loss jobs (QBO profit negative)
  if (lossJobs.length > 0) {
    const worst = [...lossJobs].sort((a, b) => a.Profit - b.Profit)[0];
    attention.push({
      severity: 'danger',
      title: `${lossJobs.length} job${lossJobs.length === 1 ? '' : 's'} running at a loss`,
      detail: `Worst: ${worst.Job_Name || worst.Job_Number} · ${fmtDollars(worst.Profit)}`,
      cta: 'Open Portfolio',
      href: '/portfolio',
    });
  }

  // Trigger 4: stale field reports on active jobs (>3 days, job not closed)
  const staleJobs = activeJobs
    .map((j) => {
      const r = reportMap[j.Job_Number];
      const d = daysSince(r?.Last_Report_Date);
      return { j, r, d };
    })
    .filter(
      (x) => x.r && x.d !== null && x.d > 3 && (Number(x.j.Contract_Amount) || 0) > 100_000,
    );
  if (staleJobs.length > 0) {
    attention.push({
      severity: 'warning',
      title: `${staleJobs.length} active job${staleJobs.length === 1 ? '' : 's'} with no report in 3+ days`,
      detail: staleJobs
        .slice(0, 3)
        .map((x) => `${x.j.Job_Name} (${x.d}d)`)
        .join(' · '),
      cta: 'Open Jobs',
      href: '/portfolio',
    });
  }

  // Cap at 4 to keep Zone 1 focused
  const attentionTop = attention.slice(0, 4);

  // ── Derive: Live Field rows (top 8 active jobs by contract) ──────────────
  const liveFieldRows = [...activeJobs]
    .sort((a, b) => (Number(b.Contract_Amount) || 0) - (Number(a.Contract_Amount) || 0))
    .slice(0, 8)
    .map((j) => {
      const r = reportMap[j.Job_Number];
      const d = daysSince(r?.Last_Report_Date);
      const onScheduleToday = isOnScheduleToday(j);
      const tons =
        (Number(r?.Asphalt_Actual) || 0) + (Number(r?.Base_Actual) || 0);
      return {
        jobNumber: j.Job_Number,
        jobName: j.Job_Name || j.Job_Number,
        crewCount: Number(r?.Crew_Count) || 0,
        manHours: Number(r?.Total_Man_Hours) || 0,
        tonsToDate: tons,
        lastReportDays: d,
        onScheduleToday,
        contract: Number(j.Contract_Amount) || 0,
        billed: Number(j.Billed_To_Date) || 0,
      };
    });

  const updatedAt = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="min-h-screen bg-[var(--color-mist-grey)]">
      {/* ══ Header strip ══════════════════════════════════════════════════ */}
      <header className="bg-[var(--color-safety-white)] border-b border-[var(--color-mist-grey)]">
        <div className="max-w-[1440px] mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="font-display font-black text-[var(--color-iron-charcoal)] tracking-tight"
              style={{ fontSize: 22, letterSpacing: '-0.01em' }}
            >
              SUNBELT <span className="text-[var(--color-track-green)]">SPORTS</span>
            </div>
            <span className="pill pill-success">● LIVE</span>
            <span className="text-[11px] font-body text-[var(--color-steel-grey)]">
              Updated {updatedAt} ET
            </span>
          </div>
          <nav className="flex items-center gap-6 text-[13px] font-body">
            <span className="font-display font-bold uppercase tracking-wide text-[12px] border-b-2 border-[var(--color-track-green)] pb-1 text-[var(--color-iron-charcoal)]">
              Dashboard
            </span>
            <Link href="/portfolio" className="text-[var(--color-steel-grey)] hover:text-[var(--color-iron-charcoal)] transition-athletic">
              Portfolio
            </Link>
            <Link href="/schedule" className="text-[var(--color-steel-grey)] hover:text-[var(--color-iron-charcoal)] transition-athletic">
              Schedule
            </Link>
            <Link href="/project-scorecard" className="text-[var(--color-steel-grey)] hover:text-[var(--color-iron-charcoal)] transition-athletic">
              Scorecard
            </Link>
            <Link href="/fleet" className="text-[var(--color-steel-grey)] hover:text-[var(--color-iron-charcoal)] transition-athletic">
              Fleet
            </Link>
            <Link href="/equipment" className="text-[var(--color-steel-grey)] hover:text-[var(--color-iron-charcoal)] transition-athletic">
              Equipment
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-8">
        {/* ══ Zone 1: Attention Now ════════════════════════════════════════ */}
        <section>
          <SectionHeader
            eyebrow="Zone 1"
            title="Attention now"
            subtitle="Only items that need action today"
          />
          {attentionTop.length === 0 ? (
            <div className="card p-8 flex flex-col items-center justify-center text-center">
              <div className="w-10 h-10 rounded-full bg-[var(--color-track-green-light)] flex items-center justify-center mb-3">
                <span className="text-[var(--color-track-green)] text-lg">✓</span>
              </div>
              <div className="font-display font-bold text-[var(--color-iron-charcoal)]">
                All clear
              </div>
              <div className="text-[13px] font-body text-[var(--color-steel-grey)] mt-1">
                No jobs flagged. Everything is on schedule and in budget.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {attentionTop.map((a, i) => (
                <AttentionCardView key={i} card={a} />
              ))}
            </div>
          )}
        </section>

        {/* ══ Zone 2: At a glance (4 tiles) ═════════════════════════════════ */}
        <section>
          <SectionHeader
            eyebrow="Zone 2"
            title="At a glance"
            subtitle="The four numbers that run the business"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <GlanceTile
              label="Active jobs"
              value={activeJobs.length.toString()}
              sub={`${fmtDollars(activeContractTotal)} in contracts`}
              source="Master Job Index"
              href="/portfolio"
            />
            <GlanceTile
              label="Billed to date"
              value={fmtDollars(totalBilled)}
              sub={`${fmtPct(billedPct)} of ${fmtDollars(totalPortfolio)}`}
              source="Master Job Index"
              href="/portfolio"
            />
            <GlanceTile
              label="A/R at risk"
              value={fmtDollars(arOver90)}
              sub={arTotal > 0 ? `${fmtPct(arOver90 / arTotal)} of total A/R (91+ days)` : 'over 90 days'}
              source="QBO A/R Aging"
              href="/portfolio"
              tone={arOver90 > 50_000 ? 'danger' : arOver90 > 0 ? 'warning' : 'ok'}
            />
            <GlanceTile
              label="Avg active margin"
              value={fmtPct(avgMargin)}
              sub={marginAtRiskDollars > 0 ? `${fmtDollars(marginAtRiskDollars)} at risk` : 'No loss jobs'}
              source="QBO Est vs Actuals"
              href="/portfolio"
              tone={avgMargin < 0.15 ? 'warning' : 'ok'}
            />
          </div>
        </section>

        {/* ══ Zone 3: Live field ═══════════════════════════════════════════ */}
        <section>
          <SectionHeader
            eyebrow="Zone 3"
            title="Live field"
            subtitle="What's happening on each active job right now"
          />
          {liveFieldRows.length === 0 ? (
            <div className="card p-8 text-center">
              <div className="font-display font-bold text-[var(--color-iron-charcoal)]">
                No active jobs
              </div>
              <div className="text-[13px] font-body text-[var(--color-steel-grey)] mt-1">
                When active jobs are running, each one shows here with its live status.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {liveFieldRows.map((r) => (
                <LiveFieldCard key={r.jobNumber} row={r} />
              ))}
            </div>
          )}
        </section>

        {/* ══ Zone 4: Money health ═════════════════════════════════════════ */}
        <section>
          <SectionHeader
            eyebrow="Zone 4"
            title="Money health"
            subtitle="A/R, rework, and margin at a glance. Full detail on Portfolio."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MoneyCard
              label="A/R over 90 days"
              value={fmtDollars(arOver90)}
              caption={`${arOver90Count} customer${arOver90Count === 1 ? '' : 's'} past due`}
              tone={arOver90 > 50_000 ? 'danger' : 'neutral'}
            />
            <MoneyCard
              label="Total A/R outstanding"
              value={fmtDollars(arTotal)}
              caption="all invoices open"
              tone="neutral"
            />
            <MoneyCard
              label="Rework cost (logged)"
              value={fmtDollars(reworkYtd)}
              caption={`${reworkCount} rework events`}
              tone={reworkYtd > 0 ? 'warning' : 'neutral'}
            />
            <MoneyCard
              label="Margin at risk"
              value={fmtDollars(marginAtRiskDollars)}
              caption={`${lossJobs.length} jobs under water`}
              tone={lossJobs.length > 0 ? 'danger' : 'neutral'}
            />
          </div>
          <div className="mt-4 text-right">
            <Link
              href="/portfolio"
              className="inline-flex items-center gap-2 text-[12px] font-display font-bold uppercase tracking-wide text-[var(--color-track-green)] hover:text-[var(--color-track-green-hover)] transition-athletic"
            >
              See full portfolio →
            </Link>
          </div>
        </section>

        {/* ══ Footer note ══════════════════════════════════════════════════ */}
        <footer className="pt-4 text-[11px] font-body text-[var(--color-steel-grey)] text-center">
          Preview build — this is the redesign for feedback. Live dashboard is at{' '}
          <Link href="/dashboard" className="underline">
            /dashboard
          </Link>
          .
        </footer>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Presentational components
// ─────────────────────────────────────────────────────────────────────────────

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <div className="font-display font-bold uppercase tracking-[1.5px] text-[10px] text-[var(--color-track-green)] pb-1 border-b-2 border-[var(--color-track-green)] inline-block">
            {eyebrow}
          </div>
          <h2 className="font-display font-black text-[22px] text-[var(--color-iron-charcoal)] leading-tight mt-2">
            {title}
          </h2>
          {subtitle && (
            <p className="font-body text-[13px] text-[var(--color-steel-grey)] mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function AttentionCardView({ card }: { card: { severity: 'danger' | 'warning'; title: string; detail: string; cta?: string; href?: string } }) {
  const borderColor =
    card.severity === 'danger' ? 'var(--color-danger-red)' : 'var(--color-alert-orange)';
  const pillClass = card.severity === 'danger' ? 'pill-danger' : 'pill-warning';
  const label = card.severity === 'danger' ? 'Urgent' : 'Watch';

  return (
    <div
      className="card p-4 flex flex-col gap-3 transition-athletic hover:shadow-md"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={`pill ${pillClass} mb-2`}>{label}</span>
          <div className="font-display font-bold text-[15px] text-[var(--color-iron-charcoal)] leading-snug">
            {card.title}
          </div>
          <div className="font-body text-[13px] text-[var(--color-steel-grey)] mt-1 leading-snug">
            {card.detail}
          </div>
        </div>
      </div>
      {card.cta && card.href && (
        <div className="flex items-center justify-end">
          <Link
            href={card.href}
            className="text-[11px] font-display font-bold uppercase tracking-wide text-[var(--color-iron-charcoal)] hover:text-[var(--color-track-green)] transition-athletic"
          >
            {card.cta} →
          </Link>
        </div>
      )}
    </div>
  );
}

function GlanceTile({
  label,
  value,
  sub,
  source,
  href,
  tone = 'ok',
}: {
  label: string;
  value: string;
  sub: string;
  source: string;
  href?: string;
  tone?: 'ok' | 'warning' | 'danger';
}) {
  const valueColor =
    tone === 'danger'
      ? 'var(--color-danger-red)'
      : tone === 'warning'
      ? 'var(--color-alert-orange)'
      : 'var(--color-iron-charcoal)';
  const Body = (
    <>
      <div className="font-display font-bold uppercase tracking-[1px] text-[10px] text-[var(--color-steel-grey)]">
        {label}
      </div>
      <div
        className="font-display font-black leading-none mt-2"
        style={{ fontSize: 36, color: valueColor, letterSpacing: '-0.02em' }}
      >
        {value}
      </div>
      <div className="font-body text-[12px] text-[var(--color-iron-charcoal)] mt-2">{sub}</div>
      <div className="font-body text-[10px] text-[var(--color-steel-grey)] mt-3 uppercase tracking-wide">
        Source: {source}
      </div>
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="card p-5 block transition-athletic hover:shadow-md hover:-translate-y-0.5"
      >
        {Body}
      </Link>
    );
  }
  return <div className="card p-5">{Body}</div>;
}

function LiveFieldCard({
  row,
}: {
  row: {
    jobNumber: string;
    jobName: string;
    crewCount: number;
    manHours: number;
    tonsToDate: number;
    lastReportDays: number | null;
    onScheduleToday: boolean;
    contract: number;
    billed: number;
  };
}) {
  const billedPct = row.contract > 0 ? row.billed / row.contract : 0;
  let statusPill;
  if (row.onScheduleToday && row.lastReportDays === 0) {
    statusPill = <span className="pill pill-success">● Active today</span>;
  } else if (row.onScheduleToday) {
    statusPill = <span className="pill pill-warning">On schedule · no report yet</span>;
  } else if (row.lastReportDays !== null && row.lastReportDays <= 1) {
    statusPill = <span className="pill pill-success">Reported {row.lastReportDays === 0 ? 'today' : 'yesterday'}</span>;
  } else if (row.lastReportDays !== null && row.lastReportDays > 3) {
    statusPill = <span className="pill pill-danger">No report {row.lastReportDays}d</span>;
  } else {
    statusPill = <span className="pill pill-neutral">Between reports</span>;
  }

  return (
    <Link
      href={`/jobs/${row.jobNumber}`}
      className="card p-4 block transition-athletic hover:shadow-md hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-[15px] text-[var(--color-iron-charcoal)] leading-tight truncate">
            {row.jobName}
          </div>
          <div className="font-body text-[11px] text-[var(--color-steel-grey)] mt-0.5">
            {row.jobNumber}
          </div>
        </div>
        {statusPill}
      </div>

      <div className="grid grid-cols-3 gap-2 py-2 border-t border-b border-[var(--color-mist-grey)]">
        <Stat label="Crew" value={row.crewCount.toString()} />
        <Stat label="Man-hrs" value={Math.round(row.manHours).toLocaleString()} />
        <Stat label="Tons" value={Math.round(row.tonsToDate).toLocaleString()} />
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between mb-1">
          <span className="font-body text-[10px] uppercase tracking-wide text-[var(--color-steel-grey)]">
            Billed
          </span>
          <span className="font-display font-bold text-[11px] text-[var(--color-iron-charcoal)]">
            {fmtDollars(row.billed)} / {fmtDollars(row.contract)}
          </span>
        </div>
        <div className="h-1.5 bg-[var(--color-mist-grey)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--color-track-green)] rounded-full"
            style={{ width: `${Math.min(100, billedPct * 100)}%` }}
          />
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="font-display font-black text-[16px] text-[var(--color-iron-charcoal)] leading-none">
        {value}
      </div>
      <div className="font-body text-[10px] uppercase tracking-wide text-[var(--color-steel-grey)] mt-1">
        {label}
      </div>
    </div>
  );
}

function MoneyCard({
  label,
  value,
  caption,
  tone,
}: {
  label: string;
  value: string;
  caption: string;
  tone: 'neutral' | 'warning' | 'danger';
}) {
  const valueColor =
    tone === 'danger'
      ? 'var(--color-danger-red)'
      : tone === 'warning'
      ? 'var(--color-alert-orange)'
      : 'var(--color-iron-charcoal)';
  return (
    <div className="card p-4">
      <div className="font-display font-bold uppercase tracking-[1px] text-[10px] text-[var(--color-steel-grey)]">
        {label}
      </div>
      <div
        className="font-display font-black mt-2 leading-none"
        style={{ fontSize: 26, color: valueColor, letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
      <div className="font-body text-[11px] text-[var(--color-steel-grey)] mt-1.5">{caption}</div>
    </div>
  );
}
