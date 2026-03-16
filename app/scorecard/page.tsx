import React from 'react';
import { fetchScorecardData } from '@/lib/sheets-data';

export const dynamic = 'force-dynamic';

async function getScorecardData() {
  return fetchScorecardData();
}

function fmt(n: number, decimals = 1) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(decimals)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(decimals)}`;
}

function fmtFull(n: number) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default async function ScorecardPage() {
  const sc = await getScorecardData();

  const healthColor = (sc.netIncome?.current || 0) > 0 ? '#20BC64' : '#ef4444';
  const grossMarginColor = (sc.grossMarginPct?.current || 0) > 20 ? '#20BC64' : (sc.grossMarginPct?.current || 0) > 10 ? '#fb923c' : '#ef4444';

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans pb-10 antialiased">
      {/* Header */}
      <header className="bg-[#1e2023] px-8 py-5 border-b border-white/5 shadow-xl">
        <div className="flex justify-between items-center max-w-[1920px] mx-auto">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Internal Scorecard</h1>
            <p className="text-xs text-white/30 mt-1">Sunbelt Sports, Inc. · {sc.reportPeriod || 'QuickBooks'} · Live from QuickBooks</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-white/30 font-bold">Cash Position</p>
              <p className="text-2xl font-black text-[#20BC64]">{fmt(sc.cashFlow?.current || 0)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30 font-bold">Net Income</p>
              <p className="text-2xl font-black" style={{ color: healthColor }}>{fmt(sc.netIncome?.current || 0)}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto p-6 flex flex-col gap-6">

        {/* ─── TOP KPI STRIP ─── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'FYTD Revenue', value: fmt(sc.totalRevenueFY?.current || 0), color: '#60a5fa' },
            { label: 'Gross Profit', value: fmt(sc.grossProfit?.current || 0), sub: `${sc.grossMarginPct?.current || 0}% margin`, color: grossMarginColor },
            { label: 'Total COGS', value: fmt(sc.totalCOGS?.current || 0), color: '#fb923c' },
            { label: 'Total Expenses', value: fmt(sc.totalExpenses?.current || 0), color: '#a78bfa' },
            { label: 'Net Income', value: fmt(sc.netIncome?.current || 0), sub: `${sc.netMarginPct?.current || 0}% margin`, color: healthColor },
          ].map(kpi => (
            <div key={kpi.label} className="bg-[#1e2023] rounded-2xl p-5 border border-white/5 shadow-xl">
              <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-2">{kpi.label}</p>
              <p className="text-2xl font-black" style={{ color: kpi.color }}>{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-white/30 mt-1">{kpi.sub}</p>}
            </div>
          ))}
        </div>

        {/* ─── ROW 2: BALANCE SHEET + P&L WATERFALL ─── */}
        <div className="grid grid-cols-12 gap-6">

          {/* Balance Sheet Summary */}
          <div className="col-span-12 lg:col-span-4 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Balance Sheet</h2>
              <p className="text-xs text-white/25 mt-0.5">As of {sc.reportPeriod?.split('-').pop()?.trim() || 'today'}</p>
            </div>
            <div className="p-5 space-y-4">
              {[
                { label: 'Bank / Cash', value: sc.cashFlow?.current, color: '#20BC64' },
                { label: 'Accounts Receivable', value: sc.accountsReceivable?.current, color: '#60a5fa' },
                { label: 'Current Assets', value: sc.currentAssets?.current, color: '#a78bfa' },
                { label: 'Accounts Payable', value: sc.accountsPayable?.current, color: '#ef4444' },
                { label: 'Current Liabilities', value: sc.currentLiabilities?.current, color: '#fb923c' },
              ].map(item => (
                <div key={item.label} className="flex justify-between items-center py-2 border-b border-white/5 last:border-b-0">
                  <span className="text-sm text-white/50">{item.label}</span>
                  <span className="text-sm font-black" style={{ color: item.color }}>{fmtFull(item.value || 0)}</span>
                </div>
              ))}
              <div className="mt-3 pt-3 border-t border-white/10">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-white/60">AR / AP Ratio</span>
                  <span className={`text-lg font-black ${(sc.arApRatio?.current || 0) > 1.5 ? 'text-[#20BC64]' : 'text-amber-400'}`}>
                    {sc.arApRatio?.current || 0}x
                  </span>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm font-bold text-white/60">Current Ratio</span>
                  <span className={`text-lg font-black ${(sc.currentRatio?.current || 0) > 1.5 ? 'text-[#20BC64]' : 'text-amber-400'}`}>
                    {sc.currentRatio?.current || 0}x
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* P&L Waterfall */}
          <div className="col-span-12 lg:col-span-8 bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/5">
              <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Profit & Loss — Revenue Waterfall</h2>
              <p className="text-xs text-white/25 mt-0.5">{sc.reportPeriod || 'FYTD'}</p>
            </div>
            <div className="p-5">
              {/* Income breakdown */}
              <div className="space-y-2 mb-6">
                {(sc.incomeBreakdown || []).sort((a: any, b: any) => b.amount - a.amount).slice(0, 10).map((item: any) => {
                  const maxVal = Math.max(...((sc.incomeBreakdown || []) as any[]).map((x: any) => Math.abs(x.amount)));
                  const pct = maxVal > 0 ? (Math.abs(item.amount) / maxVal) * 100 : 0;
                  const isNeg = item.amount < 0;
                  return (
                    <div key={item.category} className="flex items-center gap-3">
                      <span className="text-xs text-white/40 w-48 truncate shrink-0">{item.category}</span>
                      <div className="flex-1 relative h-5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="absolute left-0 top-0 h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: isNeg ? '#ef4444' : '#60a5fa' }}
                        />
                      </div>
                      <span className={`text-xs font-bold w-20 text-right ${isNeg ? 'text-red-400' : 'text-blue-400'}`}>
                        {fmt(item.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Summary row */}
              <div className="grid grid-cols-4 gap-3 pt-4 border-t border-white/10">
                {[
                  { label: 'Total Income', value: sc.totalRevenueFY?.current, color: '#60a5fa' },
                  { label: 'Total COGS', value: -(sc.totalCOGS?.current || 0), color: '#ef4444' },
                  { label: 'Gross Profit', value: sc.grossProfit?.current, color: '#20BC64' },
                  { label: 'Net Income', value: sc.netIncome?.current, color: healthColor },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-xs text-white/30 uppercase font-bold">{s.label}</p>
                    <p className="text-lg font-black" style={{ color: s.color }}>{fmt(s.value || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── ROW 3: AR AGING ─── */}
        <div className="bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Accounts Receivable — Aging</h2>
            <span className="text-sm font-black text-blue-400">{fmtFull(sc.arAging?.total || 0)}</span>
          </div>
          <div className="p-5">
            {/* Aging buckets */}
            <div className="grid grid-cols-5 gap-4 mb-6">
              {[
                { label: 'Current', value: sc.arAging?.current, color: '#20BC64' },
                { label: '1-30 Days', value: sc.arAging?.['1_30'], color: '#60a5fa' },
                { label: '31-60 Days', value: sc.arAging?.['31_60'], color: '#fb923c' },
                { label: '61-90 Days', value: sc.arAging?.['61_90'], color: '#f59e0b' },
                { label: 'Over 90', value: sc.arAging?.over90, color: '#ef4444' },
              ].map(bucket => {
                const total = sc.arAging?.total || 1;
                const pct = total > 0 ? ((bucket.value || 0) / total) * 100 : 0;
                return (
                  <div key={bucket.label} className="text-center">
                    <p className="text-xs text-white/40 font-bold uppercase mb-2">{bucket.label}</p>
                    <div className="mx-auto w-20 h-20 rounded-full border-4 flex items-center justify-center mb-2" style={{ borderColor: bucket.color }}>
                      <span className="text-sm font-black" style={{ color: bucket.color }}>{pct.toFixed(0)}%</span>
                    </div>
                    <p className="text-sm font-bold text-white">{fmt(bucket.value || 0)}</p>
                  </div>
                );
              })}
            </div>
            {/* Visual bar */}
            <div className="flex h-5 rounded-full overflow-hidden mb-6">
              {[
                { value: sc.arAging?.current, color: '#20BC64' },
                { value: sc.arAging?.['1_30'], color: '#60a5fa' },
                { value: sc.arAging?.['31_60'], color: '#fb923c' },
                { value: sc.arAging?.['61_90'], color: '#f59e0b' },
                { value: sc.arAging?.over90, color: '#ef4444' },
              ].map((seg, i) => (
                <div key={i} style={{ backgroundColor: seg.color, width: `${(sc.arAging?.total || 0) > 0 ? ((seg.value || 0) / (sc.arAging?.total || 1)) * 100 : 0}%` }} />
              ))}
            </div>

            {/* Top AR customers */}
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40 mb-3">Top Outstanding Receivables</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {(sc.arByCustomer || []).slice(0, 12).map((c: any) => {
                const overduePct = c.total > 0 ? ((c.over90 + c.d61_90) / c.total) * 100 : 0;
                return (
                  <div key={c.customer} className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-white truncate">{c.customer}</p>
                      <div className="flex gap-2 mt-1">
                        {c.current > 0 && <span className="text-[10px] text-green-400">C: {fmt(c.current, 0)}</span>}
                        {c.d1_30 > 0 && <span className="text-[10px] text-blue-400">30: {fmt(c.d1_30, 0)}</span>}
                        {c.d61_90 > 0 && <span className="text-[10px] text-yellow-400">90: {fmt(c.d61_90, 0)}</span>}
                        {c.over90 > 0 && <span className="text-[10px] text-red-400">90+: {fmt(c.over90, 0)}</span>}
                      </div>
                    </div>
                    <span className={`text-sm font-black ml-2 ${overduePct > 50 ? 'text-red-400' : 'text-white'}`}>{fmt(c.total, 0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ─── ROW 4: SALES BY CUSTOMER ─── */}
        <div className="bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center">
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Sales by Customer — FYTD</h2>
            <div className="flex items-center gap-4">
              <span className="text-xs text-white/30">{sc.numCustomers || 0} customers</span>
              <span className="text-sm font-black text-[#20BC64]">{fmt(sc.totalSales?.current || 0)}</span>
            </div>
          </div>
          <div className="p-5">
            <div className="space-y-2">
              {(sc.salesByCustomer || []).slice(0, 12).map((c: any) => {
                const maxSales = Math.max(...((sc.salesByCustomer || []) as any[]).map((x: any) => x.amount));
                const pct = maxSales > 0 ? (c.amount / maxSales) * 100 : 0;
                return (
                  <div key={c.customer} className="flex items-center gap-3">
                    <span className="text-xs text-white/50 w-56 truncate shrink-0">{c.customer}</span>
                    <div className="flex-1 relative h-5 bg-white/5 rounded-full overflow-hidden">
                      <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#20BC64] to-[#16a558] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs font-black text-white w-16 text-right">{fmt(c.amount, 0)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
