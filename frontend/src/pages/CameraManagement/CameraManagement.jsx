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
import {
  PageHeader, StatCard, Button, IconButton, SearchInput, EmptyState, ErrorState, Skeleton, Tooltip, Menu,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './CameraManagement.module.css';

const STREAM_LABELS = { RTSP: 'RTSP stream', RTMP: 'RTMP stream', HTTP: 'HTTP stream', LOCAL_WEBCAM: 'Webcam', UPLOADED_VIDEO: 'Video file' };
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
  const [searchText, setSearchText] = useState('');

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
      setError(err);
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

  const onSearchChange = (v) => {
    setSearchText(v);
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
      if (formMode === 'edit') { await updateCamera(selected.id, payload); cameraId = selected.id; showToast(`Camera ${payload.cameraCode || selected.cameraCode} updated.`, 'success'); }
      else { const cam = await createCamera(payload); cameraId = cam.id; showToast(`Camera ${cam.cameraCode} added.`, 'success'); }
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
    try { await updateCamera(cam.id, { status: next }); showToast(`${cam.cameraName} ${next === 'ACTIVE' ? 'turned on' : 'turned off'}.`, 'success'); refresh(); }
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
    try { await deleteCamera(confirm.id); showToast(`Camera ${confirm.cameraCode} deleted.`, 'success'); setConfirm(null); refresh(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Delete failed.', 'error'); }
    finally { setDeleting(false); }
  };

  const hasFilters = search || status || health || streamType;

  const clearFilters = () => { setStatus(''); setHealth(''); setStreamType(''); onSearchChange(''); };
  const filterCount = [search, status, health, streamType].filter(Boolean).length;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <PageHeader
        icon={Icons.camera}
        title="Cameras"
        term="Camera management"
        subtitle="Every security camera on site, whether it’s working, and where it points."
        actions={(
          <>
            <IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={refresh} disabled={loading} />
            {canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Add camera</Button>}
          </>
        )}
      />

      <section className={styles.kpis} aria-label="Camera summary">
        <StatCard icon={Icons.camera} label="Cameras" value={summary?.total ?? null} loading={!summary} tone="info" hint="Registered on site" />
        <StatCard icon={Icons.signal} label="Working" value={summary?.health.ONLINE ?? null} loading={!summary} tone="success"
          hint="Sending video right now" onClick={() => setHealth(health === 'ONLINE' ? '' : 'ONLINE')} />
        <StatCard icon={Icons.wifiOff} label="Not working" value={summary?.health.OFFLINE ?? null} loading={!summary}
          tone={summary?.health.OFFLINE > 0 ? 'danger' : 'success'} status={summary ? (summary.health.OFFLINE > 0 ? 'Check' : 'All good') : undefined}
          hint="Offline — no video coming in" onClick={() => setHealth(health === 'OFFLINE' ? '' : 'OFFLINE')} />
        <StatCard icon={Icons.cog} label="In maintenance" value={summary?.status.MAINTENANCE ?? null} loading={!summary} tone="warning"
          hint={`${summary?.status.ACTIVE ?? '—'} switched on and in use`} onClick={() => setStatus(status === 'MAINTENANCE' ? '' : 'MAINTENANCE')} />
      </section>

      <div className={styles.toolbar}>
        <SearchInput className={styles.searchBox} value={searchText} onChange={onSearchChange} placeholder="Search name, code, location or area" ariaLabel="Search cameras" />
        <div className={styles.filters}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={uiStyles.input} aria-label="Filter by status">
            <option value="">Any status</option>
            <option value="ACTIVE">Switched on</option><option value="INACTIVE">Switched off</option><option value="MAINTENANCE">Maintenance</option>
          </select>
          <select value={health} onChange={(e) => setHealth(e.target.value)} className={uiStyles.input} aria-label="Filter by connection">
            <option value="">Any connection</option>
            <option value="ONLINE">Working</option><option value="OFFLINE">Not working</option><option value="UNKNOWN">Not checked yet</option>
          </select>
          <select value={streamType} onChange={(e) => setStreamType(e.target.value)} className={uiStyles.input} aria-label="Filter by video source">
            <option value="">Any video source</option>
            <option value="RTSP">RTSP stream</option><option value="RTMP">RTMP stream</option><option value="HTTP">HTTP stream</option>
            <option value="LOCAL_WEBCAM">Webcam</option><option value="UPLOADED_VIDEO">Video file</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className={uiStyles.input} aria-label="Sort">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {filterCount > 0 && <Button variant="ghost" size="sm" icon={Icons.close} onClick={clearFilters}>Clear {filterCount} {filterCount === 1 ? 'filter' : 'filters'}</Button>}
        </div>
      </div>

      {loading && (
        <div className={styles.grid}>{[...Array(6)].map((_, i) => <Skeleton key={i} height={232} radius={20} />)}</div>
      )}

      {!loading && error && (
        <div className={uiStyles.card}><ErrorState title="We couldn’t load the cameras" error={error} onRetry={load} /></div>
      )}

      {!loading && !error && data.items.length === 0 && (
        <div className={uiStyles.card}>
          <EmptyState
            icon={hasFilters ? Icons.search : Icons.camera}
            title={hasFilters ? 'No cameras match these filters' : 'No cameras added yet'}
            message={hasFilters ? 'Try a different search, or clear the filters.' : 'Add your first camera to start watching the yard.'}
            action={hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Add camera</Button>}
          />
        </div>
      )}

      {!loading && !error && data.items.length > 0 && (
        <>
          <div className={styles.grid}>
            {data.items.map((cam) => (
              <article key={cam.id} className={`${styles.card} ${styles[`h_${cam.health}`] || ''}`}>
                <div className={styles.cardTop}>
                  <span className={styles.camIcon}>{Icons.camera}</span>
                  <div className={styles.cardTitleWrap}>
                    <h3 className={styles.cardName}>
                      <button type="button" onClick={() => navigate(`/surveillance/cameras/${cam.id}`)}>{cam.cameraName}</button>
                    </h3>
                    <span className={styles.cardCode}>{cam.cameraCode} · {STREAM_LABELS[cam.streamType] || cam.streamType}</span>
                  </div>
                  {canManage && (
                    <Menu
                      label={`More actions for ${cam.cameraName}`}
                      items={[
                        { label: 'Edit details', icon: Icons.edit, onClick: () => openEdit(cam) },
                        { label: cam.status === 'INACTIVE' ? 'Turn on' : 'Turn off', icon: cam.status === 'INACTIVE' ? Icons.play : Icons.pause, onClick: () => toggleStatus(cam) },
                        { label: 'Delete camera', icon: Icons.trash, onClick: () => setConfirm(cam), danger: true },
                      ]}
                    />
                  )}
                </div>

                <div className={styles.cardMeta}>
                  {cam.location && <span className={styles.meta} title="Location">{Icons.pin}{cam.location}</span>}
                  {cam.zone && <span className={styles.meta} title="Yard area">{Icons.layers}{cam.zone}</span>}
                  {cam.cameraPurpose && <span className={styles.meta} title="What it watches">{Icons.eye}{cam.cameraPurpose}</span>}
                </div>

                <div className={styles.cardBadges}>
                  <StatusBadge status={cam.health} size="sm" />
                  <StatusBadge status={cam.status} size="sm" />
                </div>

                <div className={styles.cardFoot}>
                  <span className={styles.cardChecked}>Last checked: <strong>{fmtDate(cam.lastConnectivityCheck)}</strong></span>
                  <div className={styles.cardActions}>
                    {canManage && (
                      <Tooltip content="Check if the camera is reachable">
                        <Button size="sm" variant="ghost" icon={Icons.sync} loading={testingId === cam.id} onClick={() => runTest(cam)}>Test</Button>
                      </Tooltip>
                    )}
                    <Button size="sm" variant="secondary" iconRight={Icons.arrowRight} onClick={() => navigate(`/surveillance/cameras/${cam.id}`)}>Open</Button>
                  </div>
                </div>
              </article>
            ))}
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
        title="Delete this camera?"
        message={`${confirm?.cameraName} (${confirm?.cameraCode}) will be removed for good. This can’t be undone.`}
        details={['Its settings and detection rules are deleted too.', 'Recorded alerts stay in the alert history.']}
        confirmLabel="Delete camera"
        onConfirm={handleDelete}
        onCancel={() => { if (!deleting) setConfirm(null); }}
        isLoading={deleting}
      />
    </div>
  );
}

export default CameraManagement;
