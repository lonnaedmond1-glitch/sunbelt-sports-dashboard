import Link from 'next/link';
import { EmptyState, HealthPill, KpiCard, PageShell, Section, moneyCompact } from '@/components/OperationsUI';
import { fetchLiveJobs, fetchLiveRentals } from '@/lib/sheets-data';
import { formatDollars } from '@/lib/format';

export const revalidate = 300;

const REP_EMAILS: Record<string, string> = {
  united: 'jbeasley@ur.com',
  'united rentals': 'jbeasley@ur.com',
  sunbelt: 'Justin.Stanley@sunbeltrentals.com',
  'sunbelt rentals': 'Justin.Stanley@sunbeltrentals.com',
  wm: 'midsouthbuildersdirect@wm.com',
  'waste management': 'midsouthbuildersdirect@wm.com',
};

function parseDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function daysBetween(start: Date | null, end: Date | null): number {
  if (!start || !end) return 0;
  const a = new Date(start); a.setHours(0, 0, 0, 0);
  const b = new Date(end); b.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / 86_400_000));
}

function rentalStatus(rental: any) {
  const status = String(rental.rentalStatus || '').toLowerCase();
  const calledOff = parseDate(rental.calledOffDate || '');
  const pickup = parseDate(rental.pickupDate || '');
  const now = new Date();
  if (calledOff || (pickup && pickup.getTime() <= now.getTime()) || /called|off.?rent|picked|returned|closed|cancel/.test(status)) {
    return { key: 'called_off', label: 'Called Off', tone: 'neutral' as const, billable: false };
  }
  if (/ordered|not.?delivered|pending|reserved|scheduled/.test(status) || (!rental.dateRented && !rental.daysOnRent)) {
    return { key: 'ordered', label: 'Ordered / Not Delivered', tone: 'warning' as const, billable: false };
  }
  return { key: 'on_site', label: 'On Site', tone: 'ok' as const, billable: true };
}

function repEmail(rental: any): string {
  if (rental.salesRepEmail) return rental.salesRepEmail;
  const vendor = String(rental.vendor || '').toLowerCase();
  return Object.entries(REP_EMAILS).find(([key]) => vendor.includes(key))?.[1] || process.env.RENTAL_DEFAULT_SALES_REP_EMAIL || '';
}

