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
export const createBayIcon = (bay, isSelected = false) => {
  const colour    = statusToColour(bay.status);
  const ringStyle = isSelected
    ? `box-shadow: 0 0 0 3px ${colour}40, 0 4px 16px ${colour}60; transform: scale(1.05); z-index: 1000;`
    : `box-shadow: 0 2px 6px rgba(15, 23, 42, 0.15);`;

  // Display a shorter code inside the block if it has a prefix (e.g. BAY-001 -> 001)
  const shortCode = bay.bayCode.includes('-')
    ? bay.bayCode.split('-').pop()
    : bay.bayCode;

  const html = `
    <div style="
      width: 44px;
      height: 32px;
      background: #ffffff;
      border: 2px solid ${colour};
      border-radius: 4px;
      ${ringStyle}
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      position: relative;
      overflow: hidden;
      transition: all 0.2s ease;
    ">
      <div style="
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 6px;
        background: ${colour};
      "></div>
      <span style="
        font-family: ui-monospace, Consolas, monospace;
        font-size: 0.65rem;
        font-weight: 700;
        color: #374151;
        margin-top: 4px;
        letter-spacing: -0.2px;
      ">${shortCode}</span>
    </div>
  `;

  return L.divIcon({
    html,
    className:  '',          // suppress Leaflet's default white square background
    iconSize:   [44, 32],
    iconAnchor: [22, 16],    // center of the block
    popupAnchor:[0, -18],
  });
};
