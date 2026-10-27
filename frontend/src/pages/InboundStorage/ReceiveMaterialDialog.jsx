/**
 * Receive material — one guided dialog for both inbound routes.
 *
 *   Step 1  How did it arrive?        Road | Rail
 *   Road    Step 2  Material + lot     pick a catalogue material or describe a
 *                                      new one inline; lot code, qty, unit, date
 *   Rail    Step 2  Pick consignment   FOIS / SAP records not yet received; the
 *                                      supervisor selects the matching one —
 *                                      no lot fields are typed
 *   Step 3  Allot a bay                handed to the existing AllocationDialog
 *                                      by the page (onAllot)
 *
 * Rail records are the system of record, so they are imported, never re-keyed.
 * Importing needs ALLOCATION_MANAGE; operators can see the list read-only.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Field, Button, FormAlert, Banner, Tag, ArrivalTag, LoadingRows, StatePanel, SegmentedControl, Stepper, SearchInput } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import { getMaterials } from '../../services/materialService';
import { createLot } from '../../services/lotService';
import { fetchPendingConsignments, importConsignment } from '../../services/inboundService';
import styles from './InboundStorage.module.css';

const MODES = [
  { value: 'ROAD', label: 'Road', icon: Icons.truck, desc: 'Arrived on a truck. You enter the lot details here.' },
  { value: 'RAIL', label: 'Rail', icon: Icons.train, desc: 'Arrived by rake. Pick the matching FOIS / SAP record — nothing to type.' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'FOIS', label: 'FOIS' },
  { value: 'SAP', label: 'SAP' },
];

// Meta keys shown when a record carries them; anything else stays in the record.
const META_LABELS = { rakeNo: 'Rake', rrNo: 'RR', wagonNos: 'Wagons', inboundDelivery: 'Inbound delivery' };

const today = () => new Date().toISOString().split('T')[0];
const EMPTY_LOT = { lotCode: '', quantity: '', unit: '', receivedDate: today() };
const EMPTY_MATERIAL = { materialCode: '', materialName: '', materialType: '' };

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

/** Server validation errors arrive as [{ field, message }] on either error shape. */
const fieldErrors = (err) => {
  const list = err?.errors || err?.response?.data?.errors || [];
  const out = {};
  for (const e of list) if (e.field && !out[e.field]) out[e.field] = e.message;
  return out;
};

function Steps({ current, mode }) {
  const steps = [
    { id: 'mode', label: 'How it arrived', hint: 'Road or rail' },
    { id: 'details', label: mode === 'RAIL' ? 'Pick the record' : 'Material & batch', hint: mode === 'RAIL' ? 'From FOIS / SAP' : 'What and how much' },
    { id: 'done', label: 'Choose a spot', hint: 'Where it will be stored' },
  ];
  const order = steps.map((x) => x.id);
  const at = order.indexOf(current === 'review' ? 'details' : current);
  return <div className={styles.stepperWrap}><Stepper steps={steps} current={at} /></div>;
}

function MetaLine({ meta }) {
  const parts = Object.entries(META_LABELS)
    .filter(([key]) => meta?.[key] !== undefined && meta?.[key] !== null && meta?.[key] !== '')
    .map(([key, label]) => {
      const v = meta[key];
      return <span key={key}>{label}: <span className={uiStyles.mono}>{Array.isArray(v) ? v.join(', ') : String(v)}</span></span>;
    });
  return parts.length ? <span className={styles.consignmentMeta}>{parts}</span> : null;
}

// ─── Road ─────────────────────────────────────────────────────────────────────

