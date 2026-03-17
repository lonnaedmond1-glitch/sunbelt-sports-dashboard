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
}

interface Props {
  jobs: JobPin[];
  vehicles: VehiclePin[];
}

// Jitter overlapping vehicles so they don't stack on top of each other
function jitterOverlaps(vehicles: VehiclePin[]): VehiclePin[] {
  const PRECISION = 3; // ~100m radius grouping
  const groups = new Map<string, VehiclePin[]>();
  for (const v of vehicles) {
    const key = `${v.lat.toFixed(PRECISION)},${v.lng.toFixed(PRECISION)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const result: VehiclePin[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }
    // Spread in a circle ~0.003 degrees radius (~300m)
    const r = 0.003;
    group.forEach((v, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      result.push({ ...v, lat: v.lat + r * Math.cos(angle), lng: v.lng + r * Math.sin(angle) });
    });
  }
  return result;
}

// Shorten job name to fit on pin label
function shortName(name: string): string {
  const stopWords = ['high', 'school', 'middle', 'elementary', 'county', 'district'];
  const words = name.split(/[\s\-]+/).filter(w => w.length > 0);
  // Take first meaningful word(s) up to ~12 chars
  let label = '';
  for (const w of words) {
    if (stopWords.includes(w.toLowerCase())) continue;
    if (label.length + w.length > 12) break;
    label += (label ? ' ' : '') + w;
  }
  return label || words[0] || name.slice(0, 10);
}

// First name from full name string like "Jeff Reece (6450.88)" → "Jeff"
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
        center: [33.0, -85.0], zoom: 6,
        zoomControl: true, attributionControl: false,
      });
      mapInstanceRef.current = map;

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19, subdomains: 'abcd',
      }).addTo(map);

      // ── Job site pin: pill with short name + % ───────────────────────────
      const jobIcon = (pct: number, name: string) => {
        const color = pct >= 80 ? '#20BC64' : pct >= 40 ? '#fb923c' : '#ef4444';
        const label = shortName(name);
        return L.divIcon({
          html: `
            <div style="
              display:flex; flex-direction:column; align-items:center;
              filter: drop-shadow(0 2px 6px rgba(0,0,0,0.7));
            ">
              <div style="
                background:${color}; color:white;
                padding:3px 8px; border-radius:20px;
                font-size:9px; font-weight:900; font-family:Montserrat,sans-serif;
                white-space:nowrap; text-transform:uppercase; letter-spacing:0.5px;
                border:1.5px solid rgba(255,255,255,0.5);
                box-shadow:0 0 10px ${color}60;
                line-height:1.3;
              ">${label}</div>
              <div style="
                background:${color}; color:white;
                padding:2px 6px; margin-top:2px; border-radius:10px;
                font-size:10px; font-weight:900; font-family:Montserrat,sans-serif;
                border:1.5px solid rgba(255,255,255,0.4);
              ">${pct}%</div>
              <div style="width:2px;height:8px;background:${color};margin-top:1px;opacity:0.7;"></div>
            </div>`,
          className: '',
          iconSize: [80, 56],
          iconAnchor: [40, 56],
          popupAnchor: [0, -58],
        });
      };

      // ── Vehicle pin: named badge with speed indicator ────────────────────
      const vehicleIcon = (name: string, speed: number) => {
        const isMoving = speed > 2;
        const fname = firstName(name);
        const statusColor = isMoving ? '#4ade80' : '#fb923c';
        return L.divIcon({
          html: `
            <div style="
              display:flex; flex-direction:column; align-items:center;
              filter: drop-shadow(0 2px 6px rgba(0,0,0,0.8));
            ">
              <div style="
                background:#1a2744; border:2px solid #60a5fa;
                border-radius:8px; padding:3px 7px;
                display:flex; align-items:center; gap:4px;
                box-shadow:0 0 12px rgba(96,165,250,0.5);
                white-space:nowrap;
              ">
                <span style="font-size:11px;">🚛</span>
                <span style="font-size:9px; font-weight:900; font-family:Montserrat,sans-serif; color:white; text-transform:uppercase; letter-spacing:0.5px;">${fname}</span>
                <span style="width:6px;height:6px;background:${statusColor};border-radius:50%;flex-shrink:0;box-shadow:0 0 4px ${statusColor};"></span>
              </div>
              <div style="width:2px;height:6px;background:#60a5fa;opacity:0.6;"></div>
            </div>`,
          className: '',
          iconSize: [90, 36],
          iconAnchor: [45, 36],
          popupAnchor: [0, -38],
        });
      };

      // ── Plot job pins ────────────────────────────────────────────────────
      const validJobs = jobs.filter(j => j.Lat && j.Lng && !isNaN(parseFloat(j.Lat)));
      validJobs.forEach((job) => {
        const lat = parseFloat(job.Lat);
        const lng = parseFloat(job.Lng);
        const pct = Math.round(job.Pct_Complete || 0);
        if (isNaN(lat) || isNaN(lng)) return;

        const proximityHtml = job.nearestVehicle
          ? `<div style="margin-top:6px;padding:4px 8px;background:rgba(96,165,250,0.12);border:1px solid rgba(96,165,250,0.3);border-radius:6px;font-size:10px;color:#60a5fa;">🚛 ${job.nearestVehicle.name} — ${job.nearestVehicle.miles.toFixed(1)} mi away</div>`
          : '';

        const marker = L.marker([lat, lng], { icon: jobIcon(pct, job.Job_Name) }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Montserrat,sans-serif;min-width:210px;background:#1e2023;color:white;border-radius:10px;padding:14px;border:1px solid rgba(255,255,255,0.1);">
            <p style="font-size:10px;color:#20BC64;font-weight:900;text-transform:uppercase;margin:0 0 3px 0;letter-spacing:1px;">${job.Job_Number}</p>
            <p style="font-size:13px;font-weight:800;margin:0 0 4px 0;line-height:1.2;">${job.Job_Name}</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.45);margin:0 0 2px 0;">${job.General_Contractor || ''}</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.45);margin:0;">${pct}% complete · $${(job.Contract_Amount || 0).toLocaleString()}</p>
            ${proximityHtml}
            <a href="/jobs/${job.Job_Number}" style="display:inline-block;margin-top:10px;font-size:11px;color:#20BC64;font-weight:800;text-decoration:none;">View Snapshot →</a>
          </div>`, { className: 'dark-popup' });
      });

      // ── Plot vehicle pins (with overlap jitter) ──────────────────────────
      const spreadVehicles = jitterOverlaps(vehicles.filter(v => v.lat && v.lng));
      spreadVehicles.forEach((v) => {
        const marker = L.marker([v.lat, v.lng], { icon: vehicleIcon(v.name, v.speed) }).addTo(map);
        marker.bindPopup(`
          <div style="font-family:Montserrat,sans-serif;min-width:190px;background:#1a2744;color:white;border-radius:10px;padding:12px;border:1px solid rgba(96,165,250,0.3);">
            <p style="font-size:10px;color:#60a5fa;font-weight:900;text-transform:uppercase;margin:0 0 3px 0;letter-spacing:1px;">SAMSARA · LIVE</p>
            <p style="font-size:13px;font-weight:800;margin:0 0 2px 0;">${v.name.replace(/\s*\(.*\)/, '')}</p>
            <p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0 0 2px 0;">Driver: ${v.driver !== 'Unassigned' ? v.driver : '—'}</p>
            <p style="font-size:11px;color:${v.speed > 2 ? '#4ade80' : '#fb923c'};margin:0;">${v.speed > 2 ? `🟢 Moving · ${v.speed} mph` : '🟠 Parked'}</p>
          </div>`, { className: 'dark-popup' });
      });

      // Fit bounds to all pins (jobs + vehicles) — stay zoomed to the region, never the whole globe
      const allPoints: [number, number][] = [];
      validJobs.forEach(j => {
        const lat = parseFloat(j.Lat); const lng = parseFloat(j.Lng);
        if (!isNaN(lat) && !isNaN(lng)) allPoints.push([lat, lng]);
      });
      spreadVehicles.forEach(v => {
        if (v.lat && v.lng) allPoints.push([v.lat, v.lng]);
      });
      if (allPoints.length > 0) {
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, minZoom: 7 });
      } else {
        // Fallback: center on Georgia if no pins
        map.setView([33.5, -83.9], 8);
      }

      const style = document.createElement('style');
      style.textContent = `
        .dark-popup .leaflet-popup-content-wrapper { background:transparent;border:none;box-shadow:none;padding:0; }
        .dark-popup .leaflet-popup-content { margin:0; }
        .dark-popup .leaflet-popup-tip-container { display:none; }
        .leaflet-control-zoom { border:1px solid rgba(255,255,255,0.1) !important; }
        .leaflet-control-zoom a { background:#1e2023 !important;color:white !important;border-color:rgba(255,255,255,0.1) !important; }
        .leaflet-control-zoom a:hover { background:#2A2D31 !important; }
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
      <div ref={mapRef} style={{ width: '100%', height: '100%', minHeight: '420px', borderRadius: '0 0 16px 16px' }} />
    </>
  );
}
