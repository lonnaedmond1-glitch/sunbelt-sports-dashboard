export const revalidate = 300;
import React from 'react';
import Link from 'next/link';
import { fetchLiveRentals, fetchVisionLinkAssets } from '@/lib/sheets-data';
import { formatDollars, formatDollarsCompact } from '@/lib/format';
import EquipmentTabs from './EquipmentTabs';

export default async function EquipmentPage() {
  const [liveRentals, vlAssets] = await Promise.all([
    fetchLiveRentals(),
    fetchVisionLinkAssets(),
  ]);

  // Sunbelt rep for Call Off Rent mailto
  const SUNBELT_EMAIL = 'Justin.Stanley@sunbeltrentals.com';
  const SUNBELT_PHONE = '678-294-6226';

  // Rentals — deduplicated, vendor-keyed
  const sunbeltRentals = (liveRentals as any[]).filter(r => r.vendor === 'Sunbelt Rentals');
  const unitedRentals  = (liveRentals as any[]).filter(r => r.vendor === 'United Rentals');

  // VisionLink owned assets
  const assets = vlAssets;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-[1400px] mx-auto">

        <header className="mb-8 flex justify-between items-end">
          <div>
            <span className="eyebrow">Equipment</span>
            <h1 className="text-4xl font-display mt-2">Rentals &amp; Owned Assets</h1>
          </div>
          <Link href="/dashboard" className="text-xs text-sunbelt-green font-display tracking-widest uppercase hover:text-sunbelt-green-hover">← Dashboard</Link>
        </header>

        <EquipmentTabs
          sunbeltRentals={sunbeltRentals}
          unitedRentals={unitedRentals}
          assets={assets}
          sunbeltEmail={SUNBELT_EMAIL}
          sunbeltPhone={SUNBELT_PHONE}
        />
      </div>
    </div>
  );
}
