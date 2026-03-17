import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Never cache this route at the edge

const SAMSARA_API_KEY = process.env.SAMSARA_API_KEY || '';

export async function getGlobalSamsara() {
  // If no Samsara key is configured, return empty so the dashboard degrades gracefully
  if (!SAMSARA_API_KEY) {
    return { vehicles: [], crews: [], configured: false };
  }

  try {
    const headers = { Authorization: `Bearer ${SAMSARA_API_KEY}`, 'Content-Type': 'application/json' };

    // Fetch vehicle locations
    const vehicleRes = await fetch('https://api.samsara.com/fleet/vehicles/locations', {
      headers,
      next: { revalidate: 60 },
    });

    let vehicles: any[] = [];
    if (vehicleRes.ok) {
      const vData = await vehicleRes.json();
      // Only show the 8 specific vehicles requested by the user
      const KEY_NAMES = ['alex', 'sergio', 'martin', 'julio', 'juan', 'cesar', 'david moctezuma', 'rosendo', 'lowboy'];
      vehicles = (vData.data || [])
        .map((v: any) => ({
          id: v.id,
          name: v.name,
          lat: v.location?.latitude,
          lng: v.location?.longitude,
          speed: v.location?.speed || 0,
          heading: v.location?.heading || 0,
          address: v.location?.reverseGeo?.formattedLocation || '',
          status: 'active',
          driver: v.staticAssignedDriver?.name || 'Unassigned',
        }))
        .filter((v: any) => v.lat && v.lng)
        .filter((v: any) => {
          const nameLower = (v.name || '').toLowerCase();
          return KEY_NAMES.some(k => new RegExp(`\\b${k}\\b`).test(nameLower));
        });
    }

    // Fetch driver/DOT HOS data for crew count
    const driverRes = await fetch('https://api.samsara.com/fleet/drivers?driverActivationStatus=active', {
      headers,
      next: { revalidate: 300 },
    });

    let crews: any[] = [];
    if (driverRes.ok) {
      const dData = await driverRes.json();
      crews = (dData.data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        phone: d.phone || '',
        status: d.eldExempt ? 'exempt' : 'on_duty',
      }));
    }

    return { vehicles, crews, configured: true, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error('[telematics/samsara] Error:', error);
    return { vehicles: [], crews: [], configured: false, error: 'Samsara fetch failed' };
  }
}

export async function GET() {
  const data = await getGlobalSamsara();
  if (data.error) return NextResponse.json(data, { status: 500 });
  return NextResponse.json(data);
}
