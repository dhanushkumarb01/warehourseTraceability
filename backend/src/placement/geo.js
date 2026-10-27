/**
 * Geographic helpers for warehouse placement.
 *
 * Distances here are STRAIGHT-LINE (great-circle) distances between two
 * surveyed points. They are a proxy for proximity only — they know nothing of
 * aisles, rail sidings, roads or obstacles, so they must never be presented as
 * actual travel distance.
 *
 * Missing coordinates are never treated as zero: every function returns null
 * (or reports invalid) instead of producing a number.
 */

'use strict';

/** Mean Earth radius in metres (IUGG). */
const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg) => (deg * Math.PI) / 180;

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

const isValidLatitude = (v) => isFiniteNumber(v) && v >= -90 && v <= 90;
const isValidLongitude = (v) => isFiniteNumber(v) && v >= -180 && v <= 180;

/**
 * True when the object carries a usable latitude/longitude pair.
 * @param {{ latitude?: number|null, longitude?: number|null }|null|undefined} point
 */
const hasCoordinates = (point) =>
  Boolean(point) && isValidLatitude(point.latitude) && isValidLongitude(point.longitude);

/**
 * Validate an optional coordinate pair as submitted by a form/API client.
 * Both values must be given together; a lone latitude or longitude is an error.
 *
 * @param {*} latitude
 * @param {*} longitude
 * @param {{ required?: boolean }} [options]
 * @returns {{ valid: boolean, message?: string, value: { latitude: number|null, longitude: number|null } }}
 */
const validateCoordinatePair = (latitude, longitude, { required = false } = {}) => {
  const blank = (v) => v === null || v === undefined || v === '';
  const none = { latitude: null, longitude: null };

  if (blank(latitude) && blank(longitude)) {
    return required
      ? { valid: false, message: 'Latitude and longitude are required.', value: none }
      : { valid: true, value: none };
  }
  if (blank(latitude) || blank(longitude)) {
    return { valid: false, message: 'Enter both latitude and longitude, or leave both blank.', value: none };
  }

  const lat = typeof latitude === 'string' ? Number(latitude.trim()) : latitude;
  const lng = typeof longitude === 'string' ? Number(longitude.trim()) : longitude;

  if (!isValidLatitude(lat)) {
    return { valid: false, message: 'Latitude must be a number between -90 and 90.', value: none };
  }
  if (!isValidLongitude(lng)) {
    return { valid: false, message: 'Longitude must be a number between -180 and 180.', value: none };
  }
  return { valid: true, value: { latitude: lat, longitude: lng } };
};

/**
 * Haversine great-circle distance between two points, in metres.
 * Returns null when either point lacks valid coordinates.
 *
 * @param {{ latitude: number, longitude: number }} a
 * @param {{ latitude: number, longitude: number }} b
 * @returns {number|null}
 */
const haversineDistanceM = (a, b) => {
  if (!hasCoordinates(a) || !hasCoordinates(b)) return null;

  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * Human-readable distance label ("42 m", "1.24 km"). Null in → null out.
 * @param {number|null} metres
 */
const formatDistance = (metres) => {
  if (!isFiniteNumber(metres)) return null;
  if (metres < 1000) return `${Math.round(metres)} m`;
  return `${(metres / 1000).toFixed(2)} km`;
};

module.exports = {
  EARTH_RADIUS_M,
  hasCoordinates,
  isValidLatitude,
  isValidLongitude,
  validateCoordinatePair,
  haversineDistanceM,
  formatDistance,
};
