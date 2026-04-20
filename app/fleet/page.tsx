import React from 'react';
import Link from 'next/link';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';
import { fetchVisionLinkAssets } from '@/lib/sheets-data';
import * as fs from 'fs';
import * as path from 'path';

export const revalidate = 86400;

interface ComplianceRow {
  name: string;
  licenseNumber: string;
  cdlExpiration: string;
  cdlDaysLeft: number | null;
  medExpiration: string;
  medDaysLeft: number | null;
  randomStatus: string;
  randomDeadline: string;
}

function loadDriverCompliance(): ComplianceRow[] {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'driver_compliance.csv');
    if (!fs.existsSync(csvPath)) return [];
    const text = fs.readFileSync(csvPath, 'utf-8');
    const lines = text.split(/\r\n|\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysUntil = (dateStr: string): number | null => {
      if (!dateStr) return null;
      const d = new Date(dateStr.trim());
      if (isNaN(d.getTime())) return null;
      return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.replace(/"/g, '').trim());
      const name = cols[0] || '';
      if (!name) return null;
      return {
        name,
        licenseNumber: cols[1] || '',
        cdlExpiration: cols[2] || '',
        cdlDaysLeft: daysUntil(cols[2] || ''),
        medExpiration: cols[3] || '',
        medDaysLeft: daysUntil(cols[3] || ''),
        randomStatus: cols[4] || '',
        randomDeadline: cols[5] || '',
      };
    }).filter((r): r is ComplianceRow => r !== null && r.name.length > 0);
  } catch { return []; }
}

interface SafetyRow {
  rank: number; name: string; score: number; driveTime: string;
  totalMiles: number; maxSpeed: number; events: number;
}
function loadDriverSafety(): SafetyRow[] {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'samsara_driver_safety.csv');
    if (!fs.existsSync(csvPath)) return [];
    const text = fs.readFileSync(csvPath, 'utf-8');
    const lines = text.split(/\r\n|\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1).map(line => {
      const c = line.split(',');
      const rank = parseInt(c[0]) || 0;
      if (rank === 0) return null;
      return {
        rank,
        name: (c[1] || '').trim(),
        score: parseInt(c[6]) || 0,
        driveTime: (c[7] || '').trim(),
        totalMiles: parseFloat(c[8]) || 0,
        maxSpeed: parseFloat(c[22]) || 0,
        events: parseInt(c[9]) || 0,
      };
    }).filter((r): r is SafetyRow => r !== null);
  } catch { return []; }
}

