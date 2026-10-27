/**
 * Bay-allocation dialogs used by the Inbound & Storage page:
 *   ArrivalModeDialog     record Rail / Road
 *   AllocationDialog      review recommendations → choose a bay → confirm
 *   ConfirmPlacementDialog operator confirms the lot is in the allotted bay
 *   CancelAllocationDialog supervisor withdraws an allotment
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Field, Button, FormAlert, Banner, Tag, ArrivalTag, LoadingRows, StatePanel } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import { fetchRecommendations } from '../../services/placementService';
import styles from './InboundStorage.module.css';

const lotLine = (lot) =>
  [lot?.material?.materialName, lot && `${lot.quantity} ${lot.unit}`].filter(Boolean).join(' · ');

const titleCase = (s) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : '');

// ─── Arrival mode ─────────────────────────────────────────────────────────────

const MODES = [
  { value: 'RAIL', label: 'Rail', icon: Icons.train, desc: 'Arrived on a wagon at a rail siding.' },
  { value: 'ROAD', label: 'Road', icon: Icons.truck, desc: 'Arrived on a truck through the gate.' },
];

export function ArrivalModeDialog({ lot, onClose, onSave }) {
  const [mode, setMode] = useState(lot?.arrivalMode || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { setMode(lot?.arrivalMode || ''); setError(null); }, [lot]);

  const submit = async (e) => {
    e.preventDefault();
    if (!mode) { setError('Choose Rail or Road.'); return; }
    setSaving(true);
    setError(null);
    try { await onSave(lot, mode); } catch (err) { setError(err.message || 'Could not save.'); } finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen={Boolean(lot)} onClose={onClose} busy={saving} size="sm" as="form" onSubmit={submit}
      icon={Icons.route}
      title="Record arrival mode"
      subtitle={lot && <><span className={uiStyles.mono}>{lot.lotCode}</span> · {lotLine(lot)}</>}
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving} disabled={!mode}>Save arrival mode</Button>
        </>
      )}
    >
      <FormAlert>{error}</FormAlert>
      <div className={styles.choiceGrid} role="radiogroup" aria-label="Arrival mode">
        {MODES.map((m) => (
          <label key={m.value} className={`${styles.choice} ${mode === m.value ? styles.choiceActive : ''}`}>
            <input type="radio" name="arrivalMode" value={m.value} checked={mode === m.value}
              onChange={() => setMode(m.value)} className={styles.srOnly} />
            <span className={styles.choiceIcon}>{m.icon}</span>
            <span className={styles.choiceLabel}>{m.label}</span>
            <span className={styles.choiceDesc}>{m.desc}</span>
          </label>
        ))}
      </div>
      <p className={`${uiStyles.hint} ${uiStyles.spaced}`}>
        Record this before choosing a storage spot. It decides which loading docks and yard areas are suggested, and it can’t be changed once a spot is chosen.
      </p>
    </Modal>
  );
}

// ─── Allocation ───────────────────────────────────────────────────────────────

function RecommendationCard({ c, selected, onSelect, readOnly }) {
  return (
    <label className={`${styles.recCard} ${selected ? styles.recCardActive : ''} ${readOnly ? styles.recCardStatic : ''}`}>
      {!readOnly && (
        <input type="radio" name="bay" className={styles.srOnly} checked={selected} onChange={() => onSelect(c.bay.id)} />
      )}
      <div className={styles.recTop}>
        <Tag tone={c.rank === 1 ? 'info' : 'neutral'}>#{c.rank} suggestion</Tag>
        {c.isEmpty ? <Tag tone="success">Empty</Tag> : <Tag tone="warning">Holds {c.lotCount} batch{c.lotCount === 1 ? '' : 'es'}</Tag>}
      </div>
      <div className={styles.recBay}>
        <span className={uiStyles.mono}>{c.bay.bayCode}</span>
        <span className={uiStyles.sub}>{c.bay.bayName} · {c.bay.zone}</span>
      </div>
      <div className={styles.recDistance}>
        <span className={styles.recDistanceValue}>{c.distanceLabel}</span>
        <span className={uiStyles.sub}>straight-line to {c.dock.dockCode}</span>
      </div>
      <ul className={styles.reasonList}>
        {c.reasons.slice(1).map((r) => <li key={r}>{r}</li>)}
        {c.notes.map((n) => <li key={n} className={styles.reasonNote}>{n}</li>)}
      </ul>
    </label>
  );
}

function BayRow({ entry, selectable, selected, onSelect, extra }) {
  return (
    <tr className={selected ? styles.rowSelected : undefined}>
      <td className={styles.radioCell}>
        {selectable && (
          <input type="radio" name="bay" aria-label={`Select ${entry.bay.bayCode}`}
            checked={selected} onChange={() => onSelect(entry.bay.id)} />
        )}
      </td>
      <td>
        <span className={uiStyles.mono}>{entry.bay.bayCode}</span>
        <span className={uiStyles.sub}>{entry.bay.zone}</span>
      </td>
      {extra}
    </tr>
  );
}

function Section({ title, count, defaultOpen = false, children }) {
  if (!count) return null;
  return (
    <details className={styles.section} open={defaultOpen}>
      <summary className={styles.sectionSummary}>{title} <span className={uiStyles.soft}>({count})</span></summary>
      <div className={uiStyles.tableWrap}>{children}</div>
    </details>
  );
}

/**
 * Recommendations + bay choice + explicit review step before allotting.
 * `canAllocate` false → read-only view of the suggestions. Mount with
 * key={lot.id} so each lot starts from a clean state.
 */
