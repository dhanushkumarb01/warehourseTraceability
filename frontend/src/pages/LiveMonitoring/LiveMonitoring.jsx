/**
 * LiveMonitoring — the surveillance video wall.
 *
 * A professional multi-camera monitoring surface (NOT an AI dashboard): every
 * registered camera rendered as a live tile through the backend streaming layer,
 * with search, filtering, adjustable grid density, and per-tile expand /
 * full-screen / refresh / details controls. No AI overlays — clean live video.
 *
 * Scales to many cameras: one /streams/live query for the wall, and each tile
 * shares a single reference-counted backend session.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchLiveCameras } from '../../services/streamService';
import LiveStreamPlayer from '../../components/LiveStreamPlayer/LiveStreamPlayer';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import styles from './LiveMonitoring.module.css';

const STREAM_LABELS = { RTSP: 'RTSP', RTMP: 'RTMP', HTTP: 'HTTP', LOCAL_WEBCAM: 'Webcam', UPLOADED_VIDEO: 'Video File' };
const LIST_POLL_MS = 20000;

function LiveMonitoring() {
  const navigate = useNavigate();
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [health, setHealth] = useState('');
  const [streamType, setStreamType] = useState('');
  const [density, setDensity] = useState(3); // columns: 2 | 3 | 4
  const [expanded, setExpanded] = useState(null);

  const [toast, setToast] = useState({ message: '', type: 'info' });
  const clearToast = useCallback(() => setToast({ message: '', type: 'info' }), []);
  const searchTimer = useRef(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await fetchLiveCameras({
        search: search || undefined, status: status || undefined,
        health: health || undefined, streamType: streamType || undefined,
      });
      setCameras(data); setError(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load cameras.');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [search, status, health, streamType]);

  useEffect(() => { load(); }, [load]);
  // Background refresh of the wall membership/health (tiles poll their own status).
  useEffect(() => {
    const t = setInterval(() => load(true), LIST_POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const onSearch = (e) => {
    const v = e.target.value;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const hasFilters = search || status || health || streamType;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 6a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2M9 10l5 3-5 3v-6z" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Live Monitoring</h1>
            <p className={styles.pageBreadcrumb}>Surveillance &rsaquo; Live Camera Wall</p>
          </div>
        </div>
        <div className={styles.densityGroup} role="group" aria-label="Grid density">
          {[2, 3, 4].map((d) => (
            <button key={d} className={`${styles.densityBtn} ${density === d ? styles.densityActive : ''}`} onClick={() => setDensity(d)} title={`${d} columns`}>
              {d}×
            </button>
          ))}
          <button className={styles.refreshAll} onClick={() => load()} title="Refresh wall">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
          <input type="text" placeholder="Search cameras…" onChange={onSearch} className={styles.searchInput} />
        </div>
        <div className={styles.filters}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={styles.filterSelect} aria-label="Status">
            <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="MAINTENANCE">Maintenance</option>
          </select>
          <select value={health} onChange={(e) => setHealth(e.target.value)} className={styles.filterSelect} aria-label="Health">
            <option value="">All health</option><option value="ONLINE">Online</option><option value="OFFLINE">Offline</option><option value="UNKNOWN">Unknown</option>
          </select>
          <select value={streamType} onChange={(e) => setStreamType(e.target.value)} className={styles.filterSelect} aria-label="Type">
            <option value="">All types</option><option value="RTSP">RTSP</option><option value="RTMP">RTMP</option><option value="HTTP">HTTP</option><option value="LOCAL_WEBCAM">Webcam</option><option value="UPLOADED_VIDEO">Video File</option>
          </select>
        </div>
      </div>

      {loading && <div className={`${styles.grid} ${styles[`cols${density}`]}`}>{[...Array(density * 2)].map((_, i) => <div key={i} className={styles.skeleton} />)}</div>}

      {!loading && error && (
        <div className={styles.errorState}><p>{error}</p><button className={styles.retryBtn} onClick={() => load()}>Retry</button></div>
      )}

      {!loading && !error && cameras.length === 0 && (
        <div className={styles.emptyState}>
          <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="10" y="18" width="36" height="26" rx="3" /><path strokeLinecap="round" strokeLinejoin="round" d="M46 26l8-4v18l-8-4" /></svg>
          <p className={styles.emptyTitle}>{hasFilters ? 'No cameras match your filters' : 'No cameras to monitor'}</p>
          <p className={styles.emptySubtitle}>{hasFilters ? 'Try clearing the search or filters.' : 'Register cameras in Camera Management to see them on the wall.'}</p>
        </div>
      )}

      {!loading && !error && cameras.length > 0 && (
        <div className={`${styles.grid} ${styles[`cols${density}`]}`}>
          {cameras.map((cam) => (
            <CameraTile key={cam.id} camera={cam} onExpand={() => setExpanded(cam)} onDetails={() => navigate(`/surveillance/cameras/${cam.id}`)} />
          ))}
        </div>
      )}

      {expanded && <ExpandModal camera={expanded} onClose={() => setExpanded(null)} onDetails={() => { const id = expanded.id; setExpanded(null); navigate(`/surveillance/cameras/${id}`); }} />}
    </div>
  );
}

function CameraTile({ camera, onExpand, onDetails }) {
  const tileRef = useRef(null);
  const [refresh, setRefresh] = useState(0);
  const [live, setLive] = useState(null);

  const goFullscreen = () => {
    const el = tileRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };

  const res = live?.resolution || camera.resolution;
  const fps = live?.fps ?? camera.fps;

  return (
    <div className={styles.tile} ref={tileRef}>
      <div className={styles.tilePlayer}>
        <LiveStreamPlayer camera={camera} refreshSignal={refresh} onStatus={setLive} />
      </div>
      <div className={styles.tileBody}>
        <div className={styles.tileInfo}>
          <h3 className={styles.tileName} title={camera.cameraName}>{camera.cameraName}</h3>
          <span className={styles.tileLoc} title={camera.location}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm0-11a3 3 0 110 6 3 3 0 010-6z" clipRule="evenodd" /></svg>
            {camera.location}
          </span>
        </div>
        <div className={styles.tileMeta}>
          <StatusBadge status={camera.status} />
          <StatusBadge status={camera.health} />
          <span className={styles.streamChip}>{STREAM_LABELS[camera.streamType] || camera.streamType}</span>
          {(res || fps != null) && <span className={styles.metricChip}>{[res, fps != null ? `${fps}fps` : null].filter(Boolean).join(' · ')}</span>}
        </div>
      </div>
      <div className={styles.tileActions}>
        <button className={styles.tileBtn} onClick={onExpand} title="Expand"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 110-2h4a1 1 0 011 1v4a1 1 0 11-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 112 0v1.586l2.293-2.293a1 1 0 011.414 1.414L6.414 15H8a1 1 0 110 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 110-2h1.586l-2.293-2.293a1 1 0 011.414-1.414L15 13.586V12a1 1 0 011-1z" /></svg></button>
        <button className={styles.tileBtn} onClick={goFullscreen} title="Full screen"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M3 3h5v2H5v3H3V3zm9 0h5v5h-2V5h-3V3zM3 12h2v3h3v2H3v-5zm14 0v5h-5v-2h3v-3h2z" /></svg></button>
        <button className={styles.tileBtn} onClick={() => setRefresh((n) => n + 1)} title="Refresh stream"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg></button>
        <button className={styles.tileBtn} onClick={onDetails} title="View details"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg></button>
      </div>
    </div>
  );
}

function ExpandModal({ camera, onClose, onDetails }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{camera.cameraName}</h2>
            <span className={styles.modalSub}>{camera.cameraCode} · {camera.location}</span>
          </div>
          <div className={styles.modalActions}>
            <button className={styles.modalSecBtn} onClick={onDetails}>View Details</button>
            <button className={styles.modalCloseBtn} onClick={onClose} aria-label="Close"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
          </div>
        </div>
        <div className={styles.modalPlayer}>
          <LiveStreamPlayer camera={camera} showControls />
        </div>
      </div>
    </div>
  );
}

export default LiveMonitoring;
