import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // Never cache this route at the edge

const SAMSARA_API_KEY = process.env.SAMSARA_API_KEY || '';

export async function getGlobalSamsara() {
  // If no Samsara key is configured, return empty so the dashboard degrades gracefully
  if (!SAMSARA_API_KEY) {
    return { vehicles: [], crews: [], hos: [], configured: false };
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

    // Fetch live Hours of Service clocks for DOT remaining hours.
    // Daily logs do not carry the current remaining drive/shift/cycle clocks.
    let hos: any[] = [];
    try {
      const hosRes = await fetch('https://api.samsara.com/fleet/hos/clocks?limit=50', {
        headers,
        next: { revalidate: 300 }, // 5 minutes
      });
      if (hosRes.ok) {
        const hData = await hosRes.json();
        const msToHours = (value: unknown) => typeof value === 'number' ? value / 3600000 : null;
        hos = (hData.data || []).map((d: any) => {
          const clocks = d.clocks || {};
          return {
            driverId: d.driver?.id || '',
            driverName: d.driver?.name || '',
            currentVehicle: d.currentVehicle?.name || '',
            logDate: '',
            driveRemainingHrs: msToHours(clocks.drive?.driveRemainingDurationMs),
            shiftRemainingHrs: msToHours(clocks.shift?.shiftRemainingDurationMs),
            cycleRemainingHrs: msToHours(clocks.cycle?.cycleRemainingDurationMs),
            breakRemainingHrs: msToHours(clocks.break?.timeUntilBreakDurationMs),
            cycleTomorrowHrs: msToHours(clocks.cycle?.cycleTomorrowDurationMs),
            currentStatus: d.currentDutyStatus?.hosStatusType || '',
          };
        });
      }
    } catch (e) {
      console.warn('[telematics/samsara] HOS fetch failed:', e);
    }

    if (crews.length === 0 && hos.length > 0) {
      crews = hos.map((h: any) => ({
        id: h.driverId,
        name: h.driverName,
        phone: '',
        status: 'on_duty',
      })).filter((driver: any) => driver.name);
    }

    return { vehicles, crews, hos, configured: true, timestamp: new Date().toISOString() };
  } catch (error) {
    console.error('[telematics/samsara] Error:', error);
    return { vehicles: [], crews: [], hos: [], configured: false, error: 'Samsara fetch failed' };
  }
}

export async function GET() {
  const data = await getGlobalSamsara();
  if (data.error) return NextResponse.json(data, { status: 500 });
  return NextResponse.json(data);
}
