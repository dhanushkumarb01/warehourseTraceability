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
import {
  PageHeader, StatCard, Button, IconButton, SearchInput, EmptyState, ErrorState, Skeleton, Menu, Modal, Drawer, Field,
  SegmentedControl, Banner, StatusChip,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
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
  const [searchText, setSearchText] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setData(await fetchEmployees({ page, pageSize: 12, search: search || undefined, status: status || undefined }));
    } catch (err) {
      setError(err);
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

  const onSearchChange = (v) => {
    setSearchText(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const refresh = () => { load(); loadSummary(); };

  const openCreate = () => { setSelected(null); setFormMode('create'); setFormOpen(true); };
  const openEdit = (emp) => { setSelected(emp); setFormMode('edit'); setFormOpen(true); };

  const handleSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit') { await updateEmployee(selected.id, payload); showToast(`${payload.name} updated.`, 'success'); }
      else {
        const emp = await createEmployee(payload);
        showToast(`${emp.name} added. Now add a photo of their face so the cameras recognise them.`, 'success');
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
    try { await deleteEmployee(confirm.id); showToast(`${confirm.name} removed from the registry.`, 'success'); setConfirm(null); refresh(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Delete failed.', 'error'); }
    finally { setDeleting(false); }
  };

  const hasFilters = search || status;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <PageHeader
        icon={Icons.face}
        title="Face registry"
        term="Face registry"
        subtitle="Staff whose faces the cameras know. Anyone not listed here shows up as an unknown person."
        actions={(
          <>
            <IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={refresh} disabled={loading} />
            {canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Add employee</Button>}
          </>
        )}
      />

      <section className={styles.kpis} aria-label="Registry summary">
        <StatCard icon={Icons.users} label="Employees" value={summary?.employees ?? null} loading={!summary} tone="info" hint="In the registry" />
        <StatCard icon={Icons.checkCircle} label="Active" value={summary?.active ?? null} loading={!summary} tone="success" hint="Allowed on site" onClick={() => setStatus(status === 'ACTIVE' ? '' : 'ACTIVE')} />
        <StatCard icon={Icons.ban} label="Inactive" value={summary?.inactive ?? null} loading={!summary} tone="neutral" hint="No longer recognised as staff" onClick={() => setStatus(status === 'INACTIVE' ? '' : 'INACTIVE')} />
        <StatCard icon={Icons.face} label="Face photos added" value={summary?.enrolledFaces ?? null} loading={!summary} tone="brand"
          hint="More photos per person means better recognition" help="Only a numeric face signature is stored, never the photo itself." />
      </section>

      <div className={styles.toolbar}>
        <SearchInput className={styles.searchBox} value={searchText} onChange={onSearchChange} placeholder="Search name, employee ID, department or job" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${uiStyles.input} ${styles.filterSelect}`} aria-label="Filter by status">
          <option value="">Anyone</option>
          <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {loading && <div className={styles.grid}>{[...Array(6)].map((_, i) => <Skeleton key={i} height={196} radius={20} />)}</div>}

      {!loading && error && (
        <div className={uiStyles.card}><ErrorState title="We couldn’t load the registry" error={error} onRetry={load} /></div>
      )}

      {!loading && !error && data.items.length === 0 && (
        <div className={uiStyles.card}>
          <EmptyState
            icon={hasFilters ? Icons.search : Icons.face}
            title={hasFilters ? 'Nobody matches this search' : 'No employees added yet'}
            message={hasFilters ? 'Try a different name or ID, or clear the filter.' : 'Add employees and a photo of their face so the cameras can tell staff from visitors.'}
            action={hasFilters
              ? <Button onClick={() => { setStatus(''); onSearchChange(''); }}>Clear search</Button>
              : canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Add employee</Button>}
          />
        </div>
      )}

      {!loading && !error && data.items.length > 0 && (
        <>
          <div className={styles.grid}>
            {data.items.map((emp) => {
              const enrolled = emp.faceCount > 0;
              return (
                <article key={emp.id} className={`${styles.card} ${enrolled ? '' : styles.cardNoFace}`}>
                  <div className={styles.cardTop}>
                    <span className={styles.avatar} aria-hidden="true">{initials(emp.name)}</span>
                    <div className={styles.cardTitleWrap}>
                      <h3 className={styles.cardName}>{emp.name}</h3>
                      <span className={styles.cardCode}>{emp.employeeCode}</span>
                    </div>
                    {canManage && (
                      <Menu
                        label={`More actions for ${emp.name}`}
                        items={[
                          { label: 'Edit details', icon: Icons.edit, onClick: () => openEdit(emp) },
                          { label: 'Remove employee', icon: Icons.trash, onClick: () => setConfirm(emp), danger: true },
                        ]}
                      />
                    )}
                  </div>

                  <div className={styles.cardMeta}>
                    {emp.department && <span className={styles.meta}>{Icons.boxes}{emp.department}</span>}
                    {emp.designation && <span className={styles.meta}>{Icons.user}{emp.designation}</span>}
                  </div>

                  <div className={styles.cardBadges}>
                    <StatusBadge status={emp.status} size="sm" />
                    {enrolled
                      ? <StatusChip tone="success" icon={Icons.face} size="sm">{emp.faceCount} face {emp.faceCount === 1 ? 'photo' : 'photos'}</StatusChip>
                      : <StatusChip tone="warning" icon={Icons.warning} size="sm" title="Without a face photo, this person shows up as unknown on camera">No face photo yet</StatusChip>}
                  </div>

                  <div className={styles.cardFoot}>
                    <span className={styles.regDate}>Added {fmtDate(emp.createdAt)}</span>
                    <Button size="sm" variant={enrolled ? 'secondary' : 'primary'} icon={Icons.camera} onClick={() => setEnrollFor(emp)}>
                      {enrolled ? 'Face photos' : 'Add face photo'}
                    </Button>
                  </div>
                </article>
              );
            })}
          </div>

          <div className={styles.pagination}>
            <span className={styles.pageInfo}>Showing {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} of {data.total}</span>
            <div className={styles.pageBtns}>
              <Button size="sm" icon={Icons.chevronLeft} disabled={data.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span className={styles.pageNum}>Page {data.page} of {data.totalPages}</span>
              <Button size="sm" iconRight={Icons.chevronRight} disabled={data.page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
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
        title="Remove this employee?"
        message={`${confirm?.name} (${confirm?.employeeCode}) will be removed from the registry, together with all their face photos.`}
        details={['Cameras will show them as an unknown person from now on.', 'This can’t be undone.']}
        confirmLabel="Remove employee"
        loadingLabel="Removing…"
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirm(null); }}
        isLoading={deleting}
      />
    </div>
  );
}

/* ── Add / edit employee modal ── */
function EmployeeFormModal({ mode, initialData, isLoading, onClose, onSubmit }) {
  const [form, setForm] = useState({
    employeeCode: initialData?.employeeCode || '',
    name: initialData?.name || '',
    department: initialData?.department || '',
    designation: initialData?.designation || '',
    status: initialData?.status || 'ACTIVE',
  });
  const [touched, setTouched] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const valid = form.employeeCode.trim() && form.name.trim();
  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    onSubmit({
      employeeCode: form.employeeCode.trim(),
      name: form.name.trim(),
      department: form.department.trim() || null,
      designation: form.designation.trim() || null,
      status: form.status,
    });
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={isLoading}
      icon={Icons.user}
      title={mode === 'edit' ? `Edit ${initialData?.name}` : 'Add an employee'}
      subtitle={mode === 'edit' ? undefined : 'After saving, you’ll add a photo of their face.'}
      as="form"
      onSubmit={submit}
      footer={(
        <>
          <Button onClick={onClose} disabled={isLoading}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isLoading}>{mode === 'edit' ? 'Save changes' : 'Save and add face photo'}</Button>
        </>
      )}
    >
      <div className={uiStyles.formGrid}>
        <Field label="Employee ID" required error={touched && !form.employeeCode.trim() ? 'Enter the employee ID from their badge.' : undefined}>
          {(p) => <input {...p} value={form.employeeCode} onChange={(e) => set('employeeCode', e.target.value)} placeholder="e.g. EMP-00123" maxLength={64} />}
        </Field>
        <Field label="Full name" required error={touched && !form.name.trim() ? 'Enter their full name.' : undefined}>
          {(p) => <input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="As on their ID card" maxLength={120} />}
        </Field>
        <Field label="Department" optional>
          {(p) => <input {...p} value={form.department} onChange={(e) => set('department', e.target.value)} placeholder="e.g. Logistics" maxLength={120} />}
        </Field>
        <Field label="Job title" optional>
          {(p) => <input {...p} value={form.designation} onChange={(e) => set('designation', e.target.value)} placeholder="e.g. Crane operator" maxLength={120} />}
        </Field>
        <Field label="Status" hint="Inactive staff are treated as unknown by the cameras." className={uiStyles.span2}>
          {(p) => (
            <select {...p} value={form.status} onChange={(e) => set('status', e.target.value)}>
              <option value="ACTIVE">Active — works here</option><option value="INACTIVE">Inactive — left or suspended</option>
            </select>
          )}
        </Field>
      </div>
    </Modal>
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
      showToast(`Face photo added (quality ${(res.face?.quality ?? 0).toFixed?.(2) ?? '—'}).`, 'success');
      setPreview(null);
      await loadFaces();
      onChanged();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Could not enrol this image.', 'error');
    } finally { setBusy(false); }
  };

  const removeFace = async (faceId) => {
    setBusy(true);
    try { await deleteFace(employee.id, faceId); await loadFaces(); onChanged(); showToast('Face signature removed.', 'success'); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Could not remove face.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Drawer
      isOpen
      onClose={onClose}
      width={480}
      icon={Icons.face}
      title={employee.name}
      subtitle={`${employee.employeeCode}${employee.department ? ` · ${employee.department}` : ''}`}
    >
      <div className={styles.drawerBody}>
        <Banner tone="info">
          Only a numeric face signature is stored — the photo itself is never saved. Add 2–3 photos from different angles and lighting for the best recognition.
        </Banner>

        {canManage && (
          <div className={styles.enrollCard}>
            <SegmentedControl
              block
              ariaLabel="How to add a photo"
              value={mode}
              onChange={(v) => { setMode(v); setPreview(null); }}
              options={[
                { value: 'upload', label: 'Upload a photo', icon: Icons.upload },
                { value: 'webcam', label: 'Use webcam', icon: Icons.camera },
              ]}
            />

            {!preview && mode === 'upload' && (
              <button type="button" className={styles.uploadZone} onClick={() => fileRef.current?.click()}>
                {Icons.upload}
                <strong>Choose a face photo</strong>
                <span>JPG or PNG · one clear, front-facing face · up to 8 MB</span>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
              </button>
            )}

            {!preview && mode === 'webcam' && (
              <div className={styles.webcamZone}>
                {camError ? <p className={styles.camError}>{Icons.error}{camError}</p> : (
                  <>
                    <video ref={videoRef} className={styles.webcam} playsInline muted />
                    <Button variant="primary" icon={Icons.camera} onClick={captureFromWebcam}>Take photo</Button>
                  </>
                )}
              </div>
            )}

            {preview && (
              <div className={styles.previewZone}>
                <img src={preview.dataUrl} alt="Face to add" className={styles.previewImg} />
                <div className={styles.previewActions}>
                  <Button onClick={() => setPreview(null)} disabled={busy}>Try another</Button>
                  <Button variant="primary" icon={Icons.check} onClick={submitEnroll} loading={busy}>Use this photo</Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={styles.facesHead}>
          <h3>Saved face signatures</h3>
          <span className={styles.facesCount}>{faces ? faces.length : '…'}</span>
        </div>

        {!faces && <Skeleton height={56} radius={12} />}
        {faces && faces.length === 0 && (
          <EmptyState icon={Icons.face} title="No face photos yet" message="Until one is added, cameras will show this person as unknown." />
        )}

        {faces && faces.length > 0 && (
          <ul className={styles.faceList}>
            {faces.map((f) => (
              <li key={f.id} className={styles.faceRow}>
                <span className={styles.faceSig}>{Icons.face}</span>
                <div className={styles.faceInfo}>
                  <strong>Signature #{f.id.slice(0, 8)}</strong>
                  <span>Quality {f.quality != null ? Number(f.quality).toFixed(2) : '—'} · added {fmtDate(f.createdAt)}</span>
                </div>
                {canManage && <IconButton icon={Icons.trash} label="Remove this face signature" size="sm" onClick={() => removeFace(f.id)} disabled={busy} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

export default FaceRegistry;
