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

// Generate a consistent, subtle color based on the zone name string
const getZoneColor = (zoneName) => {
  let hash = 0;
  for (let i = 0; i < zoneName.length; i++) {
    hash = zoneName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 50%, 45%)`;
};

function ZoneOverlay({ zoneName, bays }) {
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

  const color = getZoneColor(zoneName);

  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{
        color: color,
        weight: 2,
        dashArray: '6, 6',
        fillColor: color,
        fillOpacity: 0.04
      }}
      interactive={false} // Ignore pointer events so we can click bays underneath
    >
      <Tooltip
        direction="top"
        permanent
        opacity={0.85}
        className="zone-tooltip"
      >
        <div style={{
          fontSize: '0.8rem',
          fontWeight: '700',
          color: '#1e293b',
          textTransform: 'uppercase',
          letterSpacing: '0.5px'
        }}>
          {zoneName}
        </div>
      </Tooltip>
    </Rectangle>
  );
}

export default ZoneOverlay;
