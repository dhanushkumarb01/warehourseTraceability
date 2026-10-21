/**
 * CameraManagement — surveillance camera registry.
 *
 * Server-driven list with search, filtering, sorting and pagination, rendered as
 * an industrial camera grid. Write actions (register / edit / disable / delete /
 * test) are gated client-side by the CAMERA_MANAGE group; the backend remains the
 * security boundary. Passwords are never present in any response.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchCameras, fetchCameraSummary, createCamera, updateCamera, deleteCamera, testSavedCamera,
} from '../../services/cameraService';
import { uploadVideo } from '../../services/streamService';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import CameraFormModal from '../../components/CameraFormModal/CameraFormModal';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import styles from './CameraManagement.module.css';

const STREAM_LABELS = { RTSP: 'RTSP', RTMP: 'RTMP', HTTP: 'HTTP', LOCAL_WEBCAM: 'Webcam', UPLOADED_VIDEO: 'Video File' };
const SORT_OPTIONS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'cameraName:asc', label: 'Name A–Z' },
  { value: 'cameraCode:asc', label: 'Code A–Z' },
  { value: 'status:asc', label: 'Status' },
  { value: 'health:asc', label: 'Health' },
  { value: 'lastConnectivityCheck:desc', label: 'Recently checked' },
];
const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never');

function CameraManagement() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can(GROUPS.CAMERA_MANAGE);

  const [data, setData] = useState({ items: [], total: 0, page: 1, pageSize: 12, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState('');
  const [streamType, setStreamType] = useState('');
  const [sort, setSort] = useState('createdAt:desc');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const [toast, setToast] = useState({ message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = useCallback(() => setToast({ message: '', type: 'info' }), []);

  const searchTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    const [sortBy, sortOrder] = sort.split(':');
    try {
      const res = await fetchCameras({
        page, pageSize: 12, sortBy, sortOrder,
        search: search || undefined, status: status || undefined,
        health: health || undefined, streamType: streamType || undefined,
      });
      setData(res);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load cameras.');
    } finally {
      setLoading(false);
    }
  }, [page, sort, search, status, health, streamType]);

  const loadSummary = useCallback(async () => {
    try { setSummary(await fetchCameraSummary()); } catch { /* non-critical */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Reset to page 1 when filters change.
  useEffect(() => { setPage(1); }, [search, status, health, streamType, sort]);

  const onSearchChange = (e) => {
    const v = e.target.value;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const openCreate = () => { setSelected(null); setFormMode('create'); setFormOpen(true); };
  const openEdit = (cam) => { setSelected(cam); setFormMode('edit'); setFormOpen(true); };

  const refresh = () => { load(); loadSummary(); };

  const handleSubmit = async (payload, videoFile) => {
    setSubmitting(true);
    try {
      let cameraId;
      if (formMode === 'edit') { await updateCamera(selected.id, payload); cameraId = selected.id; showToast('Camera updated.', 'success'); }
      else { const cam = await createCamera(payload); cameraId = cam.id; showToast('Camera registered.', 'success'); }
      // Persist the uploaded video to the backend (reuses the stream video
      // endpoint) so the camera references a durable file, not a browser blob.
      if (videoFile && payload.streamType === 'UPLOADED_VIDEO') {
        await uploadVideo(cameraId, videoFile);
      }
      setFormOpen(false); refresh();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      showToast(apiErrors?.length ? apiErrors.map((e) => e.message).join(' ') : (err.response?.data?.message || err.message || 'Operation failed.'), 'error');
    } finally { setSubmitting(false); }
  };

  const toggleStatus = async (cam) => {
    const next = cam.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    try { await updateCamera(cam.id, { status: next }); showToast(`Camera ${next === 'ACTIVE' ? 'enabled' : 'disabled'}.`, 'success'); refresh(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Update failed.', 'error'); }
  };

  const runTest = async (cam) => {
    setTestingId(cam.id);
    try {
      const res = await testSavedCamera(cam.id);
      const tone = res.result === 'SUCCESS' ? 'success' : res.result === 'CLIENT_SIDE' ? 'info' : 'error';
      showToast(`${cam.cameraCode}: ${res.message}`, tone);
      refresh();
    } catch (err) { showToast(err.response?.data?.message || err.message || 'Test failed.', 'error'); }
    finally { setTestingId(null); }
  };

  const handleDelete = async () => {
    if (!confirm) return;
    setDeleting(true);
    try { await deleteCamera(confirm.id); showToast(`Camera "${confirm.cameraCode}" deleted.`, 'success'); setConfirm(null); refresh(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Delete failed.', 'error'); }
    finally { setDeleting(false); }
  };

  const hasFilters = search || status || health || streamType;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Camera Management</h1>
            <p className={styles.pageBreadcrumb}>Surveillance &rsaquo; Camera Registry</p>
          </div>
        </div>
        {canManage && (
          <button className={styles.primaryBtn} onClick={openCreate}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            Register Camera
          </button>
        )}
      </div>

      {summary && (
        <div className={styles.statsStrip}>
          <Stat label="Total Cameras" value={summary.total} color="#2563eb" bg="#eff6ff" />
          <Stat label="Online" value={summary.health.ONLINE} color="#16a34a" bg="#f0fdf4" />
          <Stat label="Offline" value={summary.health.OFFLINE} color="#dc2626" bg="#fef2f2" />
          <Stat label="Active" value={summary.status.ACTIVE} color="#0891b2" bg="#ecfeff" />
          <Stat label="Maintenance" value={summary.status.MAINTENANCE} color="#d97706" bg="#fffbeb" />
        </div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
          <input type="text" placeholder="Search name, code, location, zone, purpose…" onChange={onSearchChange} className={styles.searchInput} />
        </div>
        <div className={styles.filters}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.filterSelect} aria-label="Filter by status">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="MAINTENANCE">Maintenance</option>
          </select>
          <select value={health} onChange={(e) => setHealth(e.target.value)} className={styles.filterSelect} aria-label="Filter by health">
            <option value="">All health</option>
            <option value="ONLINE">Online</option><option value="OFFLINE">Offline</option><option value="UNKNOWN">Unknown</option>
          </select>
          <select value={streamType} onChange={(e) => setStreamType(e.target.value)} className={styles.filterSelect} aria-label="Filter by connection">
            <option value="">All types</option>
            <option value="RTSP">RTSP</option><option value="RTMP">RTMP</option><option value="HTTP">HTTP</option>
            <option value="LOCAL_WEBCAM">Webcam</option><option value="UPLOADED_VIDEO">Video File</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={styles.filterSelect} aria-label="Sort">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div className={styles.grid}>{[...Array(6)].map((_, i) => <div key={i} className={styles.skeleton} />)}</div>
      )}

      {!loading && error && (
        <div className={styles.errorState}>
          <p>{error}</p>
          <button className={styles.retryBtn} onClick={load}>Retry</button>
        </div>
      )}

      {!loading && !error && data.items.length === 0 && (
        <div className={styles.emptyState}>
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="10" y="20" width="36" height="24" rx="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M46 28l8-4v16l-8-4" /></svg>
          <p className={styles.emptyTitle}>{hasFilters ? 'No cameras match your filters' : 'No cameras registered yet'}</p>
          <p className={styles.emptySubtitle}>{hasFilters ? 'Try clearing the search or filters.' : 'Register your first camera to begin building the surveillance network.'}</p>
          {!hasFilters && canManage && <button className={styles.primaryBtn} onClick={openCreate}>Register First Camera</button>}
        </div>
      )}

      {!loading && !error && data.items.length > 0 && (
        <>
          <div className={styles.grid}>
            {data.items.map((cam) => (
              <div key={cam.id} className={styles.card}>
                <div className={styles.cardTop}>
                  <span className={`${styles.healthDot} ${styles[`h_${cam.health}`]}`} title={`Health: ${cam.health}`} />
                  <div className={styles.cardTitleWrap}>
                    <h3 className={styles.cardName} onClick={() => navigate(`/surveillance/cameras/${cam.id}`)}>{cam.cameraName}</h3>
                    <span className={styles.cardCode}>{cam.cameraCode}</span>
                  </div>
                  <span className={styles.streamChip}>{STREAM_LABELS[cam.streamType] || cam.streamType}</span>
                </div>

                <div className={styles.cardMeta}>
                  <Meta icon="pin" label={cam.location} />
                  <Meta icon="zone" label={cam.zone} />
                  <Meta icon="eye" label={cam.cameraPurpose} />
                </div>

                <div className={styles.cardBadges}>
                  <StatusBadge status={cam.status} />
                  <StatusBadge status={cam.health} />
                </div>

                <div className={styles.cardChecked}>
                  <span>Last checked</span><strong>{fmtDate(cam.lastConnectivityCheck)}</strong>
                </div>

                <div className={styles.cardActions}>
                  <button className={styles.actBtn} onClick={() => navigate(`/surveillance/cameras/${cam.id}`)} title="View details">
                    <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                  </button>
                  {canManage && (
                    <>
                      <button className={styles.actBtn} onClick={() => runTest(cam)} disabled={testingId === cam.id} title="Test connection">
                        {testingId === cam.id ? <span className={styles.miniSpin} /> : <svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 10-2 0v1.07A6.002 6.002 0 004.07 9H3a1 1 0 000 2h1.07A6.002 6.002 0 009 15.93V17a1 1 0 102 0v-1.07A6.002 6.002 0 0015.93 11H17a1 1 0 100-2h-1.07A6.002 6.002 0 0011 4.07V3zM10 13a3 3 0 110-6 3 3 0 010 6z" /></svg>}
                      </button>
                      <button className={styles.actBtn} onClick={() => openEdit(cam)} title="Edit">
                        <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                      </button>
                      <button className={styles.actBtn} onClick={() => toggleStatus(cam)} title={cam.status === 'INACTIVE' ? 'Enable' : 'Disable'}>
                        {cam.status === 'INACTIVE'
                          ? <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                          : <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 5.11a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" /></svg>}
                      </button>
                      <button className={`${styles.actBtn} ${styles.del}`} onClick={() => setConfirm(cam)} title="Delete">
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

      <CameraFormModal
        isOpen={formOpen}
        onClose={() => { if (!submitting) setFormOpen(false); }}
        onSubmit={handleSubmit}
        initialData={selected}
        isLoading={submitting}
        mode={formMode}
      />

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        title="Delete Camera"
        message={`Permanently delete "${confirm?.cameraCode} – ${confirm?.cameraName}"? This cannot be undone.`}
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirm(null); }}
        isLoading={deleting}
      />
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
    pin: 'M10 18a8 8 0 100-16 8 8 0 000 16zm0-11a3 3 0 110 6 3 3 0 010-6z',
    zone: 'M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z',
    eye: 'M10 12a2 2 0 100-4 2 2 0 000 4z M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10z',
  };
  return (
    <span className={styles.meta} title={label}>
      <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d={icons[icon]} clipRule="evenodd" /></svg>
      {label}
    </span>
  );
}

export default CameraManagement;
