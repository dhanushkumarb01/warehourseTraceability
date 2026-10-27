/**
 * MovementTimeline Component
 *
 * Presentational, reusable timeline of a batch's storage history. Receives the
 * array of mappings returned by GET /mappings/lot/:lotId/history (chronological,
 * includes closed MOVED / UNMAPPED rows) and renders it with the shared
 * Timeline primitive (newest first).
 *
 * Props:
 *   history {Array}   mapping rows (each with bay, mappedAt, unmappedAt, status)
 *   compact {boolean} kept for call-site compatibility
 */

import { Timeline, EmptyState } from '../ui';
import { Icons } from '../ui/icons';

const fmt = (d) =>
  d
    ? new Date(d).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

const STATUS_META = {
  ACTIVE:   { state: 'current', label: 'Here now' },
  MOVED:    { state: 'done', label: 'Moved out' },
  UNMAPPED: { state: 'done', label: 'Taken out' },
};

// eslint-disable-next-line no-unused-vars
function MovementTimeline({ history = [], compact = false }) {
  if (!history || history.length === 0) {
    return <EmptyState icon={Icons.history} title="No movements yet" message="Each time this batch is stored or moved, it shows up here." />;
  }

  // Newest first for display.
  const ordered = [...history].sort(
    (a, b) => new Date(b.mappedAt).getTime() - new Date(a.mappedAt).getTime()
  );

  return (
    <Timeline
      items={ordered.map((m) => {
        const meta = STATUS_META[m.status] || STATUS_META.MOVED;
        return {
          key: m.id,
          state: meta.state,
          icon: meta.state === 'current' ? Icons.pin : undefined,
          title: `${m.bay?.bayCode || '—'}${m.bay?.bayName && m.bay.bayName !== m.bay.bayCode ? ` · ${m.bay.bayName}` : ''} — ${meta.label}`,
          time: `In: ${fmt(m.mappedAt)}${m.unmappedAt ? ` · Out: ${fmt(m.unmappedAt)}` : ''}`,
          meta: [m.bay?.zone, m.user?.username && `by ${m.user.username}`].filter(Boolean).join(' · ') || undefined,
        };
      })}
    />
  );
}

export default MovementTimeline;
