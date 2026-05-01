import { EmptyState, HealthPill, KpiCard, PageShell, ProgressBar, Section } from '@/components/OperationsUI';
import { fetchMarketingLeads } from '@/lib/sheets-data';

export const revalidate = 300;

export default async function MarketingPage() {
  const leads = await fetchMarketingLeads();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const mtd = leads.filter(lead => (lead.Date || '') >= monthStart);
  const qualified = leads.filter(lead => /qualified|won|signed/i.test(lead.Status || ''));
  const bySource = new Map<string, number>();
  leads.forEach(lead => bySource.set(lead.Source || 'Unknown source', (bySource.get(lead.Source || 'Unknown source') || 0) + 1));
  const sourceRows = Array.from(bySource.entries()).sort((a, b) => b[1] - a[1]);
  const conversion = leads.length ? Math.round((qualified.length / leads.length) * 100) : 0;

  return (
    <PageShell title="Marketing" question="Where is new work coming from?" updatedAt={`${leads.length} lead rows read`}>
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="New Leads MTD" value={leads.length ? mtd.length : 'Missing'} context="Current month" tone={mtd.length ? 'ok' : 'neutral'} />
        <KpiCard label="Total Leads YTD" value={leads.length || 'Missing'} context="Marketing_Leads rows" />
        <KpiCard label="Qualified" value={leads.length ? qualified.length : 'Missing'} context="Qualified, won, or signed" tone={qualified.length ? 'ok' : 'neutral'} />
        <KpiCard label="Conversion Rate" value={leads.length ? `${conversion}%` : 'Missing'} context="Qualified / total leads" tone={conversion >= 30 ? 'ok' : conversion > 0 ? 'warning' : 'neutral'} />
      </div>

      {leads.length === 0 ? (
        <Section title="No Lead Data Yet" kicker="Marketing needs source rows before this page can answer the question.">
          <EmptyState
            title="Add your first lead in the Marketing_Leads sheet"
            detail="No rows were returned from the Marketing_Leads tab, so this page will not show fake zeroes."
            href="https://docs.google.com/spreadsheets/d/1yNpkY-gcbeZS2hGPyATTkDdt8iMbmOm4mhy7WGidKfY"
            actionLabel="Open sheet"
          />
        </Section>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
          <Section title="Source Breakdown" kicker="Lead count by source.">
            <div className="space-y-4 p-4">
              {sourceRows.map(([source, count]) => {
                const pct = leads.length ? (count / leads.length) * 100 : 0;
                return (
                  <div key={source}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span className="font-extrabold text-[#0F172A]">{source}</span>
                      <span className="font-bold text-[#475569]">{count} · {Math.round(pct)}%</span>
                    </div>
                    <ProgressBar value={pct} tone="ok" />
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Recent Leads" kicker="Newest rows first.">
            <div className="overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr>
                    {['Date', 'Source', 'Contact', 'Project', 'Status', 'Owner'].map(header => (
                      <th key={header} className="px-4 py-3 text-left">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {leads.slice(0, 30).map((lead, index) => (
                    <tr key={`${lead.Date}-${lead.Contact}-${index}`}>
                      <td className="px-4 py-3">{lead.Date}</td>
                      <td className="px-4 py-3 font-bold">{lead.Source || 'Unknown source'}</td>
                      <td className="px-4 py-3">{lead.Contact || 'No contact'}</td>
                      <td className="px-4 py-3">{lead.Project || 'No project named'}</td>
                      <td className="px-4 py-3"><HealthPill label={lead.Status || 'New'} tone={/qualified|won|signed/i.test(lead.Status || '') ? 'ok' : 'neutral'} /></td>
                      <td className="px-4 py-3">{lead.Owner || 'Owner missing'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Source ROI" kicker="Lead source performance. Connect won bids by source as data becomes available." className="xl:col-span-2">
            <div className="grid gap-4 p-4 md:grid-cols-3">
              {sourceRows.slice(0, 6).map(([source, count]) => (
                <div key={source} className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
                  <p className="font-extrabold text-[#0F172A]">{source}</p>
                  <p className="ops-display mt-2 text-[32px] font-extrabold leading-none text-[#0BBE63]">{count}</p>
                  <p className="mt-1 text-xs font-semibold text-[#475569]">Lead rows. Won-bid attribution not connected yet.</p>
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </PageShell>
  );
}
