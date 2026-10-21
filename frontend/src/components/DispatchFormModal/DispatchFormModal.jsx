/**
 * DispatchFormModal — create a dispatch request.
 *
 * Only mapped lots can be dispatched, so the lot picker is sourced from the
 * active inventory (each option is a lot currently stored in a bay). The
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

  if (!isOpen) return null;

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
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6m0 0V9.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0015.5 6H13" />
              </svg>
            </div>
            <div>
              <h2 className={styles.title}>New Dispatch Request</h2>
              <p className={styles.subtitle}>Request a mapped lot for dispatch — pending supervisor approval.</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <form className={styles.body} onSubmit={handleSubmit}>
          {error && <div className={styles.errorBanner}>{error}</div>}

          <div className={styles.field}>
            <label className={styles.label}>Material Lot</label>
            <select className={styles.select} value={lotId} onChange={(e) => { setLotId(e.target.value); setQuantity(''); }} required>
              <option value="">Select a mapped lot…</option>
              {inventory.map((m) => (
                <option key={m.id} value={m.lot?.id}>
                  {m.lot?.lotCode}{m.lot?.material?.materialName ? ` — ${m.lot.material.materialName}` : ''} · {m.bay?.bayCode} ({m.lot?.quantity} {m.lot?.unit})
                </option>
              ))}
            </select>
            {inventory.length === 0 && <p className={styles.hint}>No mapped lots are available to dispatch.</p>}
          </div>

          {selected && (
            <div className={styles.summary}>
              <span>From bay <strong>{selected.bay?.bayCode}</strong> · Zone {selected.bay?.zone}</span>
              <span>Available: <strong>{maxQty} {selected.lot?.unit}</strong></span>
            </div>
          )}

          <div className={styles.row}>
            <div className={styles.field}>
              <label className={styles.label}>Requested Quantity</label>
              <input
                className={styles.input}
                type="number" min="0" step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={selected ? `Max ${maxQty}` : '—'}
                disabled={!selected}
                required
              />
              {selected && quantity !== '' && !qtyValid && (
                <p className={styles.hint}>Enter a quantity between 0 and {maxQty}.</p>
              )}
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Vehicle Number <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. KA-01-AB-1234" maxLength={50} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Remarks <span className={styles.optional}>(optional)</span></label>
            <textarea className={styles.textarea} value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Customer PO-5567" />
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={!canSubmit}>{isSubmitting ? 'Submitting…' : 'Create Request'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default DispatchFormModal;
