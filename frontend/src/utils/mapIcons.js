/**
 * Bay Marker Icon Factory
 *
 * Creates Leaflet DivIcon instances for bay markers.
 * Using DivIcon (SVG-based) instead of the default Leaflet PNG icons because:
 *   1. No dependency on leaflet/dist/images — avoids the notorious Leaflet
 *      webpack/Vite asset-path issue.
 *   2. Status-aware colouring without additional image assets.
 *   3. Crisp at all DPI / zoom levels (vector-based).
 *   4. Future customisation (pulse animation, inventory count badge) is trivial.
 *
 * This file has a single Leaflet dependency (L.divIcon) and no React dependency.
 * It can be tested in isolation without a DOM.
 */

import L from 'leaflet';
import { statusToColour } from '../utils/mapUtils';

/**
 * Create a Leaflet DivIcon for a bay marker.
 *
 * @param {object} bay
 * @param {boolean} [isSelected=false] — renders with a highlight ring when true
 * @returns {L.DivIcon}
 */
// Small status glyphs so the marker never relies on colour alone.
const GLYPH = {
  AVAILABLE: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="3"/>',
  OCCUPIED: '<circle cx="12" cy="12" r="8" fill="currentColor"/>',
  INACTIVE: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6.5 6.5l11 11" stroke="currentColor" stroke-width="3"/>',
};

export const createBayIcon = (bay, isSelected = false) => {
  const colour = statusToColour(bay.status);
  const ring = isSelected
    ? `box-shadow: 0 0 0 3px var(--c-bg), 0 0 0 5px ${colour}, 0 8px 22px rgba(0,0,0,0.45); transform: scale(1.08);`
    : 'box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);';

  // Display a shorter code inside the block if it has a prefix (e.g. BAY-001 -> 001)
  const shortCode = bay.bayCode.includes('-')
    ? bay.bayCode.split('-').pop()
    : bay.bayCode;

  const html = `
    <div style="
      width: 52px; height: 30px; box-sizing: border-box;
      display: flex; align-items: center; justify-content: center; gap: 4px;
      background: var(--c-overlay); color: var(--c-heading);
      border: 1.5px solid ${colour}; border-radius: 9px;
      ${ring}
      ${bay.status === 'INACTIVE' ? 'border-style: dashed; opacity: 0.85;' : ''}
      cursor: pointer; transition: transform 0.15s ease;
    ">
      <svg viewBox="0 0 24 24" width="11" height="11" style="color: ${colour}; flex-shrink: 0;">${GLYPH[bay.status] || GLYPH.AVAILABLE}</svg>
      <span style="
        font-family: Inter, system-ui, sans-serif; font-size: 12px; font-weight: 700;
        font-variant-numeric: tabular-nums; letter-spacing: -0.2px;
      ">${shortCode}</span>
    </div>
  `;

  return L.divIcon({
    html,
    className:  '',          // suppress Leaflet's default white square background
    iconSize:   [52, 30],
    iconAnchor: [26, 15],    // center of the block
    popupAnchor:[0, -18],
  });
};
