/**
 * MaterialMapping Page
 *
 * The operational hub for the Material-to-Bay Mapping module (Phase 5).
 *
 * Responsibilities:
 *   - Show live active inventory (which lot is in which bay).
 *   - Map an available lot into a bay (manual, dropdown-driven).
 *   - Move a mapped lot to another bay (history-preserving).
 *   - Remove a lot from its bay.
 *   - Dual-QR "Scan to Map" workflow (scan-ready).
 *   - Inspect a lot's full movement history.
 *
 * Data sources (no duplicated logic — reuses existing services):
 *   - mappingService.fetchActiveInventory  → active mappings
 *   - lotService.getLots                   → available lots for mapping
 *   - bayService.fetchAllBays              → bays for targets / scan
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchAllBays } from '../../services/bayService';
import { getLots } from '../../services/lotService';
import {
  fetchActiveInventory,
  fetchMappingHistory,
  createMapping,
  moveMaterial,
  removeMaterial,
} from '../../services/mappingService';

import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import MappingModal from '../../components/MappingModal/MappingModal';
import ScanMappingModal from '../../components/ScanMappingModal/ScanMappingModal';
import MovementTimeline from '../../components/MovementTimeline/MovementTimeline';

import styles from './MaterialMapping.module.css';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

function MaterialMapping() {
  const { can } = useAuth();
  const canOperate = can(GROUPS.OPERATIONS);
  const [inventory, setInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [bays, setBays] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [toast, setToast] = useState({ message: '', type: '' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: '' });

  // Map / Move modal
  const [mapModal, setMapModal] = useState({ open: false, mode: 'map', lot: null, currentBayId: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Scan modal
  const [scanOpen, setScanOpen] = useState(false);

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // History modal
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [inv, lotsRes, baysRes] = await Promise.all([
        fetchActiveInventory(),
        getLots(),
        fetchAllBays(),
      ]);
      setInventory(inv);
      setLots(lotsRes.data || []);
      setBays(baysRes || []);
    } catch (err) {
      setFetchError(err.message || 'Failed to load mapping data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const availableLots = useMemo(() => lots.filter((l) => l.status === 'AVAILABLE'), [lots]);

  const stats = useMemo(() => {
    const occupiedBays = new Set(inventory.map((m) => m.bayId));
    const totalQty = inventory.reduce((sum, m) => sum + (m.lot?.quantity || 0), 0);
    return {
      active: inventory.length,
      occupiedBays: occupiedBays.size,
      available: availableLots.length,
      totalQty,
    };
  }, [inventory, availableLots]);

  // ── Map / Move ──────────────────────────────────────────────────────────
  const openMap = () => { setSubmitError(null); setMapModal({ open: true, mode: 'map', lot: null, currentBayId: null }); };
  const openMove = (mapping) => {
    setSubmitError(null);
    setMapModal({ open: true, mode: 'move', lot: mapping.lot, currentBayId: mapping.bayId });
  };
  const closeMap = () => setMapModal((s) => ({ ...s, open: false }));

  const handleMapSubmit = async (payload) => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (mapModal.mode === 'move') {
        await moveMaterial(payload);
        showToast('Material moved successfully.', 'success');
      } else {
        await createMapping(payload);
        showToast('Material mapped to bay successfully.', 'success');
      }
      closeMap();
      loadAll();
    } catch (err) {
      setSubmitError(err.message || 'Operation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Remove ──────────────────────────────────────────────────────────────
  const handleRemove = async () => {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      await removeMaterial({ lotId: removeTarget.lotId });
      showToast(`Lot "${removeTarget.lot?.lotCode}" removed from bay.`, 'success');
      setRemoveTarget(null);
      loadAll();
    } catch (err) {
      showToast(err.message || 'Remove failed.', 'error');
    } finally {
      setIsRemoving(false);
    }
  };

  // ── Scan ────────────────────────────────────────────────────────────────
  const handleScanDone = (result) => {
    setScanOpen(false);
    showToast(result.action === 'MOVED' ? 'Material relocated via scan.' : 'Material mapped via scan.', 'success');
    loadAll();
  };

  // ── History ─────────────────────────────────────────────────────────────
  const openHistory = async (mapping) => {
    setHistoryFor(mapping.lot);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const rows = await fetchMappingHistory(mapping.lotId);
      setHistoryRows(rows);
    } catch (err) {
      showToast(err.message || 'Failed to load history.', 'error');
    } finally {
      setHistoryLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      {/* Header */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17H5V5h8v6m0 6h6v-6h-6m0-6l6 6" />
            </svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Material Mapping</h1>
            <p className={styles.pageBreadcrumb}>Lot ↔ Bay inventory, movement & traceability</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {canOperate && (
            <button className={styles.scanBtn} onClick={() => setScanOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" /><path strokeLinecap="round" d="M14 14h3m4 0v.01M17 21h4M14 17v4" />
              </svg>
              Scan to Map
            </button>
          )}
          {canOperate && (
            <button className={styles.primaryBtn} onClick={openMap}>
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Map Material
            </button>
          )}
          <button className={styles.refreshBtn} onClick={loadAll} disabled={isLoading} title="Refresh">
            <svg viewBox="0 0 20 20" fill="currentColor" className={isLoading ? styles.spinning : ''}>
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsStrip}>
        <StatCard label="Active Mappings" value={isLoading ? '—' : stats.active} color="#2563eb" />
        <StatCard label="Bays Occupied" value={isLoading ? '—' : stats.occupiedBays} color="#ca8a04" />
        <StatCard label="Available Lots" value={isLoading ? '—' : stats.available} color="#16a34a" />
        <StatCard label="Total Stored Qty" value={isLoading ? '—' : stats.totalQty.toLocaleString('en-IN')} color="#7c3aed" />
      </div>

      {/* Inventory table */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Active Inventory</h3>
          <span className={styles.count}>{inventory.length} lots stored</span>
        </div>

        {isLoading ? (
          <div className={styles.loadingState}>
            <div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} />
          </div>
        ) : fetchError ? (
          <div className={styles.errorState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{fetchError}</p>
            <button className={styles.retryBtn} onClick={loadAll}>Try Again</button>
          </div>
        ) : inventory.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
            </svg>
            <p className={styles.emptyTitle}>No materials are mapped yet</p>
            <p className={styles.emptySubtitle}>Use “Map Material” or “Scan to Map” to place a lot into a bay.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Lot Code</th><th>Material</th><th>Quantity</th>
                  <th>Bay</th><th>Zone</th><th>Mapped At</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inventory.map((m) => (
                  <tr key={m.id}>
                    <td><span className={styles.code}>{m.lot?.lotCode}</span></td>
                    <td className={styles.nameCell}>{m.lot?.material?.materialName || '—'}</td>
                    <td>{m.lot?.quantity} {m.lot?.unit}</td>
                    <td>
                      <span className={styles.bayChip}>{m.bay?.bayCode}</span>
                      <span className={styles.bayName}>{m.bay?.bayName}</span>
                    </td>
                    <td>{m.bay?.zone}</td>
                    <td className={styles.muted}>{fmtDate(m.mappedAt)}</td>
                    <td>
                      <div className={styles.actions}>
                        {canOperate && (
                          <button className={`${styles.actionBtn} ${styles.moveBtn}`} onClick={() => openMove(m)} title="Move to another bay">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                          </button>
                        )}
                        <button className={`${styles.actionBtn} ${styles.histBtn}`} onClick={() => openHistory(m)} title="Movement history">
                          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                        </button>
                        {canOperate && (
                          <button className={`${styles.actionBtn} ${styles.removeBtn}`} onClick={() => setRemoveTarget(m)} title="Remove from bay">
                            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      <MappingModal
        isOpen={mapModal.open}
        mode={mapModal.mode}
        lot={mapModal.lot}
        availableLots={availableLots}
        bays={bays}
        currentBayId={mapModal.currentBayId}
        isSubmitting={isSubmitting}
        error={submitError}
        onClose={closeMap}
        onSubmit={handleMapSubmit}
      />

      <ScanMappingModal
        isOpen={scanOpen}
        lots={lots}
        bays={bays}
        onClose={() => setScanOpen(false)}
        onDone={handleScanDone}
      />

      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title="Remove from Bay"
        message={`Remove lot "${removeTarget?.lot?.lotCode}" from bay "${removeTarget?.bay?.bayCode}"? The movement history is preserved.`}
        confirmLabel="Remove"
        loadingLabel="Removing…"
        isProcessing={isRemoving}
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />

      {/* History modal (inline) */}
      {historyFor && (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={() => setHistoryFor(null)}>
          <div className={styles.historyModal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.historyHead}>
              <div>
                <h3 className={styles.historyTitle}>Movement History</h3>
                <p className={styles.historySub}>
                  <span className={styles.code}>{historyFor.lotCode}</span>
                  {historyFor.material?.materialName ? ` · ${historyFor.material.materialName}` : ''}
                </p>
              </div>
              <button className={styles.closeBtn} onClick={() => setHistoryFor(null)} aria-label="Close">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              </button>
            </div>
            <div className={styles.historyBody}>
              {historyLoading ? <p className={styles.muted}>Loading history…</p> : <MovementTimeline history={historyRows} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={styles.statCard} style={{ '--stat-color': color }}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default MaterialMapping;
