/**
 * Material Bay Allocation Page (replaces Material Mapping)
 *
 * One workspace for incoming lots, in four visible stages:
 *   1. Awaiting arrival mode   record Rail / Road           (operations)
 *   2. Pending allocation      review suggested bay, allot   (supervisor)
 *   3. Allotted                confirm physical placement    (operations)
 *   4. Placed                  stored; move / remove / history as before
 *
 * Suggestions come from the backend's static placeholder rule (straight-line
 * distance to the relevant dock + configured demand level). The page never
 * computes or invents recommendations itself; it only displays them.
 *
 * Existing mapping functionality is preserved: dual-QR scan, direct placement,
 * move, remove and movement history all reuse the original components/APIs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchAllBays } from '../../services/bayService';
import { getLots } from '../../services/lotService';
import { fetchMappingHistory, createMapping, moveMaterial, removeMaterial } from '../../services/mappingService';
import {
  fetchPlacementConfig, fetchPlacementLots, recordArrivalMode, allocateBay, confirmPlacement, cancelAllocation,
} from '../../services/placementService';

import Toast from '../../components/Toast/Toast';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import MappingModal from '../../components/MappingModal/MappingModal';
import ScanMappingModal from '../../components/ScanMappingModal/ScanMappingModal';
import MovementTimeline from '../../components/MovementTimeline/MovementTimeline';
import {
  PageHeader, Button, Banner, SegmentedControl, Tag, ArrivalTag, LoadingRows, StatePanel, Modal,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import { formatDistance } from '../../utils/geo';
import {
  ArrivalModeDialog, AllocationDialog, ConfirmPlacementDialog, CancelAllocationDialog,
} from '../InboundStorage/AllocationDialogs';
import styles from './MaterialAllocation.module.css';

const STAGES = [
  { value: 'AWAITING_ARRIVAL_MODE', step: 1, label: 'Awaiting arrival mode', hint: 'Record rail or road', tone: 'neutral' },
  { value: 'PENDING_ALLOCATION', step: 2, label: 'Pending allocation', hint: 'Review the suggested bay', tone: 'warning' },
  { value: 'ALLOCATED', step: 3, label: 'Allotted', hint: 'Awaiting physical placement', tone: 'info' },
  { value: 'PLACED', step: 4, label: 'Placed', hint: 'Stored in a bay', tone: 'success' },
];
const STAGE_BY_VALUE = Object.fromEntries(STAGES.map((s) => [s.value, s]));

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Bay column: makes suggested / allotted / stored visually distinct. */
function BayCell({ row }) {
  if (row.stage === 'PLACED') {
    const bay = row.activeMapping?.bay;
    return (
      <div className={styles.bayCell}>
        <Tag tone="success" icon={Icons.check}>Stored</Tag>
        <span><span className={uiStyles.mono}>{bay?.bayCode}</span><span className={uiStyles.sub}>{bay?.zone} · since {fmtDate(row.activeMapping?.mappedAt)}</span></span>
      </div>
    );
  }
  if (row.stage === 'ALLOCATED') {
    const bay = row.openAllocation.bay;
    return (
      <div className={styles.bayCell}>
        <Tag tone="info" icon={Icons.pin}>Allotted</Tag>
        <span><span className={uiStyles.mono}>{bay.bayCode}</span><span className={uiStyles.sub}>{bay.zone} · by {row.openAllocation.allocator?.username}</span></span>
      </div>
    );
  }
  if (row.stage === 'PENDING_ALLOCATION') {
    const top = row.topRecommendation;
    if (!top) return <Tag tone="warning" title="Check loading docks and zone rules in Bays & Layout">No suggestion available</Tag>;
    return (
      <div className={styles.bayCell}>
        <Tag tone="outline">Suggested</Tag>
        <span><span className={uiStyles.mono}>{top.bay.bayCode}</span><span className={uiStyles.sub}>{top.bay.zone}</span></span>
      </div>
    );
  }
  return <span className={uiStyles.soft}>Record arrival first</span>;
}

/** Straight-line distance relevant to the row's stage, or an honest dash. */
function DistanceCell({ row }) {
  let metres = null;
  let dock = null;
  if (row.stage === 'PENDING_ALLOCATION') { metres = row.topRecommendation?.distanceM; dock = row.topRecommendation?.dock?.dockCode; }
  if (row.stage === 'ALLOCATED') { metres = row.openAllocation.straightLineDistanceM; dock = row.openAllocation.loadingDock?.dockCode; }
  if (row.stage === 'PLACED') { metres = row.activeMapping?.allocation?.straightLineDistanceM; dock = row.activeMapping?.allocation?.loadingDock?.dockCode; }
  const label = formatDistance(metres);
  if (!label) return <span className={uiStyles.soft} title="No distance recorded or calculable">—</span>;
  return <span>{label}{dock && <span className={uiStyles.sub}>to {dock}</span>}</span>;
}

