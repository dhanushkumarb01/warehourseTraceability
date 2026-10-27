/**
 * Catalogue tab — the material list (item types) with a lot drill-down drawer.
 * Replaces the former Materials and Material Detail pages; material / lot
 * create, edit, delete and lot QR reuse the existing modals and APIs.
 *
 * Receiving a new lot goes through the page's Receive dialog (onReceive), so
 * there is one way in for new stock.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { getMaterials, getMaterialById, deleteMaterial } from '../../services/materialService';
import { deleteLot } from '../../services/lotService';
import MaterialFormModal from '../../components/MaterialFormModal/MaterialFormModal';
import LotFormModal from '../../components/LotFormModal/LotFormModal';
import LotDetailModal from '../../components/LotDetailModal/LotDetailModal';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import { Button, Tag, ArrivalTag, LoadingRows, StatePanel, DataTable, SearchInput, ErrorState, IconButton } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './InboundStorage.module.css';

// Set by FOIS / SAP import when the source record carried no material type.
const UNCLASSIFIED = 'UNCLASSIFIED';

const NeedsReview = ({ material }) => (material?.materialType === UNCLASSIFIED
  ? <Tag tone="warning" icon={Icons.warning} title="Created from a FOIS / SAP record without a material type. Edit it to set the type.">Needs a type</Tag>
  : null);

/** Right-hand drawer: Escape closes (unless a dialog is open on top), focus returns to the opener. */
function Drawer({ title, subtitle, onClose, blockEscape, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    ref.current?.focus();
    return () => { if (opener && typeof opener.focus === 'function') opener.focus(); };
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      // Another modal dialog on top (e.g. Receive material) handles its own Escape.
      const stacked = [...document.querySelectorAll('[aria-modal="true"]')].some((n) => n !== ref.current);
      if (e.key === 'Escape' && !blockEscape && !stacked) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, blockEscape]);

  return (
    <div className={styles.drawerOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside ref={ref} className={styles.drawer} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className={styles.drawerHead}>
          <div className={styles.drawerTitles}>
            <h2 className={styles.drawerTitle}>{title}</h2>
            {subtitle && <div className={uiStyles.sub}>{subtitle}</div>}
          </div>
          <IconButton icon={Icons.close} label="Close" onClick={onClose} size="sm" variant="outline" tooltip={false} />
        </div>
        <div className={styles.drawerBody}>{children}</div>
      </aside>
    </div>
  );
}

