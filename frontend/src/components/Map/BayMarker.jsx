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
import { statusMeta } from '../ui/status';
import styles from './MapLegend.module.css';

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
        <span className={styles.tipCode}>{bay.bayCode}</span>
        <span className={styles.tipMeta}>{statusMeta(bay.status).label}{bay.zone ? ` · ${bay.zone}` : ''}</span>
      </Tooltip>
    </Marker>
  );
}

export default BayMarker;
