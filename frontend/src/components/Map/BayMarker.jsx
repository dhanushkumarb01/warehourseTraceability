/**
 * BayMarker Component
 *
 * Renders a bay as a rectangular block marker on the Leaflet map.
 * Only renders when the bay does NOT have polygonCoordinates — once
 * polygon data is present, BayPolygon takes over the visual.
 *
 * Single-representation policy:
 *   polygonCoordinates present → BayPolygon renders
 *   polygonCoordinates absent  → BayMarker renders (fallback)
 *
 * Props:
 *   bay        {object}           — bay data object
 *   isSelected {boolean}          — highlights this marker when true
 *   onSelect   {function(bay)}    — called when marker is clicked
 */

import { Marker, Tooltip } from 'react-leaflet';
import { createBayIcon } from '../../utils/mapIcons';
import { hasPolygon } from '../../utils/mapUtils';

function BayMarker({ bay, isSelected, onSelect }) {
  // When polygon data exists, BayPolygon handles the visualization
  if (hasPolygon(bay)) return null;

  const icon = createBayIcon(bay, isSelected);

  return (
    <Marker
      position={[bay.latitude, bay.longitude]}
      icon={icon}
      eventHandlers={{ click: () => onSelect(bay) }}
    >
      <Tooltip
        direction="top"
        offset={[0, -18]}
        opacity={1}
        permanent={false}
      >
        <span style={{
          fontSize:   '0.75rem',
          fontWeight: '600',
          fontFamily: 'ui-monospace, Consolas, monospace',
          color:      '#0f172a',
          whiteSpace: 'nowrap',
        }}>
          {bay.bayCode}
        </span>
      </Tooltip>
    </Marker>
  );
}

export default BayMarker;
