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
import { Modal, Field, Button, FormAlert, Banner } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
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
    <Modal
      isOpen
      onClose={onClose}
      busy={isSubmitting}
      icon={isMove ? Icons.arrowRight : Icons.pin}
      title={isMove ? 'Move to another storage spot' : 'Put a batch in a storage spot'}
      subtitle={isMove ? 'Its movement history is kept.' : 'Choose the batch and where it is now stored.'}
      as="form"
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Icons.check} loading={isSubmitting} disabled={!canSubmit}>
            {isMove ? 'Move batch' : 'Confirm storage spot'}
          </Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{error}</FormAlert>

        {isMove || lot ? (
          <div className={styles.fixedValue}>
            <span className={styles.fixedIcon}>{Icons.box}</span>
            <span className={styles.fixedText}>
              <span className={uiStyles.strong}>{lot?.material?.materialName || 'Batch'}</span>
              <span className={uiStyles.sub}>Batch <span className={uiStyles.mono}>{lot?.lotCode}</span></span>
            </span>
          </div>
        ) : (
          <Field label="Which batch?" required>
            {(p) => (
              <select {...p} value={lotId} onChange={(e) => setLotId(e.target.value)} required>
                <option value="">Choose a batch that isn’t stored yet…</option>
                {availableLots.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.material?.materialName ? `${l.material.materialName} — ` : ''}{l.lotCode} ({l.quantity} {l.unit})
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {!isMove && availableLots.length === 0 && !lot && (
          <Banner tone="info">Every batch is already stored or sent out, so there’s nothing to place.</Banner>
        )}

        <Field label={isMove ? 'Move it to' : 'Storage spot'} required hint="Spots that are out of use can’t be chosen.">
          {(p) => (
            <select {...p} value={bayId} onChange={(e) => setBayId(e.target.value)} required>
              <option value="">Choose a storage spot…</option>
              {selectableBays.map((b) => (
                <option key={b.id} value={b.id} disabled={b.status === 'INACTIVE'}>
                  {b.bayCode} — {b.bayName} · {b.zone}
                  {b.status === 'INACTIVE' ? ' (out of use)' : b.status === 'OCCUPIED' ? ' (in use)' : ' (free)'}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Note" optional>
          {(p) => <textarea {...p} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Delivery note GRN-1042, waiting for quality check" rows={2} maxLength={500} />}
        </Field>
      </div>
    </Modal>
  );
}

export default MappingModal;