function RoadStep({ presetMaterial, onCreated, onBack, onBusy }) {
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [search, setSearch] = useState('');
  const [materialId, setMaterialId] = useState(presetMaterial?.id || '');
  const [creatingMaterial, setCreatingMaterial] = useState(false);
  const [material, setMaterial] = useState(EMPTY_MATERIAL);
  const [lot, setLot] = useState(EMPTY_LOT);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getMaterials();
      setMaterials(res.data || []);
    } catch (err) {
      setLoadError(err.message || 'Could not load materials.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const term = search.trim().toLowerCase();
  const options = useMemo(() => materials.filter((m) => m.status !== 'INACTIVE'
    && (!term || m.materialCode.toLowerCase().includes(term) || m.materialName.toLowerCase().includes(term))), [materials, term]);
  const chosen = materials.find((m) => m.id === materialId) || null;

  const setLotField = (k, v) => { setLot((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const setMatField = (k, v) => { setMaterial((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [`material.${k}`]: undefined })); };

  const validate = () => {
    const e = {};
    if (creatingMaterial) {
      if (!material.materialCode.trim()) e['material.materialCode'] = 'Material code is required.';
      if (!material.materialName.trim()) e['material.materialName'] = 'Material name is required.';
      if (!material.materialType.trim()) e['material.materialType'] = 'Material type is required.';
    } else if (!materialId) {
      e.materialId = 'Choose a material, or create a new one.';
    }
    if (!lot.lotCode.trim()) e.lotCode = 'Lot code is required.';
    if (!(Number(lot.quantity) > 0)) e.quantity = 'Quantity must be greater than 0.';
    if (!lot.unit.trim()) e.unit = 'Unit is required.';
    if (!lot.receivedDate) e.receivedDate = 'Received date is required.';
    return e;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;

    const payload = {
      lotCode: lot.lotCode.trim(),
      quantity: Number(lot.quantity),
      unit: lot.unit.trim().toUpperCase(),
      receivedDate: lot.receivedDate,
      arrivalMode: 'ROAD',
      ...(creatingMaterial
        ? { material: { materialCode: material.materialCode.trim(), materialName: material.materialName.trim(), materialType: material.materialType.trim() } }
        : { materialId }),
    };
    setSaving(true);
    onBusy(true);
    try {
      const res = await createLot(payload);
      const created = res.data;
      onCreated({
        ...created,
        material: creatingMaterial ? { id: created.materialId, ...payload.material } : chosen,
      });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(err.message || 'Could not receive the lot.');
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={styles.stepPane}>
      <div className={styles.stepFields}>
        <FormAlert>{formError}</FormAlert>
        <p className={styles.helper}>
          A <strong>material</strong> is the item type (e.g. Steel Coil). A <strong>lot</strong> is this one delivery of it.
        </p>

        {creatingMaterial ? (
          <div className={styles.inlineMaterial}>
            <div className={styles.inlineHead}>
              <span className={styles.inlineTitle}>New material — added to the catalogue with this lot</span>
              <Button size="sm" variant="ghost" onClick={() => { setCreatingMaterial(false); setMaterial(EMPTY_MATERIAL); }}>Pick existing instead</Button>
            </div>
            <div className={styles.formGrid2}>
              <Field label="Material code" required error={errors['material.materialCode']}>
                {(p) => <input {...p} value={material.materialCode} maxLength={50} onChange={(e) => setMatField('materialCode', e.target.value)} placeholder="e.g. MAT-120" />}
              </Field>
              <Field label="Material type" required error={errors['material.materialType']}>
                {(p) => <input {...p} value={material.materialType} onChange={(e) => setMatField('materialType', e.target.value)} placeholder="e.g. RAW_MATERIAL" />}
              </Field>
              <Field label="Material name" required error={errors['material.materialName']} className={styles.full}>
                {(p) => <input {...p} value={material.materialName} onChange={(e) => setMatField('materialName', e.target.value)} placeholder="e.g. Hot Rolled Plate" />}
              </Field>
            </div>
          </div>
        ) : loading ? <LoadingRows rows={2} /> : loadError ? (
          <StatePanel kind="error" title="Couldn’t load materials" message={loadError} action={<Button onClick={load}>Try again</Button>} />
        ) : (
          <div className={styles.formGrid2}>
            <Field label="Find material" hint={`${options.length} of ${materials.length} shown`}>
              {(p) => <input {...p} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name" />}
            </Field>
            <Field label="Material" required error={errors.materialId}>
              {(p) => (
                <select {...p} value={materialId} onChange={(e) => { setMaterialId(e.target.value); setErrors((x) => ({ ...x, materialId: undefined })); }}>
                  <option value="">Select…</option>
                  {chosen && !options.includes(chosen) && <option value={chosen.id}>{chosen.materialCode} — {chosen.materialName}</option>}
                  {options.map((m) => <option key={m.id} value={m.id}>{m.materialCode} — {m.materialName}</option>)}
                </select>
              )}
            </Field>
            <div className={styles.full}>
              <Button size="sm" variant="ghost" icon={Icons.plus} onClick={() => { setCreatingMaterial(true); setMaterialId(''); }}>
                Not in the list? Create a new material
              </Button>
            </div>
          </div>
        )}

        <div className={styles.formGrid2}>
          <Field label="Lot code" required error={errors.lotCode} hint="Your reference for this delivery, e.g. the challan number.">
            {(p) => <input {...p} value={lot.lotCode} maxLength={50} onChange={(e) => setLotField('lotCode', e.target.value)} />}
          </Field>
          <Field label="Received on" required error={errors.receivedDate}>
            {(p) => <input {...p} type="date" value={lot.receivedDate} max={today()} onChange={(e) => setLotField('receivedDate', e.target.value)} />}
          </Field>
          <Field label="Quantity" required error={errors.quantity}>
            {(p) => <input {...p} type="number" inputMode="decimal" min="0" step="any" value={lot.quantity} onChange={(e) => setLotField('quantity', e.target.value)} />}
          </Field>
          <Field label="Unit" required error={errors.unit}>
            {(p) => <input {...p} value={lot.unit} maxLength={20} onChange={(e) => setLotField('unit', e.target.value)} placeholder="e.g. KG, MT, PCS" />}
          </Field>
        </div>
      </div>

      <div className={`${uiStyles.rowActions} ${styles.stepActions}`}>
        <Button onClick={onBack} disabled={saving}>Back</Button>
        <Button type="submit" variant="primary" loading={saving} icon={Icons.check}>Receive lot</Button>
      </div>
    </form>
  );
}

// ─── Rail ─────────────────────────────────────────────────────────────────────

function RailStep({ canImport, onImported, onBack, onBusy }) {
  const [source, setSource] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setData(await fetchPendingConsignments({ source: source || undefined, search: debounced || undefined }));
    } catch (err) {
      setLoadError(err.message || 'Could not load consignments.');
    } finally {
      setLoading(false);
    }
  }, [source, debounced]);
  useEffect(() => { load(); }, [load]);

  const keyOf = (c) => `${c.source}|${c.externalRef}`;
  const selected = data?.consignments.find((c) => keyOf(c) === selectedKey) || null;

  const doImport = async () => {
    setSaving(true);
    setSaveError(null);
    onBusy(true);
    try {
      const result = await importConsignment(selected.source, selected.externalRef);
      onImported(result);
    } catch (err) {
      setSaveError(err.message || 'Import failed.');
      setReviewing(false);
      load();
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  const demoTag = data?.isDemo && <Tag tone="warning" title="Mock records — not real FOIS / SAP data">Demo data</Tag>;

  if (reviewing && selected) {
    return (
      <div className={styles.stepPane}>
        <FormAlert>{saveError}</FormAlert>
        <dl className={styles.summaryList}>
          <dt>Record</dt><dd>{selected.source} <span className={uiStyles.mono}>{selected.externalRef}</span> {demoTag}</dd>
          <dt>New lot</dt><dd><span className={uiStyles.mono}>{selected.lotCode}</span> · <ArrivalTag mode="RAIL" /></dd>
          <dt>Material</dt>
          <dd>
            <span className={uiStyles.mono}>{selected.materialCode}</span> · {selected.catalogueMaterial?.materialName || selected.materialName}
            {!selected.catalogueMaterial && (
              <span className={uiStyles.sub}>
                Not in the catalogue yet — it will be added{selected.materialType ? ` as type ${selected.materialType}` : ' and marked “needs review” (no type in the record)'}.
              </span>
            )}
          </dd>
          <dt>Quantity</dt><dd>{selected.quantity} {selected.unit}</dd>
          {selected.expectedOrArrivedAt && (<><dt>Source time</dt><dd>{fmtDateTime(selected.expectedOrArrivedAt)}</dd></>)}
          {selected.meta && (<><dt>Details</dt><dd><MetaLine meta={selected.meta} /></dd></>)}
        </dl>
        <Banner tone="info">
          The lot is created exactly as the {selected.source} record says. No bay is allotted yet — that is the next step.
        </Banner>
        <div className={`${uiStyles.rowActions} ${styles.stepActions}`}>
          <Button onClick={() => setReviewing(false)} disabled={saving}>Back</Button>
          <Button variant="primary" loading={saving} icon={Icons.check} onClick={doImport}>Receive this consignment</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stepPane}>
      <FormAlert>{saveError}</FormAlert>
      <p className={styles.helper}>
        Rail material is already recorded in FOIS / SAP. Find the record that matches what arrived; the lot is created from it.
      </p>
      {!canImport && (
        <Banner tone="info">Only a supervisor or admin can receive a rail consignment. You can check which records are waiting.</Banner>
      )}
      <div className={styles.railToolbar}>
        <SegmentedControl ariaLabel="Filter by source" options={SOURCE_OPTIONS} value={source} onChange={(v) => { setSource(v); setSelectedKey(null); }} />
        <SearchInput className={styles.search} value={search} onChange={setSearch}
          placeholder="Rake, RR, material or reference" ariaLabel="Search consignments" />
      </div>

      <div className={styles.stepScroll}>
        {loading && !data ? <LoadingRows rows={3} /> : loadError ? (
          <StatePanel kind="error" title="Couldn’t load consignments" message={loadError} action={<Button onClick={load}>Try again</Button>} />
        ) : data && !data.available ? (
          <StatePanel kind="error" icon={Icons.warning} title="FOIS / SAP source unreachable" message={data.reason}
            action={<Button onClick={load} icon={Icons.refresh}>Try again</Button>} />
        ) : data && data.consignments.length === 0 ? (
          <StatePanel icon={Icons.train}
            title={debounced || source ? 'No consignments match' : 'Nothing waiting to be received'}
            message={debounced || source ? 'Try another search or source.' : `${data.importedCount} consignment${data.importedCount === 1 ? ' has' : 's have'} already been received.`} />
        ) : data && (
          <>
            <div className={uiStyles.tagRow}>
              {demoTag}
              <span className={uiStyles.sub}>{data.consignments.length} waiting · {data.importedCount} already received</span>
            </div>
            <ul className={styles.consignmentList} role="radiogroup" aria-label="Pending consignments">
              {data.consignments.map((c) => {
                const key = keyOf(c);
                const active = key === selectedKey;
                const blocked = !c.importable;
                return (
                  <li key={key}>
                    <label className={`${styles.consignment} ${active ? styles.consignmentActive : ''} ${blocked ? styles.consignmentBlocked : ''}`}>
                      <input type="radio" name="consignment" checked={active} disabled={blocked || !canImport}
                        onChange={() => setSelectedKey(key)} aria-label={`${c.source} ${c.externalRef}`} />
                      <span className={styles.consignmentMain}>
                        <span><Tag tone="rail">{c.source}</Tag> <span className={uiStyles.mono}>{c.externalRef}</span></span>
                        <span>{c.materialName || <span className={uiStyles.muted}>No material name</span>} <span className={uiStyles.mono}>{c.materialCode}</span>
                          {!c.catalogueMaterial && c.importable && <> <Tag tone="outline">New material</Tag></>}
                        </span>
                        <MetaLine meta={c.meta} />
                        {c.expectedOrArrivedAt && <span className={uiStyles.sub}>{fmtDateTime(c.expectedOrArrivedAt)}</span>}
                      </span>
                      <span className={styles.consignmentQty}>{c.quantity !== null ? `${c.quantity} ${c.unit || ''}` : '—'}</span>
                      {blocked && (
                        <ul className={styles.problemList}>{c.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      <div className={`${uiStyles.rowActions} ${styles.stepActions}`}>
        <Button onClick={onBack}>Back</Button>
        {canImport && (
          <Button variant="primary" icon={Icons.arrowRight} disabled={!selected} onClick={() => setReviewing(true)}>Review</Button>
        )}
      </div>
    </div>
  );
}

// ─── Dialog ───────────────────────────────────────────────────────────────────

/**
 * Mount only while open (with a fresh key) so every receipt starts clean.
 * `onReceived(lot)` refreshes the page; `onAllot(lot)` opens step 3.
 */
function ReceiveMaterialDialog({ presetMaterial = null, canAllocate, onClose, onReceived, onAllot }) {
  const [step, setStep] = useState(presetMaterial ? 'details' : 'mode');
  const [mode, setMode] = useState(presetMaterial ? 'ROAD' : '');
  const [busy, setBusy] = useState(false);
  const [received, setReceived] = useState(null); // { lot, materialCreated }

  const finish = (lot, materialCreated = false) => {
    setReceived({ lot, materialCreated });
    setStep('done');
    onReceived(lot);
  };

  const subtitle = {
    mode: 'Road deliveries are typed in here. Rail deliveries are picked from their FOIS / SAP record, so nothing is typed twice.',
    details: mode === 'RAIL' ? 'Pick the record that matches the rake (train) that arrived.' : 'Choose the material, then enter how much arrived.',
    done: 'Received. The last step is choosing where to store it.',
  }[step];

  return (
    <Modal
      isOpen onClose={onClose} busy={busy} size="lg" icon={Icons.box}
      title="Receive material" subtitle={subtitle}
      className={styles.receiveModal} bodyClassName={styles.receiveBody}
    >
      <Steps current={step} mode={mode} />

      {step === 'mode' && (
        <div className={styles.stepPane}>
          <div className={styles.choiceGrid} role="radiogroup" aria-label="How the material arrived">
            {MODES.map((m) => (
              <label key={m.value} className={`${styles.choice} ${mode === m.value ? styles.choiceActive : ''}`}>
                <input type="radio" name="receiveMode" value={m.value} checked={mode === m.value}
                  onChange={() => setMode(m.value)} className={styles.srOnly} />
                <span className={styles.choiceIcon}>{m.icon}</span>
                <span className={styles.choiceLabel}>{m.label}</span>
                <span className={styles.choiceDesc}>{m.desc}</span>
              </label>
            ))}
          </div>
          <div className={`${uiStyles.rowActions} ${styles.stepActions}`}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!mode} icon={Icons.arrowRight} onClick={() => setStep('details')}>Continue</Button>
          </div>
        </div>
      )}

      {step === 'details' && mode === 'ROAD' && (
        <RoadStep presetMaterial={presetMaterial} onBusy={setBusy} onBack={() => setStep('mode')}
          onCreated={(lot) => finish(lot)} />
      )}
      {step === 'details' && mode === 'RAIL' && (
        <RailStep canImport={canAllocate} onBusy={setBusy} onBack={() => setStep('mode')}
          onImported={({ lot, materialCreated }) => finish(lot, materialCreated)} />
      )}

      {step === 'done' && received && (
        <div className={`${styles.stepPane} ${styles.doneBox}`}>
          <span className={styles.doneIcon}>{Icons.check}</span>
          <p className={uiStyles.strong}>
            Batch <span className={uiStyles.mono}>{received.lot.lotCode}</span> received · <ArrivalTag mode={received.lot.arrivalMode} />
          </p>
          <p className={uiStyles.muted}>
            {received.lot.material?.materialName} · {received.lot.quantity} {received.lot.unit}
            {received.materialCreated && ' · new material added to the materials list'}
          </p>
          {canAllocate ? (
            <div className={uiStyles.rowActions}>
              <Button onClick={onClose}>Do it later</Button>
              <Button variant="primary" icon={Icons.pin} onClick={() => onAllot(received.lot)}>Choose a storage spot</Button>
            </div>
          ) : (
            <>
              <Banner tone="info">It’s ready for a storage spot. A supervisor chooses the spot — you’ll see it in the Arriving tab.</Banner>
              <div className={uiStyles.rowActions}>
                <Button onClick={() => onAllot(received.lot)} icon={Icons.pin}>See suggested spots</Button>
                <Button variant="primary" onClick={onClose}>Done</Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

export default ReceiveMaterialDialog;
