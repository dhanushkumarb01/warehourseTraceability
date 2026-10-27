import { useState, useEffect } from 'react';
import { createLot, updateLot } from '../../services/lotService';
import { Modal, Field, Button, FormAlert } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';

function LotFormModal({ isOpen, mode, materialId, initialData, onClose, onSaved }) {
  const [formData, setFormData] = useState({
    lotCode: '',
    quantity: '',
    unit: 'kg',
    receivedDate: new Date().toISOString().split('T')[0],
    status: 'AVAILABLE',
    arrivalMode: ''
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
          status: 'AVAILABLE',
          arrivalMode: ''
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
      const { arrivalMode, ...rest } = formData;
      const payload = {
        ...rest,
        materialId,
        quantity: parseFloat(formData.quantity),
        // Captured at receipt only; later changes go through Material Bay Allocation.
        ...(mode !== 'edit' && arrivalMode ? { arrivalMode } : {})
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

  const field = (name) => ({ name, value: formData[name] ?? '', onChange: handleChange });

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={submitting}
      icon={Icons.box}
      title={mode === 'edit' ? `Edit batch ${initialData?.lotCode || ''}` : 'Add a batch'}
      subtitle="A batch (lot) is one delivery of a material."
      as="form"
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="primary" loading={submitting}>Save batch</Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{error}</FormAlert>
        <div className={uiStyles.formGrid}>
          <Field label="Batch code" required className={uiStyles.span2} hint="Usually printed on the delivery note">
            {(p) => <input {...p} {...field('lotCode')} type="text" required placeholder="e.g. LOT-2026-001" />}
          </Field>
          <Field label="Quantity" required>
            {(p) => <input {...p} {...field('quantity')} type="number" step="0.01" min="0.01" required placeholder="e.g. 100" />}
          </Field>
          <Field label="Unit" required>
            {(p) => (
              <select {...p} {...field('unit')} required>
                <option value="kg">kg</option>
                <option value="tons">tons</option>
                <option value="pcs">pieces</option>
                <option value="liters">litres</option>
                <option value="meters">metres</option>
              </select>
            )}
          </Field>
          <Field label="Date received" required>
            {(p) => <input {...p} {...field('receivedDate')} type="date" required />}
          </Field>
          <Field label="Status" help="Free: not stored yet. Stored: in a storage spot. Sent out: left the yard.">
            {(p) => (
              <select {...p} {...field('status')}>
                <option value="AVAILABLE">Free (not stored yet)</option>
                <option value="MAPPED">Stored</option>
                <option value="DISPATCHED">Sent out</option>
              </select>
            )}
          </Field>
          {mode !== 'edit' && (
            <Field label="How did it arrive?" optional className={uiStyles.span2} hint="You can record this later if you’re not sure.">
              {(p) => (
                <select {...p} {...field('arrivalMode')}>
                  <option value="">Not recorded yet</option>
                  <option value="RAIL">Rail</option>
                  <option value="ROAD">Road</option>
                </select>
              )}
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default LotFormModal;
