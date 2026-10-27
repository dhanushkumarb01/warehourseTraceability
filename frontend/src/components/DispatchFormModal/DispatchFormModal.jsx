/**
 * DispatchFormModal — create an outgoing-truck (dispatch) request.
 *
 * Only stored batches can be sent out, so the picker is sourced from the
 * active inventory (each option is a batch currently in a storage spot). The
 * backend re-validates eligibility, quantity and duplicate-prevention.
 *
 * Props:
 *   isOpen        {boolean}
 *   inventory     {Array}    active mappings (lot + material + bay)
 *   isSubmitting  {boolean}
 *   error         {string|null}
 *   onClose       {function}
 *   onSubmit      {function({ lotId, requestedQuantity, vehicleNumber, remarks })}
 */

import { useEffect, useMemo, useState } from 'react';
import { Modal, Field, Button, FormAlert, Banner } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from './DispatchFormModal.module.css';

function DispatchFormModal({ isOpen, inventory = [], isSubmitting = false, error = null, onClose, onSubmit }) {
  const [lotId, setLotId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [remarks, setRemarks] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLotId(''); setQuantity(''); setVehicleNumber(''); setRemarks('');
  }, [isOpen]);

  const selected = useMemo(() => inventory.find((m) => m.lot?.id === lotId), [inventory, lotId]);

  const maxQty = selected?.lot?.quantity ?? 0;
  const qtyNum = parseFloat(quantity);
  const qtyValid = quantity !== '' && qtyNum > 0 && qtyNum <= maxQty;
  const canSubmit = Boolean(lotId) && qtyValid && !isSubmitting;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      lotId,
      requestedQuantity: qtyNum,
      vehicleNumber: vehicleNumber.trim() || null,
      remarks: remarks.trim() || null,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
      icon={Icons.truckOut}
      title="Send a batch out"
      subtitle="A supervisor approves the request before the truck can leave."
      as="form"
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isSubmitting} disabled={!canSubmit} icon={Icons.check}>Send request</Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{error}</FormAlert>
        {inventory.length === 0 && (
          <Banner tone="warning">Nothing is in storage right now, so there’s nothing to send out.</Banner>
        )}

        <Field label="Which batch?" required hint="Only batches that are in a storage spot are listed.">
          {(p) => (
            <select {...p} value={lotId} onChange={(e) => { setLotId(e.target.value); setQuantity(''); }} disabled={inventory.length === 0}>
              <option value="">Choose a stored batch…</option>
              {inventory.map((m) => (
                <option key={m.id} value={m.lot?.id}>
                  {m.lot?.material?.materialName ? `${m.lot.material.materialName} — ` : ''}{m.lot?.lotCode} · spot {m.bay?.bayCode} ({m.lot?.quantity} {m.lot?.unit})
                </option>
              ))}
            </select>
          )}
        </Field>

        {selected && (
          <div className={styles.summary}>
            <span>{Icons.pin}From spot <strong>{selected.bay?.bayCode}</strong>{selected.bay?.zone ? ` · ${selected.bay.zone}` : ''}</span>
            <span>{Icons.box}In stock: <strong className="wt-num">{maxQty} {selected.lot?.unit}</strong></span>
          </div>
        )}

        <div className={uiStyles.formGrid}>
          <Field
            label="How much?"
            required
            hint={selected ? `Up to ${maxQty} ${selected.lot?.unit}` : 'Choose a batch first'}
            error={selected && quantity !== '' && !qtyValid ? `Enter an amount between 0 and ${maxQty}.` : undefined}
          >
            {(p) => (
              <input {...p} type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                placeholder={selected ? `e.g. ${maxQty}` : '—'} disabled={!selected} />
            )}
          </Field>
          <Field label="Truck number" optional>
            {(p) => <input {...p} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. KA-01-AB-1234" maxLength={50} />}
          </Field>
          <Field label="Note" optional className={uiStyles.span2}>
            {(p) => <textarea {...p} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Customer order PO-5567" />}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export default DispatchFormModal;
