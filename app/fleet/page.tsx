import React from 'react';
import Link from 'next/link';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';
import Papa from 'papaparse';
import * as fs from 'fs';
import * as path from 'path';

export const revalidate = 300;

function loadCsvRows(filename: string): Record<string, string>[] {
  const csvPath = path.join(process.cwd(), 'data', filename);
  if (!fs.existsSync(csvPath)) return [];
  const text = fs.readFileSync(csvPath, 'utf-8');
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

function cleanText(value: string | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function toNumber(value: string | undefined): number {
  const n = parseFloat((value || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
}

// ── Driver compliance CSV reader ──────────────────────────────────────────
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
    const rows = loadCsvRows('driver_compliance.csv');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysUntil = (dateStr: string): number | null => {
      if (!dateStr) return null;
      const d = new Date(dateStr.trim());
      if (isNaN(d.getTime())) return null;
      return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };
    return rows.map(row => {
      const name = cleanText(row['Driver Name']);
      if (!name) return null;
      const cdlExpiration = cleanText(row['CDL/DL Expiration Date']);
      const medExpiration = cleanText(row['Medical Certificate (MEC) Expiration']);
      return {
        name,
        licenseNumber: cleanText(row['Drivers License Number']),
        cdlExpiration,
        cdlDaysLeft: daysUntil(cdlExpiration),
        medExpiration,
        medDaysLeft: daysUntil(medExpiration),
        randomStatus: cleanText(row['Random Selection Status']),
        randomDeadline: cleanText(row['Random Test Deadline']),
      };
    }).filter((r): r is ComplianceRow => r !== null && r.name.length > 0);
  } catch { return []; }
}

// ── Driver safety CSV reader ──────────────────────────────────────────
interface SafetyRow {
  rank: number; name: string; score: number; driveTime: string;
  totalMiles: number; maxSpeed: number; events: number; behaviors: number;
  lightSpeeding: number; moderateSpeeding: number; heavySpeeding: number; severeSpeeding: number;
  harshAccel: number; harshBrake: number; harshTurn: number; mobileUsage: number; noSeatBelt: number; forwardCollisionWarning: number;
}
function loadDriverSafety(): SafetyRow[] {
  try {
    return loadCsvRows('samsara_driver_safety.csv').map(row => {
      const rank = parseInt(row['Rank'] || '') || 0;
      if (rank === 0) return null; // skip "All Drivers" summary row
      return {
        rank,
        name: cleanText(row['Driver Name']),
        score: toNumber(row['Safety Score']),
        driveTime: cleanText(row['Drive Time (hh:mm:ss)']),
        totalMiles: toNumber(row['Total Distance (mi)']),
        maxSpeed: toNumber(row['Max Speed (mph)']),
        events: toNumber(row['Total Events']),
        behaviors: toNumber(row['Total Behaviors']),
        lightSpeeding: toNumber(row['Percent Light Speeding']),
        moderateSpeeding: toNumber(row['Percent Moderate Speeding']),
        heavySpeeding: toNumber(row['Percent Heavy Speeding']),
        severeSpeeding: toNumber(row['Percent Severe Speeding']),
        harshAccel: toNumber(row['Harsh Accel']),
        harshBrake: toNumber(row['Harsh Brake']),
        harshTurn: toNumber(row['Harsh Turn']),
        mobileUsage: toNumber(row['Mobile Usage']),
        noSeatBelt: toNumber(row['No Seat Belt']),
        forwardCollisionWarning: toNumber(row['Forward Collision Warning']),
      };
    }).filter((r): r is SafetyRow => r !== null);
  } catch { return []; }
}

// ── ELD Diagnostics reader ──────────────────────────────────────────
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
  const samsara = await getGlobalSamsara();
  const configured = samsara.configured;
  const diagnostics: any = (samsara as any).diagnostics || {};
  const vehicles: any[] = samsara.vehicles || [];
  const crews: any[] = samsara.crews || [];
  const hos: any[] = (samsara as any).hos || [];
  const compliance = loadDriverCompliance();
  const safety = loadDriverSafety();
  const eldDiags = loadEldDiagnostics();

  // HOS tone helper
  const toneFor = (hrs: number | null, critical: number, warn: number) => {
    if (hrs == null) return { color: '#9CA3AF', label: 'N/A' };
    if (hrs <= critical) return { color: '#E04343', label: 'STOP' };
    if (hrs <= warn)     return { color: '#F5A623', label: 'WATCH' };
    return { color: '#20BC64', label: 'OK' };
  };

  const driverTable = hos.length > 0
    ? hos.filter(h => h.driverName).map(h => ({
        name: h.driverName,
        eldStatus: 'on_duty',
        logDate: h.logDate || '',
        drive: h.driveRemainingHrs ?? null,
        shift: h.shiftRemainingHrs ?? null,
        cycle: h.cycleRemainingHrs ?? null,
        currentStatus: h.currentStatus || '',
      }))
    : crews.filter(c => c.status !== 'exempt').map(c => {
      const h = hos.find((x: any) => cleanText(x.driverName).toLowerCase() === cleanText(c.name).toLowerCase());
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
  const vehiclesAssigned = vehicles.filter(v => v.driver && v.driver !== 'Unassigned');
  const fleetScore = vehicles.length > 0 ? Math.round((vehiclesAssigned.length / vehicles.length) * 100) : null;
  const activeDriverCount = driverTable.length || crews.length || compliance.length;
  const driversAtRisk = driverTable.filter(d => d.drive != null && d.drive <= 2).length;
  const hasAnyHosData = driverTable.some(d => d.drive != null || d.shift != null || d.cycle != null);
  const hosApiStatus = diagnostics.hosStatus ? String(diagnostics.hosStatus) : '';
  const hosUnavailable = configured && driverTable.length === 0 && hos.length === 0;

  // Compliance countdown tone
  const cdlTone = (days: number | null) => {
    if (days == null) return { color: '#9CA3AF', label: 'N/A' };
    if (days <= 30) return { color: '#E04343', label: `${days}d` };
    if (days <= 90) return { color: '#F5A623', label: `${days}d` };
    return { color: '#20BC64', label: `${days}d` };
  };

  const urgentCompliance = compliance.filter(c =>
    (c.cdlDaysLeft != null && c.cdlDaysLeft <= 90) ||
    (c.medDaysLeft != null && c.medDaysLeft <= 90)
  ).length;

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Fleet &amp; Driver Compliance</h1>
          <p className="text-[#757A7F] text-sm">Samsara vehicle positions, driver HOS, DOT license &amp; medical compliance.</p>
        </div>
        <Link href="/dashboard" className="text-xs text-[#20BC64] font-bold uppercase hover:text-[#16a558]">&larr; Dashboard</Link>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Vehicles</p>
          <p className="text-3xl font-black text-[#20BC64]">{vehicles.length}</p>
          <p className="text-[10px] text-[#757A7F] mt-0.5">{vehiclesMoving.length} moving · {vehiclesParked.length} parked</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Drivers</p>
          <p className="text-3xl font-black text-[#20BC64]">{activeDriverCount}</p>
          <p className="text-[10px] text-[#757A7F] mt-0.5">{driverTable.length > 0 ? 'from Samsara HOS' : 'from DOT file'}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">HOS Risk</p>
          {hasAnyHosData ? (
            <>
              <p className={`text-3xl font-black ${driversAtRisk > 0 ? 'text-[#E04343]' : 'text-[#20BC64]'}`}>{driversAtRisk}</p>
              <p className="text-[10px] text-[#757A7F] mt-0.5">&le;2h drive left</p>
            </>
          ) : (
            <>
              <p className="text-3xl font-black text-[#9CA3AF]">&mdash;</p>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5 font-bold uppercase">No HOS data</p>
            </>
          )}
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">DOT Compliance</p>
          <p className="text-3xl font-black text-[#3C4043]">{compliance.length}</p>
          <p className="text-[10px] text-[#757A7F] mt-0.5">drivers on file</p>
        </div>
        <div className={`bg-white rounded-xl p-5 border ${urgentCompliance > 0 ? 'border-[#E04343]/30' : 'border-[#F1F3F4]'}`}>
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Expiring &le;90d</p>
          <p className={`text-3xl font-black ${urgentCompliance > 0 ? 'text-[#E04343]' : 'text-[#20BC64]'}`}>{urgentCompliance}</p>
          <p className="text-[10px] text-[#757A7F] mt-0.5">license or medical card</p>
        </div>
      </div>

      {!configured && (
        <div className="mb-8 rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">Awaiting Samsara integration</p>
          <p className="text-xs text-[#757A7F]">Set <code className="font-mono text-[11px]">SAMSARA_API_KEY</code> in Vercel env vars to populate HOS data.</p>
        </div>
      )}

      {/* Fleet Health Summary */}
      <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
          <div>
            <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Fleet Health</h2>
            <p className="text-[10px] text-[#757A7F] mt-0.5">Samsara vehicle GPS and driver assignment only.</p>
          </div>
          {fleetScore != null && (
            <div className="text-right">
              <p className={`text-2xl font-black ${fleetScore >= 80 ? 'text-[#20BC64]' : fleetScore >= 50 ? 'text-[#F5A623]' : 'text-[#E04343]'}`}>{fleetScore}%</p>
              <p className="text-[10px] text-[#757A7F]/70 font-bold uppercase">healthy</p>
            </div>
          )}
        </div>
        <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl p-4 border border-[#20BC64]/20 bg-[#20BC64]/5 text-center">
            <p className="text-2xl font-black text-[#20BC64]">{vehicles.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F] mt-1">Reporting</p>
            <p className="text-[9px] text-[#757A7F]/60 mt-0.5">Samsara vehicles with GPS</p>
          </div>
          <div className="rounded-xl p-4 border border-[#F5A623]/20 bg-[#F5A623]/5 text-center">
            <p className="text-2xl font-black text-[#F5A623]">{vehiclesParked.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F] mt-1">Parked</p>
            <p className="text-[9px] text-[#757A7F]/60 mt-0.5">0-2 mph right now</p>
          </div>
          <div className="rounded-xl p-4 border border-[#E04343]/20 bg-[#E04343]/5 text-center">
            <p className="text-2xl font-black text-[#E04343]">{vehicles.length - vehiclesAssigned.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F] mt-1">No Driver</p>
            <p className="text-[9px] text-[#757A7F]/60 mt-0.5">No assigned driver shown</p>
          </div>
          <div className="rounded-xl p-4 border border-[#F1F3F4] text-center">
            <p className="text-2xl font-black text-[#3C4043]">{vehiclesMoving.length}</p>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F] mt-1">Moving</p>
            <p className="text-[9px] text-[#757A7F]/60 mt-0.5">Above 2 mph</p>
          </div>
        </div>
      </div>

      {/* HOS + DOT Compliance */}
      <div className="grid grid-cols-1 gap-6 mb-8">

        {/* ═══ HOS Compliance — exempt drivers filtered out ═══ */}
        <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F1F3F4]">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Driver HOS Compliance</h2>
            <p className="text-[10px] text-[#757A7F] mt-0.5">Non-exempt drivers only. 11h drive / 14h shift / 60h cycle caps.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F1F3F4]">
                <tr>
                  {['Driver', 'Duty Status', 'Drive', 'Shift', 'Cycle'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {driverTable.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-[#757A7F]">
                      {hosUnavailable
                        ? `No HOS clock rows returned by Samsara${hosApiStatus ? ` (status ${hosApiStatus})` : ''}. Vehicle GPS is connected, but driver HOS is not coming through this token.`
                        : 'No non-exempt drivers reporting.'}
                    </td>
                  </tr>
                ) : driverTable.map((d, i) => {
                  const dr = toneFor(d.drive, 0.5, 2);
                  const sh = toneFor(d.shift, 1, 3);
                  const cy = toneFor(d.cycle, 5, 15);
                  const fmt = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}h`;
                  return (
                    <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                      <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{d.name}</td>
                      <td className="px-3 py-2 text-xs text-[#757A7F]">{d.currentStatus || 'No HOS log'}</td>
                      <td className="px-3 py-2 text-xs font-black" style={{ color: dr.color }}>{fmt(d.drive)}</td>
                      <td className="px-3 py-2 text-xs font-black" style={{ color: sh.color }}>{fmt(d.shift)}</td>
                      <td className="px-3 py-2 text-xs font-black" style={{ color: cy.color }}>{fmt(d.cycle)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ═══ DOT Compliance — License, Medical Card, Random Drug Test ═══ */}
        <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F1F3F4]">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">DOT License &amp; Medical Compliance</h2>
            <p className="text-[10px] text-[#757A7F] mt-0.5">CDL expiration, medical certificate countdown, random selection status.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[#F1F3F4]">
                <tr>
                  {['Driver', 'CDL Expires', 'Days Left', 'Medical Expires', 'Days Left', 'Random Status'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compliance.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[#757A7F]">No compliance data. Add <code className="font-mono text-[11px]">driver_compliance.csv</code> to /data.</td></tr>
                ) : compliance
                  .sort((a, b) => {
                    // Sort: soonest expiration first (either CDL or medical)
                    const aMin = Math.min(a.cdlDaysLeft ?? 9999, a.medDaysLeft ?? 9999);
                    const bMin = Math.min(b.cdlDaysLeft ?? 9999, b.medDaysLeft ?? 9999);
                    return aMin - bMin;
                  })
                  .map((c, i) => {
                    const cdl = cdlTone(c.cdlDaysLeft);
                    const med = cdlTone(c.medDaysLeft);
                    return (
                      <tr key={i} className={`border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40 ${(c.cdlDaysLeft != null && c.cdlDaysLeft <= 30) || (c.medDaysLeft != null && c.medDaysLeft <= 30) ? 'bg-[#E04343]/5' : ''}`}>
                        <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{c.name}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{c.cdlExpiration || '—'}</td>
                        <td className="px-3 py-2 text-xs font-black" style={{ color: cdl.color }}>{cdl.label}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{c.medExpiration || '—'}</td>
                        <td className="px-3 py-2 text-xs font-black" style={{ color: med.color }}>{med.label}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">
                          {c.randomStatus ? (
                            <span className={`text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${c.randomStatus.toLowerCase().includes('pending') ? 'bg-[#F5A623]/15 text-[#F5A623]' : c.randomStatus.toLowerCase().includes('complete') ? 'bg-[#20BC64]/15 text-[#20BC64]' : 'bg-[#F1F3F4] text-[#757A7F]'}`}>
                              {c.randomStatus}
                            </span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ═══ Driver Safety Scores + ELD Diagnostics ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Driver Safety Scores — 2/3 width */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F1F3F4] flex justify-between items-center">
            <div>
              <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Driver Safety Scores</h2>
              <p className="text-[10px] text-[#757A7F] mt-0.5">Samsara score based on speeding, harsh driving, phone use, seat belt, and collision warnings. 100 is best.</p>
            </div>
            <span className="text-[10px] text-[#757A7F]/60 font-bold uppercase">
              {safety.length > 0 ? `Avg: ${Math.round(safety.reduce((s, d) => s + d.score, 0) / safety.length)}` : 'No data'}
            </span>
          </div>
          {safety.length === 0 ? (
            <div className="p-6"><p className="text-sm text-[#757A7F] italic">No safety data. Add <code className="font-mono text-[11px]">samsara_driver_safety.csv</code> to /data.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F1F3F4]">
                  <tr>
                    {['#', 'Driver', 'Safety Score', 'Speeding %', 'Risk Events', 'Drive Time', 'Miles', 'Max Speed'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {safety.map((d, i) => {
                    const scoreColor = d.score >= 80 ? '#20BC64' : d.score >= 60 ? '#F5A623' : '#E04343';
                    const speedingPct = d.lightSpeeding + d.moderateSpeeding + d.heavySpeeding + d.severeSpeeding;
                    const behaviorEvents = d.harshAccel + d.harshBrake + d.harshTurn + d.mobileUsage + d.noSeatBelt + d.forwardCollisionWarning;
                    const riskEvents = Math.max(d.events, d.behaviors, behaviorEvents);
                    return (
                      <tr key={i} className={`border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40 ${d.score < 60 ? 'bg-[#E04343]/5' : ''}`}>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{d.rank}</td>
                        <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{d.name}</td>
                        <td className="px-3 py-2">
                          <span className="text-sm font-black" style={{ color: scoreColor }}>{d.score}</span>
                        </td>
                        <td className="px-3 py-2 text-xs font-bold text-[#757A7F]">{speedingPct.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{riskEvents}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F] font-mono">{d.driveTime}</td>
                        <td className="px-3 py-2 text-xs text-[#757A7F]">{d.totalMiles.toLocaleString()}</td>
                        <td className="px-3 py-2 text-xs font-bold" style={{ color: d.maxSpeed > 80 ? '#E04343' : '#3C4043' }}>{Math.round(d.maxSpeed)} mph</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ELD Diagnostics — 1/3 width */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#F1F3F4]">
            <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">ELD Diagnostics</h2>
            <p className="text-[10px] text-[#757A7F] mt-0.5">Active malfunctions that need attention.</p>
          </div>
          {eldDiags.length === 0 ? (
            <div className="p-6"><p className="text-sm text-[#20BC64] font-bold">All clear — no active diagnostics.</p></div>
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
                  <div key={i} className="rounded-lg p-3 border border-[#F5A623]/20 bg-[#F5A623]/5">
                    <p className="text-xs font-bold text-[#3C4043]">{asset}</p>
                    {events.map((e, j) => (
                      <p key={j} className="text-[10px] text-[#F5A623] font-bold mt-0.5">{e}</p>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </div>

        {/* ── LOWBOY COMMAND ─────────────────────────────────────────────── */}
        {(() => {
          const lowboyVehicle = samsara.configured
            ? samsara.vehicles.find((v: any) => (v.name || '').toLowerCase().includes('lowboy') || (v.name || '').toLowerCase().includes('hudson') || (v.name || '').toLowerCase().includes('david'))
            : null;
          const lowboyCompliance = compliance.find((c: any) => {
            const n = String(c.name || '').toLowerCase();
            return n.includes('david') && n.includes('hudson');
          });

          // Always render the card — show an 'awaiting Samsara' placeholder if not configured.

          return (
            <div className="bg-white rounded-md border border-[#F1F3F4] shadow-sm overflow-hidden">
              <div className="p-5 border-b border-[#F1F3F4] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-black uppercase tracking-widest text-[#3C4043]/70">🚛 Lowboy Command — David Hudson</h2>
                  {lowboyVehicle && (
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${lowboyVehicle.speed > 2 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-[#F5A623] border border-amber-500/20'}`}>
                      {lowboyVehicle.speed > 2 ? `🟢 EN ROUTE · ${Math.round(lowboyVehicle.speed)} mph` : '🟡 PARKED'}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-bold text-emerald-400 px-2 py-1 rounded bg-emerald-400/10 border border-emerald-400/20">✅ PERMANENT PERMIT</span>
              </div>
              {lowboyVehicle ? (
                <div className="p-5">
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-[#FAFCFB] rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Current Location</p>
                      <p className="text-xs font-bold text-[#3C4043] leading-relaxed">{lowboyVehicle.address || 'GPS Active'}</p>
                    </div>
                    <div className="bg-[#FAFCFB] rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Speed</p>
                      <p className="text-2xl font-black text-[#3C4043]">{Math.round(lowboyVehicle.speed)}<span className="text-sm text-[#757A7F] ml-1">mph</span></p>
                    </div>
                    <div className="bg-[#FAFCFB] rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Heading</p>
                      <p className="text-lg font-black text-[#3C4043]/70">{lowboyVehicle.heading || 0}°</p>
                    </div>
                    <div className="bg-[#FAFCFB] rounded-xl p-4 border border-[#F1F3F4]">
                      <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Driver</p>
                      <p className="text-sm font-black text-[#3C4043]">David Hudson</p>
                    </div>
                  </div>
                  {/* DOT HOS gauges (remaining legal time) */}
                  {(() => {
                    // Exact match on "David Hudson" — avoids accidentally pairing
                    // with David Moctezuma or any other David in the fleet.
                    let lowboyHos = (samsara.hos || []).find((h: any) => {
                      const n = (h.driverName || '').toLowerCase().trim();
                      return n === 'david hudson' || (n.includes('hudson') && n.includes('david'));
                    });
                    if (!lowboyHos) {
                      lowboyHos = {
                        driveRemainingHrs: null,
                        shiftRemainingHrs: null,
                        cycleRemainingHrs: null,
                        cycleCapHrs: 60,
                        logDate: '',
                        currentStatus: 'No HOS log',
                      };
                    }
                    const toneFor = (hrs: number | null, critical: number, warn: number) => {
                      if (hrs == null) return { color: '#9CA3AF', bg: '#F1F3F4', label: 'N/A' };
                      if (hrs <= critical) return { color: '#E04343', bg: '#FDECEC', label: 'STOP' };
                      if (hrs <= warn)     return { color: '#F5A623', bg: '#FEF3DB', label: 'WATCH' };
                      return { color: '#20BC64', bg: '#DFF5E6', label: 'OK' };
                    };
                    const d = toneFor(lowboyHos.driveRemainingHrs, 0.5, 2);
                    const s = toneFor(lowboyHos.shiftRemainingHrs, 1, 3);
                    const c = toneFor(lowboyHos.cycleRemainingHrs, 5, 15);
                    const hrs = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}h`;
                    return (
                      <div className="mt-4 pt-4 border-t border-[#F1F3F4]">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-[#757A7F]">DOT Hours of Service — Remaining</p>
                          <span className="text-[9px] text-[#757A7F]/60 font-bold uppercase">Source: Samsara HOS API</span>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          <div className="rounded-xl p-3 border" style={{ background: d.bg, borderColor: `${d.color}33` }}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Drive Time (11h cap)</p>
                            <p className="text-2xl font-black" style={{ color: d.color }}>{hrs(lowboyHos.driveRemainingHrs)}</p>
                            <p className="text-[9px] font-bold" style={{ color: d.color }}>{d.label}</p>
                          </div>
                          <div className="rounded-xl p-3 border" style={{ background: s.bg, borderColor: `${s.color}33` }}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">On-Duty Shift (14h cap)</p>
                            <p className="text-2xl font-black" style={{ color: s.color }}>{hrs(lowboyHos.shiftRemainingHrs)}</p>
                            <p className="text-[9px] font-bold" style={{ color: s.color }}>{s.label}</p>
                          </div>
                          <div className="rounded-xl p-3 border" style={{ background: c.bg, borderColor: `${c.color}33` }}>
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Weekly Cycle ({lowboyHos.cycleCapHrs || 60}h / {lowboyHos.cycleCapHrs === 70 ? 8 : 7}d)</p>
                            <p className="text-2xl font-black" style={{ color: c.color }}>{hrs(lowboyHos.cycleRemainingHrs)}</p>
                            <p className="text-[9px] font-bold" style={{ color: c.color }}>{c.label}</p>
                          </div>
                        </div>
                        {lowboyHos.logDate && (
                          <p className="text-[10px] text-[#757A7F]/70 mt-2">Latest day logged: <span className="font-bold text-[#3C4043]">{lowboyHos.logDate}</span></p>
                        )}
                      </div>
                    );
                  })()}

                  {lowboyVehicle.speed > 2 && (
                    <div className="mt-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 flex items-center gap-3">
                      <span className="text-emerald-400">🚛</span>
                      <p className="text-xs text-[#0F8F47] font-bold">Lowboy is currently in transit at {Math.round(lowboyVehicle.speed)} mph. ETA to next staging site is shown on the Schedule lowboy card.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-[#F1F3F4] bg-[#FAFCFB] p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">Driver</p>
                    <p className="text-sm font-black text-[#3C4043]">David Hudson</p>
                    <p className="mt-1 text-xs text-[#757A7F]">{lowboyCompliance?.cdlExpiration ? `CDL expires ${lowboyCompliance.cdlExpiration}` : 'CDL date not loaded'}</p>
                  </div>
                  <div className="rounded-xl border border-[#F1F3F4] bg-[#FAFCFB] p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">GPS</p>
                    <p className="text-sm font-black text-[#F5A623]">{samsara.configured ? 'No lowboy signal' : 'Samsara not configured'}</p>
                    <p className="mt-1 text-xs text-[#757A7F]">Card stays visible until the truck reports.</p>
                  </div>
                  <div className="rounded-xl border border-[#F1F3F4] bg-[#FAFCFB] p-4">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#757A7F] mb-1">HOS</p>
                    <p className="text-sm font-black text-[#9CA3AF]">No HOS log</p>
                    <p className="mt-1 text-xs text-[#757A7F]">No made-up drive hours shown.</p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}



      {/* Vehicle locations table */}
      <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F1F3F4]">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Vehicle Locations</h2>
          <p className="text-[10px] text-[#757A7F] mt-0.5">Live GPS from Samsara.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F1F3F4]">
              <tr>
                {['Vehicle', 'Driver', 'Location', 'Speed', 'Status'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-[#757A7F]">No vehicles reporting.</td></tr>
              ) : vehicles.map((v, i) => {
                const isMoving = (v.speed || 0) > 2;
                return (
                  <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                    <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{v.name}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F]">{v.driver || '—'}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F] truncate max-w-[200px]" title={v.address}>{v.address || '—'}</td>
                    <td className="px-3 py-2 text-xs font-bold" style={{ color: isMoving ? '#20BC64' : '#757A7F' }}>{Math.round(v.speed || 0)} mph</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${isMoving ? 'text-[#20BC64]' : 'text-[#757A7F]'}`}>
                        {isMoving ? 'Moving' : 'Parked'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
