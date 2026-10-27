import { useState, useEffect } from 'react';
import { createMaterial, updateMaterial } from '../../services/materialService';
import { Modal, Field, Button, FormAlert } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';

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

  const field = (name) => ({ name, value: formData[name] ?? '', onChange: handleChange });

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={submitting}
      icon={Icons.layers}
      title={mode === 'edit' ? `Edit ${initialData?.materialName || 'material'}` : 'Add a material'}
      subtitle="A material is a type of item, like Steel Coil. Each delivery of it becomes a batch."
      as="form"
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="primary" loading={submitting}>Save material</Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <FormAlert>{error}</FormAlert>
        <p className={uiStyles.sectionTitle}>What is it?</p>
        <div className={uiStyles.formGrid}>
          <Field label="Material code" required hint="Your internal or SAP code">
            {(p) => <input {...p} {...field('materialCode')} type="text" required placeholder="e.g. STL-COIL-01" />}
          </Field>
          <Field label="Name" required>
            {(p) => <input {...p} {...field('materialName')} type="text" required placeholder="e.g. Steel coil 50 mm" />}
          </Field>
          <Field label="Type" required hint="A simple group, e.g. Raw material">
            {(p) => <input {...p} {...field('materialType')} type="text" required placeholder="e.g. Raw material" />}
          </Field>
          <Field label="Status" help="Inactive materials stay in the list but can’t receive new batches.">
            {(p) => (
              <select {...p} {...field('status')}>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            )}
          </Field>
        </div>
      </div>
      <div className={uiStyles.formSection}>
        <p className={uiStyles.sectionTitle}>Where does it come from?</p>
        <div className={uiStyles.formGrid}>
          <Field label="Manufacturer" optional>
            {(p) => <input {...p} {...field('manufacturer')} type="text" placeholder="Who makes it" />}
          </Field>
          <Field label="Supplier" optional>
            {(p) => <input {...p} {...field('supplier')} type="text" placeholder="Who delivers it" />}
          </Field>
          <Field label="Description" optional className={uiStyles.span2}>
            {(p) => <textarea {...p} {...field('description')} placeholder="Anything that helps people recognise it" />}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export default MaterialFormModal;
