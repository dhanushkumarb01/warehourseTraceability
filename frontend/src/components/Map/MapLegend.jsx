/**
 * MapLegend Component
 *
 * Collapsible legend card overlaid on the map. Answers "How full is the
 * yard?" with a count, percentage and bar per status — icon + label + number,
 * never colour alone. Each row is also a filter: choosing one shows only
 * those storage spots on the map.
 *
 * Props:
 *   counts   {{ AVAILABLE, OCCUPIED, INACTIVE }} — storage spots per status
 *   filter   {'ALL'|'AVAILABLE'|'OCCUPIED'|'INACTIVE'}
 *   onFilter {function(filter)}
 */

import { useState } from 'react';
import { Icons } from '../ui/icons';
import { STATUS } from '../ui/status';
import styles from './MapLegend.module.css';

const ROWS = [
  { status: 'AVAILABLE', icon: Icons.circle, cls: 'free' },
  { status: 'OCCUPIED', icon: Icons.circleFull, cls: 'full' },
  { status: 'INACTIVE', icon: Icons.ban, cls: 'off' },
];

function MapLegend({ counts = {}, filter = 'ALL', onFilter }) {
  const [open, setOpen] = useState(true);
  const total = ROWS.reduce((sum, r) => sum + (counts[r.status] || 0), 0);

  return (
    <section className={`${styles.legend} ${open ? '' : styles.legendClosed}`} aria-label="Map legend">
      <button type="button" className={styles.head} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={styles.title}>Storage spots</span>
        <span className={styles.total}>{total} total</span>
        <span className={`${styles.chev} ${open ? styles.chevOpen : ''}`}>{Icons.chevronDown}</span>
      </button>

      {open && (
        <>
          <ul className={styles.list}>
            {ROWS.map((r) => {
              const n = counts[r.status] || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              const active = filter === r.status;
              return (
                <li key={r.status}>
                  <button
                    type="button"
                    className={`${styles.row} ${styles[r.cls]} ${active ? styles.rowActive : ''} ${filter !== 'ALL' && !active ? styles.rowDim : ''}`}
                    onClick={() => onFilter?.(active ? 'ALL' : r.status)}
                    aria-pressed={active}
                    title={active ? 'Show all storage spots' : `Show only “${STATUS[r.status].label}” spots`}
                  >
                    <span className={styles.swatch}>{r.icon}</span>
                    <span className={styles.label}>{STATUS[r.status].label}</span>
                    <span className={`${styles.count} wt-num`}>{n}</span>
                    <span className={styles.bar}><span style={{ width: `${pct}%` }} /></span>
                    <span className={`${styles.pct} wt-num`}>{pct}%</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className={styles.foot}>
            {filter === 'ALL'
              ? 'Tap a row to show only those spots.'
              : <>Showing only “{STATUS[filter].label}”. <button type="button" className={styles.reset} onClick={() => onFilter?.('ALL')}>Show all</button></>}
          </p>
        </>
      )}
    </section>
  );
}

export default MapLegend;