function callOffHref(rental: any, email: string): string {
  const subject = `Call off rental ${rental.contractNumber || ''} - ${rental.equipmentType || 'equipment'}`;
  const body = [
    'Please call off this rental.',
    '',
    `Vendor: ${rental.vendor || ''}`,
    `Contract: ${rental.contractNumber || ''}`,
    `Equipment: ${rental.equipmentType || ''}`,
    `Job: ${rental.jobName || ''}`,
    `Pickup date on file: ${rental.pickupDate || ''}`,
    '',
    'Confirm off-rent date and pickup status.',
  ].join('\n');
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default async function RentalsPage() {
  const [rentals, jobs] = await Promise.all([fetchLiveRentals(), fetchLiveJobs()]);
  const jobByName = new Map(jobs.map((job: any) => [String(job.Job_Name || '').trim().toLowerCase(), job]));
  const enriched = rentals.map((rental: any) => {
    const status = rentalStatus(rental);
    const rented = parseDate(rental.dateRented || '');
    const calledOff = parseDate(rental.calledOffDate || rental.pickupDate || '');
    const effectiveDays = status.key === 'called_off' ? daysBetween(rented, calledOff) : Number(rental.daysOnRent || 0);
    const rate = Number(rental.dayRate || 0);
    const accrued = status.key === 'ordered' ? 0 : Number(rental.accruedAmount || effectiveDays * rate || 0);
    const job = jobByName.get(String(rental.jobName || '').trim().toLowerCase());
    return {
      ...rental,
      status,
      rep: repEmail(rental),
      effectiveDays,
      dailyBurn: status.billable ? rate : 0,
      accrued,
      jobNumber: job?.Job_Number || '',
      rateMissing: rate <= 0 && status.key !== 'called_off',
    };
  });

  const onSite = enriched.filter(r => r.status.key === 'on_site');
  const ordered = enriched.filter(r => r.status.key === 'ordered');
  const calledOff = enriched.filter(r => r.status.key === 'called_off');
  const dailyBurn = enriched.reduce((sum, r) => sum + r.dailyBurn, 0);
  const accruedBurn = enriched.reduce((sum, r) => sum + r.accrued, 0);
  const missingRates = enriched.filter(r => r.rateMissing);
  const latestSync = enriched.map(r => r.syncedAt || r.emailDate).filter(Boolean).sort().at(-1);

  return (
    <PageShell title="Rentals" question="Which rented items are ordered, on site, or called off?" updatedAt={latestSync ? new Date(latestSync).toLocaleString('en-US') : 'Rental source'}>
      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <KpiCard label="Active Rentals" value={onSite.length} context="Currently billable" tone={onSite.length ? 'warning' : 'ok'} />
        <KpiCard label="Ordered" value={ordered.length} context="Not delivered yet" tone={ordered.length ? 'warning' : 'neutral'} />
        <KpiCard label="Called Off" value={calledOff.length} context="Not burning daily cost" />
        <KpiCard label="Daily Burn" value={moneyCompact(dailyBurn)} context="On-site rentals only" tone={dailyBurn ? 'warning' : 'ok'} />
        <KpiCard label="Accumulated Burn" value={moneyCompact(accruedBurn)} context={`${missingRates.length} missing rates`} tone={missingRates.length ? 'warning' : 'neutral'} />
      </div>

      <Section title="Rental Register" kicker="Call-off links create an email draft only. They do not send automatically.">
        {enriched.length === 0 ? (
          <EmptyState title="No rental rows found" detail="The rental source did not return live rental data." />
        ) : (
          <div className="overflow-x-auto">
            <table className="ops-table w-full">
              <thead>
                <tr>
                  {['Equipment / Vendor', 'Job', 'Status', 'Days', 'Daily Rate', 'Burn', 'Sales Rep', 'Action'].map(header => (
                    <th key={header} className="px-4 py-3 text-left">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {enriched.sort((a, b) => b.dailyBurn - a.dailyBurn).map((rental, index) => (
                  <tr key={`${rental.contractNumber}-${rental.equipmentType}-${index}`}>
                    <td className="px-4 py-3">
                      <p className="font-extrabold text-[#0F172A]">{rental.equipmentType || rental.className || 'Missing equipment name'}</p>
                      <p className="text-xs text-[#475569]">{rental.vendor || 'Unknown vendor'} · {rental.contractNumber || 'No contract #'}</p>
                    </td>
                    <td className="px-4 py-3">
                      {rental.jobNumber ? <Link href={`/jobs/${rental.jobNumber}`} className="font-bold text-[#0BBE63]">{rental.jobName}</Link> : rental.jobName || 'Unassigned'}
                    </td>
                    <td className="px-4 py-3"><HealthPill label={rental.status.label} tone={rental.status.tone} /></td>
                    <td className="px-4 py-3">{rental.effectiveDays}d</td>
                    <td className="ops-money px-4 py-3">{rental.rateMissing ? <span className="font-extrabold text-[#F59E0B]">Missing</span> : formatDollars(rental.dayRate)}</td>
                    <td className="ops-money px-4 py-3 font-extrabold">{formatDollars(rental.accrued)}</td>
                    <td className="px-4 py-3">{rental.rep || 'Rep missing'}</td>
                    <td className="px-4 py-3">
                      {rental.rep ? (
                        <a href={callOffHref(rental, rental.rep)} className="rounded-full border border-[rgba(31,41,55,0.15)] px-3 py-1 text-xs font-extrabold text-[#0F172A]">
                          Call off
                        </a>
                      ) : (
                        <span className="text-xs font-bold text-[#DC2626]">Add rep email</span>
                      )}
                    </td>
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
