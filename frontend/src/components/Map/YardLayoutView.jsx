/**
 * YardLayoutView Component
 *
 * A schematic, non-map visualization of the warehouse yard.
 * Designed for non-technical stakeholders and client demonstrations.
 *
 * Architecture:
 *   - Receives the same `bays` array from the parent (no API call).
 *   - Groups bays by zone dynamically — no hardcoded zone names.
 *   - Clicking a bay block fires onSelectBay, which surfaces the BayInfoPanel.
 *   - Status colors are sourced from statusToColour() in mapUtils for consistency.
 *   - Future sections (material count, QR, dispatch) are reserved as empty space
 *     inside each bay block — uncomment and populate when those modules ship.
 *
 * Props:
 *   bays         {Array}            — all bay objects from the API
 *   selectedBay  {object|null}      — currently selected bay (or null)
 *   onSelectBay  {function(bay)}    — called when a bay block is clicked
 */

import { useMemo } from 'react';
import { statusToColour } from '../../utils/mapUtils';
import StatusBadge from '../StatusBadge/StatusBadge';
import styles from './YardLayoutView.module.css';

function YardLayoutView({ bays, selectedBay, onSelectBay, inventorySummary = {} }) {
  // Group bays by zone — dynamic, no hardcoded zone list
  const zoneGroups = useMemo(() => {
    const groups = {};
    for (const bay of bays) {
      const zone = bay.zone || 'Unassigned';
      if (!groups[zone]) groups[zone] = [];
      groups[zone].push(bay);
    }
    // Sort zones alphabetically for consistent rendering
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [bays]);

  if (bays.length === 0) {
    return (
      <div className={styles.empty}>
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="8" y="16" width="48" height="32" rx="3" />
          <path strokeLinecap="round" d="M8 24h48M20 24v24M44 24v24" />
        </svg>
        <p className={styles.emptyTitle}>No bays registered</p>
        <p className={styles.emptySubtitle}>Add bays in Bay Management to view the yard layout.</p>
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
  const available = bays.filter(b => b.status === 'AVAILABLE').length;
  const occupied = bays.filter(b => b.status === 'OCCUPIED').length;
  const inactive = bays.filter(b => b.status === 'INACTIVE').length;
  const zoneLots = bays.reduce((sum, b) => sum + (inventorySummary[b.id]?.lotCount || 0), 0);

  return (
    <div className={styles.zone}>
      {/* Zone header */}
      <div className={styles.zoneHeader}>
        <div className={styles.zoneHeaderLeft}>
          <span className={styles.zoneName}>{zoneName}</span>
          <span className={styles.zoneCount}>{bays.length} bays</span>
          <span className={styles.zoneLots}>{zoneLots} lots stored</span>
        </div>
        <div className={styles.zoneMini}>
          {available > 0 && <span className={styles.miniAvail}>{available} avail</span>}
          {occupied > 0 && <span className={styles.miniOccup}>{occupied} occ</span>}
          {inactive > 0 && <span className={styles.miniInact}>{inactive} inact</span>}
        </div>
      </div>

      {/* Bay blocks grid */}
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
    </div>
  );
}

// ── BayBlock ──────────────────────────────────────────────────────────────────

function BayBlock({ bay, isSelected, onSelect, lotCount = 0 }) {
  const colour = statusToColour(bay.status);
  const hasLots = lotCount > 0;

  return (
    <button
      id={`layout-bay-${bay.id}`}
      className={`${styles.bayBlock} ${isSelected ? styles.bayBlockSelected : ''}`}
      style={{ '--bay-colour': colour }}
      onClick={() => onSelect(bay)}
      title={`${bay.bayCode} — ${bay.bayName} (${bay.status})`}
    >
      {/* Status accent bar */}
      <div className={styles.bayAccent} />

      {/* Bay code */}
      <div className={styles.bayCode}>{bay.bayCode}</div>

      {/* Bay name — truncated */}
      <div className={styles.bayName} title={bay.bayName}>{bay.bayName}</div>

      {/* Status badge */}
      <div className={styles.bayStatus}>
        <StatusBadge status={bay.status} />
      </div>

      {/*
        ── Phase 3 – Bay QR ───────────────────────────────────────────────
      */}
      {bay.qrStatus === 'GENERATED' && (
        <div className={styles.bayQr}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
          </svg>
        </div>
      )}
      {/* Inventory occupancy — live lot count from active mappings */}
      <div className={styles.bayMaterial}>
        <span className={hasLots ? styles.lotSlotFilled : styles.futureSlot}>
          {lotCount} {lotCount === 1 ? 'lot' : 'lots'}
        </span>
      </div>
    </button>
  );
}

export default YardLayoutView;
