import React from 'react';
import Link from 'next/link';
import { fetchMarketingLeads } from '@/lib/sheets-data';

export const revalidate = 86400;

export default async function MarketingPage() {
  const leads = await fetchMarketingLeads();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const mtd = leads.filter(l => (l.Date || '') >= monthStart);
  const qualified = leads.filter(l => /qualified|won|signed/i.test(l.Status || ''));
  const bySource: Record<string, number> = {};
  leads.forEach(l => { const s = l.Source || 'Unknown'; bySource[s] = (bySource[s] || 0) + 1; });
  const sources = Object.entries(bySource).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Marketing Funnel</h1>
          <p className="text-[#757A7F] text-sm">Leads, inbound inquiries &amp; campaign performance. Live from Marketing_Leads sheet.</p>
          <div className="mt-3 rounded-lg bg-[#60a5fa]/5 border border-[#60a5fa]/20 px-4 py-3 max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#60a5fa]/80 mb-1">What this page is for</p>
            <p className="text-xs text-[#3C4043] leading-relaxed">Track where new work is coming from — GC referrals, website inquiries, trade shows, direct outreach. Use it to decide which channels to double-down on, which to cut, and whether marketing spend is converting to qualified bids. Log every new lead in the <code className="font-mono text-[10px]">Marketing_Leads</code> sheet tab with its source and status; the funnel refreshes daily and feeds the Sales pipeline when leads get qualified.</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-xs text-[#20BC64] font-bold uppercase hover:text-[#16a558]">← Dashboard</Link>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">New Leads (MTD)</p>
          <p className="text-3xl font-black text-[#20BC64]">{mtd.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Total Leads</p>
          <p className="text-3xl font-black">{leads.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Qualified</p>
          <p className="text-3xl font-black text-[#60a5fa]">{qualified.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Conversion Rate</p>
          <p className="text-3xl font-black text-[#F5A623]">{leads.length > 0 ? ((qualified.length / leads.length) * 100).toFixed(0) : 0}%</p>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">No Lead Data Yet</p>
          <p className="text-xs text-[#757A7F]">Add rows to the <code className="font-mono text-[11px]">Marketing_Leads</code> tab in the Scorecard sheet with columns:
            <span className="font-mono text-[11px]"> Date, Source, Contact, Project, Status, Owner</span>.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          {/* Sources breakdown */}
          <div className="col-span-1 bg-white rounded-xl border border-[#F1F3F4] p-5">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70 mb-4">Lead Sources</h2>
            <div className="space-y-2">
              {sources.map(([src, n]) => {
                const pct = leads.length > 0 ? (n / leads.length) * 100 : 0;
                return (
                  <div key={src}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-[#3C4043]">{src}</span>
                      <span className="text-[#757A7F]">{n} · {pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 bg-[#F1F3F4] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#20BC64]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Recent leads */}
          <div className="col-span-2 bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F1F3F4]">
              <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Recent Leads</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F1F3F4]">
                  <tr>
                    {['Date', 'Source', 'Contact', 'Project', 'Status', 'Owner'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 25).map((l, i) => (
                    <tr key={i} className="border-t border-[#F1F3F4]">
                      <td className="px-3 py-2 text-xs">{l.Date}</td>
                      <td className="px-3 py-2 text-xs font-bold text-[#60a5fa]">{l.Source}</td>
                      <td className="px-3 py-2 text-xs">{l.Contact}</td>
                      <td className="px-3 py-2 text-xs text-[#757A7F]">{l.Project}</td>
                      <td className="px-3 py-2 text-xs font-bold">{l.Status}</td>
                      <td className="px-3 py-2 text-xs text-[#757A7F]">{l.Owner}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
