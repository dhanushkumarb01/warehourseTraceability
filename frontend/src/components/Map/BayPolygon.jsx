/**
 * BayPolygon Component
 *
 * Renders a warehouse bay as a filled polygon on the Leaflet map.
 * Used when a bay has polygonCoordinates defined.
 * Falls back gracefully — if polygon data is missing, renders nothing
 * (the BayMarker block handles the fallback visualization).
 *
 * Status is shown by colour *and* line style (out-of-use spots are dashed)
 * plus the hover label, so it never relies on colour alone. Leaflet paths
 * can't read CSS variables, so token colours are resolved per theme.
 *
 * Props:
 *   bay        {object}         — bay data including polygonCoordinates
 *   isSelected {boolean}        — highlights polygon when true
 *   onSelect   {function(bay)}  — called when polygon is clicked
 */

import { Polygon, Tooltip } from 'react-leaflet';
import { useTheme, cssVar } from '../../context/ThemeContext';
import { statusColourVar, polygonToLeafletPositions, hasPolygon } from '../../utils/mapUtils';
import { statusMeta } from '../ui/status';
import styles from './MapLegend.module.css';

function BayPolygon({ bay, isSelected, onSelect }) {
  useTheme(); // re-render on theme change so resolved colours update
  if (!hasPolygon(bay)) return null;

  const positions = polygonToLeafletPositions(bay);
  if (positions.length < 3) return null;

  const colour = cssVar(statusColourVar(bay.status));
  const inactive = bay.status === 'INACTIVE';

  return (
    <Polygon
      positions={positions}
      pathOptions={{
        color:       isSelected ? cssVar('--c-heading') : colour,
        weight:      isSelected ? 3 : 1.5,
        fillColor:   colour,
        fillOpacity: inactive ? 0.12 : isSelected ? 0.55 : 0.38,
        dashArray:   inactive ? '5 5' : null,
      }}
      eventHandlers={{ click: () => onSelect(bay) }}
    >
      <Tooltip direction="top" opacity={1}>
        <span className={styles.tipCode}>{bay.bayCode}</span>
        <span className={styles.tipMeta}>{statusMeta(bay.status).label}{bay.zone ? ` · ${bay.zone}` : ''}</span>
      </Tooltip>
    </Polygon>
  );
}

export default BayPolygon;
