import { useState, useEffect } from 'react';
import { createLot, updateLot } from '../../services/lotService';
import styles from './LotFormModal.module.css';

function LotFormModal({ isOpen, mode, materialId, initialData, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    lotCode: '',
    quantity: '',
    unit: 'kg',
    receivedDate: new Date().toISOString().split('T')[0],
    status: 'AVAILABLE'
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        setFormData({
          lotCode: initialData.lotCode || '',
          quantity: initialData.quantity || '',
          unit: initialData.unit || 'kg',
          receivedDate: initialData.receivedDate ? new Date(initialData.receivedDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
          status: initialData.status || 'AVAILABLE'
        });
      } else {
        setFormData({
          lotCode: '',
          quantity: '',
          unit: 'kg',
          receivedDate: new Date().toISOString().split('T')[0],
          status: 'AVAILABLE'
        });
      }
      setError(null);
    }
  }, [isOpen, mode, initialData]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        ...formData,
        materialId,
        quantity: parseFloat(formData.quantity)
      };

      if (mode === 'edit') {
        await updateLot(initialData.id, payload);
      } else {
        await createLot(payload);
      }
      onSaved();
    } catch (err) {
      const apiErrors = err.errors;
      if (apiErrors?.length) {
        setError(apiErrors.map(e => e.message).join(' '));
      } else {
        setError(err.message || 'An error occurred while saving.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2>{mode === 'edit' ? 'Edit Lot' : 'Create Lot'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorText}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="lotCode">Lot Code *</label>
            <input
              id="lotCode"
              name="lotCode"
              type="text"
              required
              value={formData.lotCode}
              onChange={handleChange}
              placeholder="e.g. LOT-2026-001"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label htmlFor="quantity">Quantity *</label>
              <input
                id="quantity"
                name="quantity"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={formData.quantity}
                onChange={handleChange}
                placeholder="e.g. 100"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="unit">Unit *</label>
              <select
                id="unit"
                name="unit"
                required
                value={formData.unit}
                onChange={handleChange}
              >
                <option value="kg">kg</option>
                <option value="tons">tons</option>
                <option value="pcs">pcs</option>
                <option value="liters">liters</option>
                <option value="meters">meters</option>
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label htmlFor="receivedDate">Received Date *</label>
              <input
                id="receivedDate"
                name="receivedDate"
                type="date"
                required
                value={formData.receivedDate}
                onChange={handleChange}
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="status">Status</label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="MAPPED">MAPPED</option>
                <option value="DISPATCHED">DISPATCHED</option>
              </select>
            </div>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Lot'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LotFormModal;
