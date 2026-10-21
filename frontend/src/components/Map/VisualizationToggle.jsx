/**
 * VisualizationToggle Component
 *
 * A simple two-state toggle button that switches between Map View and
 * Yard Layout View. Pure UI — no business logic.
 *
 * Props:
 *   activeView  {'map'|'layout'} — the currently active view
 *   onChange    {function}       — called with 'map' or 'layout'
 */

import styles from './VisualizationToggle.module.css';

const VIEWS = [
  {
    key: 'map',
    label: 'Map View',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    key: 'layout',
    label: 'Yard Layout',
    icon: (
      <svg viewBox="0 0 20 20" fill="currentColor">
        <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
  },
];

function VisualizationToggle({ activeView, onChange }) {
  return (
    <div className={styles.toggle} role="tablist" aria-label="Visualization mode">
      {VIEWS.map((view) => (
        <button
          key={view.key}
          id={`view-toggle-${view.key}`}
          role="tab"
          aria-selected={activeView === view.key}
          className={`${styles.btn} ${activeView === view.key ? styles.active : ''}`}
          onClick={() => onChange(view.key)}
        >
          <span className={styles.icon}>{view.icon}</span>
          <span>{view.label}</span>
        </button>
      ))}
    </div>
  );
}

export default VisualizationToggle;
