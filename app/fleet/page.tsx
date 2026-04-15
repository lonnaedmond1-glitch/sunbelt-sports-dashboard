import React from 'react';
import Link from 'next/link';
import { getGlobalSamsara } from '@/app/api/telematics/samsara/route';

export const revalidate = 86400;

export default async function FleetPage() {
  const samsara = await getGlobalSamsara();
  const configured = samsara.configured;
  const vehicles: any[] = samsara.vehicles || [];
  const crews: any[] = samsara.crews || [];
  const hos: any[] = (samsara as any).hos || [];

  // HOS status per driver
  const toneFor = (hrs: number | null, critical: number, warn: number) => {
    if (hrs == null) return { color: '#9CA3AF', label: 'N/A' };
    if (hrs <= critical) return { color: '#E04343', label: 'STOP' };
    if (hrs <= warn)     return { color: '#F5A623', label: 'WATCH' };
    return { color: '#20BC64', label: 'OK' };
  };

  // Merge crews with HOS by name match
  const driverTable = crews.map(c => {
    const h = hos.find((x: any) => (x.driverName || '').toLowerCase() === (c.name || '').toLowerCase());
    return {
      name: c.name,
      phone: c.phone,
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

  return (
    <div className="min-h-screen bg-[#F1F3F4] text-[#3C4043] font-body p-8">
      <header className="mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-[#3C4043] mb-1">Fleet &amp; Driver Compliance</h1>
          <p className="text-[#757A7F] text-sm">Samsara vehicle positions, driver Hours of Service, and ELD compliance status.</p>
          <div className="mt-3 rounded-lg bg-[#60a5fa]/5 border border-[#60a5fa]/20 px-4 py-3 max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#60a5fa]/80 mb-1">What this page is for</p>
            <p className="text-xs text-[#3C4043] leading-relaxed">Single view of every active driver\u2019s remaining legal drive-time and shift hours. Use it at dispatch to decide who can take the next Low Boy move, who needs a reset, and which vehicles are in motion right now. If this card shows <strong>Awaiting Samsara integration</strong>, set <code className="font-mono text-[10px]">SAMSARA_API_KEY</code> in Vercel \u2192 Settings \u2192 Environment Variables.</p>
          </div>
        </div>
        <Link href="/dashboard" className="text-xs text-[#20BC64] font-bold uppercase hover:text-[#16a558]">← Dashboard</Link>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Vehicles Tracked</p>
          <p className="text-3xl font-black text-[#20BC64]">{vehicles.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Currently Moving</p>
          <p className="text-3xl font-black text-[#60a5fa]">{vehiclesMoving.length}</p>
          <p className="text-[10px] text-[#757A7F] mt-0.5">{vehiclesParked.length} parked</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">Active Drivers</p>
          <p className="text-3xl font-black text-[#20BC64]">{crews.length}</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-[#F1F3F4]">
          <p className="text-xs font-bold uppercase tracking-widest text-[#757A7F] mb-1">HOS Risk</p>
          <p className={`text-3xl font-black ${driversAtRisk > 0 ? 'text-[#E04343]' : 'text-[#20BC64]'}`}>{driversAtRisk}</p>
          <p className="text-[10px] text-[#757A7F] mt-0.5">drivers with ≤2h drive left</p>
        </div>
      </div>

      {!configured && (
        <div className="mb-8 rounded-xl bg-amber-500/10 border border-amber-500/30 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-widest text-amber-700 mb-1">Awaiting Samsara integration</p>
          <p className="text-xs text-[#757A7F]">Set <code className="font-mono text-[11px]">SAMSARA_API_KEY</code> in Vercel env vars to populate this page.</p>
        </div>
      )}

      {/* Driver HOS compliance table */}
      <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-[#F1F3F4]">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Driver HOS Compliance</h2>
          <p className="text-[10px] text-[#757A7F] mt-0.5">Remaining legal hours per DOT rules: 11h driving, 14h shift, 60h / 7-day cycle.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F1F3F4]">
              <tr>
                {['Driver', 'ELD Status', 'Duty Status', 'Drive Remaining', 'Shift Remaining', 'Cycle Remaining', 'Phone'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {driverTable.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-[#757A7F]">No active drivers reporting.</td></tr>
              ) : driverTable.map((d, i) => {
                const dr = toneFor(d.drive, 0.5, 2);
                const sh = toneFor(d.shift, 1, 3);
                const cy = toneFor(d.cycle, 5, 15);
                const fmt = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}h`;
                return (
                  <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                    <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{d.name}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F] uppercase">{d.eldStatus}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F]">{d.currentStatus || '—'}</td>
                    <td className="px-3 py-2 text-xs font-black" style={{ color: dr.color }}>{fmt(d.drive)}</td>
                    <td className="px-3 py-2 text-xs font-black" style={{ color: sh.color }}>{fmt(d.shift)}</td>
                    <td className="px-3 py-2 text-xs font-black" style={{ color: cy.color }}>{fmt(d.cycle)}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F]">{d.phone || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vehicle locations table */}
      <div className="bg-white rounded-xl border border-[#F1F3F4] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#F1F3F4]">
          <h2 className="text-xs font-black uppercase tracking-widest text-[#3C4043]/70">Vehicle Locations</h2>
          <p className="text-[10px] text-[#757A7F] mt-0.5">Live GPS from Samsara. Updated every minute.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-[#F1F3F4]">
              <tr>
                {['Vehicle', 'Assigned Driver', 'Address', 'Speed', 'Heading', 'Status'].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[#757A7F]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-[#757A7F]">No vehicles reporting.</td></tr>
              ) : vehicles.map((v, i) => {
                const moving = (v.speed || 0) > 2;
                return (
                  <tr key={i} className="border-t border-[#F1F3F4] hover:bg-[#F1F3F4]/40">
                    <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{v.name}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F]">{v.driver}</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F] truncate max-w-[300px]">{v.address || '—'}</td>
                    <td className="px-3 py-2 text-xs font-bold text-[#3C4043]">{v.speed || 0} mph</td>
                    <td className="px-3 py-2 text-xs text-[#757A7F]">{v.heading || 0}°</td>
                    <td className="px-3 py-2 text-xs font-black" style={{ color: moving ? '#20BC64' : '#F5A623' }}>● {moving ? 'EN ROUTE' : 'PARKED'}</td>
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