function MaterialAllocation() {
  const { can } = useAuth();
  const canOperate = can(GROUPS.OPERATIONS);
  const canAllocate = can(GROUPS.ALLOCATION_MANAGE);

  const [config, setConfig] = useState(null);
  const [data, setData] = useState({ lots: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [arrivalFilter, setArrivalFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [toast, setToast] = useState({ message: '', type: '' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = useCallback(() => setToast({ message: '', type: '' }), []);

  // Dialog targets
  const [arrivalLot, setArrivalLot] = useState(null);
  const [allocLot, setAllocLot] = useState(null);
  const [placeLot, setPlaceLot] = useState(null);
  const [cancelLot, setCancelLot] = useState(null);

  // Legacy mapping tools (unchanged behaviour)
  const [bays, setBays] = useState([]);
  const [allLots, setAllLots] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);
  const [mapModal, setMapModal] = useState({ open: false, mode: 'map', lot: null, currentBayId: null });
  const [mapSubmitting, setMapSubmitting] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);
  const [historyFor, setHistoryFor] = useState(null);
  const [historyRows, setHistoryRows] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await fetchPlacementLots({
        arrivalMode: arrivalFilter || undefined,
        stage: stageFilter || undefined,
        search: debouncedSearch || undefined,
      });
      setData(result);
    } catch (err) {
      setFetchError(err.message || 'Failed to load lots.');
    } finally {
      setLoading(false);
    }
  }, [arrivalFilter, stageFilter, debouncedSearch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetchPlacementConfig().then(setConfig).catch(() => setConfig(null)); }, []);

  const loadMappingSources = useCallback(async () => {
    const [lotsRes, baysRes] = await Promise.all([getLots(), fetchAllBays()]);
    setAllLots(lotsRes.data || []);
    setBays(baysRes || []);
  }, []);

  const refreshAll = () => { load(); if (bays.length) loadMappingSources().catch(() => {}); };

  const summary = data.summary;
  const arrivalOptions = useMemo(() => [
    { value: '', label: 'All', count: summary?.total },
    { value: 'RAIL', label: 'Rail', icon: Icons.train, count: summary?.byArrivalMode.RAIL },
    { value: 'ROAD', label: 'Road', icon: Icons.truck, count: summary?.byArrivalMode.ROAD },
    { value: 'UNRECORDED', label: 'Not recorded', count: summary?.byArrivalMode.UNRECORDED },
  ], [summary]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const saveArrival = async (lot, mode) => {
    await recordArrivalMode(lot.id, mode);
    setArrivalLot(null);
    showToast(`${lot.lotCode}: arrival recorded as ${mode === 'RAIL' ? 'Rail' : 'Road'}.`, 'success');
    load();
  };

  const doAllocate = async (payload) => {
    const allocation = await allocateBay(payload);
    setAllocLot(null);
    showToast(`Bay ${allocation.bay.bayCode} allotted to ${allocLot.lotCode}. Awaiting placement.`, 'success');
    load();
  };

  const doConfirmPlacement = async (lot, remarks) => {
    await confirmPlacement(lot.openAllocation.id, remarks);
    setPlaceLot(null);
    showToast(`${lot.lotCode} placed in ${lot.openAllocation.bay.bayCode}.`, 'success');
    refreshAll();
  };

  const doCancel = async (lot, reason) => {
    await cancelAllocation(lot.openAllocation.id, reason);
    setCancelLot(null);
    showToast(`Allotment of ${lot.openAllocation.bay.bayCode} cancelled.`, 'success');
    load();
  };

  const openScan = async () => {
    try { await loadMappingSources(); setScanOpen(true); } catch (err) { showToast(err.message || 'Could not load bays.', 'error'); }
  };
  const openDirect = async (mode = 'map', row = null) => {
    try {
      await loadMappingSources();
      setMapError(null);
      setMapModal({ open: true, mode, lot: row, currentBayId: row?.activeMapping?.bayId || null });
    } catch (err) { showToast(err.message || 'Could not load bays.', 'error'); }
  };
  const submitMap = async (payload) => {
    setMapSubmitting(true);
    setMapError(null);
    try {
      if (mapModal.mode === 'move') await moveMaterial(payload); else await createMapping(payload);
      showToast(mapModal.mode === 'move' ? 'Material moved.' : 'Material placed.', 'success');
      setMapModal((m) => ({ ...m, open: false }));
      refreshAll();
    } catch (err) {
      setMapError(err.message || 'Operation failed.');
    } finally {
      setMapSubmitting(false);
    }
  };
  const doRemove = async () => {
    setRemoving(true);
    try {
      await removeMaterial({ lotId: removeTarget.id });
      showToast(`${removeTarget.lotCode} removed from bay.`, 'success');
      setRemoveTarget(null);
      refreshAll();
    } catch (err) {
      showToast(err.message || 'Remove failed.', 'error');
    } finally {
      setRemoving(false);
    }
  };
  const openHistory = async (row) => {
    setHistoryFor(row);
    setHistoryRows([]);
    setHistoryLoading(true);
    try { setHistoryRows(await fetchMappingHistory(row.id)); }
    catch (err) { showToast(err.message || 'Failed to load history.', 'error'); }
    finally { setHistoryLoading(false); }
  };

  const availableLots = useMemo(() => allLots.filter((l) => l.status === 'AVAILABLE'), [allLots]);
  const filtersActive = arrivalFilter || stageFilter || debouncedSearch;

  // ── Row actions per stage ────────────────────────────────────────────────
  const rowActions = (row) => {
    switch (row.stage) {
      case 'AWAITING_ARRIVAL_MODE':
        return canOperate && <Button size="sm" variant="primary" icon={Icons.route} onClick={() => setArrivalLot(row)}>Record arrival</Button>;
      case 'PENDING_ALLOCATION':
        return (
          <>
            {canOperate && <Button size="sm" variant="ghost" onClick={() => setArrivalLot(row)}>Change arrival</Button>}
            <Button size="sm" variant={canAllocate ? 'primary' : 'secondary'} icon={Icons.pin} onClick={() => setAllocLot(row)}>
              {canAllocate ? 'Allot bay' : 'View suggestions'}
            </Button>
          </>
        );
      case 'ALLOCATED':
        return (
          <>
            {canAllocate && <Button size="sm" variant="ghost" onClick={() => setCancelLot(row)}>Cancel</Button>}
            {canOperate && <Button size="sm" variant="success" icon={Icons.check} onClick={() => setPlaceLot(row)}>Confirm placed</Button>}
          </>
        );
      case 'PLACED':
        return (
          <>
            {canOperate && !row.arrivalMode && <Button size="sm" variant="ghost" onClick={() => setArrivalLot(row)}>Record arrival</Button>}
            <Button size="sm" variant="ghost" icon={Icons.history} onClick={() => openHistory(row)} aria-label={`History of ${row.lotCode}`} title="Movement history" />
            {canOperate && <Button size="sm" variant="ghost" icon={Icons.arrowRight} onClick={() => openDirect('move', row)} title="Move to another bay">Move</Button>}
            {canOperate && <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(row)} title="Remove from bay">Remove</Button>}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <PageHeader
        icon={Icons.pin}
        title="Material Bay Allocation"
        subtitle="Record how material arrived, review the suggested bay and allot it."
        actions={(
          <>
            {canOperate && <Button icon={Icons.qr} onClick={openScan}>Scan to place</Button>}
            {canOperate && <Button icon={Icons.plus} onClick={() => openDirect('map')}>Direct placement</Button>}
            <Button variant="ghost" icon={Icons.refresh} onClick={refreshAll} disabled={loading} aria-label="Refresh" title="Refresh" />
          </>
        )}
      />

      <Banner tone="info" title="How bay suggestions work:">
        a static placeholder rule ranks bays by straight-line distance to the relevant loading dock and a configured
        demand level. It does not use demand analytics yet, and straight-line distance is not the actual travel route.
      </Banner>

      {/* Stage overview — doubles as a filter */}
      <div className={styles.stages} role="group" aria-label="Filter by stage">
        {STAGES.map((s) => {
          const active = stageFilter === s.value;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={active}
              className={`${styles.stage} ${styles[`stage_${s.tone}`]} ${active ? styles.stageActive : ''}`}
              onClick={() => setStageFilter(active ? '' : s.value)}
            >
              <span className={styles.stageStep}>{s.step}</span>
              <span className={styles.stageText}>
                <span className={styles.stageLabel}>{s.label}</span>
                <span className={styles.stageHint}>{s.hint}</span>
              </span>
              <span className={styles.stageCount}>{summary ? summary.byStage[s.value] : '—'}</span>
            </button>
          );
        })}
      </div>

      <div className={uiStyles.card}>
        <div className={styles.toolbar}>
          <SegmentedControl ariaLabel="Filter by arrival mode" options={arrivalOptions} value={arrivalFilter} onChange={setArrivalFilter} />
          <div className={styles.search}>
            {Icons.search}
            <input
              type="search" className={uiStyles.input} value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search lot or material" aria-label="Search lot or material"
            />
          </div>
        </div>

        {loading && !data.lots.length ? <LoadingRows rows={5} /> : fetchError ? (
          <StatePanel kind="error" title="Couldn’t load lots" message={fetchError} action={<Button onClick={load}>Try again</Button>} />
        ) : data.lots.length === 0 ? (
          filtersActive ? (
            <StatePanel icon={Icons.search} title="No lots match these filters"
              action={<Button onClick={() => { setArrivalFilter(''); setStageFilter(''); setSearch(''); }}>Clear filters</Button>} />
          ) : (
            <StatePanel title="No incoming material" message="Lots created under Materials appear here for arrival recording and bay allocation." />
          )
        ) : (
          <div className={uiStyles.tableWrap}>
            <table className={uiStyles.table}>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Arrival</th>
                  <th>Stage</th>
                  <th>Bay</th>
                  <th title="Straight-line distance, not the travel route">Dock distance</th>
                  <th className={styles.actionsHead}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.lots.map((row) => {
                  const stage = STAGE_BY_VALUE[row.stage];
                  return (
                    <tr key={row.id}>
                      <td>
                        <span className={uiStyles.mono}>{row.lotCode}</span>
                        <span className={uiStyles.sub}>{row.material?.materialName} · {row.quantity} {row.unit}</span>
                      </td>
                      <td><ArrivalTag mode={row.arrivalMode} /></td>
                      <td><Tag tone={stage.tone}>{stage.label}</Tag></td>
                      <td><BayCell row={row} /></td>
                      <td><DistanceCell row={row} /></td>
                      <td><div className={uiStyles.rowActions}>{rowActions(row)}</div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Allocation workflow dialogs ── */}
      <ArrivalModeDialog lot={arrivalLot} onClose={() => setArrivalLot(null)} onSave={saveArrival} />
      {allocLot && (
        <AllocationDialog
          key={allocLot.id}
          lot={allocLot}
          config={config}
          canAllocate={canAllocate}
          onClose={() => setAllocLot(null)}
          onAllocate={doAllocate}
        />
      )}
      <ConfirmPlacementDialog lot={placeLot} onClose={() => setPlaceLot(null)} onConfirm={doConfirmPlacement} />
      <CancelAllocationDialog lot={cancelLot} onClose={() => setCancelLot(null)} onConfirm={doCancel} />

      {/* ── Existing mapping tools (unchanged behaviour) ── */}
      <MappingModal
        isOpen={mapModal.open}
        mode={mapModal.mode}
        lot={mapModal.lot}
        availableLots={availableLots}
        bays={bays}
        currentBayId={mapModal.currentBayId}
        isSubmitting={mapSubmitting}
        error={mapError}
        onClose={() => setMapModal((m) => ({ ...m, open: false }))}
        onSubmit={submitMap}
      />
      <ScanMappingModal
        isOpen={scanOpen}
        lots={allLots}
        bays={bays}
        onClose={() => setScanOpen(false)}
        onDone={(result) => {
          setScanOpen(false);
          showToast(result.action === 'MOVED' ? 'Material relocated via scan.' : 'Material placed via scan.', 'success');
          refreshAll();
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title="Remove from bay"
        message={`Remove lot "${removeTarget?.lotCode}" from bay "${removeTarget?.activeMapping?.bay?.bayCode}"? The movement history is preserved.`}
        confirmLabel="Remove"
        loadingLabel="Removing…"
        isProcessing={removing}
        onConfirm={doRemove}
        onCancel={() => setRemoveTarget(null)}
      />
      <Modal
        isOpen={Boolean(historyFor)} onClose={() => setHistoryFor(null)} size="sm" icon={Icons.history}
        title="Movement history"
        subtitle={historyFor && <><span className={uiStyles.mono}>{historyFor.lotCode}</span> · {historyFor.material?.materialName}</>}
      >
        {historyLoading ? <LoadingRows rows={3} /> : <MovementTimeline history={historyRows} />}
      </Modal>
    </div>
  );
}

export default MaterialAllocation;
