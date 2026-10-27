/**
 * BayForm Component
 *
 * Shared modal form used for both Create Bay and Edit Bay operations.
 * Field-level validation mirrors backend rules exactly (single source of
 * truth being the backend; this is client-side defence-in-depth).
 *
 * polygonCoordinates:
 *   Added as an optional 4-corner input section.
 *   Users enter Corner 1–4 lat/lng.
 *   If all 4 corners are blank, null is sent (no boundary defined).
 *   If any corner is partially filled, the field is validated.
 *   Corners are sent as [[lat,lng], [lat,lng], [lat,lng], [lat,lng]].
 *
 * Props:
 *   isOpen      {boolean}         — controls modal visibility
 *   onClose     {function}        — called when modal is dismissed
 *   onSubmit    {function}        — called with validated form data
 *   initialData {object|null}     — pre-fills form for edit mode
 *   isLoading   {boolean}         — disables submit while request is in flight
 *   mode        {'create'|'edit'} — controls heading and button text
 */

import { useState, useEffect } from 'react';
import { Modal, Field, Button, FormAlert } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from './BayForm.module.css';

const EMPTY_CORNER = { lat: '', lng: '' };

const EMPTY_FORM = {
  bayCode:   '',
  bayName:   '',
  zone:      '',
  latitude:  '',
  longitude: '',
  status:    'AVAILABLE',
  corners:   [
    { ...EMPTY_CORNER },
    { ...EMPTY_CORNER },
    { ...EMPTY_CORNER },
    { ...EMPTY_CORNER },
  ],
};

const STATUS_OPTIONS = [
  { value: 'AVAILABLE', label: 'Free — ready to take material' },
  { value: 'OCCUPIED',  label: 'In use — material stored'  },
  { value: 'INACTIVE',  label: 'Out of use — closed'  },
];

const CORNER_LABELS = ['Top-left (NW)', 'Top-right (NE)', 'Bottom-right (SE)', 'Bottom-left (SW)'];

/**
 * Parse a polygonCoordinates array (from the API) into the 4-corner form format.
 * Pads with empty corners if fewer than 4 coordinates exist.
 */
function parsePolygonToCorners(polygonCoordinates) {
  const corners = [
    { ...EMPTY_CORNER },
    { ...EMPTY_CORNER },
    { ...EMPTY_CORNER },
    { ...EMPTY_CORNER },
  ];
  if (!Array.isArray(polygonCoordinates)) return corners;
  polygonCoordinates.slice(0, 4).forEach((pair, i) => {
    if (Array.isArray(pair) && pair.length === 2) {
      corners[i] = { lat: String(pair[0] ?? ''), lng: String(pair[1] ?? '') };
    }
  });
  return corners;
}

/**
 * Convert the 4-corner form values into a polygonCoordinates array.
 * Returns null if all corners are empty (no boundary defined).
 * Returns the array of filled corners only.
 */
function cornersToPolygon(corners) {
  const filled = corners.filter(c => c.lat.trim() !== '' || c.lng.trim() !== '');
  if (filled.length === 0) return null;
  return corners
    .filter(c => c.lat.trim() !== '' && c.lng.trim() !== '')
    .map(c => [parseFloat(c.lat), parseFloat(c.lng)]);
}

// Client-side validators
const validate = (data) => {
  const errors = {};

  if (!data.bayCode.trim())
    errors.bayCode = 'Enter the spot code, e.g. A-12.';
  else if (data.bayCode.trim().length > 50)
    errors.bayCode = 'Keep the spot code to 50 characters or fewer.';

  if (!data.bayName.trim())
    errors.bayName = 'Enter a name for this spot.';
  else if (data.bayName.trim().length > 100)
    errors.bayName = 'Keep the name to 100 characters or fewer.';

  if (!data.zone.trim())
    errors.zone = 'Choose or type the yard area.';

  const lat = parseFloat(data.latitude);
  if (data.latitude === '' || data.latitude === undefined)
    errors.latitude = 'Enter the latitude (from GPS or the map).';
  else if (isNaN(lat) || lat < -90 || lat > 90)
    errors.latitude = 'Latitude must be between -90 and 90.';

  const lng = parseFloat(data.longitude);
  if (data.longitude === '' || data.longitude === undefined)
    errors.longitude = 'Enter the longitude (from GPS or the map).';
  else if (isNaN(lng) || lng < -180 || lng > 180)
    errors.longitude = 'Longitude must be between -180 and 180.';

  if (!data.status)
    errors.status = 'Status is required.';

  // Validate corners — only if at least one has data
  const anyFilled = data.corners.some(c => c.lat.trim() !== '' || c.lng.trim() !== '');
  if (anyFilled) {
    const allFilled = data.corners.every(c => c.lat.trim() !== '' && c.lng.trim() !== '');
    if (!allFilled) {
      errors.corners = 'Fill in all 4 corners, or leave all of them empty.';
    } else {
      for (let i = 0; i < data.corners.length; i++) {
        const cLat = parseFloat(data.corners[i].lat);
        const cLng = parseFloat(data.corners[i].lng);
        if (isNaN(cLat) || cLat < -90 || cLat > 90) {
          errors.corners = `Corner ${i + 1} latitude must be between -90 and 90.`;
          break;
        }
        if (isNaN(cLng) || cLng < -180 || cLng > 180) {
          errors.corners = `Corner ${i + 1} longitude must be between -180 and 180.`;
          break;
        }
      }
    }
  }

  return errors;
};

