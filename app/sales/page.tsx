import React from 'react';
import Link from 'next/link';
import { fetchBidLog } from '@/lib/sheets-data';
import { formatDollarsCompact } from '@/lib/format';

export const revalidate = 86400;

type Bucket = 'win' | 'loss' | 'review' | 'budgetary' | 'other';

const categorize = (s: string): Bucket => {
  const u = (s || '').toUpperCase();
  if (u.includes('WIN')) return 'win';
  if (u.includes('LOSS') || u.includes('LOST')) return 'loss';
  if (u.includes('UNDER REVIEW')) return 'review';
  if (u.includes('BUDGETARY')) return 'budgetary';
  return 'other';
};

const bucketColor: Record<Bucket, string> = {
  win: '#198754', loss: '#D8392B', review: '#2563EB', budgetary: '#E8892B', other: '#6B7278',
};

const bucketPill: Record<Bucket, string> = {
  win: 'pill pill-success',
  loss: 'pill pill-danger',
  review: 'pill pill-info',
  budgetary: 'pill pill-warning',
  other: 'pill pill-neutral',
};

export default async function SalesPage() {
  const bids = await fetchBidLog();

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
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Sales</span>
            <h1 className="text-4xl font-display mt-2">Bid Pipeline</h1>
            <p className="text-steel-grey text-sm mt-1">
              Source: 2026_Bid_Log. {bids.length} bids total.
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        {bids.length === 0 ? (
          <div className="card card-padded border-l-4" style={{ borderLeftColor: '#E8892B' }}>
            <p className="font-display text-lg">No Bids Loaded</p>
            <p className="text-steel-grey text-sm mt-1">
              Bud's 2026 Bid Log came back empty. Confirm the sheet is published with "Anyone with the link can view" access.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
              <div className="card card-padded">
                <p className="stat-label">Total Bids</p>
                <p className="stat-value font-mono">{bids.length}</p>
                <p className="stat-sub">{formatDollarsCompact(totalProposalValue)} proposed</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Won</p>
                <p className="stat-value font-mono" style={{ color: '#198754' }}>{wins.length}</p>
                <p className="stat-sub">{formatDollarsCompact(totalAwarded)} awarded</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Under Review</p>
                <p className="stat-value font-mono" style={{ color: '#2563EB' }}>{review.length}</p>
                <p className="stat-sub">{formatDollarsCompact(totalPipe)} weighted</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Lost</p>
                <p className="stat-value font-mono" style={{ color: '#D8392B' }}>{losses.length}</p>
                <p className="stat-sub">{formatDollarsCompact(totalLost)} lost</p>
              </div>
              <div className="card card-padded">
                <p className="stat-label">Win Rate</p>
                <p className="stat-value font-mono" style={{ color: winRate >= 30 ? '#198754' : winRate >= 15 ? '#E8892B' : '#D8392B' }}>{winRate.toFixed(0)}%</p>
                <p className="stat-sub">avg deal {formatDollarsCompact(avgDealSize)}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {([
                { label: 'Won', key: 'win' as Bucket, rows: wins },
                { label: 'Under Review', key: 'review' as Bucket, rows: review },
                { label: 'Budgetary', key: 'budgetary' as Bucket, rows: budgetary },
                { label: 'Lost', key: 'loss' as Bucket, rows: losses },
              ]).map(col => (
                <div key={col.label} className="card overflow-hidden">
                  <div className="px-4 py-3 border-b border-line-grey flex justify-between items-center" style={{ borderLeftWidth: 3, borderLeftColor: bucketColor[col.key] }}>
                    <span className="font-display tracking-widest text-sm" style={{ color: bucketColor[col.key] }}>{col.label}</span>
                    <span className="font-mono text-xs text-steel-grey">{col.rows.length}</span>
                  </div>
                  <div className="p-3 space-y-2 min-h-[200px] max-h-[480px] overflow-y-auto custom-scrollbar">
                    {col.rows.slice(0, 25).map((b, i) => (
                      <div key={i} className="rounded p-3 border border-line-grey bg-mist-grey/40">
                        <p className="text-xs font-semibold truncate" title={`${b.Job_Name} — ${b.Location}`}>{b.Job_Name}</p>
                        <p className="text-[11px] text-steel-grey mt-0.5 truncate">{b.Customer}</p>
                        <div className="flex justify-between items-end mt-2">
                          <span className="text-[11px] text-steel-grey font-mono">{b.Bid_Number}</span>
                          <span className="text-xs font-mono" style={{ color: bucketColor[col.key] }}>{formatDollarsCompact(b.Proposal, 0)}</span>
                        </div>
                      </div>
                    ))}
                    {col.rows.length === 0 && (
                      <p className="text-xs text-steel-grey/80 text-center py-6">No bids in this bucket.</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-line-grey">
                <p className="eyebrow">All Bids</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {['Bid #', 'Date', 'Customer', 'Job Name', 'Location', 'Prob.', 'Proposal', 'Status', 'Feedback'].map(h => (
                        <th key={h} className="table-header text-left px-3 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bids.map((b, i) => {
                      const cat = categorize(b.Status);
                      return (
                        <tr key={i} className="table-row-zebra border-b border-line-grey hover:bg-sunbelt-green-light/40">
                          <td className="px-3 py-3 font-mono font-semibold">{b.Bid_Number}</td>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{b.Date_Bid}</td>
                          <td className="px-3 py-3 text-xs truncate max-w-[180px]" title={b.Customer}>{b.Customer}</td>
                          <td className="px-3 py-3 font-medium truncate max-w-[240px]" title={b.Job_Name}>{b.Job_Name}</td>
                          <td className="px-3 py-3 text-xs text-steel-grey truncate max-w-[160px]">{b.Location}</td>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{b.Probability}%</td>
                          <td className="px-3 py-3 font-mono text-xs">{formatDollarsCompact(b.Proposal, 0)}</td>
                          <td className="px-3 py-3"><span className={bucketPill[cat]}>{b.Status || '—'}</span></td>
                          <td className="px-3 py-3 text-xs text-steel-grey truncate max-w-[240px]" title={b.Feedback}>{b.Feedback}</td>
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
    </div>
  );
}
