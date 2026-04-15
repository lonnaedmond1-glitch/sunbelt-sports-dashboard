import React from 'react';
import Link from 'next/link';
import { fetchBidLog } from '@/lib/sheets-data';

export const revalidate = 86400;

export default async function SalesPage() {
  const bids = await fetchBidLog();

  // Status buckets
  const categorize = (s: string): 'win' | 'loss' | 'review' | 'budgetary' | 'other' => {
    const u = (s || '').toUpperCase();
    if (u.includes('WIN')) return 'win';
    if (u.includes('LOSS') || u.includes('LOST')) return 'loss';
    if (u.includes('UNDER REVIEW')) return 'review';
    if (u.includes('BUDGETARY')) return 'budgetary';
    return 'other';
  };

  const wins = bids.filter(b => categorize(b.Status) === 'win');
  const losses = bids.filter(b => categorize(b.Status) === 'loss');
  const review = bids.filter(b => categorize(b.Status) === 'review');
  const budgetary = bids.filter(b => categorize(b.Status) === 'budgetary');

  const totalProposalValue = bids.reduce((s, b) => s + b.Proposal, 0);
  const totalAwarded = wins.reduce((s, b) => s + (b.Awarded || b.Proposal), 0);
  const totalPipe = review.reduce((s, b) => s + b.Pipe, 0);
  const totalLost = losses.reduce((s, b) => s + (b.Lost || b.Proposal), 0);

  const winCount = wins.length;
  const totalDecided = wins.length + losses.length;
  const winRate = totalDecided > 0 ? (winCount / totalDecided) * 100 : 0;
  const avgDealSize = wins.length > 0 ? totalAwarded / wins.length : 0;

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Sales Pipeline</h1>
          <p className="text-[#757A7F] text-sm">Bid tracking — Under Review → Won → Lost. Live from Bud’s 2026 Bid Log.</p>
          <div className="mt-3 rounded-lg bg-[#60a5fa]/5 border border-[#60a5fa]/20 px-4 py-3 max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#60a5fa]/80 mb-1">What this page is for</p>
            <p className="text-xs text-[#3C4043] leading-relaxed">Single view of every 2026 bid and where it stands. Use it at your Monday sales meeting to see proposal value, weighted pipeline, win rate, and which bids still need a follow-up. Edit the bid log directly in Bud’s sheet; this page refreshes daily.</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-xs text-[#20BC64] font-bold uppercase hover:text-[#16a558]">← Dashboard</Link>
      </header>

      {bids.length === 0 ? (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">Awaiting Bid Log Data</p>
          <p className="text-xs text-[#757A7F]">Could not read Bud’s 2026 Bid Log. Make sure the sheet has “Anyone with the link can view” access so Vercel can fetch the CSV export.</p>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
              <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Total Bids</p>
              <p className="text-3xl font-black text-[#3C4043]">{bids.length}</p>
              <p className="text-[10px] text-[#757A7F] mt-0.5">${(totalProposalValue/1000000).toFixed(1)}M proposed</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
              <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Won</p>
              <p className="text-3xl font-black text-[#20BC64]">{wins.length}</p>
              <p className="text-[10px] text-[#757A7F] mt-0.5">${(totalAwarded/1000000).toFixed(2)}M awarded</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
              <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Under Review</p>
              <p className="text-3xl font-black text-[#60a5fa]">{review.length}</p>
              <p className="text-[10px] text-[#757A7F] mt-0.5">${(totalPipe/1000000).toFixed(2)}M weighted</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
              <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Lost</p>
              <p className="text-3xl font-black text-[#E04343]">{losses.length}</p>
              <p className="text-[10px] text-[#757A7F] mt-0.5">${(totalLost/1000000).toFixed(2)}M lost</p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
              <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Win Rate</p>
              <p className={`text-3xl font-black ${winRate >= 30 ? 'text-[#20BC64]' : winRate >= 15 ? 'text-[#F5A623]' : 'text-[#E04343]'}`}>{winRate.toFixed(0)}%</p>
              <p className="text-[10px] text-[#757A7F] mt-0.5">Avg deal ${(avgDealSize/1000).toFixed(0)}K</p>
            </div>
          </div>

          {/* 4 columns for Win / Review / Budgetary / Loss */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Won', color: '#20BC64', rows: wins },
              { label: 'Under Review', color: '#60a5fa', rows: review },
              { label: 'Budgetary', color: '#F5A623', rows: budgetary },
              { label: 'Lost', color: '#E04343', rows: losses },
            ].map(col => (
              <div key={col.label} className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#F1F3F4] flex justify-between items-center" style={{ background: `${col.color}10` }}>
                  <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: col.color }}>{col.label}</h3>
                  <span className="text-xs font-bold text-[#757A7F]">{col.rows.length}</span>
                </div>
                <div className="p-3 space-y-2 min-h-[240px] max-h-[500px] overflow-y-auto">
                  {col.rows.slice(0, 25).map((b, i) => (
                    <div key={i} className="rounded-lg p-3 border bg-[#F1F3F4]/40" style={{ borderColor: `${col.color}20` }}>
                      <p className="text-xs font-bold text-[#3C4043] truncate" title={`${b.Job_Name} — ${b.Location}`}>{b.Job_Name}</p>
                      <p className="text-[10px] text-[#757A7F] mt-0.5 truncate">{b.Customer}</p>
                      <div className="flex justify-between items-end mt-2">
                        <span className="text-[10px] text-[#757A7F]/70">{b.Bid_Number} · {b.Probability}%</span>
                        <span className="text-xs font-black" style={{ color: col.color }}>${(b.Proposal / 1000).toFixed(0)}K</span>
                      </div>
                    </div>
                  ))}
                  {col.rows.length === 0 && (
                    <p className="text-[11px] text-[#757A7F]/60 text-center py-6">No bids in this bucket.</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Full bid log table */}
          <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#F1F3F4]">
              <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">All 2026 Bids</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F1F3F4]">
                  <tr>
                    {['Bid #', 'Date', 'Customer', 'Job Name', 'Location', 'Prob.', 'Proposal', 'Status', 'Feedback'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bids.map((b, i) => {
                    const cat = categorize(b.Status);
                    const toneColor = cat === 'win' ? '#20BC64' : cat === 'loss' ? '#E04343' : cat === 'review' ? '#60a5fa' : cat === 'budgetary' ? '#F5A623' : '#9CA3AF';
                    return (
                      <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                        <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{b.Bid_Number}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{b.Date_Bid}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F] truncate max-w-[180px]" title={b.Customer}>{b.Customer}</td>
                        <td className="px-3 py-2 text-xs font-bold text-[#3C4043] truncate max-w-[220px]" title={b.Job_Name}>{b.Job_Name}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F] truncate max-w-[160px]">{b.Location}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{b.Probability}%</td>
                        <td className="px-3 py-2 text-xs font-black text-[#3C4043]">${(b.Proposal / 1000).toFixed(0)}K</td>
                        <td className="px-3 py-2 text-xs font-black" style={{ color: toneColor }}>{b.Status || '—'}</td>
                        <td className="px-3 py-2 text-[10px] text-[#757A7F] truncate max-w-[240px]" title={b.Feedback}>{b.Feedback}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
