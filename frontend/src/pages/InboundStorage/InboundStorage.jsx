/**
 * Inbound & Storage Page (replaces Bays & Layout, Materials and Bay Allocation)
 *
 * One place to receive material and put it in a bay:
 *   Inbound queue  lots on their way into a bay (arrival → allot → confirm)
 *   In storage     placed lots: move, remove, history, QR
 *   Catalogue      materials (item types) and their lots
 *   Layout         bays, zones, loading docks
 *
 * "Receive material" is the single way in for new stock: road lots are entered
 * here, rail lots are picked from their FOIS / SAP record. Allotment uses the
 * existing AllocationDialog and placement workflow.
 *
 * The active tab and an open catalogue material live in the URL
 * (?tab=…&material=…) so the former /materials/:id links can deep-link here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchPlacementConfig, allocateBay } from '../../services/placementService';
import Toast from '../../components/Toast/Toast';
import { PageHeader, Tabs, Button, IconButton } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { AllocationDialog } from './AllocationDialogs';
import ReceiveMaterialDialog from './ReceiveMaterialDialog';
import LotWorkspace from './LotWorkspace';
import CatalogueTab from './CatalogueTab';
import LayoutTab from './LayoutTab';
import styles from './InboundStorage.module.css';

const TABS = [
  { value: 'queue', label: 'Arriving', icon: Icons.inbox, hint: 'Inbound queue — batches on their way into a storage spot' },
  { value: 'storage', label: 'Stored', icon: Icons.box, hint: 'In storage — batches placed in a storage spot' },
  { value: 'catalogue', label: 'Materials list', icon: Icons.layers, hint: 'Catalogue — material types and their batches' },
  { value: 'layout', label: 'Yard layout', icon: Icons.dock, hint: 'Layout — storage spots, yard areas and loading docks' },
];
const TAB_VALUES = TABS.map((t) => t.value);

function InboundStorage() {
  const { can } = useAuth();
  const canReceive = can(GROUPS.MATERIAL_WRITE);
  const canAllocate = can(GROUPS.ALLOCATION_MANAGE);

  const [params, setParams] = useSearchParams();
  const tab = TAB_VALUES.includes(params.get('tab')) ? params.get('tab') : 'queue';
  const openMaterialId = params.get('material');

  const setTab = (value) => setParams(value === 'queue' ? {} : { tab: value });
  const setOpenMaterial = (id) => setParams(id ? { tab: 'catalogue', material: id } : { tab: 'catalogue' });

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const [toast, setToast] = useState({ message: '', type: '' });
  const notify = useCallback((message, type = 'info') => setToast({ message, type }), []);
  const clearToast = useCallback(() => setToast({ message: '', type: '' }), []);

  const [config, setConfig] = useState(null);
  useEffect(() => { fetchPlacementConfig().then(setConfig).catch(() => setConfig(null)); }, []);

  // Receive dialog: a fresh key per opening so each receipt starts clean.
  const [receive, setReceive] = useState(null); // { key, presetMaterial }
  const openReceive = (presetMaterial = null) => setReceive({ key: Date.now(), presetMaterial });

  const [allocLot, setAllocLot] = useState(null);

  const doAllocate = async (payload) => {
    const allocation = await allocateBay(payload);
    notify(`Storage spot ${allocation.bay.bayCode} chosen for batch ${allocLot.lotCode}. Move it there and confirm when it’s placed.`, 'success');
    setAllocLot(null);
    refresh();
  };

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <PageHeader
        icon={Icons.inbox}
        title="Receiving & storage"
        term="Inbound & Storage"
        subtitle="Receive material by road or rail, choose a storage spot for it, and see what is stored where."
        actions={(
          <>
            <IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={refresh} />
            {canReceive && <Button variant="primary" icon={Icons.plus} onClick={() => openReceive()}>Receive material</Button>}
          </>
        )}
      />

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Inbound and storage sections" />

      {tab === 'queue' && (
        <LotWorkspace
          view="queue" refreshKey={refreshKey} notify={notify}
          onAllot={setAllocLot} onShowStorage={() => setTab('storage')}
          onReceive={canReceive ? () => openReceive() : null}
        />
      )}
      {tab === 'storage' && (
        <LotWorkspace view="storage" refreshKey={refreshKey} notify={notify} onAllot={setAllocLot} />
      )}
      {tab === 'catalogue' && (
        <CatalogueTab
          refreshKey={refreshKey} notify={notify}
          openMaterialId={openMaterialId} onOpenMaterial={setOpenMaterial}
          onReceive={(material) => openReceive(material)}
        />
      )}
      {tab === 'layout' && <LayoutTab notify={notify} />}

      {receive && (
        <ReceiveMaterialDialog
          key={receive.key}
          presetMaterial={receive.presetMaterial}
          canAllocate={canAllocate}
          onClose={() => setReceive(null)}
          onReceived={refresh}
          onAllot={(lot) => { setReceive(null); setAllocLot(lot); }}
        />
      )}
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
    </div>
  );
}

export default InboundStorage;
