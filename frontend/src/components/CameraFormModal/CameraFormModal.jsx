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
import { Modal, Button } from '../ui';
import { Icons } from '../ui/icons';
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
    <Modal
      isOpen
      onClose={onClose}
      busy={isLoading}
      size="lg"
      icon={Icons.camera}
      title={isEdit ? `Edit ${initialData?.cameraName || 'camera'}` : 'Add a camera'}
      subtitle={isEdit ? 'Change this camera’s details and how we connect to it.' : 'Tell us where the camera is and how to reach its video.'}
      as="form"
      onSubmit={handleSubmit}
      footer={(
        <>
          <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Icons.check} loading={isLoading}>{isEdit ? 'Save changes' : 'Add camera'}</Button>
        </>
      )}
    >
          <div className={styles.body}>
            {/* ── Identity ─────────────────────────────────────────────── */}
            <Section title="About the camera" desc="What it’s called, where it is and what it watches.">
              <div className={styles.row}>
                <Field label="Camera name" required error={errors.cameraName}>
                  <input name="cameraName" value={form.cameraName} onChange={handleChange} placeholder="e.g. Entry Gate North" className={`${styles.input} ${errors.cameraName ? styles.inputError : ''}`} disabled={isLoading} />
                </Field>
                <Field label="Camera code" required error={errors.cameraCode} hint={isEdit ? 'The code can’t be changed.' : 'A short unique code, e.g. CAM-ENTRY-01'}>
                  <input name="cameraCode" value={form.cameraCode} onChange={handleChange} placeholder="e.g. CAM-ENTRY-01" className={`${styles.input} ${errors.cameraCode ? styles.inputError : ''}`} disabled={isLoading || isEdit} />
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="Location" required error={errors.location}>
                  <input name="location" value={form.location} onChange={handleChange} placeholder="e.g. Main Gate, North Pillar" className={`${styles.input} ${errors.location ? styles.inputError : ''}`} disabled={isLoading} />
                </Field>
                <Field label="Camera type" required error={errors.cameraType}>
                  <select name="cameraType" value={form.cameraType} onChange={handleChange} className={`${styles.input} ${styles.select}`} disabled={isLoading}>
                    {CAMERA_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="What it watches" required error={errors.cameraPurpose} hint="e.g. Entry gate traffic, PPE checks">
                  <input name="cameraPurpose" value={form.cameraPurpose} onChange={handleChange} list="camera-purposes" placeholder="e.g. PPE Compliance" className={`${styles.input} ${errors.cameraPurpose ? styles.inputError : ''}`} disabled={isLoading} />
                  <datalist id="camera-purposes">{PURPOSES.map((p) => <option key={p} value={p} />)}</datalist>
                </Field>
                <Field label="Description" hint="Optional.">
                  <input name="description" value={form.description} onChange={handleChange} placeholder="Short description" className={styles.input} disabled={isLoading} />
                </Field>
              </div>
            </Section>

            {/* ── Connection ───────────────────────────────────────────── */}
            <Section title="Video connection" desc="Where the video comes from. Passwords are stored encrypted and never shown again.">
              <div className={styles.row}>
                <Field label="Video source" required error={errors.streamType}>
                  <select name="streamType" value={form.streamType} onChange={handleStreamTypeChange} className={`${styles.input} ${styles.select}`} disabled={isLoading}>
                    {STREAM_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </Field>
                {showUrl && (
                  <Field label="Video address (URL)" required error={errors.streamUrl}>
                    <input name="streamUrl" value={form.streamUrl} onChange={handleChange} placeholder={form.streamType === 'HTTP' ? 'http://host:port/stream' : `${form.streamType.toLowerCase()}://host:port/path`} className={`${styles.input} ${styles.mono} ${errors.streamUrl ? styles.inputError : ''}`} disabled={isLoading} />
                  </Field>
                )}
                {isUpload && (
                  <Field label="Video file" hint="Uploaded when you save.">
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
                <Button icon={Icons.sync} onClick={handleTest} loading={testing} disabled={isLoading}>{testing ? 'Testing…' : 'Test connection'}</Button>
                {testResult && (
                  <div className={`${styles.testResult} ${styles[`tone_${tm.tone}`]}`}>
                    <strong>{tm.label}</strong>
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              {/* Live preview */}
              <div className={styles.previewBlock}>
                <span className={styles.previewLabel}>Preview</span>
                <CameraPreview streamType={form.streamType} streamUrl={form.streamUrl} file={uploadFile} />
              </div>
            </Section>

            {/* ── Deployment ───────────────────────────────────────────── */}
            <Section title="Placement" desc="Where this camera is installed.">
              <div className={styles.row}>
                <Field label="Yard area" required error={errors.zone}>
                  <input name="zone" value={form.zone} onChange={handleChange} list="camera-zones" placeholder="e.g. Entry Gate" className={`${styles.input} ${errors.zone ? styles.inputError : ''}`} disabled={isLoading} />
                  <datalist id="camera-zones">{ZONES.map((z) => <option key={z} value={z} />)}</datalist>
                </Field>
                <Field label="Site" hint="Optional — only if you have more than one warehouse.">
                  <input name="site" value={form.site} onChange={handleChange} placeholder="e.g. Plant 1" className={styles.input} disabled={isLoading} />
                </Field>
              </div>
              <div className={styles.row}>
                <Field label="Installed on" hint="Optional.">
                  <input type="date" name="installationDate" value={form.installationDate} onChange={handleChange} className={styles.input} disabled={isLoading} />
                </Field>
                <Field label="Status" required>
                  <select name="status" value={form.status} onChange={handleChange} className={`${styles.input} ${styles.select}`} disabled={isLoading}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Notes" hint="Optional.">
                <textarea name="notes" value={form.notes} onChange={handleChange} rows={2} placeholder="e.g. Mounted 4m high, faces inbound lane." className={`${styles.input} ${styles.textarea}`} disabled={isLoading} />
              </Field>
            </Section>
          </div>

    </Modal>
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