export function AllocationDialog({ lot, config, canAllocate, onClose, onAllocate }) {
  const [demandLevel, setDemandLevel] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [bayId, setBayId] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [step, setStep] = useState('choose');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = useCallback(async () => {
    if (!lot) return;
    setLoading(true);
    setLoadError(null);
    try {
      const result = await fetchRecommendations(lot.id, demandLevel || undefined);
      setData(result);
      setBayId((current) => current ?? result.recommendations[0]?.bay.id ?? null);
    } catch (err) {
      setLoadError(err.message || 'Could not load recommendations.');
    } finally {
      setLoading(false);
    }
  }, [lot, demandLevel]);

  useEffect(() => { load(); }, [load]);

  const selected = useMemo(() => {
    if (!data || !bayId) return null;
    return data.candidates.find((c) => c.bay.id === bayId)
      || data.unranked.find((u) => u.bay.id === bayId)
      || null;
  }, [data, bayId]);

  if (!lot) return null;

  const others = data?.candidates.filter((c) => !c.recommended) || [];
  const configuredLevel = data && data.demand.source !== 'MANUAL_OVERRIDE' ? data.demand.level : null;

  const submit = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onAllocate({ lotId: lot.id, bayId, demandLevel: demandLevel || undefined, remarks: remarks.trim() || undefined });
    } catch (err) {
      setSaveError(err.message || 'Allocation failed.');
      setStep('choose');
      load();
    } finally {
      setSaving(false);
    }
  };

  const footer = !canAllocate ? (
    <Button onClick={onClose}>Close</Button>
  ) : step === 'review' ? (
    <>
      <Button onClick={() => setStep('choose')} disabled={saving}>Back</Button>
      <Button variant="primary" loading={saving} icon={Icons.check} onClick={submit}>Confirm this spot</Button>
    </>
  ) : (
    <>
      <Button onClick={onClose}>Cancel</Button>
      <Button variant="primary" disabled={!selected} icon={Icons.arrowRight} onClick={() => setStep('review')}>Review choice</Button>
    </>
  );

  const footerNote = canAllocate && step === 'choose' && selected
    ? <>Selected <strong className={uiStyles.mono}>{selected.bay.bayCode}</strong>{selected.distanceLabel ? ` · ${selected.distanceLabel}` : ''}</>
    : null;

  return (
    <Modal
      isOpen onClose={onClose} busy={saving} size="lg"
      icon={Icons.pin}
      title={step === 'review' ? 'Confirm the storage spot' : canAllocate ? 'Choose a storage spot' : 'Suggested storage spots'}
      subtitle={<><span className={uiStyles.mono}>{lot.lotCode}</span> · {lotLine(lot)} · <ArrivalTag mode={lot.arrivalMode} /></>}
      footer={footer}
      footerNote={footerNote}
    >
      {step === 'review' && selected ? (
        <div className={uiStyles.formSection}>
          <FormAlert>{saveError}</FormAlert>
          <dl className={styles.summaryList}>
            <dt>Lot</dt><dd><span className={uiStyles.mono}>{lot.lotCode}</span> · {lotLine(lot)}</dd>
            <dt>Bay</dt><dd><span className={uiStyles.mono}>{selected.bay.bayCode}</span> · {selected.bay.bayName} · {selected.bay.zone}</dd>
            <dt>Loading dock</dt><dd>{selected.dock ? selected.dock.dockCode : <span className={uiStyles.muted}>Not determined</span>}</dd>
            <dt>Distance</dt>
            <dd>{selected.distanceLabel ? `${selected.distanceLabel} straight-line` : <span className={uiStyles.muted}>Not available — {selected.reasons?.[0]}</span>}</dd>
            <dt>Suggestion</dt>
            <dd>
              {selected.recommended ? `#${selected.rank} of the suggested bays`
                : selected.rank ? `Ranked #${selected.rank}, not among the top suggestions` : 'Not ranked'}
              {' '}· demand {titleCase(data.demand.level)} ({data.demand.source === 'MANUAL_OVERRIDE' ? 'chosen by you' : 'placeholder'})
            </dd>
            {remarks.trim() && (<><dt>Remarks</dt><dd>{remarks.trim()}</dd></>)}
          </dl>
          <Banner tone="info">
            The bay is reserved for this lot. An operator then confirms the physical placement, which updates
            bay occupancy and the movement history.
          </Banner>
        </div>
      ) : (
        <>
          <FormAlert>{saveError}</FormAlert>
          <div className={styles.dialogToolbar}>
            <Field label="Demand level used for ranking" className={styles.demandField}
              hint={data ? data.demand.explanation : 'Static placeholder — not derived from dispatch history.'}>
              {(p) => (
                <select {...p} value={demandLevel} onChange={(e) => { setDemandLevel(e.target.value); setBayId(null); }}>
                  <option value="">Configured{configuredLevel ? ` (${titleCase(configuredLevel)})` : ''}</option>
                  {(config?.demandLevels || ['HIGH', 'MEDIUM', 'LOW']).map((l) => (
                    <option key={l} value={l}>What if demand is {titleCase(l)}</option>
                  ))}
                </select>
              )}
            </Field>
            <p className={styles.methodNote}>
              <strong>{config?.method?.label || 'Static placeholder rule'}.</strong>{' '}
              High demand prefers bays nearest the dock, low demand bays farther away.
              Distances are straight-line between coordinates, not the actual travel route.
            </p>
          </div>

          {loading && !data ? <LoadingRows rows={3} /> : loadError ? (
            <StatePanel kind="error" title="Couldn’t load suggestions" message={loadError} action={<Button onClick={load}>Try again</Button>} />
          ) : data && (
            <>
              {data.warnings.map((w) => <Banner key={w} tone="warning" className={uiStyles.spaced}>{w}</Banner>)}

              {data.recommendations.length > 0 && (
                <>
                  <h3 className={styles.blockTitle}>Suggested bays</h3>
                  <div className={styles.recGrid} role="radiogroup" aria-label="Suggested bays">
                    {data.recommendations.map((c) => (
                      <RecommendationCard key={c.bay.id} c={c} selected={bayId === c.bay.id} onSelect={setBayId} readOnly={!canAllocate} />
                    ))}
                  </div>
                </>
              )}

              <Section title="Other eligible bays" count={others.length}>
                <table className={uiStyles.table}>
                  <thead><tr><th aria-label="Select" /><th>Storage spot</th><th>Rank</th><th>Distance</th><th>Dock</th><th>What’s there</th></tr></thead>
                  <tbody>
                    {others.map((c) => (
                      <BayRow key={c.bay.id} entry={c} selectable={canAllocate} selected={bayId === c.bay.id} onSelect={setBayId}
                        extra={(<>
                          <td>#{c.rank}</td>
                          <td>{c.distanceLabel}</td>
                          <td className={uiStyles.mono}>{c.dock.dockCode}</td>
                          <td>{c.isEmpty ? 'Empty' : `${c.lotCount} batch${c.lotCount === 1 ? '' : 'es'}`}</td>
                        </>)} />
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="Bays without a distance" count={data.unranked.length} defaultOpen={!data.candidates.length}>
                <table className={uiStyles.table}>
                  <thead><tr><th aria-label="Select" /><th>Storage spot</th><th>Why no distance</th></tr></thead>
                  <tbody>
                    {data.unranked.map((u) => (
                      <BayRow key={u.bay.id} entry={u} selectable={canAllocate} selected={bayId === u.bay.id} onSelect={setBayId}
                        extra={<td className={uiStyles.muted}>{u.reasons.join(' ')}</td>} />
                    ))}
                  </tbody>
                </table>
              </Section>

              <Section title="Not eligible" count={data.excluded.length}>
                <table className={uiStyles.table}>
                  <thead><tr><th aria-label="Select" /><th>Storage spot</th><th>Reason</th></tr></thead>
                  <tbody>
                    {data.excluded.map((x) => (
                      <BayRow key={x.bay.id} entry={x} selectable={false} extra={<td className={uiStyles.muted}>{x.reasons.join(' ')}</td>} />
                    ))}
                  </tbody>
                </table>
              </Section>

              {canAllocate && (
                <Field label="Remarks" optional className={uiStyles.spaced}>
                  {(p) => <textarea {...p} rows={2} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)}
                    placeholder="e.g. Keep near the coil shear for Monday's dispatch" />}
                </Field>
              )}
            </>
          )}
        </>
      )}
    </Modal>
  );
}

