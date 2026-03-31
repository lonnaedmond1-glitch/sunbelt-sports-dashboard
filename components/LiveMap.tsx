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
  nearestVehicle?: { name: string; driver: string; miles: number } | null;
}

interface VehiclePin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  speed: number;
  driver: string;
  status: string;
  address?: string;
}

interface Props {
  jobs: JobPin[];
  vehicles: VehiclePin[];
}

function jitterOverlaps(vehicles: VehiclePin[]): VehiclePin[] {
  const PRECISION = 3;
  const groups = new Map<string, VehiclePin[]>();
  for (const v of vehicles) {
    const key = `${v.lat.toFixed(PRECISION)},${v.lng.toFixed(PRECISION)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const result: VehiclePin[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }
    const r = 0.003;
    group.forEach((v, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      result.push({ ...v, lat: v.lat + r * Math.cos(angle), lng: v.lng + r * Math.sin(angle) });
    });
  }
  return result;
}

function shortName(name: string): string {
  const stopWords = ['high', 'school', 'middle', 'elementary', 'county', 'district'];
  const words = name.split(/[\s\-]+/).filter(w => w.length > 0);
  let label = '';
  for (const w of words) {
    if (stopWords.includes(w.toLowerCase())) continue;
    if (label.length + w.length > 12) break;
    label += (label ? ' ' : '') + w;
  }
  return label || words[0] || name.slice(0, 10);
}

function firstName(name: string): string {
  return name.split(/[\s(]/)[0] || name.slice(0, 5);
}

export default function LiveMap({ jobs, vehicles }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import('leaflet').then((L) => {
      // @ts-expect-error - leaflet icon fix
      delete L.Icon.Default.prototype._getIconUrl;

      if (!mapRef.current) return;

      const map = L.map(mapRef.current, {
        center: [33.5, -83.9], zoom: 8,
        zoomControl: true, attributionControl: false,
        minZoom: 6, maxZoom: 18,
      });
      mapInstanceRef.current = map;

      // Dark map tiles
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, subdomains: 'abcd',
      }).addTo(map);

      // Job site icon - clean modern pill style
      const jobIcon = (pct: number, name: string) => {
        const color = pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
        const label = shortName(name);
        return L.divIcon({
          html: `
            <div style="
              display:flex; flex-direction:column; align-items:center;
              filter: drop-shadow(0 2px 8px rgba(0,0,0,0.5));
            ">
              <div style="
                background:${color}; color:white;
                padding:4px 10px; border-radius:6px;
                font-size:10px; font-weight:600; font-family:Inter,system-ui,sans-serif;
                white-space:nowrap; letter-spacing:0.3px;
                border:1px solid rgba(255,255,255,0.2);
                line-height:1.3;
              ">${label}</div>
              <div style="
                background:rgba(10,10,10,0.9); color:${color};
                padding:2px 8px; margin-top:3px; border-radius:4px;
                font-size:11px; font-weight:700; font-family:'JetBrains Mono',monospace;
                border:1px solid ${color}40;
              ">${pct}%</div>
              <div style="width:2px;height:6px;background:${color};margin-top:2px;opacity:0.6;border-radius:1px;"></div>
            </div>`,
          className: '',
          iconSize: [80, 56],
          iconAnchor: [40, 56],
          popupAnchor: [0, -58],
        });
      };

      // Vehicle icon - modern dark card style
      const vehicleIcon = (name: string, speed: number, status: string = 'active') => {
        const isMoving = speed > 5;
        const borderColor = isMoving ? '#22c55e' : '#f59e0b';
        const fname = firstName(name);
        return L.divIcon({
          html: `
            <div style="
              display:flex; flex-direction:column; align-items:center;
              filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
            ">
              <div style="
                background:#1a1a1a; border:1.5px solid ${borderColor};
                border-radius:6px; padding:4px 10px;
                display:flex; align-items:center; gap:6px;
                box-shadow:0 0 12px ${borderColor}30;
              ">
                <div style="width:6px;height:6px;border-radius:50%;background:${borderColor};${isMoving ? 'animation:pulse 1.5s infinite;' : ''}"></div>
                <span style="font-size:10px; font-weight:600; font-family:Inter,system-ui,sans-serif; color:white; letter-spacing:0.3px;">${fname}</span>
              </div>
              <div style="width:2px;height:4px;background:${borderColor};opacity:0.5;margin-top:2px;border-radius:1px;"></div>
            </div>`,
          className: '',
          iconSize: [90, 36],
          iconAnchor: [45, 36],
          popupAnchor: [0, -38],
        });
      };

      // Plot job pins
      const validJobs = jobs.filter(j => j.Lat && j.Lng && !isNaN(parseFloat(j.Lat)));
      validJobs.forEach((job) => {
        const lat = parseFloat(job.Lat);
        const lng = parseFloat(job.Lng);
        const pct = Math.round(job.Pct_Complete || 0);
        if (isNaN(lat) || isNaN(lng)) return;

        const proximityHtml = job.nearestVehicle
          ? `<div style="margin-top:8px;padding:6px 10px;background:rgba(59,130,246,0.1);border:1px solid rgba(59,130,246,0.2);border-radius:6px;font-size:11px;color:#60a5fa;display:flex;align-items:center;gap:6px;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
              ${job.nearestVehicle.name} — ${job.nearestVehicle.miles.toFixed(1)} mi
            </div>`
          : '';

        const marker = L.marker([lat, lng], { icon: jobIcon(pct, job.Job_Name) }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Inter,system-ui,sans-serif;min-width:220px;background:#1a1a1a;color:white;border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.1);">
            <p style="font-size:10px;color:#f97316;font-weight:600;margin:0 0 4px 0;letter-spacing:0.5px;">${job.Job_Number}</p>
            <p style="font-size:14px;font-weight:600;margin:0 0 6px 0;line-height:1.3;">${job.Job_Name}</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 4px 0;">${job.General_Contractor || ''}</p>
            <div style="display:flex;gap:12px;font-size:11px;color:rgba(255,255,255,0.7);margin-top:8px;">
              <span>${pct}% billed</span>
              <span>$${(job.Contract_Amount || 0).toLocaleString()}</span>
            </div>
            ${proximityHtml}
            <a href="/jobs/${job.Job_Number}" style="display:inline-flex;align-items:center;gap:4px;margin-top:12px;font-size:11px;color:#f97316;font-weight:600;text-decoration:none;">
              View Details
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14m-7-7 7 7-7 7"/></svg>
            </a>
          </div>`, { className: 'dark-popup' });
      });

      // Plot vehicle pins
      const spreadVehicles = jitterOverlaps(vehicles.filter(v => v.lat && v.lng));
      spreadVehicles.forEach((v) => {
        const marker = L.marker([v.lat, v.lng], { icon: vehicleIcon(v.name, v.speed, v.status) }).addTo(map);
        const isMoving = v.speed > 5;
        marker.bindPopup(`
          <div style="font-family:Inter,system-ui,sans-serif;min-width:200px;background:#1a1a1a;color:white;border-radius:10px;padding:12px;border:1px solid ${isMoving ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'};">
            <p style="font-size:10px;color:${isMoving ? '#22c55e' : '#f59e0b'};font-weight:600;margin:0 0 4px 0;letter-spacing:0.5px;">SAMSARA • LIVE</p>
            <p style="font-size:13px;font-weight:600;margin:0 0 6px 0;">${v.name.replace(/\s*\(.*\)/, '')}</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 4px 0;">Driver: ${v.driver !== 'Unassigned' ? v.driver : '—'}</p>
            <div style="display:flex;align-items:center;gap:6px;margin-top:6px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${isMoving ? '#22c55e' : '#f59e0b'};"></span>
              <span style="font-size:11px;color:${isMoving ? '#22c55e' : '#f59e0b'};font-weight:500;">${isMoving ? `Moving • ${v.speed} mph` : 'Parked'}</span>
            </div>
          </div>`, { className: 'dark-popup' });
      });

      // Fit bounds to all pins
      const isValidCoord = (lat: number, lng: number) => lat >= 25 && lat <= 40 && lng >= -95 && lng <= -75;
      const allPoints: [number, number][] = [];
      validJobs.forEach(j => {
        const lat = parseFloat(j.Lat); const lng = parseFloat(j.Lng);
        if (!isNaN(lat) && !isNaN(lng) && isValidCoord(lat, lng)) allPoints.push([lat, lng]);
      });
      spreadVehicles.forEach(v => {
        if (v.lat && v.lng && isValidCoord(v.lat, v.lng)) allPoints.push([v.lat, v.lng]);
      });
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      } else {
        map.setView([33.5, -83.9], 8);
      }

      const style = document.createElement('style');
      style.textContent = `
        .dark-popup .leaflet-popup-content-wrapper { background:transparent;border:none;box-shadow:none;padding:0; }
        .dark-popup .leaflet-popup-content { margin:0; }
        .dark-popup .leaflet-popup-tip-container { display:none; }
        .leaflet-control-zoom { border:1px solid rgba(255,255,255,0.1) !important;border-radius:8px !important;overflow:hidden; }
        .leaflet-control-zoom a { background:#1a1a1a !important;color:white !important;border-color:rgba(255,255,255,0.1) !important;width:32px !important;height:32px !important;line-height:32px !important;font-size:16px !important; }
        .leaflet-control-zoom a:hover { background:#242424 !important; }
        .leaflet-control-zoom-in { border-radius:0 !important; }
        .leaflet-control-zoom-out { border-radius:0 !important; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `;
      document.head.appendChild(style);
    });

    return () => {
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; }
    };
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossOrigin="" />
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: '420px', background: '#0a0a0a' }} />
    </>
  );
}
