import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';
import { AlertCard, EmptyState, HealthPill, KpiCard, PageShell, ProgressBar, Section } from '@/components/OperationsUI';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type ComplianceRow = {
  name: string;
  cdlExpiration: string;
  cdlDaysLeft: number | null;
  medExpiration: string;
  medDaysLeft: number | null;
  randomStatus: string;
};

type SafetyRow = {
  rank: number;
  name: string;
  score: number;
  totalMiles: number;
  maxSpeed: number;
  events: number;
  lightSpeeding: number;
  moderateSpeeding: number;
  heavySpeeding: number;
  severeSpeeding: number;
  harshAccel: number;
  harshBrake: number;
  harshTurn: number;
  mobileUsage: number;
  noSeatBelt: number;
};

const DOT_COMPLIANCE_SHEET_ID = process.env.DOT_COMPLIANCE_SHEET_ID || '1Sjy2D088jh28_NYGK8Zcp73hxrkRQRAD3vmhSw2sAUg';
const DOT_COMPLIANCE_DRIVER_GID = process.env.DOT_COMPLIANCE_DRIVER_GID || '878551575';

function clean(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function number(value: string | undefined): number {
  const parsed = parseFloat((value || '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function loadCsvRows(filename: string): Record<string, string>[] {
  const csvPath = path.join(process.cwd(), 'data', filename);
  if (!fs.existsSync(csvPath)) return [];
  return Papa.parse<Record<string, string>>(fs.readFileSync(csvPath, 'utf-8'), {
    header: true,
    skipEmptyLines: true,
  }).data;
}

function buildDriverCompliance(rows: Record<string, string>[]): ComplianceRow[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysUntil = (dateStr: string): number | null => {
    if (!dateStr) return null;
    const parsed = new Date(dateStr.trim());
    if (!Number.isFinite(parsed.getTime())) return null;
    return Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);
  };

  return rows.map(row => {
    const name = clean(row['Driver Name']);
    if (!name) return null;
    const cdlExpiration = clean(row['CDL/DL Expiration Date']);
    const medExpiration = clean(row['Medical Certificate (MEC) Expiration']);
    return {
      name,
      cdlExpiration,
      cdlDaysLeft: daysUntil(cdlExpiration),
      medExpiration,
      medDaysLeft: daysUntil(medExpiration),
      randomStatus: clean(row['Random Selection Status']),
    };
  }).filter((row): row is ComplianceRow => row !== null);
}

async function loadDriverCompliance(): Promise<ComplianceRow[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${DOT_COMPLIANCE_SHEET_ID}/export?format=csv&gid=${DOT_COMPLIANCE_DRIVER_GID}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
    if (response.ok) {
      const parsed = Papa.parse<Record<string, string>>(await response.text(), { header: true, skipEmptyLines: true });
      const rows = buildDriverCompliance(parsed.data);
      if (rows.length) return rows;
    }
  } catch (error) {
    console.error('[fleet] DOT compliance live fetch failed', error);
  }
  return buildDriverCompliance(loadCsvRows('driver_compliance.csv'));
}

function loadDriverSafety(): SafetyRow[] {
  return loadCsvRows('samsara_driver_safety.csv').map(row => {
    const rank = parseInt(row['Rank'] || '', 10) || 0;
    if (!rank) return null;
    return {
      rank,
      name: clean(row['Driver Name']),
      score: number(row['Safety Score']),
      totalMiles: number(row['Total Distance (mi)']),
      maxSpeed: number(row['Max Speed (mph)']),
      events: number(row['Total Events']),
      lightSpeeding: number(row['Percent Light Speeding']),
      moderateSpeeding: number(row['Percent Moderate Speeding']),
      heavySpeeding: number(row['Percent Heavy Speeding']),
      severeSpeeding: number(row['Percent Severe Speeding']),
      harshAccel: number(row['Harsh Accel']),
      harshBrake: number(row['Harsh Brake']),
      harshTurn: number(row['Harsh Turn']),
      mobileUsage: number(row['Mobile Usage']),
      noSeatBelt: number(row['No Seat Belt']),
    };
  }).filter((row): row is SafetyRow => row !== null);
}

function daysTone(days: number | null) {
  if (days == null) return { label: 'Missing', tone: 'warning' as const };
  if (days <= 30) return { label: `${days}d`, tone: 'critical' as const };
  if (days <= 90) return { label: `${days}d`, tone: 'warning' as const };
  return { label: `${days}d`, tone: 'ok' as const };
}

function hoursTone(value: number | null | undefined, cap: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return { label: 'Not reporting', pct: 0, tone: 'warning' as const };
  return {
    label: `${value.toFixed(1)}h`,
    pct: Math.round((value / cap) * 100),
    tone: value <= 2 ? 'critical' as const : value <= 4 ? 'warning' as const : 'ok' as const,
  };
}

function scoreTone(score: number) {
  if (score >= 90) return 'ok' as const;
  if (score >= 75) return 'warning' as const;
  return 'critical' as const;
}

export default async function FleetPage() {
  const [samsara, compliance, safety] = await Promise.all([
    getGlobalSamsara(),
    loadDriverCompliance(),
    Promise.resolve(loadDriverSafety()),
  ]);

  const vehicles = samsara.vehicles || [];
  const hos = samsara.hos || [];
  const vehiclesAssigned = vehicles.filter((vehicle: any) => vehicle.driver && vehicle.driver !== 'Unassigned');
  const unassignedVehicles = vehicles.filter((vehicle: any) => !vehicle.driver || vehicle.driver === 'Unassigned');
  const expiringSoon = compliance.filter(row =>
    (row.cdlDaysLeft != null && row.cdlDaysLeft <= 30) ||
    (row.medDaysLeft != null && row.medDaysLeft <= 30) ||
    row.medDaysLeft == null
  );
  const avgSafetyScore = safety.length ? Math.round(safety.reduce((sum, row) => sum + row.score, 0) / safety.length) : null;
  const riskEvents = safety.reduce((sum, row) => sum + row.events, 0);
  const hosNotReporting = samsara.configured && hos.length === 0;
  const lowboy = vehicles.find((vehicle: any) => /lowboy|david/i.test(`${vehicle.name} ${vehicle.driver}`));
  const lowboyHos = hos.find((row: any) => /david|hudson/i.test(row.driverName || ''));

  return (
    <PageShell title="Fleet" question="Are my drivers safe, legal, and where they should be?" updatedAt={samsara.timestamp ? new Date(samsara.timestamp).toLocaleString('en-US') : 'Samsara source'}>
      <div className="mb-6 grid gap-3">
        {hosNotReporting ? (
          <AlertCard severity="HIGH" title="HOS is not reporting" detail="Samsara vehicle GPS is connected, but HOS clock rows are not coming through this token." owner="Fleet" />
        ) : null}
        {expiringSoon.length > 0 ? (
          <AlertCard severity="CRITICAL" title={`${expiringSoon.length} driver compliance items need review`} detail="CDL or medical card is missing or inside the 30-day window." owner="Fleet" />
        ) : null}
        {unassignedVehicles.length > 0 ? (
          <AlertCard severity="HIGH" title={`${unassignedVehicles.length} vehicles have no assigned driver`} detail="Fleet accountability is not clear until each reporting vehicle has a driver." owner="Fleet" />
        ) : null}
      </div>

      <Section title="Lowboy Command" kicker="Moved to the top because lowboy decisions affect the whole schedule.">
        <div className="grid gap-4 p-4 md:grid-cols-4">
          <div className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">Location</p>
            <p className="mt-2 font-extrabold text-[#0F172A]">{lowboy?.address || 'No lowboy signal'}</p>
            <p className="mt-1 text-sm text-[#475569]">{lowboy ? `${Math.round(lowboy.speed || 0)} mph · ${lowboy.driver || 'Driver missing'}` : 'Samsara did not return a lowboy vehicle.'}</p>
          </div>
          {[
            { title: 'Drive Time', data: hoursTone(lowboyHos?.driveRemainingHrs, 11) },
            { title: 'Shift', data: hoursTone(lowboyHos?.shiftRemainingHrs, 14) },
            { title: 'Cycle', data: hoursTone(lowboyHos?.cycleRemainingHrs, 60) },
          ].map(item => (
            <div key={item.title} className="rounded-lg border border-[rgba(31,41,55,0.15)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#475569]">{item.title}</p>
                <HealthPill label={item.data.label} tone={item.data.tone} />
              </div>
              <ProgressBar value={item.data.pct} tone={item.data.tone} />
            </div>
          ))}
        </div>
      </Section>

      <div className="my-6 grid gap-4 md:grid-cols-4">
        <KpiCard label="Vehicles Reporting" value={vehicles.length} context={`${vehiclesAssigned.length} assigned`} tone={vehicles.length ? 'ok' : 'warning'} />
        <KpiCard label="Drivers On File" value={compliance.length} context="DOT compliance sheet" />
        <KpiCard label="Avg Safety Score" value={avgSafetyScore ?? 'Missing'} context="Samsara safety export" tone={avgSafetyScore == null ? 'warning' : scoreTone(avgSafetyScore)} />
        <KpiCard label="Risk Events This Week" value={riskEvents} context="From driver safety rows" tone={riskEvents ? 'warning' : 'ok'} />
      </div>

      <div className="grid gap-6">
        <Section title="Driver Safety Scorecard" kicker="Score is rated from Samsara safety rows: speeding, harsh events, mobile use, seat belt, events, and miles. Worst scores first.">
          {safety.length === 0 ? (
            <EmptyState title="No driver safety rows found" detail="The Samsara safety export did not return rows." />
          ) : (
            <div className="overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr>
                    {['Driver', 'Score', 'Events', 'Miles', 'Max Speed', 'Speeding', 'Behaviors Rated'].map(header => (
                      <th key={header} className="px-4 py-3 text-left">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safety.sort((a, b) => a.score - b.score).map(row => {
                    const speeding = row.lightSpeeding + row.moderateSpeeding + row.heavySpeeding + row.severeSpeeding;
                    const behaviors = row.harshAccel + row.harshBrake + row.harshTurn + row.mobileUsage + row.noSeatBelt;
                    return (
                      <tr key={row.name}>
                        <td className="px-4 py-3 font-extrabold">{row.name}</td>
                        <td className="px-4 py-3"><HealthPill label={`${row.score}`} tone={scoreTone(row.score)} /></td>
                        <td className="px-4 py-3">{row.events}</td>
                        <td className="px-4 py-3">{Math.round(row.totalMiles).toLocaleString()}</td>
                        <td className="px-4 py-3">{Math.round(row.maxSpeed)} mph</td>
                        <td className="px-4 py-3">{speeding.toFixed(1)}%</td>
                        <td className="px-4 py-3">{behaviors}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Vehicle Locations" kicker="Only vehicles currently returned by Samsara are shown.">
          {vehicles.length === 0 ? (
            <EmptyState title="No vehicles reporting" detail="Samsara did not return vehicle location rows." />
          ) : (
            <div className="overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr>
                    {['Vehicle', 'Driver', 'Location', 'Speed', 'Status'].map(header => (
                      <th key={header} className="px-4 py-3 text-left">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((vehicle: any) => (
                    <tr key={vehicle.id || vehicle.name}>
                      <td className="px-4 py-3 font-extrabold">{vehicle.name}</td>
                      <td className="px-4 py-3">{vehicle.driver || 'Unassigned'}</td>
                      <td className="px-4 py-3">{vehicle.address || 'Location missing'}</td>
                      <td className="px-4 py-3">{Math.round(vehicle.speed || 0)} mph</td>
                      <td className="px-4 py-3"><HealthPill label={(vehicle.speed || 0) > 2 ? 'Moving' : 'Parked'} tone={(vehicle.speed || 0) > 2 ? 'ok' : 'neutral'} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="DOT Compliance" kicker="Sorted by nearest CDL or medical-card deadline.">
          {compliance.length === 0 ? (
            <EmptyState title="No DOT compliance rows found" detail="The driver compliance sheet did not return rows." />
          ) : (
            <div className="overflow-x-auto">
              <table className="ops-table w-full">
                <thead>
                  <tr>
                    {['Driver', 'CDL Expires', 'CDL Days Left', 'Medical Card Expires', 'Medical Days Left', 'Random Status'].map(header => (
                      <th key={header} className="px-4 py-3 text-left">{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compliance.sort((a, b) => Math.min(a.cdlDaysLeft ?? 9999, a.medDaysLeft ?? 9999) - Math.min(b.cdlDaysLeft ?? 9999, b.medDaysLeft ?? 9999)).map(row => {
                    const cdl = daysTone(row.cdlDaysLeft);
                    const med = daysTone(row.medDaysLeft);
                    return (
                      <tr key={row.name}>
                        <td className="px-4 py-3 font-extrabold">{row.name}</td>
                        <td className="px-4 py-3">{row.cdlExpiration || 'Missing'}</td>
                        <td className="px-4 py-3"><HealthPill label={cdl.label} tone={cdl.tone} /></td>
                        <td className="px-4 py-3">{row.medExpiration || 'Missing'}</td>
                        <td className="px-4 py-3"><HealthPill label={med.label} tone={med.tone} /></td>
                        <td className="px-4 py-3">{row.randomStatus || 'No status'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
