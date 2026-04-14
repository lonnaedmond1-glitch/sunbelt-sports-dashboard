import React from 'react';
import Link from 'next/link';
import { fetchSalesPipeline } from '@/lib/sheets-data';

export const revalidate = 86400;

const STAGES = [
  { key: 'Proposal Sent', color: '#F5A623' },
  { key: 'Negotiating',   color: '#60a5fa' },
  { key: 'Signed',        color: '#20BC64' },
  { key: 'Executed',      color: '#16a558' },
];

export default async function SalesPage() {
  const deals = await fetchSalesPipeline();
  const open = deals.filter(d => d.Stage !== 'Executed');
  const totalValue = open.reduce((s, d) => s + d.Value, 0);
  const byStage: Record<string, typeof deals> = {};
  STAGES.forEach(s => { byStage[s.key] = deals.filter(d => d.Stage === s.key); });

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Sales Pipeline</h1>
          <p className="text-[#757A7F] text-sm">Bid tracking — Proposal → Signed → Executed. Live from Sales_Pipeline sheet.</p>
        </div>
        <Link href="/dashboard" className="text-xs text-[#20BC64] font-bold uppercase hover:text-[#16a558]">← Dashboard</Link>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Open Bids</p>
          <p className="text-3xl font-black text-[#F5A623]">{open.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Pipeline Value</p>
          <p className="text-3xl font-black">${(totalValue / 1000000).toFixed(1)}M</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Signed YTD</p>
          <p className="text-3xl font-black text-[#20BC64]">{deals.filter(d => d.Stage === 'Signed' || d.Stage === 'Executed').length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Avg Deal Size</p>
          <p className="text-3xl font-black text-[#60a5fa]">${open.length > 0 ? ((totalValue / open.length) / 1000).toFixed(0) : 0}K</p>
        </div>
      </div>

      {deals.length === 0 ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">No Pipeline Data Yet</p>
          <p className="text-xs text-[#757A7F]">Add rows to the <code className="font-mono text-[11px]">Sales_Pipeline</code> tab in the Scorecard sheet with columns:
            <span className="font-mono text-[11px]"> Job_Number, Client, Project_Name, Stage, Value, State, PM, Bid_Date, Days_In_Stage</span>.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {STAGES.map(stage => (
            <div key={stage.key} className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
              <div className="px-4 py-3 border-b border-[#F1F3F4] flex justify-between items-center" style={{ background: `${stage.color}10` }}>
                <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: stage.color }}>{stage.key}</h3>
                <span className="text-xs font-bold text-[#757A7F]">{byStage[stage.key].length}</span>
              </div>
              <div className="p-3 space-y-2 min-h-[300px]">
                {byStage[stage.key].map((d, i) => (
                  <div key={i} className="rounded-lg p-3 border bg-[#F1F3F4]/40" style={{ borderColor: `${stage.color}20` }}>
                    <p className="text-xs font-bold text-[#3C4043]">{d.Project_Name}</p>
                    <p className="text-[10px] text-[#757A7F] mt-0.5">{d.Client}</p>
                    <div className="flex justify-between items-end mt-2">
                      <span className="text-[10px] text-[#757A7F]/70">{d.State} · {d.Days_In_Stage}d</span>
                      <span className="text-xs font-black" style={{ color: stage.color }}>${(d.Value / 1000).toFixed(0)}K</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
