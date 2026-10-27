/**
 * Zone and Loading Dock forms (create + edit), built on the shared UI
 * primitives. Coordinates are optional but validated as a complete pair; a
 * blank pair is sent as null so the backend never stores a guessed position.
 */

import { useEffect, useState } from 'react';
import { Modal, Field, Button, FormAlert, Banner } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import { validateCoordinates } from '../../utils/geo';
import { apiErrorDetails } from '../../utils/apiErrors';

const toText = (v) => (v === null || v === undefined ? '' : String(v));
const triToText = (v) => (v === true ? 'true' : v === false ? 'false' : '');
const textToTri = (v) => (v === 'true' ? true : v === 'false' ? false : null);

/** Latitude/longitude pair with shared hints. */
export function CoordinateFields({ latitude, longitude, errors = {}, onChange, disabled, required = false, purpose }) {
  return (
    <div className={uiStyles.formSection}>
      <div>
        <p className={uiStyles.sectionTitle}>Location</p>
      </div>
      <p className={uiStyles.sectionDesc}>
        {purpose} Decimal degrees (WGS84), e.g. from a site survey or a map pin.
        {!required && ' Leave both blank if not surveyed yet.'}
      </p>
      <div className={uiStyles.formGrid}>
        <Field label="Latitude" required={required} optional={!required} error={errors.latitude} hint="−90 to 90">
          {(p) => (
            <input {...p} type="number" step="any" inputMode="decimal" placeholder="e.g. 22.804512"
              value={latitude} onChange={(e) => onChange('latitude', e.target.value)} disabled={disabled} />
          )}
        </Field>
        <Field label="Longitude" required={required} optional={!required} error={errors.longitude} hint="−180 to 180">
          {(p) => (
            <input {...p} type="number" step="any" inputMode="decimal" placeholder="e.g. 86.202873"
              value={longitude} onChange={(e) => onChange('longitude', e.target.value)} disabled={disabled} />
          )}
        </Field>
      </div>
    </div>
  );
}

function TriStateField({ label, value, onChange, disabled, hint }) {
  return (
    <Field label={label} hint={hint}>
      {(p) => (
        <select {...p} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">Not configured</option>
          <option value="true">Yes — reachable</option>
          <option value="false">No — not reachable</option>
        </select>
      )}
    </Field>
  );
}

// ─── Zone form ────────────────────────────────────────────────────────────────

const EMPTY_ZONE = { name: '', description: '', latitude: '', longitude: '', railConnected: '', roadConnected: '' };

