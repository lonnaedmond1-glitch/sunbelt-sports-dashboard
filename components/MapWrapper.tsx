'use client';

import dynamic from 'next/dynamic';

const LiveMap = dynamic(() => import('./LiveMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#1a1d20' }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#20BC64] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-white/30 text-xs font-bold uppercase tracking-widest">Loading Map</p>
      </div>
    </div>
  ),
});

interface JobPin {
  Job_Number: string;
  Job_Name: string;
  Lat: string;
  Lng: string;
  Status: string;
  Pct_Complete: number;
  General_Contractor: string;
  Contract_Amount: number;
}

interface VehiclePin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  speed: number;
  driver: string;
  status: string;
}

export default function MapWrapper({ jobs, vehicles }: { jobs: JobPin[]; vehicles: VehiclePin[] }) {
  return <LiveMap jobs={jobs} vehicles={vehicles} />;
}
