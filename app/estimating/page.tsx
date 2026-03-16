import React from 'react';

const getBaseUrl = () => {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
};

async function getEstimatingData() {
  try {
    const res = await fetch(`${getBaseUrl()}/api/sync/estimating`, { cache: 'no-store' });
    if (!res.ok) return { bids: [], commitments: [] };
    const json = await res.json();
    return json.data || { bids: [], commitments: [] };
  } catch { return { bids: [], commitments: [] }; }
}

function fmt(n: number) {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (Math.abs(n) >= 1000000) return `$${(n / 1000000).toFixed(2)}M`;
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export default async function EstimatingPage() {
  const data = await getEstimatingData();
  const bids = data.bids || [];
  const commitments = data.commitments || [];

  // Group bids by status
  const submittedBids = bids.filter((b: any) => b.status?.toLowerCase().includes('submitted'));
  const wonBids = bids.filter((b: any) => b.status?.toLowerCase().includes('win') || b.status?.toLowerCase().includes('awarded') || b.awarded > 0);
  const lostBids = bids.filter((b: any) => b.status?.toLowerCase().includes('loss') || b.status?.toLowerCase().includes('lost'));

  const totalPipeline = submittedBids.reduce((sum: number, b: any) => sum + (b.proposal || 0), 0);
  const totalBacklog = commitments.reduce((sum: number, c: any) => sum + (c.contractAmount || 0), 0);

  return (
    <div className="min-h-screen bg-[#2A2D31] text-white font-sans pb-10 antialiased">
      {/* Header */}
      <header className="bg-[#1e2023] px-8 py-5 border-b border-white/5 shadow-xl sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-[1920px] mx-auto">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Estimating & Pipeline</h1>
            <p className="text-xs text-white/40 mt-1">Sunbelt Sports Bid Log & Backlog Tracking</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-xs text-white/30 font-bold uppercase tracking-wider">Active Pipeline</p>
              <p className="text-2xl font-black text-blue-400">{fmt(totalPipeline)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30 font-bold uppercase tracking-wider">Total Backlog</p>
              <p className="text-2xl font-black text-[#20BC64]">{fmt(totalBacklog)}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1920px] mx-auto p-6 space-y-6">

        {/* ─── BACKLOG COMMITMENTS ─── */}
        <section className="bg-[#1e2023] rounded-2xl border border-white/5 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-black/20">
            <h2 className="text-sm font-black uppercase tracking-widest text-[#20BC64] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#20BC64] animate-pulse" />
              Recent Commitments (Backlog)
            </h2>
            <span className="text-xs font-bold text-white/40 px-3 py-1 bg-white/5 rounded-full">{commitments.length} Jobs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] font-black uppercase tracking-widest text-white/30 border-b border-white/5">
                  <th className="p-4 w-24">Job #</th>
                  <th className="p-4">Project Name</th>
                  <th className="p-4 w-32">Status</th>
                  <th className="p-4 w-24">State</th>
                  <th className="p-4 w-32 text-right">Contract Amt</th>
                  <th className="p-4 w-32 text-right">Billed</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-white/5">
                {commitments.map((c: any, i: number) => {
                  const pct = Math.min(100, Math.max(0, (c.billedToDate / (c.contractAmount || 1)) * 100));
                  return (
                    <tr key={i} className="hover:bg-white/5 transition-colors">
                      <td className="p-4 font-mono text-xs text-white/50">{c.jobNo || '—'}</td>
                      <td className="p-4 font-bold">{c.jobName}</td>
                      <td className="p-4">
                        <span className="px-2 py-1 bg-white/5 text-white/70 text-[10px] font-bold uppercase rounded-md">
                          {c.status || 'Active'}
                        </span>
                      </td>
                      <td className="p-4 text-white/50">{c.state || '—'}</td>
                      <td className="p-4 font-black text-right text-white">{fmt(c.contractAmount)}</td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-[#20BC64] rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs font-bold text-[#20BC64] w-8">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── BID ACTIVITY PIPELINE (KANBAN-ISH) ─── */}
        <section>
          <div className="flex items-center gap-3 mb-4 mt-8">
            <h2 className="text-sm font-black uppercase tracking-widest text-white/60">Bid Activity Pipeline</h2>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* COLUMN 1: SUBMITTED / UNDER REVIEW */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-blue-400">Submitted & Under Review</h3>
                <span className="text-xs font-bold text-white/30">{submittedBids.length}</span>
              </div>
              {submittedBids.map((b: any, i: number) => (
                <div key={i} className="bg-[#1e2023] p-4 rounded-xl border border-white/5 hover:border-blue-500/30 transition-colors shadow-lg group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500/50" />
                  <div className="flex justify-between items-start mb-2 pl-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{b.dateBid}</p>
                    <span className="px-2 py-0.5 bg-blue-500/10 text-blue-400 text-[10px] font-black rounded">{b.probability || '??%'}</span>
                  </div>
                  <h4 className="font-bold text-white leading-tight mb-1 pl-2 pr-4">{b.jobName}</h4>
                  <p className="text-xs text-white/50 mb-3 pl-2 truncate">{b.customer}</p>
                  
                  <div className="bg-black/20 p-2.5 rounded-lg border border-white/5 ml-2">
                    <p className="text-[10px] text-white/40 uppercase font-bold tracking-wider mb-1">Proposal</p>
                    <p className="text-lg font-black text-white">{fmt(b.proposal)}</p>
                  </div>
                  
                  {b.feedback && (
                    <div className="mt-3 pl-2">
                      <p className="text-[10px] text-amber-500/70 uppercase font-bold tracking-wider mb-0.5">Feedback</p>
                      <p className="text-xs text-white/60 line-clamp-2 italic">"{b.feedback}"</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* COLUMN 2: WON / AWARDED */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-[#20BC64]">Won / Awarded</h3>
                <span className="text-xs font-bold text-white/30">{wonBids.length}</span>
              </div>
              {wonBids.map((b: any, i: number) => (
                <div key={i} className="bg-[#1e2023] p-4 rounded-xl border border-white/5 hover:border-[#20BC64]/30 transition-colors shadow-lg group relative overflow-hidden opacity-90">
                  <div className="absolute top-0 left-0 w-1 h-full bg-[#20BC64]/50" />
                  <div className="flex justify-between items-start mb-2 pl-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{b.dateBid}</p>
                    <span className="px-2 py-0.5 bg-[#20BC64]/10 text-[#20BC64] text-[10px] font-black rounded">WON</span>
                  </div>
                  <h4 className="font-bold text-white leading-tight mb-1 pl-2 pr-4">{b.jobName}</h4>
                  <p className="text-xs text-white/50 mb-3 pl-2 truncate">{b.customer}</p>
                  <div className="bg-black/20 p-2.5 rounded-lg border border-[#20BC64]/10 ml-2">
                    <p className="text-lg font-black text-[#20BC64]">{fmt(b.awarded > 0 ? b.awarded : b.proposal)}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* COLUMN 3: LOST */}
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center mb-2 px-1">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-red-500/70">Lost</h3>
                <span className="text-xs font-bold text-white/30">{lostBids.length}</span>
              </div>
              {lostBids.map((b: any, i: number) => (
                <div key={i} className="bg-[#1e2023] p-4 rounded-xl border border-white/5 opacity-60 grayscale hover:grayscale-0 transition-all shadow-lg group relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-500/30" />
                  <div className="flex justify-between items-start mb-2 pl-2">
                    <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">{b.dateBid}</p>
                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 text-[10px] font-black rounded">LOST</span>
                  </div>
                  <h4 className="font-bold text-white/70 leading-tight mb-1 pl-2 pr-4 line-through decoration-red-500/30">{b.jobName}</h4>
                  <p className="text-xs text-white/40 mb-3 pl-2 truncate">{b.customer}</p>
                  
                  {b.feedback && (
                    <div className="mt-3 pl-2">
                      <p className="text-[10px] text-red-400/50 uppercase font-bold tracking-wider mb-0.5">Loss Reason</p>
                      <p className="text-xs text-white/50 line-clamp-2">"{b.feedback}"</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

          </div>
        </section>

      </div>
    </div>
  );
}
