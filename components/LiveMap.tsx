'use client';

import { useEffect, useRef } from 'react';

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

interface Props {
  jobs: JobPin[];
  vehicles: VehiclePin[];
}

export default function LiveMap({ jobs, vehicles }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Dynamically import Leaflet to avoid SSR issues
    import('leaflet').then((L) => {
      // Fix leaflet default icon paths
      // @ts-expect-error - leaflet icon prototype fix
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [33.0, -85.0], // Center on Southeast US
        zoom: 6,
        zoomControl: true,
        attributionControl: false,
      });
      mapInstanceRef.current = map;

      // Dark tile layer (CartoDB dark matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(map);

      // Custom job site icon
      const jobIcon = (pct: number) => L.divIcon({
        html: `
          <div style="
            width:36px; height:36px;
            background: ${pct >= 80 ? '#20BC64' : pct >= 40 ? '#fb923c' : '#ef4444'};
            border: 2px solid rgba(255,255,255,0.8);
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            box-shadow: 0 2px 8px rgba(0,0,0,0.6);
            display:flex; align-items:center; justify-content:center;
          ">
            <span style="transform:rotate(45deg); font-size:11px; font-weight:900; color:white;">${pct}%</span>
          </div>`,
        className: '',
        iconSize: [36, 36],
        iconAnchor: [18, 36],
        popupAnchor: [0, -38],
      });

      // Vehicle icon
      const vehicleIcon = L.divIcon({
        html: `
          <div style="
            width:24px; height:24px;
            background: #60a5fa;
            border: 2px solid white;
            border-radius: 4px;
            box-shadow: 0 0 8px rgba(96,165,250,0.8);
            display:flex; align-items:center; justify-content:center;
            font-size:12px;
          ">🚛</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -14],
      });

      // Plot job pins
      const validJobs = jobs.filter(j => j.Lat && j.Lng && !isNaN(parseFloat(j.Lat)));
      validJobs.forEach((job) => {
        const lat = parseFloat(job.Lat);
        const lng = parseFloat(job.Lng);
        const pct = Math.round(job.Pct_Complete || 0);
        if (isNaN(lat) || isNaN(lng)) return;

        const marker = L.marker([lat, lng], { icon: jobIcon(pct) }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Montserrat,sans-serif; min-width:180px; background:#1e2023; color:white; border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.1);">
            <p style="font-size:11px; color:#20BC64; font-weight:900; text-transform:uppercase; margin:0 0 4px 0;">${job.Job_Number}</p>
            <p style="font-size:13px; font-weight:700; margin:0 0 4px 0;">${job.Job_Name}</p>
            <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0 0 2px 0;">${job.General_Contractor || ''}</p>
            <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0;">${pct}% complete · $${(job.Contract_Amount || 0).toLocaleString()}</p>
            <a href="/jobs/${job.Job_Number}" style="display:inline-block; margin-top:8px; font-size:11px; color:#20BC64; font-weight:700;">View Snapshot →</a>
          </div>
        `, { className: 'dark-popup' });
      });

      // Plot vehicle pins
      vehicles.forEach((v) => {
        const marker = L.marker([v.lat, v.lng], { icon: vehicleIcon }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Montserrat,sans-serif; background:#1e2023; color:white; border-radius:8px; padding:10px; border:1px solid rgba(96,165,250,0.3);">
            <p style="font-size:11px; color:#60a5fa; font-weight:900; margin:0 0 4px 0;">VEHICLE</p>
            <p style="font-size:13px; font-weight:700; margin:0 0 2px 0;">${v.name}</p>
            <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0;">Driver: ${v.driver}</p>
            <p style="font-size:11px; color:rgba(255,255,255,0.5); margin:0;">${v.speed} mph</p>
          </div>
        `, { className: 'dark-popup' });
      });

      // Auto-fit to job pins if there are valid ones
      if (validJobs.length > 0) {
        const bounds = L.latLngBounds(validJobs.map(j => [parseFloat(j.Lat), parseFloat(j.Lng)]));
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 9 });
      }

      // Add custom CSS for dark popups
      const style = document.createElement('style');
      style.textContent = `
        .dark-popup .leaflet-popup-content-wrapper { background:transparent; border:none; box-shadow:none; padding:0; }
        .dark-popup .leaflet-popup-content { margin:0; }
        .dark-popup .leaflet-popup-tip-container { display:none; }
        .leaflet-control-zoom { border:1px solid rgba(255,255,255,0.1) !important; }
        .leaflet-control-zoom a { background:#1e2023 !important; color:white !important; border-color:rgba(255,255,255,0.1) !important; }
        .leaflet-control-zoom a:hover { background:#2A2D31 !important; }
      `;
      document.head.appendChild(style);
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
        crossOrigin=""
      />
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '420px', borderRadius: '0 0 16px 16px' }} />
    </>
  );
}