export function ZoneFormModal({ isOpen, zone, onClose, onSave }) {
  const isEdit = Boolean(zone);
  const [form, setForm] = useState(EMPTY_ZONE);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormError(null);
    setForm(zone ? {
      name: zone.name,
      description: toText(zone.description),
      latitude: toText(zone.latitude),
      longitude: toText(zone.longitude),
      railConnected: triToText(zone.railConnected),
      roadConnected: triToText(zone.roadConnected),
    } : EMPTY_ZONE);
  }, [isOpen, zone]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = 'Zone name is required.';
    const coords = validateCoordinates(form.latitude, form.longitude);
    Object.assign(next, coords.errors);
    if (Object.keys(next).length) { setErrors(next); return; }

    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        name: form.name.trim(),
        description: form.description.trim() || null,
        ...coords.value,
        railConnected: textToTri(form.railConnected),
        roadConnected: textToTri(form.roadConnected),
      });
    } catch (err) {
      const { fields, message } = apiErrorDetails(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen} onClose={onClose} busy={saving} as="form" onSubmit={submit}
      icon={Icons.layers}
      title={isEdit ? `Edit ${zone.name}` : 'Add zone'}
      subtitle="Zones group bays and decide which inbound routes can reach them."
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{isEdit ? 'Save changes' : 'Create zone'}</Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{formError}</FormAlert>
        <div className={uiStyles.formGrid}>
          <Field label="Zone name" required error={errors.name}
            hint={isEdit ? 'Renaming also updates the zone label on its bays.' : 'Bays use this name in their Zone field.'}>
            {(p) => <input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Zone A" maxLength={100} disabled={saving} />}
          </Field>
          <Field label="Description" optional error={errors.description}>
            {(p) => <input {...p} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Coil storage, north shed" maxLength={500} disabled={saving} />}
          </Field>
        </div>
      </div>

      <div className={uiStyles.formSection}>
        <div><p className={uiStyles.sectionTitle}>Inbound connectivity</p></div>
        <p className={uiStyles.sectionDesc}>Used as a hard rule for recommendations only when set. “Not configured” applies no restriction.</p>
        <div className={uiStyles.formGrid}>
          <TriStateField label="Rail reaches this zone" value={form.railConnected} onChange={(v) => set('railConnected', v)} disabled={saving} />
          <TriStateField label="Road reaches this zone" value={form.roadConnected} onChange={(v) => set('roadConnected', v)} disabled={saving} />
        </div>
      </div>

      <CoordinateFields
        latitude={form.latitude} longitude={form.longitude} errors={errors} onChange={set} disabled={saving}
        purpose="Reference point for the zone (for example its centre or entrance)."
      />
    </Modal>
  );
}

// ─── Loading dock form ────────────────────────────────────────────────────────

const EMPTY_DOCK = { dockCode: '', dockName: '', zoneId: '', latitude: '', longitude: '', rail: false, road: false, status: 'ACTIVE', notes: '' };

export function DockFormModal({ isOpen, dock, zones, onClose, onSave }) {
  const isEdit = Boolean(dock);
  const [form, setForm] = useState(EMPTY_DOCK);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormError(null);
    setForm(dock ? {
      dockCode: dock.dockCode,
      dockName: dock.dockName,
      zoneId: dock.zoneId || '',
      latitude: toText(dock.latitude),
      longitude: toText(dock.longitude),
      rail: dock.arrivalModes?.includes('RAIL') || false,
      road: dock.arrivalModes?.includes('ROAD') || false,
      status: dock.status,
      notes: toText(dock.notes),
    } : EMPTY_DOCK);
  }, [isOpen, dock]);

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.dockCode.trim()) next.dockCode = 'Dock code is required.';
    if (!form.dockName.trim()) next.dockName = 'Dock name is required.';
    const coords = validateCoordinates(form.latitude, form.longitude);
    Object.assign(next, coords.errors);
    if (Object.keys(next).length) { setErrors(next); return; }

    setSaving(true);
    setFormError(null);
    try {
      await onSave({
        dockCode: form.dockCode.trim(),
        dockName: form.dockName.trim(),
        zoneId: form.zoneId || null,
        ...coords.value,
        arrivalModes: [form.rail && 'RAIL', form.road && 'ROAD'].filter(Boolean),
        status: form.status,
        notes: form.notes.trim() || null,
      });
    } catch (err) {
      const { fields, message } = apiErrorDetails(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const noModes = !form.rail && !form.road;
  const noCoords = !String(form.latitude).trim() && !String(form.longitude).trim();

  return (
    <Modal
      isOpen={isOpen} onClose={onClose} busy={saving} as="form" onSubmit={submit}
      icon={Icons.dock}
      title={isEdit ? `Edit ${dock.dockCode}` : 'Add loading dock'}
      subtitle="Docks are where inbound material is unloaded; bay distances are measured from them."
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving}>{isEdit ? 'Save changes' : 'Create dock'}</Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{formError}</FormAlert>
        <div className={uiStyles.formGrid}>
          <Field label="Dock code" required error={errors.dockCode}>
            {(p) => <input {...p} value={form.dockCode} onChange={(e) => set('dockCode', e.target.value)} placeholder="e.g. DOCK-R1" maxLength={50} disabled={saving} />}
          </Field>
          <Field label="Dock name" required error={errors.dockName}>
            {(p) => <input {...p} value={form.dockName} onChange={(e) => set('dockName', e.target.value)} placeholder="e.g. North rail siding" maxLength={100} disabled={saving} />}
          </Field>
          <Field label="Serves zone" error={errors.zoneId}
            hint="A shared dock serves every zone that has no dock of its own.">
            {(p) => (
              <select {...p} value={form.zoneId} onChange={(e) => set('zoneId', e.target.value)} disabled={saving}>
                <option value="">Shared — all zones without a dock</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Status" error={errors.status} hint="Inactive docks are ignored by recommendations.">
            {(p) => (
              <select {...p} value={form.status} onChange={(e) => set('status', e.target.value)} disabled={saving}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            )}
          </Field>
        </div>
      </div>

      <div className={uiStyles.formSection}>
        <div><p className={uiStyles.sectionTitle}>Arrivals received</p></div>
        <p className={uiStyles.sectionDesc}>Which inbound routes unload at this dock.</p>
        <div className={uiStyles.checkGroup}>
          {[['rail', 'Rail'], ['road', 'Road']].map(([key, label]) => (
            <label key={key} className={uiStyles.checkOption}>
              <input type="checkbox" checked={form[key]} onChange={(e) => set(key, e.target.checked)} disabled={saving} />
              {label}
            </label>
          ))}
        </div>
        {noModes && <Banner tone="warning">No route selected — recommendations will treat this dock’s arrival modes as not configured.</Banner>}
      </div>

      <CoordinateFields
        latitude={form.latitude} longitude={form.longitude} errors={errors} onChange={set} disabled={saving}
        purpose="Where trucks or wagons unload."
      />
      {noCoords && <Banner tone="warning" className={uiStyles.spaced}>Without coordinates this dock cannot be used to calculate bay distances.</Banner>}
    </Modal>
  );
}
