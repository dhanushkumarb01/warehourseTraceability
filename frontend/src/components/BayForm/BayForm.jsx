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
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'OCCUPIED',  label: 'Occupied'  },
  { value: 'INACTIVE',  label: 'Inactive'  },
];

const CORNER_LABELS = ['NW', 'NE', 'SE', 'SW'];

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
    errors.bayCode = 'Bay Code is required.';
  else if (data.bayCode.trim().length > 50)
    errors.bayCode = 'Bay Code must not exceed 50 characters.';

  if (!data.bayName.trim())
    errors.bayName = 'Bay Name is required.';
  else if (data.bayName.trim().length > 100)
    errors.bayName = 'Bay Name must not exceed 100 characters.';

  if (!data.zone.trim())
    errors.zone = 'Zone is required.';

  const lat = parseFloat(data.latitude);
  if (data.latitude === '' || data.latitude === undefined)
    errors.latitude = 'Latitude is required.';
  else if (isNaN(lat) || lat < -90 || lat > 90)
    errors.latitude = 'Latitude must be between -90 and 90.';

  const lng = parseFloat(data.longitude);
  if (data.longitude === '' || data.longitude === undefined)
    errors.longitude = 'Longitude is required.';
  else if (isNaN(lng) || lng < -180 || lng > 180)
    errors.longitude = 'Longitude must be between -180 and 180.';

  if (!data.status)
    errors.status = 'Status is required.';

  // Validate corners — only if at least one has data
  const anyFilled = data.corners.some(c => c.lat.trim() !== '' || c.lng.trim() !== '');
  if (anyFilled) {
    const allFilled = data.corners.every(c => c.lat.trim() !== '' && c.lng.trim() !== '');
    if (!allFilled) {
      errors.corners = 'Please fill all 4 corner coordinates or leave all blank.';
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

function BayForm({ isOpen, onClose, onSubmit, initialData, isLoading, mode = 'create' }) {
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
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="bay-form-title">
      <div className={styles.modal}>
        {/* ── Header ─────────────────────────────────────── */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V12h6v9" />
              </svg>
            </div>
            <div>
              <h2 id="bay-form-title" className={styles.title}>
                {isEdit ? 'Edit Bay Configuration' : 'Configure New Bay'}
              </h2>
              <p className={styles.subtitle}>
                {isEdit
                  ? 'Modify the warehouse bay asset configuration below.'
                  : 'Register a new warehouse bay asset in the yard management system.'}
              </p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close form" disabled={isLoading}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────── */}
        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.body}>

            {/* ─ Section 1: Bay Identity ─ */}
            <fieldset className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Bay Identity</h3>
                  <p className={styles.sectionDesc}>Unique identifier and display name for this bay asset.</p>
                </div>
              </div>

              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="bayCode" className={styles.label}>
                      Bay Code <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="bayCode" name="bayCode" type="text"
                      value={form.bayCode} onChange={handleChange}
                      placeholder="e.g. BAY-001"
                      className={`${styles.input} ${errors.bayCode ? styles.inputError : ''}`}
                      disabled={isLoading}
                    />
                    {errors.bayCode
                      ? <span className={styles.fieldError}>{errors.bayCode}</span>
                      : <span className={styles.hint}>Unique system identifier — cannot be changed later.</span>
                    }
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="bayName" className={styles.label}>
                      Bay Name <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="bayName" name="bayName" type="text"
                      value={form.bayName} onChange={handleChange}
                      placeholder="e.g. Dispatch Bay A"
                      className={`${styles.input} ${errors.bayName ? styles.inputError : ''}`}
                      disabled={isLoading}
                    />
                    {errors.bayName
                      ? <span className={styles.fieldError}>{errors.bayName}</span>
                      : <span className={styles.hint}>Human-readable display name for operations.</span>
                    }
                  </div>
                </div>
              </div>
            </fieldset>

            {/* ─ Section 2: Operational Configuration ─ */}
            <fieldset className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={styles.sectionIcon}>
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" /></svg>
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Operational Configuration</h3>
                  <p className={styles.sectionDesc}>Zone assignment and operational status of this bay.</p>
                </div>
              </div>

              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="zone" className={styles.label}>
                      Zone <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="zone" name="zone" type="text"
                      value={form.zone} onChange={handleChange}
                      placeholder="e.g. Zone A"
                      className={`${styles.input} ${errors.zone ? styles.inputError : ''}`}
                      disabled={isLoading}
                    />
                    {errors.zone
                      ? <span className={styles.fieldError}>{errors.zone}</span>
                      : <span className={styles.hint}>Logical grouping within the warehouse yard.</span>
                    }
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="status" className={styles.label}>
                      Status <span className={styles.required}>*</span>
                    </label>
                    <select
                      id="status" name="status"
                      value={form.status} onChange={handleChange}
                      className={`${styles.input} ${styles.select} ${errors.status ? styles.inputError : ''}`}
                      disabled={isLoading}
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {errors.status && <span className={styles.fieldError}>{errors.status}</span>}
                  </div>
                </div>
              </div>
            </fieldset>

            {/* ─ Section 3: Geographic Position ─ */}
            <fieldset className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={`${styles.sectionIcon} ${styles.sectionIconGeo}`}>
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Geographic Position</h3>
                  <p className={styles.sectionDesc}>Center-point coordinates for this bay on the yard map.</p>
                </div>
              </div>

              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="latitude" className={styles.label}>
                      Latitude <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="latitude" name="latitude" type="number" step="any"
                      value={form.latitude} onChange={handleChange}
                      placeholder="e.g. 28.4595"
                      className={`${styles.input} ${styles.coordInputMain} ${errors.latitude ? styles.inputError : ''}`}
                      disabled={isLoading}
                    />
                    {errors.latitude
                      ? <span className={styles.fieldError}>{errors.latitude}</span>
                      : <span className={styles.hint}>Decimal degrees · Range: −90 to 90</span>
                    }
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="longitude" className={styles.label}>
                      Longitude <span className={styles.required}>*</span>
                    </label>
                    <input
                      id="longitude" name="longitude" type="number" step="any"
                      value={form.longitude} onChange={handleChange}
                      placeholder="e.g. 77.0266"
                      className={`${styles.input} ${styles.coordInputMain} ${errors.longitude ? styles.inputError : ''}`}
                      disabled={isLoading}
                    />
                    {errors.longitude
                      ? <span className={styles.fieldError}>{errors.longitude}</span>
                      : <span className={styles.hint}>Decimal degrees · Range: −180 to 180</span>
                    }
                  </div>
                </div>
              </div>
            </fieldset>

            {/* ─ Section 4: Bay Boundary (Polygon Corners) ─ */}
            <fieldset className={styles.section}>
              <div className={styles.sectionHeader}>
                <div className={`${styles.sectionIcon} ${styles.sectionIconBoundary}`}>
                  <svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 01-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" /></svg>
                </div>
                <div>
                  <h3 className={styles.sectionTitle}>Bay Boundary</h3>
                  <p className={styles.sectionDesc}>
                    Define the physical perimeter with 4 corner coordinates.
                    <span className={styles.optionalBadge}>Optional</span>
                  </p>
                </div>
              </div>

              <div className={styles.sectionBody}>
                {errors.corners && (
                  <div className={styles.cornersError}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    {errors.corners}
                  </div>
                )}

                <div className={styles.cornersGrid}>
                  {form.corners.map((corner, i) => (
                    <div key={i} className={styles.cornerCard}>
                      <div className={styles.cornerHeader}>
                        <span className={styles.cornerNum}>{i + 1}</span>
                        <span className={styles.cornerLabel}>{CORNER_LABELS[i]}</span>
                      </div>
                      <div className={styles.cornerInputs}>
                        <div className={styles.cornerField}>
                          <label htmlFor={`corner-${i}-lat`} className={styles.coordLabel}>Latitude</label>
                          <input
                            id={`corner-${i}-lat`}
                            type="number" step="any"
                            value={corner.lat}
                            onChange={(e) => handleCornerChange(i, 'lat', e.target.value)}
                            placeholder="—"
                            className={styles.coordInput}
                            disabled={isLoading}
                          />
                        </div>
                        <div className={styles.cornerField}>
                          <label htmlFor={`corner-${i}-lng`} className={styles.coordLabel}>Longitude</label>
                          <input
                            id={`corner-${i}-lng`}
                            type="number" step="any"
                            value={corner.lng}
                            onChange={(e) => handleCornerChange(i, 'lng', e.target.value)}
                            placeholder="—"
                            className={styles.coordInput}
                            disabled={isLoading}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </fieldset>

          </div>

          {/* ── Footer ──────────────────────────────────── */}
          <div className={styles.footer}>
            <button
              type="button" className={styles.cancelBtn}
              onClick={onClose} disabled={isLoading}
            >
              Cancel
            </button>
            <button
              id="bay-form-submit-btn"
              type="submit" className={styles.submitBtn}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <span className={styles.btnSpinner} />
                  {isEdit ? 'Saving…' : 'Creating…'}
                </>
              ) : (
                <>
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  {isEdit ? 'Save Changes' : 'Create Bay'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BayForm;
