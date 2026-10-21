/**
 * CameraFormModal — register / edit a surveillance camera.
 *
 * Mirrors the backend validators as client-side defence-in-depth (the backend
 * remains the security boundary). Captures identity, connection, deployment and
 * administration details, runs a REAL connection test against the backend, and
 * shows a live preview for the chosen stream type.
 *
 * Security: the password is write-only. On edit the existing credential is never
 * fetched back — the field stays in "keep current" mode until the operator
 * explicitly chooses to change or remove it.
 *
 * Props:
 *   isOpen, onClose, onSubmit(payload), initialData, isLoading, mode
 */

import { useState, useEffect } from 'react';
import CameraPreview from '../CameraPreview/CameraPreview';
import { testConnection } from '../../services/cameraService';
import styles from './CameraFormModal.module.css';

const CAMERA_TYPES = ['FIXED', 'PTZ', 'DOME', 'BULLET', 'THERMAL'];
const STREAM_TYPES = [
  { value: 'RTSP', label: 'RTSP' },
  { value: 'RTMP', label: 'RTMP' },
  { value: 'HTTP', label: 'HTTP / MJPEG' },
  { value: 'LOCAL_WEBCAM', label: 'Local Webcam' },
  { value: 'UPLOADED_VIDEO', label: 'Uploaded Video' },
];
const STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE'];
const ZONES = ['Entry Gate', 'Exit Gate', 'Loading Bay', 'Boundary Wall', 'Weighbridge', 'Parking', 'Storage Yard', 'Railway Siding'];
const PURPOSES = ['General Surveillance', 'PPE Compliance', 'Fire & Smoke', 'Geo-fence', 'Face Recognition', 'Motion Detection', 'Crowd Monitoring', 'Vehicle Monitoring', 'Speed Monitoring', 'Wall Intrusion', 'Dispatch Validation'];

const EMPTY = {
  cameraCode: '', cameraName: '', location: '', cameraType: 'FIXED', cameraPurpose: '', description: '',
  streamType: 'RTSP', streamUrl: '', username: '', password: '',
  zone: '', site: '', installationDate: '', status: 'ACTIVE', notes: '',
};

const needsUrl = (t) => t === 'RTSP' || t === 'RTMP' || t === 'HTTP';

const RESULT_META = {
  SUCCESS:     { tone: 'ok',   label: 'Connection successful' },
  CLIENT_SIDE: { tone: 'info', label: 'Verified in browser preview' },
  AUTH_FAILED: { tone: 'bad',  label: 'Authentication failed' },
  INVALID_URL: { tone: 'warn', label: 'Invalid stream URL' },
  TIMEOUT:     { tone: 'warn', label: 'Connection timed out' },
  FAILED:      { tone: 'bad',  label: 'Connection failed' },
};

function validate(f, isEdit) {
  const e = {};
  if (!isEdit && !f.cameraCode.trim()) e.cameraCode = 'Camera code is required.';
  else if (f.cameraCode.trim().length > 50) e.cameraCode = 'Max 50 characters.';
  if (!f.cameraName.trim()) e.cameraName = 'Camera name is required.';
  if (!f.location.trim()) e.location = 'Location is required.';
  if (!f.cameraType.trim()) e.cameraType = 'Camera type is required.';
  if (!f.cameraPurpose.trim()) e.cameraPurpose = 'Purpose is required.';
  if (!f.streamType) e.streamType = 'Stream type is required.';
  if (needsUrl(f.streamType) && !f.streamUrl.trim()) e.streamUrl = 'A stream URL is required for this type.';
  if (!f.zone.trim()) e.zone = 'Warehouse zone is required.';
  return e;
}

