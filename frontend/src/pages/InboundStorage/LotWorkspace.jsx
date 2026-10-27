/**
 * Lot workspace for the Inbound & Storage page — two views of one list:
 *
 *   view="queue"    incoming lots: awaiting arrival → pending allocation →
 *                   allotted (placed lots are counted; the stage card jumps to
 *                   the storage view). Scan-to-place and direct placement.
 *   view="storage"  placed lots: bay, move, remove, history, lot and bay QR.
 *
 * Data, workflow and mapping tools are exactly those of the former Bay
 * Allocation page (placement + mapping APIs, MappingModal, ScanMappingModal,
 * MovementTimeline). Allotting a bay is delegated to the page (onAllot) so the
 * receive dialog can open the same AllocationDialog.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchAllBays } from '../../services/bayService';
import { getLots } from '../../services/lotService';
import { fetchMappingHistory, createMapping, moveMaterial, removeMaterial } from '../../services/mappingService';
import { fetchPlacementLots, recordArrivalMode, confirmPlacement, cancelAllocation } from '../../services/placementService';

import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import MappingModal from '../../components/MappingModal/MappingModal';
import ScanMappingModal from '../../components/ScanMappingModal/ScanMappingModal';
import MovementTimeline from '../../components/MovementTimeline/MovementTimeline';
import LotDetailModal from '../../components/LotDetailModal/LotDetailModal';
import BayDetailModal from '../../components/BayDetailModal/BayDetailModal';
import { Button, SegmentedControl, Tag, ArrivalTag, LoadingRows, StatePanel, Modal, Menu, DataTable, SearchInput, ErrorState } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import { formatDistance } from '../../utils/geo';
import { ArrivalModeDialog, ConfirmPlacementDialog, CancelAllocationDialog } from './AllocationDialogs';
import styles from './InboundStorage.module.css';

const STAGES = [
  { value: 'AWAITING_ARRIVAL_MODE', step: 1, label: 'How did it arrive?', hint: 'Record rail or road', tone: 'neutral' },
  { value: 'PENDING_ALLOCATION', step: 2, label: 'Needs a storage spot', hint: 'Choose from the suggestions', tone: 'warning' },
  { value: 'ALLOCATED', step: 3, label: 'Spot chosen', hint: 'Move it there, then confirm', tone: 'info' },
  { value: 'PLACED', step: 4, label: 'Stored', hint: 'Open the Stored tab', tone: 'success' },
];
const STAGE_BY_VALUE = Object.fromEntries(STAGES.map((s) => [s.value, s]));

const fmtDate = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

/** Bay column: makes suggested / allotted / stored visually distinct. */
function BayCell({ row, onOpenBay }) {
  if (row.stage === 'PLACED') {
    const bay = row.activeMapping?.bay;
    return (
      <div className={styles.bayCell}>
        <Tag tone="success" icon={Icons.check}>Stored</Tag>
        <span>
          {bay && onOpenBay
            ? <button type="button" className={`${uiStyles.mono} ${styles.linkBtn}`} onClick={() => onOpenBay(bay)} title="Storage spot details and QR">{bay.bayCode}</button>
            : <span className={uiStyles.mono}>{bay?.bayCode}</span>}
          <span className={uiStyles.sub}>{bay?.zone} · since {fmtDate(row.activeMapping?.mappedAt)}</span>
        </span>
      </div>
    );
  }
  if (row.stage === 'ALLOCATED') {
    const bay = row.openAllocation.bay;
    return (
      <div className={styles.bayCell}>
        <Tag tone="info" icon={Icons.pin}>Chosen</Tag>
        <span><span className={uiStyles.mono}>{bay.bayCode}</span><span className={uiStyles.sub}>{bay.zone} · by {row.openAllocation.allocator?.username}</span></span>
      </div>
    );
  }
  if (row.stage === 'PENDING_ALLOCATION') {
    const top = row.topRecommendation;
    if (!top) return <Tag tone="warning" title="Check loading docks and yard-area rules in the Yard layout tab">No suggestion yet</Tag>;
    return (
      <div className={styles.bayCell}>
        <Tag tone="outline">Suggested</Tag>
        <span><span className={uiStyles.mono}>{top.bay.bayCode}</span><span className={uiStyles.sub}>{top.bay.zone}</span></span>
      </div>
    );
  }
  return <span className={uiStyles.soft}>Record how it arrived first</span>;
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

/** Where the lot record came from: FOIS / SAP reference, or nothing for manual. */
function SourceLine({ row }) {
  if (!row.source || row.source === 'MANUAL') return null;
  return <span className={uiStyles.sub}>{row.source} <span className={uiStyles.mono}>{row.externalRef}</span></span>;
}

function LotWorkspace({ view, refreshKey, notify, onAllot, onShowStorage, onReceive }) {
  const { can } = useAuth();
  const canOperate = can(GROUPS.OPERATIONS);
  const canAllocate = can(GROUPS.ALLOCATION_MANAGE);
  const isStorage = view === 'storage';

  const [data, setData] = useState({ lots: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [arrivalFilter, setArrivalFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Dialog targets
  const [arrivalLot, setArrivalLot] = useState(null);
  const [placeLot, setPlaceLot] = useState(null);
  const [cancelLot, setCancelLot] = useState(null);
  const [qrLot, setQrLot] = useState(null);
  const [qrBay, setQrBay] = useState(null);

  // Mapping tools (unchanged behaviour)
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
        stage: isStorage ? 'PLACED' : stageFilter || undefined,
        search: debouncedSearch || undefined,
      });
      setData(result);
    } catch (err) {
      setFetchError(err);
    } finally {
      setLoading(false);
    }
    // refreshKey: the page bumps it after a receipt or an allotment.
  }, [arrivalFilter, stageFilter, debouncedSearch, isStorage, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

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

  // The queue lists lots still on their way into a bay; placed lots live in "In storage".
  const rows = isStorage || stageFilter ? data.lots : data.lots.filter((r) => r.stage !== 'PLACED');

  // ── Actions ──────────────────────────────────────────────────────────────
  const saveArrival = async (lot, mode) => {
    await recordArrivalMode(lot.id, mode);
    setArrivalLot(null);
    notify(`Batch ${lot.lotCode} marked as arrived by ${mode === 'RAIL' ? 'rail' : 'road'}.`, 'success');
    load();
  };

  const doConfirmPlacement = async (lot, remarks) => {
    await confirmPlacement(lot.openAllocation.id, remarks);
    setPlaceLot(null);
    notify(`Batch ${lot.lotCode} is now stored in ${lot.openAllocation.bay.bayCode}.`, 'success');
    refreshAll();
  };

  const doCancel = async (lot, reason) => {
    await cancelAllocation(lot.openAllocation.id, reason);
    setCancelLot(null);
    notify(`Storage spot ${lot.openAllocation.bay.bayCode} released — batch ${lot.lotCode} needs a new spot.`, 'success');
    load();
  };

  const openScan = async () => {
    try { await loadMappingSources(); setScanOpen(true); } catch (err) { notify(err.message || 'Could not load bays.', 'error'); }
  };
  const openDirect = async (mode = 'map', row = null) => {
    try {
      await loadMappingSources();
      setMapError(null);
      setMapModal({ open: true, mode, lot: row, currentBayId: row?.activeMapping?.bayId || null });
    } catch (err) { notify(err.message || 'Could not load bays.', 'error'); }
  };
  const submitMap = async (payload) => {
    setMapSubmitting(true);
    setMapError(null);
    try {
      if (mapModal.mode === 'move') await moveMaterial(payload); else await createMapping(payload);
      notify(mapModal.mode === 'move' ? 'Batch moved to its new storage spot.' : 'Batch placed in its storage spot.', 'success');
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
      notify(`Batch ${removeTarget.lotCode} taken out of its storage spot.`, 'success');
      setRemoveTarget(null);
      refreshAll();
    } catch (err) {
      notify(err.message || 'Remove failed.', 'error');
    } finally {
      setRemoving(false);
    }
  };
  const openHistory = async (row) => {
    setHistoryFor(row);
    setHistoryRows([]);
    setHistoryLoading(true);
    try { setHistoryRows(await fetchMappingHistory(row.id)); }
    catch (err) { notify(err.message || 'Failed to load history.', 'error'); }
    finally { setHistoryLoading(false); }
  };

  const availableLots = useMemo(() => allLots.filter((l) => l.status === 'AVAILABLE'), [allLots]);
  const filtersActive = arrivalFilter || stageFilter || debouncedSearch;

  // ── Row actions per stage: one obvious primary action, the rest in a menu ──
  const rowActions = (row) => {
    switch (row.stage) {
      case 'AWAITING_ARRIVAL_MODE':
        return canOperate && <Button size="sm" variant="primary" icon={Icons.route} onClick={() => setArrivalLot(row)}>Record arrival</Button>;
      case 'PENDING_ALLOCATION':
        return (
          <>
            <Button size="sm" variant={canAllocate ? 'primary' : 'secondary'} icon={Icons.pin} onClick={() => onAllot(row)}>
              {canAllocate ? 'Choose spot' : 'See suggestions'}
            </Button>
            <Menu
              label={`More actions for ${row.lotCode}`}
              items={[{ label: 'Change how it arrived', icon: Icons.route, onClick: () => setArrivalLot(row), hidden: !(canOperate && row.source === 'MANUAL') }]}
            />
          </>
        );
      case 'ALLOCATED':
        return (
          <>
            {canOperate && <Button size="sm" variant="success" icon={Icons.check} onClick={() => setPlaceLot(row)}>Confirm placed</Button>}
            <Menu
              label={`More actions for ${row.lotCode}`}
              items={[{ label: 'Release this spot', icon: Icons.close, onClick: () => setCancelLot(row), hidden: !canAllocate, danger: true }]}
            />
          </>
        );
      case 'PLACED':
        return (
          <>
            {canOperate && <Button size="sm" variant="secondary" icon={Icons.arrowRight} onClick={() => openDirect('move', row)}>Move</Button>}
            <Menu
              label={`More actions for ${row.lotCode}`}
              items={[
                { label: 'Details & QR label', icon: Icons.qr, onClick: () => setQrLot(row) },
                { label: 'Movement history', icon: Icons.history, onClick: () => openHistory(row) },
                { label: 'Record how it arrived', icon: Icons.route, onClick: () => setArrivalLot(row), hidden: !(canOperate && !row.arrivalMode) },
                { label: 'Take out of storage spot', icon: Icons.trash, onClick: () => setRemoveTarget(row), hidden: !canOperate, danger: true },
              ]}
            />
          </>
        );
      default:
        return null;
    }
  };

  const columns = [
    {
      key: 'lotCode', header: 'Batch', primary: true,
      render: (row) => (
        <>
          <span className={uiStyles.strong}>{row.material?.materialName || 'Material'}</span>
          <span className={uiStyles.sub}><span className={uiStyles.mono}>{row.lotCode}</span> · {row.quantity} {row.unit}</span>
          <SourceLine row={row} />
        </>
      ),
    },
    { key: 'arrivalMode', header: 'Arrived by', render: (row) => <ArrivalTag mode={row.arrivalMode} /> },
    !isStorage && {
      key: 'stage', header: 'Step', sortValue: (row) => STAGE_BY_VALUE[row.stage]?.step,
      render: (row) => { const st = STAGE_BY_VALUE[row.stage]; return <Tag tone={st.tone}>{st.step}. {st.label}</Tag>; },
    },
    {
      key: 'bay', header: 'Storage spot', sortable: false,
      help: 'Suggested spots are ranked by straight-line distance to the loading dock and a set demand level. This is a simple rule — it is not the actual driving route.',
      render: (row) => <BayCell row={row} onOpenBay={setQrBay} />,
    },
    { key: 'distance', header: 'Distance to dock', sortable: false, hideOnMobile: true, render: (row) => <DistanceCell row={row} /> },
    { key: 'actions', header: 'Actions', sortable: false, render: (row) => <div className={uiStyles.rowActions}>{rowActions(row)}</div> },
  ].filter(Boolean);

  const emptyState = filtersActive ? (
    <StatePanel icon={Icons.search} title="No batches match these filters" message="Try a different search, or clear the filters to see everything."
      action={<Button onClick={() => { setArrivalFilter(''); setStageFilter(''); setSearch(''); }}>Clear filters</Button>} />
  ) : isStorage ? (
    <StatePanel icon={Icons.box} title="Nothing stored yet" message="Batches show up here once someone confirms they’ve been put in a storage spot." />
  ) : (
    <StatePanel icon={Icons.inbox} title="Nothing waiting to be stored" message="Everything that arrived has been put away. New arrivals will show up here."
      action={onReceive && <Button variant="primary" icon={Icons.plus} onClick={onReceive}>Receive material</Button>} />
  );

  return (
    <>
      {!isStorage && (
        <div className={styles.stages} role="group" aria-label="Filter by stage">
          {STAGES.map((s) => {
            const active = stageFilter === s.value;
            const toStorage = s.value === 'PLACED';
            return (
              <button
                key={s.value}
                type="button"
                aria-pressed={toStorage ? undefined : active}
                className={`${styles.stage} ${styles[`stage_${s.tone}`]} ${active ? styles.stageActive : ''}`}
                onClick={() => (toStorage ? onShowStorage() : setStageFilter(active ? '' : s.value))}
              >
                <span className={styles.stageStep}>Step {s.step}</span>
                <span className={styles.stageText}>
                  <span className={styles.stageLabel}>{s.label}</span>
                  <span className={styles.stageHint}>{s.hint}</span>
                </span>
                <span className={styles.stageCount}>{summary ? summary.byStage[s.value] : '—'}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className={uiStyles.card}>
        <div className={styles.toolbar}>
          <SegmentedControl ariaLabel="Filter by arrival mode" options={arrivalOptions} value={arrivalFilter} onChange={setArrivalFilter} />
          <div className={styles.cardTools}>
            <SearchInput className={styles.search} value={search} onChange={setSearch} placeholder="Search batch or material" />
            {canOperate && <Button icon={Icons.scan} onClick={openScan}>Scan to place</Button>}
            {canOperate && !isStorage && <Button icon={Icons.plus} onClick={() => openDirect('map')}>Place directly</Button>}
          </div>
        </div>

        {loading && !data.lots.length ? <LoadingRows rows={5} /> : fetchError ? (
          <ErrorState title="We couldn’t load the batches" error={fetchError} onRetry={load} />
        ) : rows.length === 0 ? emptyState : (
          <DataTable
            columns={columns}
            rows={rows}
            caption={isStorage ? 'Stored batches' : 'Batches arriving'}
            defaultSort={isStorage ? undefined : { key: 'stage', dir: 'asc' }}
          />
        )}
      </div>

      {/* ── Allocation workflow dialogs ── */}
      <ArrivalModeDialog lot={arrivalLot} onClose={() => setArrivalLot(null)} onSave={saveArrival} />
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
          notify(result.action === 'MOVED' ? 'Batch moved (scanned).' : 'Batch placed (scanned).', 'success');
          refreshAll();
        }}
      />
      <ConfirmDialog
        isOpen={Boolean(removeTarget)}
        title="Take this batch out of its storage spot?"
        message={`Batch ${removeTarget?.lotCode} will no longer be shown in storage spot ${removeTarget?.activeMapping?.bay?.bayCode}.`}
        details={['The spot becomes free for other material.', 'The batch’s movement history is kept.']}
        confirmLabel="Take it out"
        loadingLabel="Taking out…"
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
      <LotDetailModal
        isOpen={Boolean(qrLot)}
        lot={qrLot}
        onClose={() => setQrLot(null)}
        onLotUpdated={(updated) => { setQrLot((cur) => ({ ...cur, ...updated })); load(); }}
      />
      <BayDetailModal
        isOpen={Boolean(qrBay)}
        bay={qrBay}
        onClose={() => setQrBay(null)}
        onBayUpdated={(updated) => { setQrBay(updated); load(); }}
      />
    </>
  );
}

export default LotWorkspace;
