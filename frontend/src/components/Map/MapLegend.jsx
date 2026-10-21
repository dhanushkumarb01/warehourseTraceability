/**
 * MapLegend Component
 *
 * A small legend overlaid on the map explaining marker colour semantics.
 * Rendered as a pure presentational component — no props, no state.
 *
 * Future: when more layer types are added (material lots, QR zones, etc.)
 * this legend should accept a `layers` prop and render dynamically.
 */

import styles from './MapLegend.module.css';

const LEGEND_ITEMS = [
  { colour: '#16a34a', label: 'Available' },
  { colour: '#ca8a04', label: 'Occupied'  },
  { colour: '#94a3b8', label: 'Inactive'  },
];

function MapLegend() {
  return (
    <div className={styles.legend} aria-label="Map legend">
      <p className={styles.title}>Bay Status</p>
      <ul className={styles.list}>
        {LEGEND_ITEMS.map((item) => (
          <li key={item.label} className={styles.item}>
            <span
              className={styles.dot}
              style={{ background: item.colour }}
            />
            <span className={styles.label}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MapLegend;
