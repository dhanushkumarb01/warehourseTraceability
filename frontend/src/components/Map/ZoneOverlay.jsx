/**
 * ZoneOverlay Component
 *
 * Renders a visual bounding box and label for a warehouse zone.
 * Groups bays physically on the map to provide a clear "yard" layout.
 *
 * Props:
 *   zoneName {string} — Name of the zone (e.g., 'Zone A')
 *   bays     {Array}  — Array of bay objects belonging to this zone
 */

import { Rectangle, Tooltip } from 'react-leaflet';
import { useTheme, cssVar } from '../../context/ThemeContext';
import styles from './MapLegend.module.css';

function ZoneOverlay({ zoneName, bays }) {
  useTheme(); // re-render on theme change so the outline colour updates
  if (!bays || bays.length === 0) return null;

  // Calculate geographic bounding box
  const lats = bays.map(b => b.latitude).filter(v => typeof v === 'number' && isFinite(v));
  const lngs = bays.map(b => b.longitude).filter(v => typeof v === 'number' && isFinite(v));

  if (lats.length === 0 || lngs.length === 0) return null;

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  // Add padding so markers don't sit exactly on the zone boundary lines
  const paddingLat = (maxLat - minLat) * 0.15 || 0.0002;
  const paddingLng = (maxLng - minLng) * 0.15 || 0.0002;

  const bounds = [
    [minLat - paddingLat, minLng - paddingLng],
    [maxLat + paddingLat, maxLng + paddingLng]
  ];

  // Neutral outline: zones group spots, they don't carry status, so no data colour.
  const color = cssVar('--c-text-soft');

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        color: color,
        weight: 1,
        dashArray: '4, 6',
        fillColor: color,
        fillOpacity: 0.03
      }}
      interactive={false} // Ignore pointer events so we can click bays underneath
    >
      <Tooltip
        direction="top"
        permanent
        opacity={1}
        className="zone-tooltip"
      >
        <span className={styles.zoneLabel}>{zoneName}</span>
      </Tooltip>
    </Rectangle>
  );
}

export default ZoneOverlay;
