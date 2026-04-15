// Money + number formatters. Keep display consistent across the dashboard.

/** Format a dollar amount with no cents (banker-rounded). Ex: 756169.5 -> "$756,170" */
export function formatDollars(n: number | string | null | undefined): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (!isFinite(num as number)) return '$0';
  return '$' + Math.round(num as number).toLocaleString('en-US');
}

/** Compact money formatter. Ex: 13039270.5 -> "$13.0M", 756169 -> "$756K" */
export function formatDollarsCompact(n: number | string | null | undefined, decimals = 1): string {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (!isFinite(num as number)) return '$0';
  const v = num as number;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(decimals)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(decimals === 0 ? 0 : 0)}K`;
  return '$' + Math.round(v).toLocaleString('en-US');
}

/** Round a speed value to whole mph. Null/NaN -> 0. */
export function roundMph(n: number | string | null | undefined): number {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0);
  if (!isFinite(num as number)) return 0;
  return Math.round(num as number);
}
