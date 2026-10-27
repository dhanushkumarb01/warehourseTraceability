/**
 * YardLayoutView Component
 *
 * A schematic, non-map view of the yard: one card per yard area (zone) with
 * an occupancy bar, and a tile per storage spot (bay) showing its status by
 * icon + label + colour. Built for people who don't read maps.
 *
 * Architecture:
 *   - Receives the same `bays` array from the parent (no API call).
 *   - Groups bays by zone dynamically — no hardcoded zone names.
 *   - Clicking a tile fires onSelectBay, which surfaces the BayInfoPanel.
 *
 * Props:
 *   bays             {Array}          — bay objects to show (already filtered)
 *   selectedBay      {object|null}    — currently selected bay (or null)
 *   onSelectBay      {function(bay)}  — called when a tile is clicked
 *   inventorySummary {object}         — { [bayId]: { lotCount } }
 */

import { useMemo } from 'react';
import { statusToColour } from '../../utils/mapUtils';
import { ProgressBar, EmptyState } from '../ui';
import { Icons } from '../ui/icons';
import { statusMeta } from '../ui/status';
import styles from './YardLayoutView.module.css';

function YardLayoutView({ bays, selectedBay, onSelectBay, inventorySummary = {} }) {
  // Group bays by zone — dynamic, no hardcoded zone list
  const zoneGroups = useMemo(() => {
    const groups = {};
    for (const bay of bays) {
      const zone = bay.zone || 'No yard area';
      if (!groups[zone]) groups[zone] = [];
      groups[zone].push(bay);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [bays]);

  if (bays.length === 0) {
    return (
      <div className={styles.layout}>
        <EmptyState icon={Icons.grid} title="No storage spots to show" message="Try a different filter, or add storage spots in Receiving & storage → Yard layout." />
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      {zoneGroups.map(([zoneName, zoneBays]) => (
        <ZoneSection
          key={zoneName}
          zoneName={zoneName}
          bays={zoneBays}
          selectedBay={selectedBay}
          onSelectBay={onSelectBay}
          inventorySummary={inventorySummary}
        />
      ))}
    </div>
  );
}

// ── ZoneSection ───────────────────────────────────────────────────────────────

function ZoneSection({ zoneName, bays, selectedBay, onSelectBay, inventorySummary = {} }) {
  const available = bays.filter((b) => b.status === 'AVAILABLE').length;
  const occupied = bays.filter((b) => b.status === 'OCCUPIED').length;
  const usable = available + occupied;
  const pct = usable ? Math.round((occupied / usable) * 100) : 0;
  const zoneLots = bays.reduce((sum, b) => sum + (inventorySummary[b.id]?.lotCount || 0), 0);
  const tone = pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'teal';

  return (
    <section className={styles.zone}>
      <div className={styles.zoneHeader}>
        <div className={styles.zoneTitles}>
          <h3 className={styles.zoneName}>{zoneName}</h3>
          <p className={styles.zoneMeta}>
            {bays.length} {bays.length === 1 ? 'spot' : 'spots'} · {zoneLots} {zoneLots === 1 ? 'batch' : 'batches'} stored
          </p>
        </div>
        <div className={styles.zoneFill}>
          <span className={`${styles.zonePct} wt-num`}>{pct}%</span>
          <span className={styles.zonePctLabel}>full</span>
        </div>
      </div>
      <ProgressBar value={pct} tone={tone} size="sm" label={`${zoneName} is ${pct}% full`} />
      <p className={styles.zoneFree}>
        <strong>{available}</strong> free · <strong>{occupied}</strong> in use
        {bays.length - usable > 0 && <> · <strong>{bays.length - usable}</strong> out of use</>}
      </p>

      <div className={styles.bayGrid}>
        {bays.map((bay) => (
          <BayBlock
            key={bay.id}
            bay={bay}
            isSelected={selectedBay?.id === bay.id}
            onSelect={onSelectBay}
            lotCount={inventorySummary[bay.id]?.lotCount || 0}
          />
        ))}
      </div>
    </section>
  );
}

// ── BayBlock ──────────────────────────────────────────────────────────────────

function BayBlock({ bay, isSelected, onSelect, lotCount = 0 }) {
  const meta = statusMeta(bay.status);

  return (
    <button
      id={`layout-bay-${bay.id}`}
      className={`${styles.bayBlock} ${bay.status === 'INACTIVE' ? styles.bayOff : ''} ${isSelected ? styles.bayBlockSelected : ''}`}
      style={{ '--bay-colour': statusToColour(bay.status) }}
      onClick={() => onSelect(bay)}
      aria-pressed={isSelected}
      aria-label={`${bay.bayCode}: ${meta.label}, ${lotCount} ${lotCount === 1 ? 'batch' : 'batches'}`}
    >
      <span className={styles.bayTop}>
        <span className={styles.bayCode}>{bay.bayCode}</span>
        {bay.qrStatus === 'GENERATED' && <span className={styles.bayQr} title="QR label printed">{Icons.qr}</span>}
      </span>
      <span className={styles.bayStatus}>
        <span className={styles.bayIcon}>{Icons[meta.icon]}</span>
        {meta.label}
      </span>
      <span className={styles.bayLots}>{lotCount} {lotCount === 1 ? 'batch' : 'batches'}</span>
    </button>
  );
}

export default YardLayoutView;
