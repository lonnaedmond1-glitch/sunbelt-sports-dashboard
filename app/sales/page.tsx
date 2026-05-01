import { EmptyState, HealthPill, KpiCard, PageShell, ProgressBar, Section, moneyCompact } from '@/components/OperationsUI';
import { fetchBidLog } from '@/lib/sheets-data';
import { formatDollars } from '@/lib/format';

export const revalidate = 300;

function bucket(status: string): 'Won' | 'Lost' | 'Under Review' | 'Budgetary' | 'Other' {
  const text = String(status || '').toUpperCase();
  if (text.includes('WIN')) return 'Won';
  if (text.includes('LOSS') || text.includes('LOST')) return 'Lost';
  if (text.includes('UNDER REVIEW')) return 'Under Review';
  if (text.includes('BUDGETARY')) return 'Budgetary';
  return 'Other';
}

function stageTone(stage: string) {
  if (stage === 'Won') return 'ok' as const;
  if (stage === 'Lost') return 'critical' as const;
  if (stage === 'Under Review') return 'info' as const;
  if (stage === 'Budgetary') return 'warning' as const;
  return 'neutral' as const;
}

export default async function SalesPage() {
  const bids = await fetchBidLog();
  const rows = bids.map(bid => ({ ...bid, bucket: bucket(bid.Status) }));
  const wins = rows.filter(row => row.bucket === 'Won');
  const lost = rows.filter(row => row.bucket === 'Lost');
  const review = rows.filter(row => row.bucket === 'Under Review');
  const budgetary = rows.filter(row => row.bucket === 'Budgetary');
  const totalProposal = rows.reduce((sum, row) => sum + row.Proposal, 0);
  const totalWon = wins.reduce((sum, row) => sum + (row.Awarded || row.Proposal), 0);
  const totalReview = review.reduce((sum, row) => sum + (row.Pipe || row.Proposal * (row.Probability / 100)), 0);
  const totalLost = lost.reduce((sum, row) => sum + (row.Lost || row.Proposal), 0);
  const decided = wins.length + lost.length;
  const winRate = decided ? Math.round((wins.length / decided) * 100) : 0;

  return (
    <PageShell title="Sales" question="Where is every bid in the pipeline?" updatedAt={`${rows.length} bid rows read`}>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Total Bids" value={rows.length} context={`${moneyCompact(totalProposal)} proposed`} />
        <KpiCard label="Won YTD" value={moneyCompact(totalWon)} context={`${wins.length} won · ${winRate}% win rate`} tone="ok" />
        <KpiCard label="Active In Review" value={moneyCompact(totalReview)} context={`${review.length} bids under review`} tone={review.length ? 'warning' : 'neutral'} />
        <KpiCard label="Lost" value={moneyCompact(totalLost)} context={`${lost.length} lost bids`} tone={lost.length ? 'critical' : 'neutral'} />
      </div>

      <Section title="Pipeline Funnel" kicker="Budgetary to submitted to under review to won or lost.">
        {rows.length === 0 ? (
          <EmptyState title="No bid rows found" detail="The bid log did not return rows." />
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-4">
            {[
              { label: 'Budgetary', rows: budgetary },
              { label: 'Under Review', rows: review },
              { label: 'Won', rows: wins },
              { label: 'Lost', rows: lost },
            ].map(stage => {
              const value = stage.rows.reduce((sum, row) => sum + row.Proposal, 0);
              return (
                <div key={stage.label} className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <HealthPill label={stage.label} tone={stageTone(stage.label)} />
                    <span className="text-sm font-extrabold text-[#0F172A]">{stage.rows.length}</span>
                  </div>
                  <p className="ops-display text-[32px] font-extrabold leading-none">{moneyCompact(value)}</p>
                  <div className="mt-4"><ProgressBar value={rows.length ? (stage.rows.length / rows.length) * 100 : 0} tone={stageTone(stage.label)} /></div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Under Review" kicker="Default work queue for the Monday sales meeting." className="mt-6">
        {review.length === 0 ? (
          <EmptyState title="No bids under review" detail="No active review rows came back from the bid log." />
        ) : (
          <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
            {review.sort((a, b) => b.Probability - a.Probability).slice(0, 18).map(row => (
              <div key={row.Bid_Number} className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#0BBE63]">{row.Bid_Number}</p>
                    <p className="mt-1 font-extrabold text-[#0F172A]">{row.Job_Name || 'Unnamed bid'}</p>
                    <p className="mt-1 text-sm text-[#475569]">{row.Customer}</p>
                  </div>
                  <HealthPill label={`${row.Probability}%`} tone={row.Probability >= 70 ? 'ok' : row.Probability >= 40 ? 'warning' : 'neutral'} />
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <span className="text-xs text-[#475569]">{row.Location || row.Expected_Start || 'No location'}</span>
                  <strong>{formatDollars(row.Proposal)}</strong>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Full Bid Log" kicker="Complete scan table from the bid log." className="mt-6">
        <div className="overflow-x-auto">
          <table className="ops-table w-full">
            <thead>
              <tr>
                {['Bid #', 'Date', 'Customer', 'Job', 'Location', 'Probability', 'Proposal', 'Status', 'Feedback'].map(header => (
                  <th key={header} className="px-4 py-3 text-left">{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.Bid_Number}>
                  <td className="px-4 py-3 font-extrabold">{row.Bid_Number}</td>
                  <td className="px-4 py-3">{row.Date_Bid}</td>
                  <td className="px-4 py-3">{row.Customer}</td>
                  <td className="px-4 py-3 font-bold">{row.Job_Name}</td>
                  <td className="px-4 py-3">{row.Location}</td>
                  <td className="px-4 py-3">{row.Probability}%</td>
                  <td className="ops-money px-4 py-3 font-extrabold">{formatDollars(row.Proposal)}</td>
                  <td className="px-4 py-3"><HealthPill label={row.bucket} tone={stageTone(row.bucket)} /></td>
                  <td className="px-4 py-3 text-[#475569]">{row.Feedback || 'No feedback'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </PageShell>
  );
}
