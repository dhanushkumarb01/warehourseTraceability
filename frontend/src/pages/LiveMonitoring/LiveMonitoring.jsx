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
import {
  PageHeader, SegmentedControl, IconButton, SearchInput, EmptyState, ErrorState, Skeleton, Modal, Button, LiveIndicator,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './LiveMonitoring.module.css';

const STREAM_LABELS = { RTSP: 'RTSP', RTMP: 'RTMP', HTTP: 'HTTP', LOCAL_WEBCAM: 'Webcam', UPLOADED_VIDEO: 'Video file' };
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
  const [searchText, setSearchText] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const data = await fetchLiveCameras({
        search: search || undefined, status: status || undefined,
        health: health || undefined, streamType: streamType || undefined,
      });
      setCameras(data); setError(null); setUpdatedAt(new Date());
    } catch (err) {
      setError(err);
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

  const onSearch = (v) => {
    setSearchText(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(v), 300);
  };

  const hasFilters = search || status || health || streamType;

  const clearFilters = () => { setStatus(''); setHealth(''); setStreamType(''); onSearch(''); };
  const offline = cameras.filter((c) => c.health === 'OFFLINE').length;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <PageHeader
        icon={Icons.video}
        title="Live view"
        term="Live monitoring"
        subtitle={loading ? 'Connecting to cameras…' : `${cameras.length} ${cameras.length === 1 ? 'camera' : 'cameras'} on the wall${offline ? ` · ${offline} not sending video` : ''}`}
        meta={<LiveIndicator updatedAt={updatedAt} onRefresh={() => load()} refreshing={loading} />}
        actions={(
          <SegmentedControl
            ariaLabel="Tiles per row"
            value={density}
            onChange={setDensity}
            options={[2, 3, 4].map((d) => ({ value: d, label: `${d} per row`, icon: Icons.grid }))}
          />
        )}
      />

      <div className={styles.toolbar}>
        <SearchInput className={styles.searchBox} value={searchText} onChange={onSearch} placeholder="Search cameras" />
        <div className={styles.filters}>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={uiStyles.input} aria-label="Status">
            <option value="">Any status</option><option value="ACTIVE">Switched on</option><option value="INACTIVE">Switched off</option><option value="MAINTENANCE">Maintenance</option>
          </select>
          <select value={health} onChange={(e) => setHealth(e.target.value)} className={uiStyles.input} aria-label="Connection">
            <option value="">Any connection</option><option value="ONLINE">Working</option><option value="OFFLINE">Not working</option><option value="UNKNOWN">Not checked yet</option>
          </select>
          <select value={streamType} onChange={(e) => setStreamType(e.target.value)} className={uiStyles.input} aria-label="Video source">
            <option value="">Any video source</option><option value="RTSP">RTSP</option><option value="RTMP">RTMP</option><option value="HTTP">HTTP</option><option value="LOCAL_WEBCAM">Webcam</option><option value="UPLOADED_VIDEO">Video file</option>
          </select>
          {hasFilters && <Button variant="ghost" size="sm" icon={Icons.close} onClick={clearFilters}>Clear filters</Button>}
        </div>
      </div>

      {loading && <div className={`${styles.grid} ${styles[`cols${density}`]}`}>{[...Array(density * 2)].map((_, i) => <Skeleton key={i} height={260} radius={20} />)}</div>}

      {!loading && error && (
        <div className={uiStyles.card}><ErrorState title="We couldn’t load the camera wall" error={error} onRetry={() => load()} /></div>
      )}

      {!loading && !error && cameras.length === 0 && (
        <div className={uiStyles.card}>
          <EmptyState
            icon={hasFilters ? Icons.search : Icons.video}
            title={hasFilters ? 'No cameras match these filters' : 'No cameras to watch yet'}
            message={hasFilters ? 'Try a different search, or clear the filters.' : 'Add cameras on the Cameras page and they’ll appear here.'}
            action={hasFilters ? <Button onClick={clearFilters}>Clear filters</Button> : <Button variant="primary" icon={Icons.camera} onClick={() => navigate('/surveillance/cameras')}>Go to Cameras</Button>}
          />
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
    <article className={`${styles.tile} ${camera.health === 'OFFLINE' ? styles.tileOffline : ''}`} ref={tileRef}>
      <div className={styles.tilePlayer}>
        <LiveStreamPlayer camera={camera} refreshSignal={refresh} onStatus={setLive} />
        <div className={styles.tileActions}>
          <IconButton icon={Icons.external} label="Enlarge" size="sm" variant="solid" onClick={onExpand} />
          <IconButton icon={Icons.grid} label="Full screen" size="sm" variant="solid" onClick={goFullscreen} />
          <IconButton icon={Icons.refresh} label="Reconnect video" size="sm" variant="solid" onClick={() => setRefresh((n) => n + 1)} />
        </div>
      </div>
      <div className={styles.tileBody}>
        <div className={styles.tileInfo}>
          <h3 className={styles.tileName} title={camera.cameraName}>
            <button type="button" onClick={onDetails}>{camera.cameraName}</button>
          </h3>
          {camera.location && <span className={styles.tileLoc} title={camera.location}>{Icons.pin}{camera.location}</span>}
        </div>
        <div className={styles.tileMeta}>
          <StatusBadge status={camera.health} size="sm" />
          {camera.status !== 'ACTIVE' && <StatusBadge status={camera.status} size="sm" />}
          <span className={styles.metricChip}>{[STREAM_LABELS[camera.streamType] || camera.streamType, res, fps != null ? `${fps} fps` : null].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
    </article>
  );
}

function ExpandModal({ camera, onClose, onDetails }) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={Icons.video}
      title={camera.cameraName}
      subtitle={[camera.cameraCode, camera.location].filter(Boolean).join(' · ')}
      footer={(
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="primary" iconRight={Icons.arrowRight} onClick={onDetails}>Camera details</Button>
        </>
      )}
    >
      <div className={styles.modalPlayer}>
        <LiveStreamPlayer camera={camera} showControls />
      </div>
    </Modal>
  );
}

export default LiveMonitoring;
