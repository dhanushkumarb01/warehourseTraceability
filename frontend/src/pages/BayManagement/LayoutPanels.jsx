/**
 * Zones and Loading Docks tabs of the Bays & Layout page.
 *
 * Both are configuration the bay recommendation relies on. Missing values are
 * shown as "Not configured" / "Not set" — never as zero or a default.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchZones, createZone, updateZone, deleteZone,
  fetchDocks, createDock, updateDock, deleteDock,
} from '../../services/locationService';
import { ZoneFormModal, DockFormModal } from '../../components/LocationForms/LocationForms';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import { Button, LoadingRows, StatePanel, Tag, ArrivalTag, Banner, ErrorState } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import { formatCoordinate, hasCoordinates } from '../../utils/geo';

const Connectivity = ({ value, label }) => {
  if (value === true) return <Tag tone="success">{label}: yes</Tag>;
  if (value === false) return <Tag tone="danger">{label}: no</Tag>;
  return <Tag tone="neutral" title="No rule applied until configured">{label}: not configured</Tag>;
};

const Coordinates = ({ item }) => (hasCoordinates(item)
  ? <span className={uiStyles.mono}>{formatCoordinate(item.latitude)}, {formatCoordinate(item.longitude)}</span>
  : <Tag tone="warning">Not set</Tag>);

/** Shared CRUD state for a location list. */
function useLocationList(load, notify) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setItems(await load()); } catch (err) { setError(err); } finally { setLoading(false); }
  }, [load]);

  useEffect(() => { reload(); }, [reload]);

  const remove = async (fn, item, label) => {
    try {
      await fn(item.id);
      notify(`${label} deleted.`, 'success');
      reload();
    } catch (err) {
      notify(err.message || 'Delete failed.', 'error');
    }
  };
  return { items, loading, error, reload, remove };
}

// ─── Zones ────────────────────────────────────────────────────────────────────

