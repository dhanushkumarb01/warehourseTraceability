/**
 * Layout tab — bays as a compact table with a quick "Add bay" form, plus the
 * zone and loading-dock configuration under "Layout settings".
 *
 * The quick form covers the everyday fields (code, name, zone, centre point);
 * "Advanced" opens the full BayForm for the boundary polygon and status. Bay
 * QR is generated from the bay details dialog, as before. Everyone can read
 * the layout; only BAY_WRITE sees edit controls (the backend enforces it).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchAllBays, createBay, updateBay, deleteBay } from '../../services/bayService';
import { fetchZones } from '../../services/locationService';
import BayForm from '../../components/BayForm/BayForm';
import BayDetailModal from '../../components/BayDetailModal/BayDetailModal';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import { Button, Field, FormAlert, Tag, LoadingRows, StatePanel, ErrorState } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import { formatCoordinate } from '../../utils/geo';
import { ZonesPanel, DocksPanel } from '../BayManagement/LayoutPanels';
import styles from './InboundStorage.module.css';

const EMPTY_QUICK = { bayCode: '', bayName: '', zone: '', latitude: '', longitude: '' };

/** Server validation errors arrive as [{ field, message }]. */
const fieldErrors = (err) => {
  const out = {};
  for (const e of err?.response?.data?.errors || []) if (e.field && !out[e.field]) out[e.field] = e.message;
  return out;
};

function QuickAddBay({ zoneNames, onCreated, onAdvanced }) {
  const [form, setForm] = useState(EMPTY_QUICK);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const validate = () => {
    const e = {};
    if (!form.bayCode.trim()) e.bayCode = 'Required.';
    if (!form.bayName.trim()) e.bayName = 'Required.';
    if (!form.zone.trim()) e.zone = 'Required.';
    const lat = Number(form.latitude);
    const lng = Number(form.longitude);
    if (form.latitude === '' || !Number.isFinite(lat) || lat < -90 || lat > 90) e.latitude = 'Between -90 and 90.';
    if (form.longitude === '' || !Number.isFinite(lng) || lng < -180 || lng > 180) e.longitude = 'Between -180 and 180.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const bay = await createBay({
        bayCode: form.bayCode.trim(),
        bayName: form.bayName.trim(),
        zone: form.zone.trim(),
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      setForm(EMPTY_QUICK);
      onCreated(bay);
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err.message || 'Could not add the bay.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Add a storage spot">
      {formError && <div className={styles.quickAlert}><FormAlert>{formError}</FormAlert></div>}
      <div className={styles.quickForm}>
        <Field label="Spot code" required error={errors.bayCode} help="Short code painted on the ground, e.g. A-12. Also called the bay code.">
          {(p) => <input {...p} value={form.bayCode} maxLength={50} onChange={(e) => set('bayCode', e.target.value)} placeholder="e.g. B-12" />}
        </Field>
        <Field label="Spot name" required error={errors.bayName}>
          {(p) => <input {...p} value={form.bayName} onChange={(e) => set('bayName', e.target.value)} />}
        </Field>
        <Field label="Yard area" required error={errors.zone} help="The part of the yard this spot belongs to (zone).">
          {(p) => (
            <>
              <input {...p} list="quick-bay-zones" value={form.zone} onChange={(e) => set('zone', e.target.value)} placeholder="Existing or new" />
              <datalist id="quick-bay-zones">{zoneNames.map((z) => <option key={z} value={z} />)}</datalist>
            </>
          )}
        </Field>
        <Field label="Latitude" required error={errors.latitude} help="GPS position — used to draw the spot on the yard map.">
          {(p) => <input {...p} type="number" step="any" inputMode="decimal" value={form.latitude} onChange={(e) => set('latitude', e.target.value)} />}
        </Field>
        <Field label="Longitude" required error={errors.longitude}>
          {(p) => <input {...p} type="number" step="any" inputMode="decimal" value={form.longitude} onChange={(e) => set('longitude', e.target.value)} />}
        </Field>
        <div className={styles.quickActions}>
          <Button type="submit" variant="primary" icon={Icons.plus} loading={saving}>Add bay</Button>
          <Button variant="ghost" onClick={onAdvanced} title="Outline on the map and status">More options…</Button>
        </div>
      </div>
    </form>
  );
}

