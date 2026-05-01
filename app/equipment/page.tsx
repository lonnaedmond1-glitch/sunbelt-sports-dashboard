import Link from 'next/link';
import { AlertCard, EmptyState, HealthPill, KpiCard, PageShell, Section } from '@/components/OperationsUI';
import { fetchVisionLinkAssets } from '@/lib/sheets-data';

export const revalidate = 300;

function daysSince(value: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor((Date.now() - parsed) / (1000 * 60 * 60 * 24));
}

function assetType(assetName: string): string {
  const text = assetName.toLowerCase();
  if (/roller/.test(text)) return 'Roller';
  if (/skid|bobcat|loader/.test(text)) return 'Loader';
  if (/grader/.test(text)) return 'Grader';
  if (/paver|paving/.test(text)) return 'Paver';
  if (/compactor/.test(text)) return 'Compactor';
  return 'Other';
}

function assetStatus(days: number | null) {
  if (days == null) return { label: 'No signal', tone: 'warning' as const, rank: 0 };
  if (days > 90) return { label: 'Stale', tone: 'critical' as const, rank: 0 };
  if (days > 30) return { label: 'Check', tone: 'warning' as const, rank: 1 };
  return { label: 'OK', tone: 'ok' as const, rank: 2 };
}

export default async function EquipmentPage({ searchParams }: { searchParams?: Promise<{ type?: string }> }) {
  const params = await searchParams;
  const assets = await fetchVisionLinkAssets();
  const enriched = assets.map(asset => {
    const staleDays = daysSince(asset.Last_Reported);
    return {
      ...asset,
      staleDays,
      type: assetType(`${asset.Asset_Name} ${asset.Model}`),
      statusInfo: assetStatus(staleDays),
    };
  });
  const filtered = params?.type ? enriched.filter(asset => asset.type === params.type) : enriched;
  const stale = enriched.filter(asset => asset.staleDays == null || asset.staleDays > 90);
  const reporting = enriched.filter(asset => asset.statusInfo.label === 'OK');
  const totalHours = enriched.reduce((sum, asset) => sum + (asset.Hours || 0), 0);
  const latestSync = enriched.map(asset => asset.Synced_At).filter(Boolean).sort().at(-1);
  const types = Array.from(new Set(enriched.map(asset => asset.type))).sort();

  return (
    <PageShell title="Equipment" question="Which assets need attention?" updatedAt={latestSync ? new Date(latestSync).toLocaleString('en-US') : 'VisionLink source'}>
      {stale.length > 0 ? (
        <div className="mb-6 grid gap-3 md:grid-cols-2">
          {stale.slice(0, 2).map(asset => (
            <AlertCard
              key={asset.Asset_ID || asset.Serial}
              severity="CRITICAL"
              title={`${asset.Asset_Name || asset.Model} is stale`}
              detail={asset.staleDays == null ? 'VisionLink has no last check-in date for this asset.' : `Last check-in was ${asset.staleDays} days ago.`}
              owner="Equipment"
            />
          ))}
        </div>
      ) : null}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Total Owned" value={enriched.length} context="VisionLink asset rows" />
        <KpiCard label="Reporting On Time" value={`${reporting.length}`} context={`${enriched.length ? Math.round((reporting.length / enriched.length) * 100) : 0}% reporting`} tone={reporting.length === enriched.length ? 'ok' : 'warning'} />
        <KpiCard label="Stale" value={stale.length} context="No check-in over 90 days" tone={stale.length ? 'critical' : 'ok'} />
        <KpiCard label="Total Engine Hours" value={Math.round(totalHours).toLocaleString()} context="Sum of live hour meters" />
      </div>

      <Section
        title="Asset Table"
        kicker="Default sort is most stale first."
        action={<Link href="/rentals" className="rounded-full border border-[#0BBE63] px-4 py-2 text-sm font-extrabold text-[#047857]">Open Rentals</Link>}
      >
        <div className="flex flex-wrap gap-2 border-b border-[rgba(31,41,55,0.15)] p-4">
          <Link href="/equipment" className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#475569]">All</Link>
          {types.map(type => (
            <Link key={type} href={`/equipment?type=${encodeURIComponent(type)}`} className="rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-bold text-[#475569]">{type}</Link>
          ))}
        </div>
        {filtered.length === 0 ? (
          <EmptyState title="No VisionLink assets found" detail="The VisionLink source did not return asset rows." />
        ) : (
          <div className="overflow-x-auto">
            <table className="ops-table w-full">
              <thead>
                <tr>
                  {['Asset', 'Type', 'Hours', 'Last Check-In', 'Jobsite', 'Geofence', 'Status'].map(header => (
                    <th key={header} className="px-4 py-3 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.sort((a, b) => (a.statusInfo.rank - b.statusInfo.rank) || ((b.staleDays || 9999) - (a.staleDays || 0))).map(asset => (
                  <tr key={asset.Asset_ID || asset.Serial}>
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-[#0F172A]">{asset.Asset_Name || asset.Model || asset.Asset_ID}</p>
                      <p className="text-xs text-[#475569]">{asset.Make} {asset.Model} · {asset.Serial}</p>
                    </td>
                    <td className="px-4 py-3">{asset.type}</td>
                    <td className="ops-money px-4 py-3 font-bold">{Math.round(asset.Hours || 0).toLocaleString()}</td>
                    <td className="px-4 py-3">{asset.Last_Reported || 'Missing'}</td>
                    <td className="px-4 py-3">{asset.Matched_Job_Name || asset.Matched_Job_Id || 'Not assigned'}</td>
                    <td className="px-4 py-3">{asset.Geofence || 'Missing'}</td>
                    <td className="px-4 py-3"><HealthPill label={asset.statusInfo.label} tone={asset.statusInfo.tone} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </PageShell>
  );
}
