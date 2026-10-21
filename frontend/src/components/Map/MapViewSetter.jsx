/**
 * MapViewSetter Component
 *
 * A utility component that lives inside a MapContainer and imperatively
 * calls `map.setView()` when the center or zoom changes.
 *
 * This is the correct pattern for programmatically controlling a Leaflet map
 * from React state — the MapContainer `center` and `zoom` props are only read
 * once on mount and are not reactive. Subsequent changes must go through
 * `useMap()` + `setView()`.
 *
 * Props:
 *   center {[number, number]}
 *   zoom   {number}
 */

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

function MapViewSetter({ center, zoom }) {
  const map = useMap();

  useEffect(() => {
    if (center && zoom) {
      map.setView(center, zoom, { animate: true });
    }
  }, [map, center, zoom]);

  return null;
}

export default MapViewSetter;