// ─── Placement confirmation / cancellation ───────────────────────────────────

export function ConfirmPlacementDialog({ lot, onClose, onConfirm }) {
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setRemarks(''); setError(null); }, [lot]);
  const alloc = lot?.openAllocation;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try { await onConfirm(lot, remarks.trim() || undefined); } catch (err) { setError(err.message || 'Could not confirm.'); } finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen={Boolean(lot)} onClose={onClose} busy={saving} size="sm" as="form" onSubmit={submit}
      icon={Icons.check}
      title="Confirm placement"
      subtitle="Confirm only once the material is physically in the bay."
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Not yet</Button>
          <Button type="submit" variant="success" loading={saving} icon={Icons.check}>Confirm placed</Button>
        </>
      )}
    >
      {alloc && (
        <div className={uiStyles.formSection}>
          <FormAlert>{error}</FormAlert>
          <dl className={styles.summaryList}>
            <dt>Lot</dt><dd><span className={uiStyles.mono}>{lot.lotCode}</span> · {lotLine(lot)}</dd>
            <dt>Allotted bay</dt><dd><span className={uiStyles.mono}>{alloc.bay.bayCode}</span> · {alloc.bay.zone}</dd>
            <dt>Chosen by</dt><dd>{alloc.allocator?.username || '—'}</dd>
          </dl>
          <Field label="Remarks" optional>
            {(p) => <textarea {...p} rows={2} maxLength={500} value={remarks} onChange={(e) => setRemarks(e.target.value)} />}
          </Field>
        </div>
      )}
    </Modal>
  );
}

export function CancelAllocationDialog({ lot, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => { setReason(''); setError(null); }, [lot]);
  const alloc = lot?.openAllocation;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try { await onConfirm(lot, reason.trim() || undefined); } catch (err) { setError(err.message || 'Could not cancel.'); } finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen={Boolean(lot)} onClose={onClose} busy={saving} size="sm" as="form" onSubmit={submit}
      icon={Icons.warning}
      title="Release this storage spot?"
      subtitle={alloc && <>Release bay <span className={uiStyles.mono}>{alloc.bay.bayCode}</span> for lot <span className={uiStyles.mono}>{lot.lotCode}</span>.</>}
      footer={(
        <>
          <Button onClick={onClose} disabled={saving}>Keep the spot</Button>
          <Button type="submit" variant="dangerSolid" loading={saving}>Release spot</Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{error}</FormAlert>
        <p className={uiStyles.muted}>The batch goes back to “Needs a storage spot” and the spot becomes free. This change is kept in the activity log.</p>
        <Field label="Reason" optional>
          {(p) => <textarea {...p} rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Spot needed for an urgent coil" />}
        </Field>
      </div>
    </Modal>
  );
}