interface EldDiag { date: string; event: string; asset: string; }
function loadEldDiagnostics(): EldDiag[] {
  try {
    const csvPath = path.join(process.cwd(), 'data', 'eld_diagnostics.csv');
    if (!fs.existsSync(csvPath)) return [];
    const text = fs.readFileSync(csvPath, 'utf-8');
    const lines = text.split(/\r\n|\n/).filter(l => l.trim());
    if (lines.length < 2) return [];
    return lines.slice(1).map(line => {
      const c = line.split(',').map(s => s.replace(/"/g, '').trim());
      return { date: c[0] || '', event: c[1] || '', asset: c[3] || '' };
    }).filter(r => r.event);
  } catch { return []; }
}

export default async function FleetPage() {
  const [samsara, vlAssets] = await Promise.all([getGlobalSamsara(), fetchVisionLinkAssets()]);
  const configured = samsara.configured;
  const vehicles: any[] = samsara.vehicles || [];
  const crews: any[] = samsara.crews || [];
  const hos: any[] = (samsara as any).hos || [];
  const compliance = loadDriverCompliance();
  const safety = loadDriverSafety();
  const eldDiags = loadEldDiagnostics();

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const vlHealthy = vlAssets.filter((a: any) => {
    const lr = a.Last_Reported ? new Date(a.Last_Reported) : null;
    if (!lr || isNaN(lr.getTime())) return false;
    return (today.getTime() - lr.getTime()) / (1000 * 60 * 60 * 24) <= 7;
  }).length;
  const vlStale = vlAssets.filter((a: any) => {
    const lr = a.Last_Reported ? new Date(a.Last_Reported) : null;
    if (!lr || isNaN(lr.getTime())) return true;
    return (today.getTime() - lr.getTime()) / (1000 * 60 * 60 * 24) > 30;
  }).length;
  const vlCheck = vlAssets.length - vlHealthy - vlStale;
  const fleetScore = vlAssets.length > 0 ? Math.round((vlHealthy / vlAssets.length) * 100) : null;

  const toneColor = (hrs: number | null, critical: number, warn: number) => {
    if (hrs == null) return '#6B7278';
    if (hrs <= critical) return '#D8392B';
    if (hrs <= warn) return '#E8892B';
    return '#198754';
  };

  const driverTable = crews
    .filter(c => c.status !== 'exempt')
    .map(c => {
      const h = hos.find((x: any) => (x.driverName || '').toLowerCase() === (c.name || '').toLowerCase());
      return {
        name: c.name,
        eldStatus: c.status,
        logDate: h?.logDate || '',
        drive: h?.driveRemainingHrs ?? null,
        shift: h?.shiftRemainingHrs ?? null,
        cycle: h?.cycleRemainingHrs ?? null,
        currentStatus: h?.currentStatus || '',
      };
    });

  const vehiclesMoving = vehicles.filter(v => (v.speed || 0) > 2);
  const vehiclesParked = vehicles.filter(v => (v.speed || 0) <= 2);
  const driversAtRisk = driverTable.filter(d => d.drive != null && d.drive <= 2).length;
  const hasAnyHosData = driverTable.some(d => d.drive != null || d.shift != null || d.cycle != null);

  const complianceTone = (days: number | null) => {
    if (days == null) return '#6B7278';
    if (days <= 30) return '#D8392B';
    if (days <= 90) return '#E8892B';
    return '#198754';
  };

  const urgentCompliance = compliance.filter(c =>
    (c.cdlDaysLeft != null && c.cdlDaysLeft <= 90) ||
    (c.medDaysLeft != null && c.medDaysLeft <= 90)
  ).length;

  const lowboyVehicle = vehicles.find((v: any) =>
    (v.name || '').toLowerCase().includes('lowboy') ||
    (v.name || '').toLowerCase().includes('hudson') ||
    (v.driver || '').toLowerCase().includes('david hudson')
  );
  const lowboyHos = hos.find((h: any) => {
    const n = (h.driverName || '').toLowerCase().trim();
    return n === 'david hudson' || (n.includes('hudson') && n.includes('david'));
  });

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">
        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Fleet</span>
            <h1 className="text-4xl font-display mt-2">Trucks, Drivers, Compliance</h1>
            <p className="text-steel-grey text-sm mt-1">
              Samsara GPS + Hours of Service. DOT license + medical cards. VisionLink equipment health.
            </p>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="card card-padded">
            <p className="stat-label">Vehicles</p>
            <p className="stat-value font-mono">{vehicles.length}</p>
            <p className="stat-sub">{vehiclesMoving.length} moving · {vehiclesParked.length} parked</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Active Drivers</p>
            <p className="stat-value font-mono">{crews.length}</p>
            <p className="stat-sub">on the clock</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">HOS Risk</p>
            {hasAnyHosData ? (
              <>
                <p className="stat-value font-mono" style={{ color: driversAtRisk > 0 ? '#D8392B' : '#198754' }}>{driversAtRisk}</p>
                <p className="stat-sub">≤2h drive left</p>
              </>
            ) : (
              <>
                <p className="stat-value font-mono text-steel-grey">—</p>
                <p className="stat-sub">no HOS data</p>
              </>
            )}
          </div>
          <div className="card card-padded">
            <p className="stat-label">DOT Drivers</p>
            <p className="stat-value font-mono">{compliance.length}</p>
            <p className="stat-sub">on file</p>
          </div>
          <div className="card card-padded">
            <p className="stat-label">Expiring ≤90d</p>
            <p className="stat-value font-mono" style={{ color: urgentCompliance > 0 ? '#D8392B' : '#198754' }}>{urgentCompliance}</p>
            <p className="stat-sub">CDL or medical</p>
          </div>
        </div>

        {!configured && (
          <div className="card card-padded mb-8 border-l-4" style={{ borderLeftColor: '#E8892B' }}>
            <p className="font-display text-sm tracking-widest uppercase" style={{ color: '#E8892B' }}>Samsara Not Connected</p>
            <p className="text-sm text-steel-grey mt-1">
              Set <code className="font-mono text-xs bg-mist-grey px-1.5 py-0.5 rounded">SAMSARA_API_KEY</code> in Vercel env vars to populate HOS and GPS data.
            </p>
          </div>
        )}

        <section className="card overflow-hidden mb-8">
          <div className="px-5 py-4 border-b border-line-grey flex justify-between items-center">
            <div>
              <p className="eyebrow">Fleet Health</p>
              <p className="text-xs text-steel-grey mt-1">Owned equipment (VisionLink) + Samsara vehicle status.</p>
            </div>
            {fleetScore != null && (
              <div className="text-right">
                <p className="stat-value font-mono" style={{ color: fleetScore >= 80 ? '#198754' : fleetScore >= 50 ? '#E8892B' : '#D8392B' }}>{fleetScore}%</p>
                <p className="stat-sub">healthy</p>
              </div>
            )}
          </div>
          <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg p-4 border border-line-grey text-center">
              <p className="text-2xl font-mono font-bold" style={{ color: '#198754' }}>{vehiclesMoving.length + vlHealthy}</p>
              <p className="eyebrow mt-1">Active / Healthy</p>
              <p className="text-[10px] text-steel-grey mt-0.5">{vehiclesMoving.length} moving · {vlHealthy} reporting</p>
            </div>
            <div className="rounded-lg p-4 border border-line-grey text-center">
              <p className="text-2xl font-mono font-bold" style={{ color: '#E8892B' }}>{vlCheck}</p>
              <p className="eyebrow mt-1">Needs Check</p>
              <p className="text-[10px] text-steel-grey mt-0.5">7–30 days since report</p>
            </div>
            <div className="rounded-lg p-4 border border-line-grey text-center">
              <p className="text-2xl font-mono font-bold" style={{ color: '#D8392B' }}>{vlStale}</p>
              <p className="eyebrow mt-1">Stale / Offline</p>
              <p className="text-[10px] text-steel-grey mt-0.5">30+ days no signal</p>
            </div>
            <div className="rounded-lg p-4 border border-line-grey text-center">
              <p className="text-2xl font-mono font-bold">{vehicles.length + vlAssets.length}</p>
              <p className="eyebrow mt-1">Total Fleet</p>
              <p className="text-[10px] text-steel-grey mt-0.5">{vehicles.length} Samsara · {vlAssets.length} VisionLink</p>
            </div>
          </div>
        </section>

        {(lowboyVehicle || lowboyHos) && (
          <section className="card overflow-hidden mb-8">
            <div className="px-5 py-4 border-b border-line-grey flex justify-between items-center">
              <div>
                <p className="eyebrow">Lowboy Command · David Hudson</p>
                <p className="text-xs text-steel-grey mt-1">Live GPS + DOT Hours of Service. Permanent permit on file.</p>
              </div>
              {lowboyVehicle && (
                <span className={lowboyVehicle.speed > 2 ? 'pill pill-success' : 'pill pill-warning'}>
                  {lowboyVehicle.speed > 2 ? `En Route · ${Math.round(lowboyVehicle.speed)} mph` : 'Parked'}
                </span>
              )}
            </div>
            {lowboyVehicle && (
              <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-line-grey">
                <div>
                  <p className="stat-label">Location</p>
                  <p className="text-xs font-medium mt-1 leading-snug">{lowboyVehicle.address || 'GPS active'}</p>
                </div>
                <div>
                  <p className="stat-label">Speed</p>
                  <p className="text-2xl font-mono font-bold mt-1">{Math.round(lowboyVehicle.speed)}<span className="text-xs text-steel-grey ml-1">mph</span></p>
                </div>
                <div>
                  <p className="stat-label">Heading</p>
                  <p className="text-xl font-mono mt-1">{lowboyVehicle.heading || 0}°</p>
                </div>
                <div>
                  <p className="stat-label">Driver</p>
                  <p className="text-sm font-medium mt-1">David Hudson</p>
                </div>
              </div>
            )}
            {lowboyHos ? (
              <div className="p-5">
                <div className="flex justify-between items-center mb-3">
                  <p className="eyebrow">DOT Hours · Remaining</p>
                  <span className="text-[10px] text-steel-grey">Source: Samsara HOS API</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Drive (11h cap)', val: lowboyHos.driveRemainingHrs, crit: 0.5, warn: 2 },
                    { label: 'Shift (14h cap)', val: lowboyHos.shiftRemainingHrs, crit: 1, warn: 3 },
                    { label: `Cycle (${lowboyHos.cycleCapHrs || 60}h / ${lowboyHos.cycleCapHrs === 70 ? 8 : 7}d)`, val: lowboyHos.cycleRemainingHrs, crit: 5, warn: 15 },
                  ].map(g => {
                    const color = toneColor(g.val, g.crit, g.warn);
                    return (
                      <div key={g.label} className="rounded-lg p-3 border border-line-grey">
                        <p className="stat-label">{g.label}</p>
                        <p className="text-2xl font-mono font-bold mt-1" style={{ color }}>{g.val == null ? '—' : `${g.val.toFixed(1)}h`}</p>
                      </div>
                    );
                  })}
                </div>
                {lowboyHos.logDate && (
                  <p className="text-[11px] text-steel-grey mt-3">Latest log: <span className="font-mono">{lowboyHos.logDate}</span></p>
                )}
              </div>
            ) : (
              <div className="p-5">
                <p className="text-sm text-steel-grey italic">Waiting on Samsara HOS feed for David Hudson.</p>
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-grey">
              <p className="eyebrow">Driver HOS Compliance</p>
              <p className="text-xs text-steel-grey mt-1">Non-exempt drivers only. 11h drive · 14h shift · 60h cycle caps.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['Driver', 'Status', 'Drive', 'Shift', 'Cycle'].map(h => (
                      <th key={h} className="table-header text-left px-3 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverTable.length === 0 ? (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-steel-grey italic">No non-exempt drivers reporting HOS.</td></tr>
                  ) : driverTable.map((d, i) => {
                    const fmt = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}h`;
                    return (
                      <tr key={i} className="table-row-zebra border-b border-line-grey">
                        <td className="px-3 py-3 text-xs font-medium">{d.name}</td>
                        <td className="px-3 py-3 text-xs text-steel-grey">{d.currentStatus || '—'}</td>
                        <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: toneColor(d.drive, 0.5, 2) }}>{fmt(d.drive)}</td>
                        <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: toneColor(d.shift, 1, 3) }}>{fmt(d.shift)}</td>
                        <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: toneColor(d.cycle, 5, 15) }}>{fmt(d.cycle)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-grey">
              <p className="eyebrow">DOT License &amp; Medical</p>
              <p className="text-xs text-steel-grey mt-1">CDL + medical card countdowns. Random drug test status.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    {['Driver', 'CDL Expires', 'Days', 'Medical', 'Days', 'Random'].map(h => (
                      <th key={h} className="table-header text-left px-3 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {compliance.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-steel-grey italic">No compliance data on file.</td></tr>
                  ) : compliance
                    .sort((a, b) => {
                      const aMin = Math.min(a.cdlDaysLeft ?? 9999, a.medDaysLeft ?? 9999);
                      const bMin = Math.min(b.cdlDaysLeft ?? 9999, b.medDaysLeft ?? 9999);
                      return aMin - bMin;
                    })
                    .map((c, i) => {
                      const urgent = (c.cdlDaysLeft != null && c.cdlDaysLeft <= 30) || (c.medDaysLeft != null && c.medDaysLeft <= 30);
                      return (
                        <tr key={i} className={`table-row-zebra border-b border-line-grey ${urgent ? 'bg-danger-red-light/40' : ''}`}>
                          <td className="px-3 py-3 text-xs font-medium">{c.name}</td>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{c.cdlExpiration || '—'}</td>
                          <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: complianceTone(c.cdlDaysLeft) }}>
                            {c.cdlDaysLeft == null ? 'N/A' : `${c.cdlDaysLeft}d`}
                          </td>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{c.medExpiration || '—'}</td>
                          <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: complianceTone(c.medDaysLeft) }}>
                            {c.medDaysLeft == null ? 'N/A' : `${c.medDaysLeft}d`}
                          </td>
                          <td className="px-3 py-3 text-xs text-steel-grey">
                            {c.randomStatus ? (
                              <span className={
                                c.randomStatus.toLowerCase().includes('pending') ? 'pill pill-warning' :
                                c.randomStatus.toLowerCase().includes('complete') ? 'pill pill-success' :
                                'pill pill-neutral'
                              }>{c.randomStatus}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <section className="card overflow-hidden lg:col-span-2">
            <div className="px-5 py-4 border-b border-line-grey flex justify-between items-center">
              <div>
                <p className="eyebrow">Driver Safety Scores</p>
                <p className="text-xs text-steel-grey mt-1">Samsara 30-day rolling. 100 = perfect. Below 70 flags coaching.</p>
              </div>
              <span className="text-xs text-steel-grey font-mono">
                {safety.length > 0 ? `Avg ${Math.round(safety.reduce((s, d) => s + d.score, 0) / safety.length)}` : 'No data'}
              </span>
            </div>
            {safety.length === 0 ? (
              <div className="p-6"><p className="text-sm text-steel-grey italic">No safety data on file.</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      {['#', 'Driver', 'Score', 'Drive Time', 'Miles', 'Max Speed', 'Events'].map(h => (
                        <th key={h} className="table-header text-left px-3 py-3">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {safety.map((d, i) => {
                      const scoreColor = d.score >= 80 ? '#198754' : d.score >= 60 ? '#E8892B' : '#D8392B';
                      const lowScore = d.score < 60;
                      return (
                        <tr key={i} className={`table-row-zebra border-b border-line-grey ${lowScore ? 'bg-danger-red-light/40' : ''}`}>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{d.rank}</td>
                          <td className="px-3 py-3 text-xs font-medium">{d.name}</td>
                          <td className="px-3 py-3 text-sm font-mono font-bold" style={{ color: scoreColor }}>{d.score}</td>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{d.driveTime}</td>
                          <td className="px-3 py-3 text-xs text-steel-grey font-mono">{d.totalMiles.toLocaleString()}</td>
                          <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: d.maxSpeed > 80 ? '#D8392B' : undefined }}>{Math.round(d.maxSpeed)} mph</td>
                          <td className="px-3 py-3 text-xs text-steel-grey">{d.events}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <div className="px-5 py-4 border-b border-line-grey">
              <p className="eyebrow">ELD Diagnostics</p>
              <p className="text-xs text-steel-grey mt-1">Active malfunctions needing attention.</p>
            </div>
            {eldDiags.length === 0 ? (
              <div className="p-6">
                <p className="text-sm font-medium" style={{ color: '#198754' }}>All clear · no active diagnostics.</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {(() => {
                  const grouped: Record<string, string[]> = {};
                  for (const d of eldDiags) {
                    const key = d.asset || 'Unknown';
                    if (!grouped[key]) grouped[key] = [];
                    if (!grouped[key].includes(d.event)) grouped[key].push(d.event);
                  }
                  return Object.entries(grouped).map(([asset, events], i) => (
                    <div key={i} className="rounded-lg p-3 border border-line-grey">
                      <p className="text-xs font-medium">{asset}</p>
                      {events.map((e, j) => (
                        <p key={j} className="text-[11px] mt-0.5" style={{ color: '#E8892B' }}>• {e}</p>
                      ))}
                    </div>
                  ));
                })()}
              </div>
            )}
          </section>
        </div>

        <section className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-line-grey">
            <p className="eyebrow">Vehicle Locations</p>
            <p className="text-xs text-steel-grey mt-1">Live GPS from Samsara.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {['Vehicle', 'Driver', 'Location', 'Speed', 'Status'].map(h => (
                    <th key={h} className="table-header text-left px-3 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehicles.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-steel-grey italic">No vehicles reporting.</td></tr>
                ) : vehicles.map((v, i) => {
                  const isMoving = (v.speed || 0) > 2;
                  return (
                    <tr key={i} className="table-row-zebra border-b border-line-grey">
                      <td className="px-3 py-3 text-xs font-medium">{v.name}</td>
                      <td className="px-3 py-3 text-xs text-steel-grey">{v.driver || '—'}</td>
                      <td className="px-3 py-3 text-xs text-steel-grey truncate max-w-[240px]" title={v.address}>{v.address || '—'}</td>
                      <td className="px-3 py-3 text-xs font-mono font-bold" style={{ color: isMoving ? '#198754' : '#6B7278' }}>{Math.round(v.speed || 0)} mph</td>
                      <td className="px-3 py-3">
                        <span className={isMoving ? 'pill pill-success' : 'pill pill-neutral'}>{isMoving ? 'Moving' : 'Parked'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