function CameraFormModal({ isOpen, onClose, onSubmit, initialData, isLoading, mode = 'create' }) {
  const isEdit = mode === 'edit';
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [pwMode, setPwMode] = useState('keep');   // edit only: 'keep' | 'edit'
  const [uploadFile, setUploadFile] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({}); setTestResult(null); setUploadFile(null);
    if (isEdit && initialData) {
      setPwMode('keep');
      setForm({
        cameraCode: initialData.cameraCode ?? '',
        cameraName: initialData.cameraName ?? '',
        location: initialData.location ?? '',
        cameraType: initialData.cameraType ?? 'FIXED',
        cameraPurpose: initialData.cameraPurpose ?? '',
        description: initialData.description ?? '',
        streamType: initialData.streamType ?? 'RTSP',
        streamUrl: initialData.streamUrl ?? '',
        username: initialData.username ?? '',
        password: '',
        zone: initialData.zone ?? '',
        site: initialData.site ?? '',
        installationDate: initialData.installationDate ? initialData.installationDate.slice(0, 10) : '',
        status: initialData.status ?? 'ACTIVE',
        notes: initialData.notes ?? '',
      });
    } else {
      setPwMode('edit');
      setForm(EMPTY);
    }
  }, [isOpen, initialData, isEdit]);

  if (!isOpen) return null;

  const set = (name, value) => {
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: undefined }));
    if (['streamType', 'streamUrl', 'username', 'password'].includes(name)) setTestResult(null);
  };
  const handleChange = (e) => set(e.target.name, e.target.value);

  const handleStreamTypeChange = (e) => {
    set('streamType', e.target.value);
    setUploadFile(null);
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const payload = {
        streamType: form.streamType,
        streamUrl: form.streamUrl || undefined,
        username: form.username || undefined,
      };
      if (!isEdit || pwMode === 'edit') payload.password = form.password || undefined;
      const res = await testConnection(payload);
      setTestResult(res);
    } catch (err) {
      setTestResult({ result: 'FAILED', message: err.response?.data?.message || err.message || 'Test failed.' });
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const v = validate(form, isEdit);
    if (Object.keys(v).length) { setErrors(v); return; }

    const upload = form.streamType === 'UPLOADED_VIDEO';
    const payload = {
      cameraName: form.cameraName.trim(),
      location: form.location.trim(),
      cameraType: form.cameraType,
      cameraPurpose: form.cameraPurpose.trim(),
      description: form.description.trim() || null,
      streamType: form.streamType,
      // Only network cameras carry a stream URL. For uploaded video the real,
      // persistent source is the file itself (stored server-side and referenced
      // by videoFilePath) — never a filename or a browser blob URL.
      streamUrl: needsUrl(form.streamType) ? form.streamUrl.trim() : null,
      username: form.username.trim() || null,
      zone: form.zone.trim(),
      site: form.site.trim() || null,
      installationDate: form.installationDate || null,
      status: form.status,
      notes: form.notes.trim() || null,
    };
    if (!isEdit) {
      payload.cameraCode = form.cameraCode.trim();
      if (form.password) payload.password = form.password;
    } else if (pwMode === 'edit') {
      payload.password = form.password; // value sets, '' clears
    }
    // Hand the selected video File (if any) to the parent so it can be persisted
    // via the existing upload endpoint after the camera is created/updated.
    onSubmit(payload, upload ? uploadFile : null);
  };

  const showUrl = needsUrl(form.streamType);
  const isUpload = form.streamType === 'UPLOADED_VIDEO';
  const isWebcam = form.streamType === 'LOCAL_WEBCAM';
  const tm = testResult ? (RESULT_META[testResult.result] || RESULT_META.FAILED) : null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="camera-form-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
            </div>
            <div>
              <h2 id="camera-form-title" className={styles.title}>{isEdit ? 'Edit Camera' : 'Register Camera'}</h2>
              <p className={styles.subtitle}>{isEdit ? 'Update this camera’s configuration and connection.' : 'Add a new camera to the surveillance registry.'}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close" disabled={isLoading}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.body}>
            {/* ── Identity ─────────────────────────────────────────────── */}
            <Section title="Camera Identity" desc="Naming, classification and purpose.">
              <div className={styles.row}>
                <Field label="Camera Name" required error={errors.cameraName}>
                  <input name="cameraName" value={form.cameraName} onChange={handleChange} placeholder="e.g. Entry Gate North" className={`${styles.input} ${errors.cameraName ? styles.inputError : ''}`} disabled={isLoading} />
                </Field>
                <Field label="Camera Code" required error={errors.cameraCode} hint={isEdit ? 'Code cannot be changed.' : 'Unique identifier.'}>
                  <input name="cameraCode" value={form.cameraCode} onChange={handleChange} placeholder="e.g. CAM-ENTRY-01" className={`${styles.input} ${errors.cameraCode ? styles.inputError : ''}`} disabled={isLoading || isEdit} />
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="Location" required error={errors.location}>
                  <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Main Gate, North Pillar" className={`${styles.input} ${errors.location ? styles.inputError : ''}`} disabled={isLoading} />
                </Field>
                <Field label="Camera Type" required error={errors.cameraType}>
                  <select name="cameraType" value={form.cameraType} onChange={handleChange} className={`${styles.input} ${styles.select}`} disabled={isLoading}>
                    {CAMERA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="Purpose" required error={errors.cameraPurpose} hint="What this camera is intended to monitor.">
                  <input name="cameraPurpose" value={form.cameraPurpose} onChange={handleChange} list="camera-purposes" placeholder="e.g. PPE Compliance" className={`${styles.input} ${errors.cameraPurpose ? styles.inputError : ''}`} disabled={isLoading} />
                  <datalist id="camera-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
                </Field>
                <Field label="Description" hint="Optional.">
                  <input name="description" value={form.description} onChange={handleChange} placeholder="Short description" className={styles.input} disabled={isLoading} />
                </Field>
              </div>
            </Section>

            {/* ── Connection ───────────────────────────────────────────── */}
            <Section title="Connection" desc="Stream source and credentials. Passwords are encrypted and never shown again.">
              <div className={styles.row}>
                <Field label="Stream Type" required error={errors.streamType}>
                  <select name="streamType" value={form.streamType} onChange={handleStreamTypeChange} className={`${styles.input} ${styles.select}`} disabled={isLoading}>
                    {STREAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {showUrl && (
                  <Field label="Stream URL" required error={errors.streamUrl}>
                    <input name="streamUrl" value={form.streamUrl} onChange={handleChange} placeholder={form.streamType === 'HTTP' ? 'http://host:port/stream' : `${form.streamType.toLowerCase()}://host:port/path`} className={`${styles.input} ${styles.mono} ${errors.streamUrl ? styles.inputError : ''}`} disabled={isLoading} />
                  </Field>
                )}
                {isUpload && (
                  <Field label="Video File" hint="Plays locally in the preview.">
                    <input type="file" accept="video/*" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} className={styles.input} disabled={isLoading} />
                  </Field>
                )}
                {isWebcam && (
                  <Field label="Device" hint="Selected in the live preview below.">
                    <input value="Local webcam" className={styles.input} disabled readOnly />
                  </Field>
                )}
              </div>

              {(showUrl) && (
                <div className={styles.row}>
                  <Field label="Username" hint="Optional.">
                    <input name="username" value={form.username} onChange={handleChange} autoComplete="off" placeholder="e.g. admin" className={styles.input} disabled={isLoading} />
                  </Field>
                  <Field label="Password" hint={isEdit && pwMode === 'keep' ? 'A credential is stored — leave to keep it.' : 'Stored encrypted (AES-256).'}>
                    {isEdit && pwMode === 'keep' ? (
                      <div className={styles.pwKeep}>
                        <span className={styles.pwMask}>{initialData?.hasPassword ? '•••••••• stored' : 'No password set'}</span>
                        <button type="button" className={styles.linkBtn} onClick={() => { setPwMode('edit'); set('password', ''); }} disabled={isLoading}>Change</button>
                      </div>
                    ) : (
                      <div className={styles.pwEdit}>
                        <input type="password" name="password" value={form.password} onChange={handleChange} autoComplete="new-password" placeholder={isEdit ? 'New password (blank = remove)' : '••••••••'} className={styles.input} disabled={isLoading} />
                        {isEdit && <button type="button" className={styles.linkBtn} onClick={() => { setPwMode('keep'); set('password', ''); }} disabled={isLoading}>Keep current</button>}
                      </div>
                    )}
                  </Field>
                </div>
              )}

              {/* Test connection */}
              <div className={styles.testRow}>
                <button type="button" className={styles.testBtn} onClick={handleTest} disabled={isLoading || testing}>
                  {testing ? <span className={styles.btnSpinner} /> : <svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 10-2 0v1.07A6.002 6.002 0 004.07 9H3a1 1 0 000 2h1.07A6.002 6.002 0 009 15.93V17a1 1 0 102 0v-1.07A6.002 6.002 0 0015.93 11H17a1 1 0 100-2h-1.07A6.002 6.002 0 0011 4.07V3zM10 13a3 3 0 110-6 3 3 0 010 6z" /></svg>}
                  {testing ? 'Testing…' : 'Test Connection'}
                </button>
                {testResult && (
                  <div className={`${styles.testResult} ${styles[`tone_${tm.tone}`]}`}>
                    <strong>{tm.label}</strong>
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div className={styles.previewBlock}>
                <span className={styles.previewLabel}>Live Preview</span>
                <CameraPreview streamType={form.streamType} streamUrl={form.streamUrl} file={uploadFile} />
              </div>
            </Section>

            {/* ── Deployment ───────────────────────────────────────────── */}
            <Section title="Deployment" desc="Where this camera lives in the facility.">
              <div className={styles.row}>
                <Field label="Warehouse Zone" required error={errors.zone}>
                  <input name="zone" value={form.zone} onChange={handleChange} list="camera-zones" placeholder="e.g. Entry Gate" className={`${styles.input} ${errors.zone ? styles.inputError : ''}`} disabled={isLoading} />
                  <datalist id="camera-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
                </Field>
                <Field label="Site / Warehouse" hint="Optional — for multi-warehouse setups.">
                  <input name="site" value={form.site} onChange={handleChange} placeholder="e.g. Plant 1" className={styles.input} disabled={isLoading} />
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="Installation Date" hint="Optional.">
                  <input type="date" name="installationDate" value={form.installationDate} onChange={handleChange} className={styles.input} disabled={isLoading} />
                </Field>
                <Field label="Status" required>
                  <select name="status" value={form.status} onChange={handleChange} className={`${styles.input} ${styles.select}`} disabled={isLoading}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Notes" hint="Optional operational notes.">
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="e.g. Mounted 4m high, faces inbound lane." className={`${styles.input} ${styles.textarea}`} disabled={isLoading} />
              </Field>
            </Section>
          </div>

          <div className={styles.footer}>
            <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className={styles.submitBtn} disabled={isLoading}>
              {isLoading ? <><span className={styles.btnSpinner} />{isEdit ? 'Saving…' : 'Registering…'}</>
                : <><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{isEdit ? 'Save Changes' : 'Register Camera'}</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Section({ title, desc, children }) {
  return (
    <fieldset className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        <p className={styles.sectionDesc}>{desc}</p>
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </fieldset>
  );
}

function Field({ label, required, error, hint, children }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}{required && <span className={styles.required}> *</span>}</label>
      {children}
      {error ? <span className={styles.fieldError}>{error}</span> : hint ? <span className={styles.hint}>{hint}</span> : null}
    </div>
  );
}

export default CameraFormModal;