function LayoutTab({ notify }) {
  const { can } = useAuth();
  const canWrite = can(GROUPS.BAY_WRITE);

  const [bays, setBays] = useState([]);
  const [zoneNames, setZoneNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(null); // { mode, bay }
  const [submitting, setSubmitting] = useState(false);
  const [detailBay, setDetailBay] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setBays(await fetchAllBays()); } catch (err) { setError(err); } finally { setLoading(false); }
  }, []);
  const loadZoneNames = useCallback(() => {
    fetchZones().then((zones) => setZoneNames(zones.map((z) => z.name))).catch(() => setZoneNames([]));
  }, []);
  useEffect(() => { load(); loadZoneNames(); }, [load, loadZoneNames]);

  const submitForm = async (payload) => {
    setSubmitting(true);
    try {
      if (form.mode === 'edit') await updateBay(form.bay.id, payload); else await createBay(payload);
      notify(form.mode === 'edit' ? 'Bay updated.' : 'Bay added.', 'success');
      setForm(null);
      load();
      loadZoneNames();
    } catch (err) {
      const list = err.response?.data?.errors;
      notify(list?.length ? list.map((e) => e.message).join(' ') : err.message || 'Operation failed.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await deleteBay(deleteTarget.id);
      notify(`Bay "${deleteTarget.bayCode}" deleted.`, 'success');
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
      <div className={uiStyles.card}>
        <div className={uiStyles.cardHeader}>
          <h2 className={uiStyles.cardTitle}>Storage spots</h2>
          <span className={uiStyles.cardMeta}>
            {bays.length} bays · {bays.filter((b) => b.status === 'AVAILABLE').length} available
          </span>
        </div>

        {canWrite && (
          <QuickAddBay
            zoneNames={zoneNames}
            onAdvanced={() => setForm({ mode: 'create', bay: null })}
            onCreated={(bay) => { notify(`Bay ${bay.bayCode} added.`, 'success'); load(); loadZoneNames(); }}
          />
        )}

        {loading && !bays.length ? <LoadingRows rows={4} /> : error ? (
          <ErrorState title="We couldn’t load the storage spots" error={error} onRetry={load} />
        ) : bays.length === 0 ? (
          <StatePanel icon={Icons.grid} title="No storage spots yet" message={canWrite ? 'Add the first storage spot with the form above.' : 'A supervisor adds storage spots here.'} />
        ) : (
          <div className={uiStyles.tableWrap}>
            <table className={uiStyles.table}>
              <thead>
                <tr><th>Bay</th><th>Zone</th><th>Centre point</th><th>Status</th><th>QR</th><th className={styles.actionsHead}>Actions</th></tr>
              </thead>
              <tbody>
                {bays.map((bay) => (
                  <tr key={bay.id}>
                    <td><span className={uiStyles.mono}>{bay.bayCode}</span><span className={uiStyles.sub}>{bay.bayName}</span></td>
                    <td>{bay.zone}</td>
                    <td className={uiStyles.mono}>{formatCoordinate(bay.latitude)}, {formatCoordinate(bay.longitude)}</td>
                    <td><StatusBadge status={bay.status} /></td>
                    <td>{bay.qrStatus === 'GENERATED' ? <Tag tone="success">Ready</Tag> : <Tag tone="neutral">None</Tag>}</td>
                    <td>
                      <div className={uiStyles.rowActions}>
                        <Button size="sm" variant="ghost" icon={Icons.qr} onClick={() => setDetailBay(bay)} aria-label={`Details and QR of ${bay.bayCode}`} title="Details and QR" />
                        {canWrite && <Button size="sm" variant="ghost" icon={Icons.edit} onClick={() => setForm({ mode: 'edit', bay })} aria-label={`Edit ${bay.bayCode}`} title="Edit storage spot" />}
                        {canWrite && <Button size="sm" variant="ghost" icon={Icons.trash} onClick={() => setDeleteTarget(bay)} aria-label={`Delete ${bay.bayCode}`} title="Delete storage spot" />}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <details className={styles.settings}>
        <summary className={styles.settingsSummary}>Layout settings — zones and loading docks</summary>
        <div className={styles.settingsBody}>
          <p className={styles.helper}>
            Used for bay suggestions: which zones rail / road reach, and where the loading docks are. Leave anything
            unknown unset — it is shown as “not configured”, never guessed.
          </p>
          <ZonesPanel canWrite={canWrite} notify={notify} onChanged={() => { load(); loadZoneNames(); }} />
          <div className={uiStyles.spaced} />
          <DocksPanel canWrite={canWrite} notify={notify} />
        </div>
      </details>

      <BayForm
        zoneOptions={zoneNames}
        isOpen={Boolean(form)}
        onClose={() => { if (!submitting) setForm(null); }}
        onSubmit={submitForm}
        initialData={form?.bay || null}
        isLoading={submitting}
        mode={form?.mode || 'create'}
      />
      <BayDetailModal
        isOpen={Boolean(detailBay)}
        bay={detailBay}
        onClose={() => setDetailBay(null)}
        onBayUpdated={(updated) => { setDetailBay(updated); setBays((prev) => prev.map((b) => (b.id === updated.id ? updated : b))); }}
      />
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete storage spot"
        message={`Permanently delete "${deleteTarget?.bayCode} – ${deleteTarget?.bayName}"? This cannot be undone.`}
        confirmLabel="Delete"
        loadingLabel="Deleting…"
        isProcessing={deleting}
        onConfirm={doDelete}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </>
  );
}

export default LayoutTab;
