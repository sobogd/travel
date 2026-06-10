// Great-circle distance (km) between two lat/lon points.
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Rough flight time (minutes): cruise ~750 km/h + 45 min taxi/climb/descent.
export function estFlightMin(distKm: number): number {
  return (distKm / 750) * 60 + 45;
}

// Rough ground transfer time (minutes) between nearby airports at ~80 km/h.
export function estGroundMin(distKm: number): number {
  return (distKm / 80) * 60;
}
