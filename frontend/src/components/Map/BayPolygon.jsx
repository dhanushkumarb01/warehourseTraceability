/**
 * BayPolygon Component
 *
 * Renders a warehouse bay as a filled polygon on the Leaflet map.
 * Used when a bay has polygonCoordinates defined.
 * Falls back gracefully — if polygon data is missing, renders nothing
 * (the BayMarker block handles the fallback visualization).
 *
 * Props:
 *   bay        {object}         — bay data including polygonCoordinates
 *   isSelected {boolean}        — highlights polygon when true
 *   onSelect   {function(bay)}  — called when polygon is clicked
 */

import { Polygon, Tooltip } from 'react-leaflet';
import { statusToColour, polygonToLeafletPositions, hasPolygon } from '../../utils/mapUtils';

function BayPolygon({ bay, isSelected, onSelect }) {
  if (!hasPolygon(bay)) return null;

  const positions = polygonToLeafletPositions(bay);
  if (positions.length < 3) return null;

  const colour     = statusToColour(bay.status);
  const weight     = isSelected ? 3 : 1.5;
  const fillOpacity = isSelected ? 0.35 : 0.2;

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color:       colour,
        weight,
        fillColor:   colour,
        fillOpacity,
        dashArray:   isSelected ? '' : null,
      }}
      eventHandlers={{ click: () => onSelect(bay) }}
    >
      <Tooltip
        direction="top"
        opacity={1}
        permanent={false}
      >
        <div style={{
          fontSize:    '0.72rem',
          fontWeight:  '700',
          fontFamily:  'ui-monospace, Consolas, monospace',
          color:       '#0f172a',
          whiteSpace:  'nowrap',
          lineHeight:  1.4,
        }}>
          <div>{bay.bayCode}</div>
          <div style={{ fontSize: '0.65rem', color: '#64748b', fontWeight: '500' }}>
            {bay.zone}
          </div>
        </div>
      </Tooltip>
    </Polygon>
  );
}

export default BayPolygon;
