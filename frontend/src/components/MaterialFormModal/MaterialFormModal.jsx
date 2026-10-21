import { useState, useEffect } from 'react';
import { createMaterial, updateMaterial } from '../../services/materialService';
import styles from './MaterialFormModal.module.css';

function MaterialFormModal({ isOpen, mode, initialData, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    materialCode: '',
    materialName: '',
    materialType: '',
    manufacturer: '',
    supplier: '',
    description: '',
    status: 'ACTIVE'
  });
  
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        setFormData({
          materialCode: initialData.materialCode || '',
          materialName: initialData.materialName || '',
          materialType: initialData.materialType || '',
          manufacturer: initialData.manufacturer || '',
          supplier: initialData.supplier || '',
          description: initialData.description || '',
          status: initialData.status || 'ACTIVE'
        });
      } else {
        setFormData({
          materialCode: '',
          materialName: '',
          materialType: '',
          manufacturer: '',
          supplier: '',
          description: '',
          status: 'ACTIVE'
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
      if (mode === 'edit') {
        await updateMaterial(initialData.id, formData);
      } else {
        await createMaterial(formData);
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
          <h2>{mode === 'edit' ? 'Edit Material' : 'Create Material'}</h2>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {error && <div className={styles.errorText}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.formGroup}>
            <label htmlFor="materialCode">Material Code *</label>
            <input
              id="materialCode"
              name="materialCode"
              type="text"
              required
              value={formData.materialCode}
              onChange={handleChange}
              placeholder="e.g. STL-COIL-01"
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="materialName">Material Name *</label>
            <input
              id="materialName"
              name="materialName"
              type="text"
              required
              value={formData.materialName}
              onChange={handleChange}
              placeholder="e.g. Steel Coil 50mm"
            />
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label htmlFor="materialType">Type *</label>
              <input
                id="materialType"
                name="materialType"
                type="text"
                required
                value={formData.materialType}
                onChange={handleChange}
                placeholder="e.g. Raw Material"
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
                <option value="ACTIVE">ACTIVE</option>
                <option value="INACTIVE">INACTIVE</option>
              </select>
            </div>
          </div>

          <div className={styles.row}>
            <div className={styles.formGroup}>
              <label htmlFor="manufacturer">Manufacturer</label>
              <input
                id="manufacturer"
                name="manufacturer"
                type="text"
                value={formData.manufacturer}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="supplier">Supplier</label>
              <input
                id="supplier"
                name="supplier"
                type="text"
                value={formData.supplier}
                onChange={handleChange}
                placeholder="Optional"
              />
            </div>
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Optional description..."
            />
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Material'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default MaterialFormModal;
