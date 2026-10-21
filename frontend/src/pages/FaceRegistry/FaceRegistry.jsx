/**
 * FaceRegistry — Employee Face Registry (Phase 14)
 *
 * Enterprise face-management console for the Face Detection / Unknown Person use
 * case. Register employees, enrol their faces (webcam capture OR image upload),
 * and view / edit / delete employees and their enrolled faces. The registry
 * stores only face embeddings + metadata — images are sent to the AI worker to
 * be embedded and are never persisted. Write actions are gated by FACE_MANAGE;
 * the backend remains the security boundary.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchEmployees, fetchRegistrySummary, createEmployee, updateEmployee,
  deleteEmployee, fetchFaces, enrollFace, deleteFace,
} from '../../services/faceService';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import styles from './FaceRegistry.module.css';

const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const initials = (name) => (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

function FaceRegistry() {
  const { can } = useAuth();
  const canManage = can(GROUPS.FACE_MANAGE);

  const [data, setData] = useState({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [enrollFor, setEnrollFor] = useState(null); // employee whose faces panel is open
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState({ message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = useCallback(() => setToast({ message: '', type: 'info' }), []);

  const searchTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchEmployees({ page, pageSize: 12, search: search || undefined, status: status || undefined }));
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load employees.');
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  const loadSummary = useCallback(async () => {
    try { setSummary(await fetchRegistrySummary()); } catch { /* non-critical */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { setPage(1); }, [search, status]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const refresh = () => { load(); loadSummary(); };

  const openCreate = () => { setSelected(null); setFormMode('create'); setFormOpen(true); };
  const openEdit = (emp) => { setSelected(emp); setFormMode('edit'); setFormOpen(true); };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit') { await updateEmployee(selected.id, payload); showToast('Employee updated.', 'success'); }
      else {
        const emp = await createEmployee(payload);
        showToast('Employee registered. Enrol a face to enable recognition.', 'success');
        setEnrollFor(emp); // jump straight into enrolment
      }
      setFormOpen(false); refresh();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      showToast(apiErrors?.length ? apiErrors.map((e) => e.message).join(' ') : (err.response?.data?.message || err.message || 'Operation failed.'), 'error');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    try { await deleteEmployee(confirm.id); showToast(`Employee "${confirm.name}" deleted.`, 'success'); setConfirm(null); refresh(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Delete failed.', 'error'); }
    finally { setDeleting(false); }
  };

  const hasFilters = search || status;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 14a4 4 0 100-8 4 4 0 000 8z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Face Registry</h1>
            <p className={styles.pageBreadcrumb}>Surveillance &rsaquo; Employee Face Registry</p>
          </div>
        </div>
        {canManage && (
          <button className={styles.primaryBtn} onClick={openCreate}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            Register Employee
          </button>
        )}
      </div>

      {summary && (
        <div className={styles.statsStrip}>
          <Stat label="Employees" value={summary.employees} color="#2563eb" bg="#eff6ff" />
          <Stat label="Active" value={summary.active} color="#16a34a" bg="#f0fdf4" />
          <Stat label="Inactive" value={summary.inactive} color="#64748b" bg="#f8fafc" />
          <Stat label="Enrolled Faces" value={summary.enrolledFaces} color="#7c3aed" bg="#f5f3ff" />
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
          <input type="text" placeholder="Search name, employee ID, department, designation…" onChange={onSearchChange} className={styles.searchInput} />
        </div>
        <div className={styles.filters}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.filterSelect} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
          </select>
        </div>
      </div>

      {loading && <div className={styles.grid}>{[...Array(6)].map((_, i) => <div key={i} className={styles.skeleton} />)}</div>}

      {!loading && error && (
        <div className={styles.errorState}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && data.items.length === 0 && (
        <div className={styles.emptyState}>
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="32" cy="24" r="10" /><path strokeLinecap="round" strokeLinejoin="round" d="M14 52c0-9.94 8.06-18 18-18s18 8.06 18 18" /></svg>
          <p className={styles.emptyTitle}>{hasFilters ? 'No employees match your filters' : 'No employees registered yet'}</p>
          <p className={styles.emptySubtitle}>{hasFilters ? 'Try clearing the search or filters.' : 'Register employees and enrol their faces so the cameras can tell staff apart from unknown people.'}</p>
          {!hasFilters && canManage && <button className={styles.primaryBtn} onClick={openCreate}>Register First Employee</button>}
        </div>
      )}

      {!loading && !error && data.items.length > 0 && (
        <>
          <div className={styles.grid}>
            {data.items.map((emp) => (
              <div key={emp.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={styles.avatar}>{initials(emp.name)}</span>
                  <div className={styles.cardTitleWrap}>
                    <h3 className={styles.cardName}>{emp.name}</h3>
                    <span className={styles.cardCode}>{emp.employeeCode}</span>
                  </div>
                  <StatusBadge status={emp.status} />
                </div>

                <div className={styles.cardMeta}>
                  {emp.department && <Meta icon="dept" label={emp.department} />}
                  {emp.designation && <Meta icon="role" label={emp.designation} />}
                </div>

                <div className={styles.cardChecked}>
                  <span className={emp.faceCount > 0 ? styles.enrolledOk : styles.enrolledNone}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                    {emp.faceCount || 0} face{emp.faceCount === 1 ? '' : 's'} enrolled
                  </span>
                  <strong className={styles.regDate}>{fmtDate(emp.createdAt)}</strong>
                </div>

                <div className={styles.cardActions}>
                  <button className={styles.enrollBtn} onClick={() => setEnrollFor(emp)}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" /></svg>
                    Manage Faces
                  </button>
                  {canManage && (
                    <>
                      <button className={styles.actBtn} onClick={() => openEdit(emp)} title="Edit">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                      </button>
                      <button className={`${styles.actBtn} ${styles.del}`} onClick={() => setConfirm(emp)} title="Delete">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
            <div className={styles.pageBtns}>
              <button className={styles.pageBtn} disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className={styles.pageNum}>Page {data.page} / {data.totalPages}</span>
              <button className={styles.pageBtn} disabled={data.page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </>
      )}

      {formOpen && (
        <EmployeeFormModal
          mode={formMode}
          initialData={selected}
          isLoading={submitting}
          onClose={() => { if (!submitting) setFormOpen(false); }}
          onSubmit={handleSubmit}
        />
      )}

      {enrollFor && (
        <FacesDrawer
          employee={enrollFor}
          canManage={canManage}
          onClose={() => setEnrollFor(null)}
          onChanged={refresh}
          showToast={showToast}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title="Delete Employee"
        message={`Permanently delete "${confirm?.employeeCode} – ${confirm?.name}" and all enrolled faces? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirm(null); }}
        isLoading={deleting}
      />
    </div>
  );
}

/* ── Register / edit employee modal ──────────────────────────────────────── */
function EmployeeFormModal({ mode, initialData, isLoading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    employeeCode: initialData?.employeeCode || '',
    name: initialData?.name || '',
    department: initialData?.department || '',
    designation: initialData?.designation || '',
    status: initialData?.status || 'ACTIVE',
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e) => {
    e.preventDefault();
    onSubmit({
      employeeCode: form.employeeCode.trim(),
      name: form.name.trim(),
      department: form.department.trim() || null,
      designation: form.designation.trim() || null,
      status: form.status,
    });
  };
  const valid = form.employeeCode.trim() && form.name.trim();

  return (
    <div className={styles.modalBackdrop} onClick={() => !isLoading && onClose()}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{mode === 'edit' ? 'Edit Employee' : 'Register Employee'}</h2>
          <button className={styles.modalClose} onClick={onClose} disabled={isLoading}>×</button>
        </div>
        <form className={styles.modalBody} onSubmit={submit}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Employee ID <em>*</em></span>
              <input value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} placeholder="e.g. EMP-00123" maxLength={64} required />
            </label>
            <label className={styles.field}>
              <span>Employee Name <em>*</em></span>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Full name" maxLength={120} required />
            </label>
            <label className={styles.field}>
              <span>Department</span>
              <input value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="Optional" maxLength={120} />
            </label>
            <label className={styles.field}>
              <span>Designation</span>
              <input value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="Optional" maxLength={120} />
            </label>
            <label className={styles.field}>
              <span>Status</span>
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={isLoading}>Cancel</button>
            <button type="submit" className={styles.primaryBtn} disabled={!valid || isLoading}>
              {isLoading ? 'Saving…' : mode === 'edit' ? 'Save Changes' : 'Register & Enrol Face'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Faces drawer: webcam capture + upload + enrolled-face management ─────── */
function FacesDrawer({ employee, canManage, onClose, onChanged, showToast }) {
  const [faces, setFaces] = useState(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('upload'); // upload | webcam
  const [preview, setPreview] = useState(null); // { dataUrl }
  const [camError, setCamError] = useState(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  const loadFaces = useCallback(async () => {
    try { setFaces((await fetchFaces(employee.id)).faces); } catch { setFaces([]); }
  }, [employee.id]);

  useEffect(() => { loadFaces(); }, [loadFaces]);

  // Manage the webcam stream lifecycle with the selected mode.
  useEffect(() => {
    let cancelled = false;
    const stop = () => {
      if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    };
    if (mode === 'webcam') {
      setCamError(null);
      navigator.mediaDevices?.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
        .then((stream) => {
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play?.(); }
        })
        .catch(() => setCamError('Unable to access the webcam. Check browser permissions, or use image upload.'));
    } else {
      stop();
    }
    return () => { cancelled = true; stop(); };
  }, [mode]);

  const captureFromWebcam = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setPreview({ dataUrl: canvas.toDataURL('image/jpeg', 0.92) });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Please choose an image file.', 'error'); return; }
    if (file.size > 8 * 1024 * 1024) { showToast('Image is too large (max 8 MB).', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview({ dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const submitEnroll = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await enrollFace(employee.id, preview.dataUrl);
      showToast(`Face enrolled (quality ${(res.face?.quality ?? 0).toFixed?.(2) ?? '—'}).`, 'success');
      setPreview(null);
      await loadFaces();
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Could not enrol this image.', 'error');
    } finally { setBusy(false); }
  };

  const removeFace = async (faceId) => {
    setBusy(true);
    try { await deleteFace(employee.id, faceId); await loadFaces(); onChanged(); showToast('Face removed.', 'success'); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Could not remove face.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className={styles.drawerBackdrop} onClick={onClose}>
      <aside className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.drawerHead}>
          <div>
            <h2>{employee.name}</h2>
            <p className={styles.drawerSub}>{employee.employeeCode}{employee.department ? ` · ${employee.department}` : ''}</p>
          </div>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>

        <div className={styles.drawerBody}>
          <p className={styles.privacyNote}>
            Only a numeric face signature is stored — the photos below are never saved. Enrol several photos (different angles / lighting) for the most reliable recognition.
          </p>

          {canManage && (
            <div className={styles.enrollCard}>
              <div className={styles.modeTabs}>
                <button className={`${styles.modeTab} ${mode === 'upload' ? styles.modeTabActive : ''}`} onClick={() => { setMode('upload'); setPreview(null); }}>Upload Image</button>
                <button className={`${styles.modeTab} ${mode === 'webcam' ? styles.modeTabActive : ''}`} onClick={() => { setMode('webcam'); setPreview(null); }}>Use Webcam</button>
              </div>

              {!preview && mode === 'upload' && (
                <div className={styles.uploadZone} onClick={() => fileRef.current?.click()}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 13l3-3m0 0l3 3m-3-3v9" /></svg>
                  <p>Click to choose a face photo</p>
                  <span>JPG or PNG, one clear front-facing face, up to 8 MB</span>
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
                </div>
              )}

              {!preview && mode === 'webcam' && (
                <div className={styles.webcamZone}>
                  {camError ? <p className={styles.camError}>{camError}</p> : (
                    <>
                      <video ref={videoRef} className={styles.webcam} playsInline muted />
                      <button className={styles.captureBtn} onClick={captureFromWebcam}>Capture</button>
                    </>
                  )}
                </div>
              )}

              {preview && (
                <div className={styles.previewZone}>
                  <img src={preview.dataUrl} alt="Face to enrol" className={styles.previewImg} />
                  <div className={styles.previewActions}>
                    <button className={styles.secondaryBtn} onClick={() => setPreview(null)} disabled={busy}>Retake</button>
                    <button className={styles.primaryBtn} onClick={submitEnroll} disabled={busy}>{busy ? 'Enrolling…' : 'Enrol This Face'}</button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className={styles.facesHead}>
            <h3>Enrolled faces</h3>
            <span className={styles.facesCount}>{faces ? faces.length : '…'}</span>
          </div>

          {faces && faces.length === 0 && <p className={styles.muted}>No faces enrolled yet. This employee will be treated as an unknown person until at least one face is enrolled.</p>}

          {faces && faces.length > 0 && (
            <ul className={styles.faceList}>
              {faces.map((f) => (
                <li key={f.id} className={styles.faceRow}>
                  <span className={styles.faceSig}>
                    <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" opacity="0" /><path d="M10 3.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13z" opacity="0.15" /><path fillRule="evenodd" d="M10 5a3 3 0 100 6 3 3 0 000-6zm-5 9a5 5 0 0110 0v.5a.5.5 0 01-.5.5h-9a.5.5 0 01-.5-.5V14z" clipRule="evenodd" /></svg>
                  </span>
                  <div className={styles.faceInfo}>
                    <strong>Signature #{f.id.slice(0, 8)}</strong>
                    <span>{f.model} · quality {f.quality != null ? Number(f.quality).toFixed(2) : '—'} · {fmtDate(f.createdAt)}</span>
                  </div>
                  {canManage && (
                    <button className={`${styles.actBtn} ${styles.del}`} onClick={() => removeFace(f.id)} disabled={busy} title="Remove face">
                      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, color, bg }) {
  return (
    <div className={styles.statCard} style={{ '--stat-color': color, '--stat-bg': bg }}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function Meta({ icon, label }) {
  const icons = {
    dept: 'M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z',
    role: 'M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z',
  };
  return (
    <span className={styles.meta} title={label}>
      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d={icons[icon]} clipRule="evenodd" /></svg>
      {label}
    </span>
  );
}

export default FaceRegistry;