function MaterialDrawer({ materialId, canWrite, notify, onClose, onReceive, onChanged }) {
  const [material, setMaterial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editLot, setEditLot] = useState(null);
  const [viewLot, setViewLot] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMaterialById(materialId);
      setMaterial(res.data);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [materialId]);
  useEffect(() => { load(); }, [load]);

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteLot(deleteTarget.id);
      notify(`Batch ${deleteTarget.lotCode} deleted.`, 'success');
      setDeleteTarget(null);
      load();
      onChanged();
    } catch (err) {
      notify(err.message || 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const childOpen = Boolean(editLot || viewLot || deleteTarget);

  return (
    <Drawer
      title={material ? material.materialName : 'Material'}
      subtitle={material && <><span className={uiStyles.mono}>{material.materialCode}</span> · {material.materialType} <NeedsReview material={material} /></>}
      onClose={onClose}
      blockEscape={childOpen}
    >
      {loading && !material ? <LoadingRows rows={4} /> : error ? (
        <ErrorState title="We couldn’t load this material" error={error} onRetry={load} />
      ) : material && (
        <>
          <dl className={styles.summaryList}>
            <dt>Manufacturer</dt><dd>{material.manufacturer || '—'}</dd>
            <dt>Supplier</dt><dd>{material.supplier || '—'}</dd>
            {material.description && (<><dt>Description</dt><dd>{material.description}</dd></>)}
          </dl>

          <div className={styles.inlineHead}>
            <h3 className={styles.drawerSectionTitle}>Batches ({material.lots.length})</h3>
            {canWrite && <Button size="sm" variant="primary" icon={Icons.plus} onClick={() => onReceive(material)}>Receive a batch</Button>}
          </div>
          <p className={styles.helper}>Each batch (lot) is one delivery of this material.</p>

          {material.lots.length === 0 ? (
            <StatePanel icon={Icons.inbox} title="No batches yet" message="When a delivery of this material arrives, receive it to create the first batch."
              action={canWrite && <Button variant="primary" icon={Icons.plus} onClick={() => onReceive(material)}>Receive a batch</Button>} />
          ) : (
            <div className={uiStyles.card}>
              <DataTable
                dense
                caption={`Batches of ${material.materialName}`}
                rows={material.lots}
                defaultSort={{ key: 'receivedDate', dir: 'desc' }}
                columns={[
                  {
                    key: 'lotCode', header: 'Batch', primary: true,
                    render: (lot) => (
                      <>
                        <span className={uiStyles.mono}>{lot.lotCode}</span>
                        <span className={uiStyles.sub}>{lot.quantity} {lot.unit}</span>
                        {lot.source && lot.source !== 'MANUAL' && <span className={uiStyles.sub}>{lot.source} <span className={uiStyles.mono}>{lot.externalRef}</span></span>}
                      </>
                    ),
                  },
                  { key: 'receivedDate', header: 'Received', sortValue: (lot) => new Date(lot.receivedDate).getTime(), render: (lot) => new Date(lot.receivedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                  { key: 'arrivalMode', header: 'Arrived by', render: (lot) => <ArrivalTag mode={lot.arrivalMode} /> },
                  { key: 'status', header: 'Status', render: (lot) => <StatusBadge status={lot.status} size="sm" /> },
                ]}
                actions={(lot) => [
                  { label: 'Details & QR label', icon: Icons.qr, onClick: () => setViewLot(lot) },
                  { label: 'Edit batch', icon: Icons.edit, onClick: () => setEditLot(lot), hidden: !(canWrite && lot.source === 'MANUAL') },
                  { label: 'Delete batch', icon: Icons.trash, onClick: () => setDeleteTarget(lot), hidden: !canWrite, danger: true },
                ]}
              />
            </div>
          )}
        </>
      )}

      <LotFormModal
        isOpen={Boolean(editLot)}
        mode="edit"
        materialId={materialId}
        initialData={editLot}
        onClose={() => setEditLot(null)}
        onSaved={() => { setEditLot(null); notify('Batch saved.', 'success'); load(); onChanged(); }}
      />
      <LotDetailModal
        isOpen={Boolean(viewLot)}
        lot={viewLot}
        onClose={() => setViewLot(null)}
        onLotUpdated={(updated) => { setViewLot((cur) => ({ ...cur, ...updated })); load(); }}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete this batch?"
        message={`Batch ${deleteTarget?.lotCode} will be permanently deleted. This can’t be undone.`}
        details={['Only batches that were never stored, given a spot or sent out can be deleted.']}
        confirmLabel="Delete batch"
        loadingLabel="Deleting…"
        isProcessing={deleting}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </Drawer>
  );
}

function CatalogueTab({ refreshKey, notify, openMaterialId, onOpenMaterial, onReceive }) {
  const { can } = useAuth();
  const canWrite = can(GROUPS.MATERIAL_WRITE);

  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(null); // { mode, material }
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getMaterials();
      setMaterials(res.data || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);

  const term = search.trim().toLowerCase();
  const rows = materials.filter((m) => !term
    || m.materialCode.toLowerCase().includes(term) || m.materialName.toLowerCase().includes(term));

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteMaterial(deleteTarget.id);
      notify(`Material ${deleteTarget.materialCode} deleted.`, 'success');
      setDeleteTarget(null);
      load();
    } catch (err) {
      notify(err.message || 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <p className={styles.helper}>
        A <strong>material</strong> is the item type (for example, Steel Coil). A <strong>batch</strong> (lot) is one delivery of it.
        New batches are created with <strong>Receive material</strong>, which can also add a material that isn’t listed here.
      </p>

      <div className={uiStyles.card}>
        <div className={styles.toolbar}>
          <SearchInput className={styles.search} value={search} onChange={setSearch} placeholder="Search code or name" ariaLabel="Search materials" />
          {canWrite && <Button icon={Icons.plus} onClick={() => setForm({ mode: 'create', material: null })}>Add material</Button>}
        </div>

        {loading && !materials.length ? <LoadingRows rows={5} /> : error ? (
          <ErrorState title="We couldn’t load the materials" error={error} onRetry={load} />
        ) : rows.length === 0 ? (
          term
            ? <StatePanel icon={Icons.search} title="No materials match your search" message="Check the spelling, or search by material code." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />
            : <StatePanel icon={Icons.layers} title="No materials yet" message="Materials are added when you receive the first delivery, or you can add one now."
                action={canWrite && <Button variant="primary" icon={Icons.plus} onClick={() => setForm({ mode: 'create', material: null })}>Add material</Button>} />
        ) : (
          <DataTable
            caption="Materials"
            rows={rows}
            defaultSort={{ key: 'materialName', dir: 'asc' }}
            onRowClick={(m) => onOpenMaterial(m.id)}
            rowTone={(m) => (m.materialType === UNCLASSIFIED ? 'warning' : undefined)}
            columns={[
              {
                key: 'materialName', header: 'Material', primary: true,
                render: (m) => (
                  <>
                    <span className={uiStyles.strong}>{m.materialName}</span>
                    <span className={uiStyles.sub}><span className={uiStyles.mono}>{m.materialCode}</span></span>
                  </>
                ),
              },
              { key: 'materialType', header: 'Type', render: (m) => <span className={uiStyles.tagRow}>{m.materialType === UNCLASSIFIED ? <NeedsReview material={m} /> : m.materialType}</span> },
              { key: 'lots', header: 'Batches', align: 'right', sortValue: (m) => m._count?.lots ?? 0, render: (m) => <span className="wt-num">{m._count?.lots ?? 0}</span> },
              { key: 'status', header: 'Status', render: (m) => <StatusBadge status={m.status} size="sm" /> },
            ]}
            actions={(m) => [
              { label: 'See batches', icon: Icons.box, onClick: () => onOpenMaterial(m.id) },
              { label: 'Receive a batch', icon: Icons.plus, onClick: () => onReceive(m), hidden: !canWrite },
              { label: 'Edit material', icon: Icons.edit, onClick: () => setForm({ mode: 'edit', material: m }), hidden: !canWrite },
              { label: 'Delete material', icon: Icons.trash, onClick: () => setDeleteTarget(m), hidden: !canWrite, danger: true },
            ]}
          />
        )}
      </div>

      {openMaterialId && (
        <MaterialDrawer
          key={openMaterialId}
          materialId={openMaterialId}
          canWrite={canWrite}
          notify={notify}
          onClose={() => onOpenMaterial(null)}
          onReceive={onReceive}
          onChanged={load}
        />
      )}

      <MaterialFormModal
        isOpen={Boolean(form)}
        mode={form?.mode}
        initialData={form?.material}
        onClose={() => setForm(null)}
        onSaved={() => { setForm(null); notify('Material saved.', 'success'); load(); }}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete this material?"
        message={`${deleteTarget?.materialName || 'This material'} (${deleteTarget?.materialCode}) will be removed from the materials list. This can’t be undone.`}
        details={['Materials that still have batches can’t be deleted.']}
        confirmLabel="Delete material"
        loadingLabel="Deleting…"
        isProcessing={deleting}
        onConfirm={doDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default CatalogueTab;
