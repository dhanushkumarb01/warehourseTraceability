/**
 * Map Utility Functions
 *
 * Pure functions for map calculations. Kept separate from components so they
 * are independently testable and reusable by future map modules.
 *
 * None of these functions have side-effects or depend on React or Leaflet DOM.
 */

/**
 * Calculate the geographic center (centroid) of an array of bays.
 * Each bay must have numeric `latitude` and `longitude` fields.
 *
 * Returns a [lat, lng] tuple suitable for Leaflet's `center` prop.
 * Falls back to a default center (India) if no valid coordinates are present.
 *
 * @param {Array<{latitude: number, longitude: number}>} bays
 * @returns {[number, number]}
 */
export const computeMapCenter = (bays) => {
  const valid = bays.filter(
    (b) =>
      typeof b.latitude  === 'number' && isFinite(b.latitude)  &&
      typeof b.longitude === 'number' && isFinite(b.longitude)
  );

  if (valid.length === 0) {
    // Geographic centre of India — a safe neutral default
    return [20.5937, 78.9629];
  }

  const sumLat = valid.reduce((acc, b) => acc + b.latitude,  0);
  const sumLng = valid.reduce((acc, b) => acc + b.longitude, 0);

  return [sumLat / valid.length, sumLng / valid.length];
};

/**
 * Calculate an appropriate zoom level based on the spread of bay coordinates.
 * Tight clusters get a higher zoom; widely distributed bays get a lower zoom.
 *
 * @param {Array<{latitude: number, longitude: number}>} bays
 * @returns {number}
 */
export const computeMapZoom = (bays) => {
  const valid = bays.filter(
    (b) =>
      typeof b.latitude  === 'number' && isFinite(b.latitude)  &&
      typeof b.longitude === 'number' && isFinite(b.longitude)
  );

  if (valid.length <= 1) return 17;

  const lats = valid.map((b) => b.latitude);
  const lngs = valid.map((b) => b.longitude);

  const latSpread = Math.max(...lats) - Math.min(...lats);
  const lngSpread = Math.max(...lngs) - Math.min(...lngs);
  const maxSpread = Math.max(latSpread, lngSpread);

  // Empirically tuned thresholds for warehouse-scale coordinate spreads
  if (maxSpread < 0.001) return 18;
  if (maxSpread < 0.005) return 17;
  if (maxSpread < 0.01)  return 16;
  if (maxSpread < 0.05)  return 15;
  if (maxSpread < 0.1)   return 14;
  if (maxSpread < 0.5)   return 12;
  return 10;
};

/**
 * Map a BayStatus enum value to a display-friendly colour token.
 * Returns a hex colour suitable for marker/icon rendering.
 *
 * @param {'AVAILABLE'|'OCCUPIED'|'INACTIVE'} status
 * @returns {string}
 */
export const statusToColour = (status) => {
  const map = {
    AVAILABLE: '#16a34a',
    OCCUPIED:  '#ca8a04',
    INACTIVE:  '#94a3b8',
  };
  return map[status] ?? '#64748b';
};

/**
 * Format a numeric coordinate value for human display.
 * @param {number} val
 * @param {number} [decimals=4]
 * @returns {string}
 */
export const formatCoord = (val, decimals = 4) =>
  val !== null && val !== undefined && isFinite(val)
    ? Number(val).toFixed(decimals)
    : '—';

/**
 * Check whether a bay has valid polygon coordinate data.
 *
 * @param {object} bay
 * @returns {boolean}
 */
export const hasPolygon = (bay) => {
  return (
    Array.isArray(bay.polygonCoordinates) &&
    bay.polygonCoordinates.length >= 3
  );
};

/**
 * Convert a bay's polygonCoordinates (stored as [[lat,lng],...]) into the
 * Leaflet positions array format required by the Polygon component.
 * Filters out any malformed pairs silently.
 *
 * @param {object} bay
 * @returns {Array<[number, number]>}  array of [lat, lng] tuples
 */
export const polygonToLeafletPositions = (bay) => {
  if (!hasPolygon(bay)) return [];
  return bay.polygonCoordinates.filter(
    (pair) =>
      Array.isArray(pair) &&
      pair.length === 2 &&
      typeof pair[0] === 'number' &&
      typeof pair[1] === 'number' &&
      isFinite(pair[0]) &&
      isFinite(pair[1])
  );
};
