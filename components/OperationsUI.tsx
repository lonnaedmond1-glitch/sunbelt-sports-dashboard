import Link from 'next/link';
import type { ReactNode } from 'react';

type Tone = 'ok' | 'warning' | 'critical' | 'neutral' | 'info';

const toneStyles: Record<Tone, { bg: string; text: string; border: string }> = {
  ok: { bg: '#DCFCE7', text: '#047857', border: 'rgba(11,190,99,0.35)' },
  warning: { bg: '#FEF3C7', text: '#92400E', border: 'rgba(245,158,11,0.35)' },
  critical: { bg: '#FEE2E2', text: '#991B1B', border: 'rgba(220,38,38,0.35)' },
  neutral: { bg: '#F1F5F9', text: '#475569', border: 'rgba(100,116,139,0.25)' },
  info: { bg: '#E0F2FE', text: '#075985', border: 'rgba(2,132,199,0.25)' },
};

export function PageShell({
  title,
  question,
  updatedAt,
  children,
}: {
  title: string;
  question: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <div className="ops-page">
      <div className="mx-auto max-w-[1600px] px-6 py-8 lg:px-8">
        <header className="mb-8 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="ops-display text-[34px] font-extrabold uppercase leading-none text-[#0F172A] md:text-[40px]">
              {title}
            </h1>
            <p className="mt-2 max-w-3xl text-sm font-medium text-[#475569]">{question}</p>
          </div>
          <div className="rounded-full border border-[rgba(31,41,55,0.15)] bg-white px-4 py-2 text-xs font-bold text-[#475569]">
            Data freshness: {updatedAt || 'Live by source'}
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Section({
  title,
  kicker,
  action,
  children,
  className = '',
}: {
  title: string;
  kicker?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ops-card overflow-hidden ${className}`}>
      <div className="flex flex-col gap-2 border-b border-[rgba(31,41,55,0.15)] px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="ops-display text-[22px] font-bold uppercase leading-none text-[#0F172A]">{title}</h2>
          {kicker ? <p className="mt-1 text-sm text-[#475569]">{kicker}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  context,
  tone = 'neutral',
}: {
  label: string;
  value: string | number;
  context?: string;
  tone?: Tone;
}) {
  const color =
    tone === 'ok' ? '#0BBE63' :
    tone === 'warning' ? '#F59E0B' :
    tone === 'critical' ? '#DC2626' :
    '#0F172A';

  return (
    <div className="ops-card min-w-[180px] flex-1 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">{label}</p>
      <p className="ops-display mt-2 text-[40px] font-extrabold leading-none" style={{ color }}>
        {value}
      </p>
      {context ? <p className="mt-2 text-xs font-medium text-[#475569]">{context}</p> : null}
    </div>
  );
}

export function HealthPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const styles = toneStyles[tone];
  return (
    <span
      className="inline-flex items-center rounded-full border px-3 py-1 text-xs font-extrabold uppercase tracking-[0.04em]"
      style={{ backgroundColor: styles.bg, color: styles.text, borderColor: styles.border }}
    >
      {label}
    </span>
  );
}

export function AlertCard({
  severity,
  title,
  detail,
  owner,
  href,
  actionLabel = 'Open',
}: {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  detail: string;
  owner?: string;
  href?: string;
  actionLabel?: string;
}) {
  const tone: Tone = severity === 'CRITICAL' ? 'critical' : severity === 'HIGH' ? 'warning' : 'neutral';
  return (
    <div className="border-l-4 bg-white p-4" style={{ borderLeftColor: tone === 'critical' ? '#DC2626' : tone === 'warning' ? '#F59E0B' : '#64748B' }}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em]" style={{ color: toneStyles[tone].text }}>{severity}</p>
          <p className="mt-1 text-base font-extrabold text-[#0F172A]">{title}</p>
          <p className="mt-1 text-sm text-[#475569]">{detail}</p>
          {owner ? <p className="mt-2 text-xs font-bold text-[#475569]">Owner: {owner}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="shrink-0 rounded-full border border-[rgba(31,41,55,0.15)] px-4 py-2 text-sm font-extrabold text-[#0F172A] hover:border-[#0BBE63]">
            {actionLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, detail, href, actionLabel }: { title: string; detail: string; href?: string; actionLabel?: string }) {
  return (
    <div className="p-6 text-center">
      <p className="font-extrabold text-[#0F172A]">{title}</p>
      <p className="mx-auto mt-2 max-w-2xl text-sm text-[#475569]">{detail}</p>
      {href && actionLabel ? (
        <Link href={href} className="mt-4 inline-flex rounded-full border border-[#0BBE63] px-4 py-2 text-sm font-extrabold text-[#047857]">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ProgressBar({ value, tone = 'ok' }: { value: number; tone?: Tone }) {
  const styles = toneStyles[tone];
  const safe = Math.max(0, Math.min(100, Math.round(value || 0)));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#E2E8F0]">
      <div className="h-full rounded-full" style={{ width: `${safe}%`, backgroundColor: styles.text }} />
    </div>
  );
}

export function moneyCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}
