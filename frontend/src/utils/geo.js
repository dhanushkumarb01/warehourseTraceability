/**
 * Client-side coordinate helpers — mirror backend src/placement/geo.js so
 * forms can validate before submitting. The backend remains authoritative.
 */

const blank = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * Validate an optional latitude/longitude pair entered as text.
 * @returns {{ errors: { latitude?: string, longitude?: string }, value: { latitude: number|null, longitude: number|null } }}
 */
export function validateCoordinates(latitude, longitude, { required = false } = {}) {
  const errors = {};
  const none = { latitude: null, longitude: null };

  if (blank(latitude) && blank(longitude)) {
    if (required) {
      errors.latitude = 'Latitude is required.';
      errors.longitude = 'Longitude is required.';
    }
    return { errors, value: none };
  }
  if (blank(latitude)) errors.latitude = 'Enter latitude too, or clear longitude.';
  if (blank(longitude)) errors.longitude = 'Enter longitude too, or clear latitude.';

  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!blank(latitude) && (!Number.isFinite(lat) || lat < -90 || lat > 90)) {
    errors.latitude = 'Latitude must be between -90 and 90.';
  }
  if (!blank(longitude) && (!Number.isFinite(lng) || lng < -180 || lng > 180)) {
    errors.longitude = 'Longitude must be between -180 and 180.';
  }
  return Object.keys(errors).length ? { errors, value: none } : { errors, value: { latitude: lat, longitude: lng } };
}

export const hasCoordinates = (p) =>
  Boolean(p) && Number.isFinite(p.latitude) && Number.isFinite(p.longitude);

export const formatCoordinate = (v) => (Number.isFinite(v) ? Number(v).toFixed(6) : '—');

/** "42 m" / "1.24 km" — null when no distance could be computed. */
export const formatDistance = (m) => {
  if (!Number.isFinite(m)) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
};
