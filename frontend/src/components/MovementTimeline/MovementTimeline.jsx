/**
 * MovementTimeline Component
 *
 * Presentational, reusable timeline of a lot's mapping history. Receives the
 * array of mappings returned by GET /mappings/lot/:lotId/history (chronological,
 * includes closed MOVED / UNMAPPED rows) and renders an audit-friendly trail.
 *
 * Stateless and data-source agnostic — used by both the Material Mapping page
 * (history modal) and the Lot detail modal.
 *
 * Props:
 *   history {Array}   mapping rows (each with bay, mappedAt, unmappedAt, status)
 *   compact {boolean} tighter spacing for embedding in a detail panel
 */

import styles from './MovementTimeline.module.css';

const fmt = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

const STATUS_META = {
  ACTIVE:   { dot: styles.dotActive,   label: 'Currently here' },
  MOVED:    { dot: styles.dotMoved,    label: 'Moved out' },
  UNMAPPED: { dot: styles.dotUnmapped, label: 'Removed' },
};

function MovementTimeline({ history = [], compact = false }) {
  if (!history || history.length === 0) {
    return <p className={styles.empty}>No movement history yet.</p>;
  }

  // Newest first for display.
  const ordered = [...history].sort(
    (a, b) => new Date(b.mappedAt).getTime() - new Date(a.mappedAt).getTime()
  );

  return (
    <ul className={`${styles.timeline} ${compact ? styles.compact : ''}`}>
      {ordered.map((m) => {
        const meta = STATUS_META[m.status] || STATUS_META.MOVED;
        return (
          <li key={m.id} className={styles.item}>
            <span className={`${styles.dot} ${meta.dot}`} />
            <div className={styles.content}>
              <div className={styles.row}>
                <span className={styles.bayCode}>{m.bay?.bayCode || '—'}</span>
                <span className={styles.bayName}>{m.bay?.bayName}</span>
                <span className={`${styles.statusTag} ${meta.dot}`}>{meta.label}</span>
              </div>
              <div className={styles.meta}>
                <span>Zone {m.bay?.zone || '—'}</span>
                <span className={styles.sep}>·</span>
                <span>In: {fmt(m.mappedAt)}</span>
                {m.unmappedAt && (
                  <>
                    <span className={styles.sep}>·</span>
                    <span>Out: {fmt(m.unmappedAt)}</span>
                  </>
                )}
              </div>
              {m.user?.username && (
                <div className={styles.byline}>by {m.user.username}</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default MovementTimeline;
