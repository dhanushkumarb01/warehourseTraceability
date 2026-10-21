/**
 * MappingModal Component
 *
 * Manual (dropdown-driven) mapping for two intents:
 *   - mode="map":  place an AVAILABLE lot into a bay (first-time mapping).
 *   - mode="move": relocate an already-mapped lot to a different bay.
 *
 * Keeps the camera-free workflow explicit and auditable. The dual-QR scan path
 * lives in ScanMappingModal — this modal is the deliberate, point-and-click
 * counterpart used from the inventory table and bay/lot detail screens.
 *
 * Props:
 *   isOpen        {boolean}
 *   mode          {'map'|'move'}
 *   lot           {object|null}   preselected lot (required for move; optional for map)
 *   availableLots {Array}         selectable lots (map mode) — typically status AVAILABLE
 *   bays          {Array}         all bays (INACTIVE are shown disabled)
 *   currentBayId  {string|null}   lot's current bay (move mode) — excluded from targets
 *   isSubmitting  {boolean}
 *   error         {string|null}
 *   onClose       {function}
 *   onSubmit      {function(payload)}  payload: {lotId,bayId,remarks} (map) | {lotId,toBayId,remarks} (move)
 */

import { useEffect, useState } from 'react';
import styles from './MappingModal.module.css';

function MappingModal({
  isOpen,
  mode = 'map',
  lot = null,
  availableLots = [],
  bays = [],
  currentBayId = null,
  isSubmitting = false,
  error = null,
  onClose,
  onSubmit,
}) {
  const [lotId, setLotId] = useState('');
  const [bayId, setBayId] = useState('');
  const [remarks, setRemarks] = useState('');

  // Reset form whenever the modal opens or the target lot changes.
  useEffect(() => {
    if (!isOpen) return;
    setLotId(lot?.id || '');
    setBayId('');
    setRemarks('');
  }, [isOpen, lot]);

  if (!isOpen) return null;

  const isMove = mode === 'move';
  const selectableBays = bays.filter((b) => b.id !== currentBayId);
  const canSubmit = Boolean(lotId) && Boolean(bayId) && !isSubmitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmed = remarks.trim() || null;
    if (isMove) {
      onSubmit({ lotId, toBayId: bayId, remarks: trimmed });
    } else {
      onSubmit({ lotId, bayId, remarks: trimmed });
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="mapping-modal-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17H5V5h8v6m0 6h6v-6h-6m0-6l6 6" />
              </svg>
            </div>
            <div>
              <h2 id="mapping-modal-title" className={styles.title}>
                {isMove ? 'Move Material' : 'Map Material to Bay'}
              </h2>
              <p className={styles.subtitle}>
                {isMove
                  ? 'Relocate this lot to a different bay — history is preserved.'
                  : 'Place a material lot into a warehouse bay.'}
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Lot selection */}
          <div className={styles.field}>
            <label className={styles.label}>Material Lot</label>
            {isMove || lot ? (
              <div className={styles.fixedValue}>
                <span className={styles.code}>{lot?.lotCode}</span>
                {lot?.material?.materialName && (
                  <span className={styles.muted}>{lot.material.materialName}</span>
                )}
              </div>
            ) : (
              <select
                className={styles.select}
                value={lotId}
                onChange={(e) => setLotId(e.target.value)}
                required
              >
                <option value="">Select an available lot…</option>
                {availableLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotCode}
                    {l.material?.materialName ? ` — ${l.material.materialName}` : ''} ({l.quantity} {l.unit})
                  </option>
                ))}
              </select>
            )}
            {!isMove && availableLots.length === 0 && !lot && (
              <p className={styles.hint}>No available lots. Every lot is already mapped or dispatched.</p>
            )}
          </div>

          {/* Bay selection */}
          <div className={styles.field}>
            <label className={styles.label}>{isMove ? 'Destination Bay' : 'Target Bay'}</label>
            <select
              className={styles.select}
              value={bayId}
              onChange={(e) => setBayId(e.target.value)}
              required
            >
              <option value="">Select a bay…</option>
              {selectableBays.map((b) => (
                <option key={b.id} value={b.id} disabled={b.status === 'INACTIVE'}>
                  {b.bayCode} — {b.bayName} · {b.zone}
                  {b.status === 'INACTIVE' ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Remarks */}
          <div className={styles.field}>
            <label className={styles.label}>Remarks <span className={styles.optional}>(optional)</span></label>
            <textarea
              className={styles.textarea}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Inbound GRN-1042, staged for QC"
              rows={2}
              maxLength={500}
            />
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>
              {isSubmitting ? 'Saving…' : isMove ? 'Confirm Move' : 'Confirm Mapping'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MappingModal;