export function ZonesPanel({ canWrite, notify, onChanged }) {
  const { items: zones, loading, error, reload, remove } = useLocationList(fetchZones, notify);
  const [editing, setEditing] = useState(undefined); // undefined = closed, null = new
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const save = async (payload) => {
    if (editing) await updateZone(editing.id, payload); else await createZone(payload);
    notify(editing ? 'Zone updated.' : 'Zone created.', 'success');
    setEditing(undefined);
    reload();
    onChanged?.();
  };

  const unconfigured = zones.filter((z) => z.railConnected == null || z.roadConnected == null).length;

  return (
    <>
      {!loading && !error && unconfigured > 0 && (
        <Banner tone="info" className={uiStyles.spaced}>
          {unconfigured} zone{unconfigured === 1 ? '' : 's'} without rail/road connectivity configured. Recommendations apply no
          route restriction to {unconfigured === 1 ? 'it' : 'them'} until the warehouse team confirms the layout.
        </Banner>
      )}
      <div className={`${uiStyles.card} ${uiStyles.spaced}`}>
        <div className={uiStyles.cardHeader}>
          <div>
            <h2 className={uiStyles.cardTitle}>Zones</h2>
            <p className={uiStyles.cardMeta}>Zones are created automatically from bay zone names; add details here.</p>
          </div>
          {canWrite && <Button variant="primary" size="sm" icon={Icons.plus} onClick={() => setEditing(null)}>Add zone</Button>}
        </div>

        {loading ? <LoadingRows /> : error ? (
          <ErrorState title="We couldn’t load the yard areas" error={error} onRetry={reload} />
        ) : zones.length === 0 ? (
          <StatePanel icon={Icons.layers} title="No yard areas yet" message="Yard areas (zones) appear here when storage spots are created, or add one now." />
        ) : (
          <div className={uiStyles.tableWrap}>
            <table className={uiStyles.table}>
              <thead>
                <tr><th>Yard area</th><th>Spots</th><th>Docks</th><th>Connectivity</th><th>Reference point</th>{canWrite && <th aria-label="Actions" />}</tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <tr key={z.id}>
                    <td>
                      <div className={uiStyles.strong}>{z.name}</div>
                      {z.description && <div className={uiStyles.sub}>{z.description}</div>}
                    </td>
                    <td>{z._count?.bays ?? 0}</td>
                    <td>{z._count?.loadingDocks ? z._count.loadingDocks : <span className={uiStyles.soft}>None</span>}</td>
                    <td><div className={uiStyles.tagRow}>
                      <Connectivity value={z.railConnected} label="Rail" />
                      <Connectivity value={z.roadConnected} label="Road" />
                    </div></td>
                    <td><Coordinates item={z} /></td>
                    {canWrite && (
                      <td><div className={uiStyles.rowActions}>
                        <Button size="sm" variant="ghost" icon={Icons.edit} onClick={() => setEditing(z)} aria-label={`Edit ${z.name}`}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={Icons.trash} onClick={() => setToDelete(z)} aria-label={`Delete ${z.name}`} />
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ZoneFormModal isOpen={editing !== undefined} zone={editing} onClose={() => setEditing(undefined)} onSave={save} />
      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Delete this yard area?"
        message={`Delete zone "${toDelete?.name}"? Zones that still contain bays or docks cannot be deleted.`}
        isLoading={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          setDeleting(true);
          await remove(deleteZone, toDelete, 'Zone');
          setDeleting(false);
          setToDelete(null);
          onChanged?.();
        }}
      />
    </>
  );
}

// ─── Loading docks ────────────────────────────────────────────────────────────

export function DocksPanel({ canWrite, notify }) {
  const { items: docks, loading, error, reload, remove } = useLocationList(fetchDocks, notify);
  const [zones, setZones] = useState([]);
  const [editing, setEditing] = useState(undefined);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchZones().then(setZones).catch(() => setZones([])); }, []);

  const save = async (payload) => {
    if (editing) await updateDock(editing.id, payload); else await createDock(payload);
    notify(editing ? 'Loading dock updated.' : 'Loading dock created.', 'success');
    setEditing(undefined);
    reload();
  };

  const missingCoords = useMemo(() => docks.filter((d) => !hasCoordinates(d)).length, [docks]);

  return (
    <>
      {!loading && !error && docks.length === 0 && (
        <Banner tone="warning" className={uiStyles.spaced}>
          No loading docks are configured, so bay distances and recommendations cannot be calculated yet.
        </Banner>
      )}
      {!loading && missingCoords > 0 && (
        <Banner tone="warning" className={uiStyles.spaced}>
          {missingCoords} dock{missingCoords === 1 ? ' has' : 's have'} no coordinates and {missingCoords === 1 ? 'is' : 'are'} skipped
          for distance calculation.
        </Banner>
      )}
      <div className={`${uiStyles.card} ${uiStyles.spaced}`}>
        <div className={uiStyles.cardHeader}>
          <div>
            <h2 className={uiStyles.cardTitle}>Loading docks</h2>
            <p className={uiStyles.cardMeta}>Bay distances are straight-line from the nearest dock serving the bay’s zone.</p>
          </div>
          {canWrite && <Button variant="primary" size="sm" icon={Icons.plus} onClick={() => setEditing(null)}>Add dock</Button>}
        </div>

        {loading ? <LoadingRows /> : error ? (
          <ErrorState title="We couldn’t load the loading docks" error={error} onRetry={reload} />
        ) : docks.length === 0 ? (
          <StatePanel icon={Icons.dock} title="No loading docks yet"
            message="Add each dock with its coordinates and the arrival routes it receives."
            action={canWrite && <Button variant="primary" icon={Icons.plus} onClick={() => setEditing(null)}>Add first dock</Button>} />
        ) : (
          <div className={uiStyles.tableWrap}>
            <table className={uiStyles.table}>
              <thead>
                <tr><th>Dock</th><th>Serves</th><th>Arrivals</th><th>Coordinates</th><th>Status</th>{canWrite && <th aria-label="Actions" />}</tr>
              </thead>
              <tbody>
                {docks.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <div className={uiStyles.mono}>{d.dockCode}</div>
                      <div className={uiStyles.sub}>{d.dockName}</div>
                    </td>
                    <td>{d.zone ? d.zone.name : <Tag tone="info">Shared</Tag>}</td>
                    <td>
                      {d.arrivalModes?.length
                        ? <div className={uiStyles.tagRow}>{d.arrivalModes.map((m) => <ArrivalTag key={m} mode={m} />)}</div>
                        : <Tag tone="neutral">Not configured</Tag>}
                    </td>
                    <td><Coordinates item={d} /></td>
                    <td>{d.status === 'ACTIVE' ? <Tag tone="success">Active</Tag> : <Tag tone="neutral">Inactive</Tag>}</td>
                    {canWrite && (
                      <td><div className={uiStyles.rowActions}>
                        <Button size="sm" variant="ghost" icon={Icons.edit} onClick={() => setEditing(d)} aria-label={`Edit ${d.dockCode}`}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={Icons.trash} onClick={() => setToDelete(d)} aria-label={`Delete ${d.dockCode}`} />
                      </div></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DockFormModal isOpen={editing !== undefined} dock={editing} zones={zones} onClose={() => setEditing(undefined)} onSave={save} />
      <ConfirmDialog
        isOpen={Boolean(toDelete)}
        title="Delete this loading dock?"
        message={`Delete dock "${toDelete?.dockCode}"? Docks used by past allocations cannot be deleted — set them to Inactive instead.`}
        isLoading={deleting}
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          setDeleting(true);
          await remove(deleteDock, toDelete, 'Loading dock');
          setDeleting(false);
          setToDelete(null);
        }}
      />
    </>
  );
}