function BayForm({ isOpen, onClose, onSubmit, initialData, isLoading, mode = 'create', zoneOptions = [] }) {
  const [form, setForm]     = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  // Sync form state whenever the dialog opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      setErrors({});
      if (mode === 'edit' && initialData) {
        setForm({
          bayCode:   initialData.bayCode   ?? '',
          bayName:   initialData.bayName   ?? '',
          zone:      initialData.zone      ?? '',
          latitude:  initialData.latitude  ?? '',
          longitude: initialData.longitude ?? '',
          status:    initialData.status    ?? 'AVAILABLE',
          corners:   parsePolygonToCorners(initialData.polygonCoordinates),
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [isOpen, initialData, mode]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleCornerChange = (index, field, value) => {
    setForm((prev) => {
      const corners = prev.corners.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      );
      return { ...prev, corners };
    });
    if (errors.corners) setErrors((prev) => ({ ...prev, corners: undefined }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    onSubmit({
      bayCode:            form.bayCode.trim(),
      bayName:            form.bayName.trim(),
      zone:               form.zone.trim(),
      latitude:           parseFloat(form.latitude),
      longitude:          parseFloat(form.longitude),
      status:             form.status,
      polygonCoordinates: cornersToPolygon(form.corners),
    });
  };

  const isEdit = mode === 'edit';

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={isLoading}
      size="lg"
      icon={Icons.pin}
      title={isEdit ? `Edit storage spot ${initialData?.bayCode || ''}` : 'Add a storage spot'}
      subtitle={isEdit ? 'Change how this storage spot (bay) is set up.' : 'A storage spot (bay) is a marked place in the yard where material is kept.'}
      as="form"
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button id="bay-form-submit-btn" type="submit" variant="primary" icon={Icons.check} loading={isLoading}>
            {isEdit ? 'Save changes' : 'Add storage spot'}
          </Button>
        </>
      )}
    >
      <div className={uiStyles.formSection}>
        <p className={uiStyles.sectionTitle}>Name it</p>
        <div className={uiStyles.formGrid}>
          <Field label="Spot code" required error={errors.bayCode} hint="Short code painted on the ground">
            {(p) => <input {...p} name="bayCode" type="text" value={form.bayCode} onChange={handleChange} placeholder="e.g. A-12" disabled={isLoading} />}
          </Field>
          <Field label="Spot name" required error={errors.bayName} hint="What people call it">
            {(p) => <input {...p} name="bayName" type="text" value={form.bayName} onChange={handleChange} placeholder="e.g. North coil bay" disabled={isLoading} />}
          </Field>
        </div>
      </div>

      <div className={uiStyles.formSection}>
        <p className={uiStyles.sectionTitle}>Where and how it’s used</p>
        <div className={uiStyles.formGrid}>
          <Field label="Yard area" required error={errors.zone} hint="Pick one, or type a new area name to create it." help="Yard areas (zones) group nearby storage spots.">
            {(p) => (
              <>
                <input {...p} name="zone" type="text" value={form.zone} onChange={handleChange} placeholder="e.g. Zone A" list="bay-zone-options" autoComplete="off" disabled={isLoading} />
                <datalist id="bay-zone-options">
                  {zoneOptions.map((z) => <option key={z} value={z} />)}
                </datalist>
              </>
            )}
          </Field>
          <Field label="Status" required error={errors.status}>
            {(p) => (
              <select {...p} name="status" value={form.status} onChange={handleChange} disabled={isLoading}>
                {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            )}
          </Field>
        </div>
      </div>

      <div className={uiStyles.formSection}>
        <p className={uiStyles.sectionTitle}>Location on the map</p>
        <p className={uiStyles.sectionDesc}>The middle of the spot. Used to draw it on the yard map and to work out the distance to loading docks.</p>
        <div className={uiStyles.formGrid}>
          <Field label="Latitude" required error={errors.latitude} hint="Between −90 and 90, e.g. 28.4595">
            {(p) => <input {...p} name="latitude" type="number" step="any" value={form.latitude} onChange={handleChange} placeholder="e.g. 28.4595" disabled={isLoading} />}
          </Field>
          <Field label="Longitude" required error={errors.longitude} hint="Between −180 and 180, e.g. 77.0266">
            {(p) => <input {...p} name="longitude" type="number" step="any" value={form.longitude} onChange={handleChange} placeholder="e.g. 77.0266" disabled={isLoading} />}
          </Field>
        </div>
      </div>

      <details className={styles.corners} open={form.corners.some((c) => c.lat || c.lng) || Boolean(errors.corners)}>
        <summary>
          Outline on the map <span className={styles.optional}>Optional</span>
        </summary>
        <p className={uiStyles.sectionDesc}>Enter the 4 corners to draw the spot’s real shape. Leave empty to show it as a simple marker.</p>
        <FormAlert>{errors.corners}</FormAlert>
        <div className={styles.cornersGrid}>
          {form.corners.map((corner, i) => (
            <div key={i} className={styles.cornerCard}>
              <span className={styles.cornerLabel}>{CORNER_LABELS[i]}</span>
              <div className={styles.cornerInputs}>
                <label className={styles.cornerField}>
                  <span>Latitude</span>
                  <input type="number" step="any" value={corner.lat} onChange={(e) => handleCornerChange(i, 'lat', e.target.value)} placeholder="—" className={uiStyles.input} disabled={isLoading} aria-label={`${CORNER_LABELS[i]} latitude`} />
                </label>
                <label className={styles.cornerField}>
                  <span>Longitude</span>
                  <input type="number" step="any" value={corner.lng} onChange={(e) => handleCornerChange(i, 'lng', e.target.value)} placeholder="—" className={uiStyles.input} disabled={isLoading} aria-label={`${CORNER_LABELS[i]} longitude`} />
                </label>
              </div>
            </div>
          ))}
        </div>
      </details>
    </Modal>
  );
}

export default BayForm;
