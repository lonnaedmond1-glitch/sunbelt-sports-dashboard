'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { formatDollars } from '@/lib/format';

interface Rental {
  vendor: string;
  contractNumber: string;
  Job_Number: string;
  equipmentType: string;
  quantity: number;
  dayRate: number;
  startDate: string;
  status: string;
}

interface VLAsset {
  Equipment_ID: string;
  Make: string;
  Model: string;
  Last_GPS: string;
  Engine_Hours: number;
  Status: string;
  Last_Update: string;
  Asset_Name: string;
}

interface Props {
  sunbeltRentals: Rental[];
  unitedRentals: Rental[];
  assets: VLAsset[];
  sunbeltEmail: string;
  sunbeltPhone: string;
}

function callOffMailto(r: Rental, email: string, phone: string): string {
  const subject = encodeURIComponent(`Call Off Rent — ${r.contractNumber ? `#${r.contractNumber} · ` : ''}${r.equipmentType}`);
  const body = encodeURIComponent(
    `Please arrange pickup for the following rental:\n\n` +
    `  Item:       ${r.equipmentType}\n` +
    `  Item Code:  ${r.contractNumber || '—'}\n` +
    `  Job #:      ${r.Job_Number || '—'}\n` +
    `  Start Date: ${r.startDate || '—'}\n` +
    `  Qty:        ${r.quantity}\n` +
    `  Status:     ${r.status || 'On Rent'}\n\n` +
    `Please confirm pickup date at your earliest convenience.\n\n` +
    `Thank you,\nSunbelt Sports Construction\n\n` +
    `(Rep: ${phone})`
  );
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

function RentalsTable({ rentals, vendor, email, phone }: {
  rentals: Rental[];
  vendor: string;
  email?: string;
  phone?: string;
}) {
  const totalBurn = rentals.reduce((s, r) => s + (r.dayRate || 0), 0);

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">{vendor} ({rentals.length})</span>
        {totalBurn > 0 && (
          <span className="text-xs text-steel-grey font-mono">
            {formatDollars(totalBurn)} / day
          </span>
        )}
      </div>
      <div className="card overflow-hidden">
        {rentals.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="font-display text-lg text-steel-grey">No data</p>
            <p className="text-xs text-steel-grey mt-1">
              {vendor === 'United Rentals'
                ? 'Email sync is being investigated. Check back soon.'
                : 'No active rentals found in the sheet.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-3">Item Code</th>
                <th className="text-left px-4 py-3">Description</th>
                <th className="text-left px-4 py-3">Job #</th>
                <th className="text-center px-4 py-3">Qty</th>
                <th className="text-right px-4 py-3">Daily Rate</th>
                <th className="text-left px-4 py-3">Start Date</th>
                <th className="text-left px-4 py-3">Status</th>
                {email && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody>
              {rentals.map((r, i) => (
                <tr key={i} className="border-b border-line-grey last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-steel-grey">{r.contractNumber || '—'}</td>
                  <td className="px-4 py-2 text-iron-charcoal">{r.equipmentType || '—'}</td>
                  <td className="px-4 py-2">
                    {r.Job_Number ? (
                      <Link href={`/jobs/${encodeURIComponent(r.Job_Number)}`}
                        className="text-sunbelt-green font-mono text-xs hover:underline">
                        {r.Job_Number}
                      </Link>
                    ) : (
                      <span className="text-xs text-steel-grey italic">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center font-mono text-xs text-iron-charcoal">{r.quantity}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-iron-charcoal">
                    {r.dayRate > 0 ? `${formatDollars(r.dayRate)}/day` : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-steel-grey">{r.startDate || '—'}</td>
                  <td className="px-4 py-2 text-xs text-steel-grey">{r.status || '—'}</td>
                  {email && (
                    <td className="px-4 py-2 text-right">
                      <a
                        href={callOffMailto(r, email, phone!)}
                        className="text-xs font-display tracking-wider text-sunbelt-green border border-sunbelt-green px-3 py-1 rounded hover:bg-sunbelt-green hover:text-white transition-colors whitespace-nowrap"
                      >
                        Call Off Rent
                      </a>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AssetsTable({ assets }: { assets: VLAsset[] }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <span className="eyebrow">VisionLink Assets ({assets.length})</span>
        {assets.length > 0 && (
          <span className="text-xs text-steel-grey">
            Last sync: {assets[0]?.Last_Update || '—'}
          </span>
        )}
      </div>
      <div className="card overflow-hidden">
        {assets.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="font-display text-lg text-steel-grey">No VisionLink data</p>
            <p className="text-xs text-steel-grey mt-1">VisionLink_Live tab is empty or unreachable.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                <th className="text-left px-4 py-3">Equipment ID</th>
                <th className="text-left px-4 py-3">Make / Model</th>
                <th className="text-left px-4 py-3">Last GPS</th>
                <th className="text-right px-4 py-3">Engine Hours</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Last Update</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a, i) => (
                <tr key={i} className="border-b border-line-grey last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-steel-grey">{a.Equipment_ID || '—'}</td>
                  <td className="px-4 py-2">
                    <span className="text-iron-charcoal">{a.Asset_Name || '—'}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-steel-grey">{a.Last_GPS || '—'}</td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-iron-charcoal">
                    {a.Engine_Hours > 0 ? `${a.Engine_Hours.toLocaleString()}h` : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs" style={{ color: a.Status?.toLowerCase() === 'active' ? '#198754' : '#6B7278' }}>
                      ● {a.Status || '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-steel-grey">{a.Last_Update || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function EquipmentTabs({ sunbeltRentals, unitedRentals, assets, sunbeltEmail, sunbeltPhone }: Props) {
  const [activeTab, setActiveTab] = useState<'rentals' | 'owned'>('rentals');

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-line-grey mb-6">
        {(['rentals', 'owned'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-display tracking-widest uppercase text-xs border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-sunbelt-green text-sunbelt-green'
                : 'border-transparent text-steel-grey hover:text-iron-charcoal'
            }`}
          >
            {tab === 'rentals' ? `Rentals (${sunbeltRentals.length + unitedRentals.length})` : `Owned Assets (${assets.length})`}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'rentals' && (
        <div>
          <RentalsTable
            rentals={sunbeltRentals}
            vendor="Sunbelt Rentals"
            email={sunbeltEmail}
            phone={sunbeltPhone}
          />
          <RentalsTable
            rentals={unitedRentals}
            vendor="United Rentals"
          />
        </div>
      )}

      {activeTab === 'owned' && (
        <AssetsTable assets={assets} />
      )}
    </div>
  );
}
