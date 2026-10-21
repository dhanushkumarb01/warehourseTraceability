/**
 * BayInfoPanel Component
 *
 * Displays detailed information for a selected bay in a card panel.
 * This component is intentionally decoupled from the map — it receives
 * a bay object and a close handler; it knows nothing about Leaflet.
 *
 * Future extensibility:
 *   - Add "Materials" section when Material module is built
 *   - Add "QR Code" when Bay QR module is built
 *   - Add "Dispatch Status" when Dispatch module is built
 *
 * Props:
 *   bay      {object|null}  — selected bay data, or null when nothing selected
 *   onClose  {function}     — called when user dismisses the panel
 */

import { useEffect, useState } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import { formatCoord } from '../../utils/mapUtils';
import { fetchBayInventory } from '../../services/mappingService';
import styles from './BayInfoPanel.module.css';

function BayInfoPanel({ bay, onClose }) {
  const [inventory, setInventory] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!bay) { setInventory(null); return; }
    let cancelled = false;
    setLoading(true);
    fetchBayInventory(bay.id)
      .then((data) => { if (!cancelled) setInventory(data); })
      .catch(() => { if (!cancelled) setInventory(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [bay]);

  if (!bay) return null;

  const lotCount = inventory?.lotCount ?? 0;
  const storedLots = inventory?.mappings ?? [];

  return (
    <div className={styles.panel} role="region" aria-label="Bay details">
      {/* Header */}
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderLeft}>
          <span className={styles.bayCode}>{bay.bayCode}</span>
          <StatusBadge status={bay.status} />
        </div>
        <button
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close panel"
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Bay name */}
      <p className={styles.bayName}>{bay.bayName}</p>

      {/* Details grid */}
      <div className={styles.detailGrid}>
        <InfoRow label="Zone"      value={bay.zone} />
        <InfoRow label="Status"    value={<StatusBadge status={bay.status} />} />
        <InfoRow label="Latitude"  value={formatCoord(bay.latitude)}  mono />
        <InfoRow label="Longitude" value={formatCoord(bay.longitude)} mono />
      </div>

      <div className={styles.sectionDivider} />

      {/* Warehouse Operations — now inventory-aware */}
      <div className={styles.futureSection}>
        <p className={styles.sectionTitle}>Warehouse Operations</p>
        <div className={styles.futureGrid}>
          <InfoRow
            label="QR Status"
            value={
              bay.qrStatus === 'GENERATED'
                ? <span className={styles.qrGeneratedBadge}>Generated</span>
                : <span className={styles.qrPendingBadge}>Missing</span>
            }
          />
          <InfoRow
            label="Lots Stored"
            value={loading ? '…' : <span className={styles.countBadge}>{lotCount}</span>}
          />
          {!loading && inventory && (
            <InfoRow
              label="Total Quantity"
              value={`${inventory.totalQuantity.toLocaleString('en-IN')}`}
            />
          )}
        </div>

        {/* Stored lots list */}
        <div className={styles.invList}>
          {loading ? (
            <p className={styles.invEmpty}>Loading inventory…</p>
          ) : lotCount === 0 ? (
            <p className={styles.invEmpty}>No materials stored in this bay.</p>
          ) : (
            storedLots.map((m) => (
              <div key={m.id} className={styles.invItem}>
                <span className={styles.invCode}>{m.lot?.lotCode}</span>
                <span className={styles.invMaterial}>{m.lot?.material?.materialName || 'Material'}</span>
                <span className={styles.invQty}>{m.lot?.quantity} {m.lot?.unit}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────
function InfoRow({ label, value, mono = false }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.mono : ''}`}>
        {value}
      </span>
    </div>
  );
}

export default BayInfoPanel;
