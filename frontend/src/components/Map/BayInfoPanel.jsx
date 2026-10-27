/**
 * BayInfoPanel Component
 *
 * Floating card describing the selected storage spot (bay): a plain-language
 * summary first ("A-12 is holding 3 batches"), then the details and the
 * batches stored there. Decoupled from the map — it receives a bay object
 * and a close handler; it knows nothing about Leaflet.
 *
 * Props:
 *   bay      {object|null}  — selected bay data, or null when nothing selected
 *   onClose  {function}     — called when user dismisses the panel
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../StatusBadge/StatusBadge';
import { IconButton, DetailList, Skeleton, HelpTip } from '../ui';
import { Icons } from '../ui/icons';
import { formatCoord } from '../../utils/mapUtils';
import { fetchBayInventory } from '../../services/mappingService';
import styles from './BayInfoPanel.module.css';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-IN') : n);

function summary(bay, lotCount, loading) {
  if (bay.status === 'INACTIVE') return `${bay.bayCode} is out of use and can’t take material right now.`;
  if (loading) return `Checking what’s stored in ${bay.bayCode}…`;
  if (lotCount === 0) return `${bay.bayCode} is empty and ready to take material.`;
  return `${bay.bayCode} is holding ${lotCount} ${lotCount === 1 ? 'batch' : 'batches'} of material.`;
}

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
    <aside className={styles.panel} role="region" aria-label={`Storage spot ${bay.bayCode}`}>
      <div className={styles.head}>
        <div className={styles.headMain}>
          <span className={styles.eyebrow}>Storage spot <span className={styles.term}>(bay)</span></span>
          <h3 className={styles.code}>{bay.bayCode}</h3>
          {bay.bayName && bay.bayName !== bay.bayCode && <p className={styles.name}>{bay.bayName}</p>}
        </div>
        <IconButton icon={Icons.close} label="Close details" onClick={onClose} size="sm" variant="outline" tooltip={false} />
      </div>

      <div className={styles.summary}>
        <StatusBadge status={bay.status} />
        <p>{summary(bay, lotCount, loading)}</p>
      </div>

      <DetailList
        items={[
          { label: 'Yard area', value: bay.zone || 'Not set' },
          { label: 'Batches stored', value: loading ? <Skeleton width={30} height={14} /> : fmt(lotCount) },
          !loading && inventory && { label: 'Total quantity', value: fmt(inventory.totalQuantity), help: 'All batches in this spot added together, in their own units.' },
          {
            label: 'QR label',
            value: bay.qrStatus === 'GENERATED' ? 'Printed' : 'Not printed yet',
            help: 'The QR label on the spot lets staff scan it when storing or moving material.',
          },
        ]}
      />

      <div className={styles.section}>
        <p className={styles.sectionTitle}>What’s stored here</p>
        {loading ? (
          <div className={styles.lots}>
            <Skeleton height={44} radius={12} />
            <Skeleton height={44} radius={12} />
          </div>
        ) : lotCount === 0 ? (
          <p className={styles.empty}>{Icons.inbox}Nothing stored in this spot.</p>
        ) : (
          <ul className={styles.lots}>
            {storedLots.map((m) => (
              <li key={m.id} className={styles.lot}>
                <span className={styles.lotIcon}>{Icons.box}</span>
                <span className={styles.lotText}>
                  <span className={styles.lotName}>{m.lot?.material?.materialName || 'Material'}</span>
                  <span className={styles.lotCode}>Batch {m.lot?.lotCode}</span>
                </span>
                <span className={`${styles.lotQty} wt-num`}>{fmt(m.lot?.quantity)} {m.lot?.unit}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className={styles.more}>
        <summary>
          Location details
          <HelpTip>GPS position of this spot, used to draw it on the map.</HelpTip>
        </summary>
        <DetailList
          items={[
            { label: 'Latitude', value: <span className={styles.mono}>{formatCoord(bay.latitude)}</span> },
            { label: 'Longitude', value: <span className={styles.mono}>{formatCoord(bay.longitude)}</span> },
          ]}
        />
      </details>

      <Link to="/inbound?tab=storage" className={styles.link}>
        Manage stored batches {Icons.arrowRight}
      </Link>
    </aside>
  );
}

export default BayInfoPanel;
