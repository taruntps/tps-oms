// src/lib/attendanceGeo.ts
export type VerificationStatus = 'verified' | 'no_match' | 'unverified'

/** Great-circle distance between two lat/lng points, in metres. */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)))
}

/** Rekognition similarity (0–100, or null on failure) + threshold % → status. */
export function mapVerification(similarity: number | null, thresholdPct: number): VerificationStatus {
  if (similarity == null) return 'unverified'
  return similarity >= thresholdPct ? 'verified' : 'no_match'
}
