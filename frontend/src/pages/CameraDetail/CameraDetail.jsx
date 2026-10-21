/**
 * CameraDetail — per-camera surveillance page.
 *
 * Information, live preview, connection details (password never exposed), health,
 * audit history, and the AI Safety Features configuration. The configuration is
 * presented as plain-language "safety rule" cards: warehouse staff enable a
 * feature, set simple options, and (where needed) draw an area — without ever
 * seeing confidence scores, thresholds or calibration. All technical values are
 * still saved unchanged; they live under each card's "Advanced settings".
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchCamera, updateCamera, testSavedCamera } from '../../services/cameraService';
import { fetchStreamStatus, fetchStreamLogs, uploadVideo, clearVideo } from '../../services/streamService';
import { fetchMotionConfig, updateMotionConfig, fetchCameraAlerts, snapshotUrl,
  fetchWallConfig, updateWallConfig, fetchWagonConfig, updateWagonConfig,
  fetchOverSpeedConfig, updateOverSpeedConfig,
  fetchCancelledConfig, updateCancelledConfig,
  fetchFaceConfig, updateFaceConfig, updateZones } from '../../services/surveillanceService';
import { fetchRegistrySummary } from '../../services/faceService';
import { fetchAuditLogs } from '../../services/authApi';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import LiveStreamPlayer from '../../components/LiveStreamPlayer/LiveStreamPlayer';
import ZoneEditor from '../../components/ZoneEditor/ZoneEditor';
import CameraFormModal from '../../components/CameraFormModal/CameraFormModal';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import styles from './CameraDetail.module.css';

const STREAM_LABELS = { RTSP: 'RTSP', RTMP: 'RTMP', HTTP: 'HTTP / MJPEG', LOCAL_WEBCAM: 'Local Webcam', UPLOADED_VIDEO: 'Uploaded Video' };
const STREAM_TONE = { ONLINE: 'ok', CONNECTING: 'warn', RECONNECTING: 'warn', ERROR: 'bad', OFFLINE: 'idle' };
const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtDay = (d) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

// ── Plain-language ↔ technical value mappings ───────────────────────────────
// These let staff pick "Low / Medium / High" while the same numeric values are
// saved to the backend. Detection confidence is inverted: higher sensitivity =
// lower confidence threshold (catch more), lower sensitivity = higher threshold.
const SENSITIVITY = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const CONF_BY_LEVEL = { low: 0.6, medium: 0.45, high: 0.3 };
const levelToConf = (lvl) => CONF_BY_LEVEL[lvl] ?? 0.45;
const confToLevel = (v) => {
  const n = Number(v);
  let best = 'custom'; let bestD = 0.081; // must be within tolerance to snap to a preset
  for (const [lvl, c] of Object.entries(CONF_BY_LEVEL)) {
    const d = Math.abs(c - n);
    if (d < bestD) { bestD = d; best = lvl; }
  }
  return best;
};
const FACE_STRICTNESS = [
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High security' },
];
const THR_BY_LEVEL = { normal: 0.45, high: 0.6 };
const levelToThreshold = (lvl) => THR_BY_LEVEL[lvl] ?? 0.45;
const thresholdToLevel = (v) => {
  const n = Number(v);
  if (Math.abs(n - 0.6) <= 0.06) return 'high';
  if (Math.abs(n - 0.45) <= 0.07) return 'normal';
  return 'custom';
};
const PRIORITY = [
  { value: 'LOW', label: 'Low' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'HIGH', label: 'High' },
  { value: 'CRITICAL', label: 'Critical' },
];

const FEATURE_ICONS = {
  motion: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l2.5-7 5 14 2.5-7H21" /></svg>,
  wall: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.4-3 8.2-7 9-4-.8-7-4.6-7-9V6l7-3z" /></svg>,
  wagon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" /></svg>,
  speed: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 14a2 2 0 100-4 2 2 0 000 4zm0 0l4-4M5 19a9 9 0 1114 0" /></svg>,
  cancelled: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M18.36 5.64A9 9 0 105.64 18.36 9 9 0 0018.36 5.64zM5.64 5.64l12.72 12.72" /></svg>,
  face: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M12 13a3 3 0 100-6 3 3 0 000 6zM4 8V6a2 2 0 012-2h2m8 0h2a2 2 0 012 2v2m0 8v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" /></svg>,
};

function CameraDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can(GROUPS.CAMERA_MANAGE);
  const canAudit = can(GROUPS.AUDIT_VIEW);

  const [cam, setCam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [audit, setAudit] = useState([]);
  const [streamStatus, setStreamStatus] = useState(null);
  const [streamLogs, setStreamLogs] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [motion, setMotion] = useState(null);
  const [motionSaving, setMotionSaving] = useState(false);
  const [wallCfg, setWallCfg] = useState(null);
  const [wagonCfg, setWagonCfg] = useState(null);
  const [overSpeedCfg, setOverSpeedCfg] = useState(null);
  const [cancelledCfg, setCancelledCfg] = useState(null);
  const [faceCfg, setFaceCfg] = useState(null);
  const [faceRegistry, setFaceRegistry] = useState(null);
  const [zones, setZones] = useState([]);
  const [wallSaving, setWallSaving] = useState(false);
  const [wagonSaving, setWagonSaving] = useState(false);
  const [overSpeedSaving, setOverSpeedSaving] = useState(false);
  const [cancelledSaving, setCancelledSaving] = useState(false);
  const [faceSaving, setFaceSaving] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const fileInput = useRef(null);

  const [toast, setToast] = useState({ message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = useCallback(() => setToast({ message: '', type: 'info' }), []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setCam(await fetchCamera(id)); }
    catch (err) { setError(err.response?.data?.message || err.message || 'Camera not found.'); }
    finally { setLoading(false); }
  }, [id]);

  const loadAudit = useCallback(async () => {
    if (!canAudit) return;
    try {
      const logs = await fetchAuditLogs({ module: 'CAMERA', limit: 200 });
      setAudit(logs.filter((l) => l.entityId === id).slice(0, 12));
    } catch { /* non-critical */ }
  }, [id, canAudit]);

  const loadStream = useCallback(async () => {
    try { setStreamStatus(await fetchStreamStatus(id)); } catch { /* non-critical */ }
    try { setStreamLogs(await fetchStreamLogs(id, 20)); } catch { /* non-critical */ }
  }, [id]);

  const loadSurveillance = useCallback(async () => {
    try { setMotion((await fetchMotionConfig(id)).motion); } catch { /* non-critical */ }
    try { const w = await fetchWallConfig(id); setWallCfg(w.wallIntrusion); setZones(w.zones || []); } catch { /* non-critical */ }
    try { setWagonCfg((await fetchWagonConfig(id)).manInsideWagon); } catch { /* non-critical */ }
    try { setOverSpeedCfg((await fetchOverSpeedConfig(id)).overSpeed); } catch { /* non-critical */ }
    try { setCancelledCfg((await fetchCancelledConfig(id)).cancelledVehicle); } catch { /* non-critical */ }
    try { setFaceCfg((await fetchFaceConfig(id)).faceDetection); } catch { /* non-critical */ }
    try { setFaceRegistry(await fetchRegistrySummary()); } catch { /* non-critical */ }
    try { setRecentAlerts(await fetchCameraAlerts(id, 8)); } catch { /* non-critical */ }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadAudit(); }, [loadAudit]);
  useEffect(() => { loadSurveillance(); }, [loadSurveillance]);
  useEffect(() => {
    loadStream();
    const t = setInterval(loadStream, 8000);
    return () => clearInterval(t);
  }, [loadStream]);

  const saveMotion = async (patch) => {
    setMotionSaving(true);
    try { setMotion((await updateMotionConfig(id, patch)).motion); showToast('Motion detection saved.', 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save.', 'error'); }
    finally { setMotionSaving(false); }
  };

  const saveWall = async (patch) => {
    setWallSaving(true);
    try { setWallCfg((await updateWallConfig(id, patch)).wallIntrusion); showToast('Boundary protection saved.', 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save.', 'error'); }
    finally { setWallSaving(false); }
  };

  const saveWagon = async (patch) => {
    setWagonSaving(true);
    try { setWagonCfg((await updateWagonConfig(id, patch)).manInsideWagon); showToast('Wagon safety monitoring saved.', 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save.', 'error'); }
    finally { setWagonSaving(false); }
  };

  const saveOverSpeed = async (patch) => {
    setOverSpeedSaving(true);
    try { setOverSpeedCfg((await updateOverSpeedConfig(id, patch)).overSpeed); showToast('Speed monitoring saved.', 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save.', 'error'); }
    finally { setOverSpeedSaving(false); }
  };

  const saveCancelled = async (patch) => {
    setCancelledSaving(true);
    try { setCancelledCfg((await updateCancelledConfig(id, patch)).cancelledVehicle); showToast('Cancelled-vehicle monitoring saved.', 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save.', 'error'); }
    finally { setCancelledSaving(false); }
  };

  const saveFace = async (patch) => {
    setFaceSaving(true);
    try { setFaceCfg((await updateFaceConfig(id, patch)).faceDetection); showToast('Face recognition saved.', 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save.', 'error'); }
    finally { setFaceSaving(false); }
  };

  // Zones are stored as one list per camera; each editor owns its family and
  // merges with the others so a boundary and a wagon zone coexist.
  const isWagon = (z) => ['WAGON_ZONE', 'WAGON'].includes(String(z.type || '').toUpperCase());
  const persistZones = async (full, label) => {
    try { const r = await updateZones(id, full); setZones(r.zones || []); showToast(label, 'success'); loadSurveillance(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to save area.', 'error'); }
  };
  const saveBoundaryZones = (arr) => persistZones([...zones.filter(isWagon), ...arr], arr.length ? 'Restricted area saved.' : 'Restricted area cleared.');
  const saveWagonZones = (arr) => persistZones([...zones.filter((z) => !isWagon(z)), ...arr], arr.length ? 'Wagon area saved.' : 'Wagon area cleared.');

  const handleVideoPick = async (e) => {
    const file = e.target.files?.[0];
    if (file) e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      await uploadVideo(id, file);
      showToast('Demo video uploaded and associated.', 'success');
      load(); loadStream(); loadAudit();
    } catch (err) { showToast(err.response?.data?.message || err.message || 'Upload failed.', 'error'); }
    finally { setUploading(false); }
  };

  const handleClearVideo = async () => {
    try { await clearVideo(id); showToast('Demo video removed.', 'success'); load(); loadStream(); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Failed to remove video.', 'error'); }
  };

  const handleEdit = async (payload, videoFile) => {
    setSubmitting(true);
    try {
      await updateCamera(id, payload);
      if (videoFile && payload.streamType === 'UPLOADED_VIDEO') await uploadVideo(id, videoFile);
      showToast('Camera updated.', 'success'); setEditOpen(false); load(); loadAudit(); loadStream();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      showToast(apiErrors?.length ? apiErrors.map((e) => e.message).join(' ') : (err.response?.data?.message || err.message || 'Update failed.'), 'error');
    } finally { setSubmitting(false); }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testSavedCamera(id);
      const tone = res.result === 'SUCCESS' ? 'success' : res.result === 'CLIENT_SIDE' ? 'info' : 'error';
      showToast(res.message, tone);
      load(); loadAudit();
    } catch (err) { showToast(err.response?.data?.message || err.message || 'Test failed.', 'error'); }
    finally { setTesting(false); }
  };

  if (loading) return <div className={styles.page}><div className={styles.loading}>Loading camera…</div></div>;
  if (error) return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={() => navigate('/surveillance/cameras')}>← Back to Cameras</button>
      <div className={styles.errorState}><p>{error}</p></div>
    </div>
  );

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <button className={styles.backBtn} onClick={() => navigate('/surveillance/cameras')}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        Camera Registry
      </button>

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={`${styles.healthDot} ${styles[`h_${cam.health}`]}`} title={`Health: ${cam.health}`} />
          <div>
            <h1 className={styles.title}>{cam.cameraName}</h1>
            <p className={styles.code}>{cam.cameraCode} · {cam.location}</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <StatusBadge status={cam.status} />
          <StatusBadge status={cam.health} />
          {canManage && (
            <>
              <button className={styles.secBtn} onClick={handleTest} disabled={testing}>
                {testing ? <span className={styles.miniSpin} /> : <svg viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 10-2 0v1.07A6.002 6.002 0 004.07 9H3a1 1 0 000 2h1.07A6.002 6.002 0 009 15.93V17a1 1 0 102 0v-1.07A6.002 6.002 0 0015.93 11H17a1 1 0 100-2h-1.07A6.002 6.002 0 0011 4.07V3zM10 13a3 3 0 110-6 3 3 0 010 6z" /></svg>}
                Test
              </button>
              <button className={styles.primaryBtn} onClick={() => setEditOpen(true)}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className={styles.layout}>
        {/* ── Left column ─────────────────────────────────────────── */}
        <div className={styles.colMain}>
          <Panel title="Live Stream" tag={STREAM_LABELS[cam.streamType]}>
            <div className={styles.livePlayer}>
              <LiveStreamPlayer camera={cam} showControls />
            </div>
            {cam.streamType === 'UPLOADED_VIDEO' && canManage && (
              <div className={styles.videoControls}>
                <input ref={fileInput} type="file" accept="video/*" onChange={handleVideoPick} hidden />
                <button className={styles.videoBtn} onClick={() => fileInput.current?.click()} disabled={uploading}>
                  {uploading ? <span className={styles.miniSpin} /> : <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>}
                  {cam.hasVideo ? 'Replace demo video' : 'Upload demo video'}
                </button>
                {cam.hasVideo && (
                  <>
                    <span className={styles.videoName}>{cam.videoFileName}</span>
                    <button className={styles.videoClear} onClick={handleClearVideo} disabled={uploading}>Remove</button>
                  </>
                )}
              </div>
            )}
            {(cam.streamType === 'RTSP' || cam.streamType === 'RTMP') && (
              <p className={styles.previewNote}>This {cam.streamType} feed is verified for reachability now; live playback is delivered through the backend media gateway (HLS/WebRTC) once enabled — no frontend change required.</p>
            )}
          </Panel>

          <Panel title="Camera Information">
            <dl className={styles.dl}>
              <Row k="Name" v={cam.cameraName} />
              <Row k="Code" v={cam.cameraCode} mono />
              <Row k="Location" v={cam.location} />
              <Row k="Type" v={cam.cameraType} />
              <Row k="Purpose" v={cam.cameraPurpose} />
              <Row k="Zone" v={cam.zone} />
              <Row k="Site" v={cam.site || '—'} />
              <Row k="Installed" v={fmtDay(cam.installationDate)} />
              <Row k="Description" v={cam.description || '—'} full />
              <Row k="Notes" v={cam.notes || '—'} full />
            </dl>
          </Panel>

          {/* ── AI Safety Features ─────────────────────────────────── */}
          <div className={styles.aiSection}>
            <div className={styles.aiSectionHead}>
              <div>
                <h2 className={styles.aiSectionTitle}>AI Safety Features</h2>
                <p className={styles.aiSectionSub}>Turn on the checks this camera should run. Each one watches the live feed and alerts your team automatically.</p>
              </div>
            </div>

            <MotionCard motion={motion} canManage={canManage} saving={motionSaving} onSave={saveMotion} />
            <WallCard wall={wallCfg} camera={cam} zones={zones.filter((z) => !isWagon(z))} canManage={canManage} saving={wallSaving} onSave={saveWall} onSaveZone={saveBoundaryZones} />
            <WagonCard wagon={wagonCfg} camera={cam} zones={zones.filter(isWagon)} canManage={canManage} saving={wagonSaving} onSave={saveWagon} onSaveZone={saveWagonZones} />
            <OverSpeedCard overspeed={overSpeedCfg} canManage={canManage} saving={overSpeedSaving} onSave={saveOverSpeed} />
            <CancelledCard cancelled={cancelledCfg} canManage={canManage} saving={cancelledSaving} onSave={saveCancelled} />
            <FaceCard face={faceCfg} registered={faceRegistry?.employees} canManage={canManage} saving={faceSaving} onSave={saveFace} onOpenRegistry={() => navigate('/surveillance/faces')} />
          </div>

          {/* AI Surveillance — recent alerts for this camera */}
          <Panel title="Recent Alerts">
            {recentAlerts.length === 0 ? (
              <p className={styles.muted}>No alerts have been raised for this camera.</p>
            ) : (
              <ul className={styles.alertList}>
                {recentAlerts.map((a) => (
                  <li key={a.id} className={styles.alertItem} onClick={() => navigate('/surveillance/alerts')}>
                    {a.hasSnapshot
                      ? <img className={styles.alertThumb} src={snapshotUrl(a.id)} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                      : <span className={styles.alertThumbPh} />}
                    <div className={styles.alertBody}>
                      <div className={styles.alertHead}><StatusBadge status={a.severity} /><span className={styles.alertTypeSm}>{a.alertType}</span></div>
                      <span className={styles.alertMsgSm}>{a.message}</span>
                      <span className={styles.alertMetaSm}>{a.status} · {fmt(a.detectedAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── Right column ────────────────────────────────────────── */}
        <div className={styles.colSide}>
          <Panel title="Connection Details">
            <dl className={styles.dl}>
              <Row k="Stream Type" v={STREAM_LABELS[cam.streamType] || cam.streamType} />
              <Row k="Stream URL" v={cam.streamUrl || '—'} mono full />
              <Row k="Username" v={cam.username || '—'} />
              <Row k="Password" v={<span className={styles.secret}>{cam.hasPassword ? '•••••••• encrypted' : 'Not set'}</span>} />
            </dl>
            <p className={styles.secNote}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
              Credentials are encrypted at rest (AES-256) and never returned by the API.
            </p>
          </Panel>

          <Panel title="Current Stream Status">
            <dl className={styles.dl}>
              <Row k="Stream" v={<StreamChip status={streamStatus?.status || cam.streamStatus} />} />
              <Row k="Viewers" v={streamStatus?.viewers ?? 0} />
              <Row k="Resolution" v={streamStatus?.resolution || cam.resolution || '—'} />
              <Row k="FPS" v={(streamStatus?.fps ?? cam.fps) != null ? (streamStatus?.fps ?? cam.fps) : '—'} />
              <Row k="Last Connected" v={fmt(streamStatus?.lastConnectedAt || cam.lastConnectedAt)} full />
              <Row k="Last Disconnected" v={fmt(streamStatus?.lastDisconnectedAt || cam.lastDisconnectedAt)} full />
              <Row k="Last Stream" v={fmt(streamStatus?.lastStreamAt || cam.lastStreamAt)} full />
            </dl>
            {streamStatus?.error && <p className={styles.streamErr}>{streamStatus.error}</p>}
          </Panel>

          <Panel title="Health & Connectivity">
            <dl className={styles.dl}>
              <Row k="Health" v={<StatusBadge status={cam.health} />} />
              <Row k="Last Check" v={fmt(cam.lastConnectivityCheck)} />
              <Row k="Last Result" v={cam.lastConnectivityResult || 'Not tested'} />
            </dl>
          </Panel>

          <Panel title="Connection Logs">
            {streamLogs.length === 0 ? (
              <p className={styles.muted}>No connection events recorded yet.</p>
            ) : (
              <ul className={styles.timeline}>
                {streamLogs.map((log) => (
                  <li key={log.id} className={styles.tItem}>
                    <span className={`${styles.tDot} ${styles[`d_${STREAM_TONE[log.status] || 'idle'}`]}`} />
                    <div className={styles.tBody}>
                      <span className={styles.tAction}>{log.event.replace(/_/g, ' ').toLowerCase()}</span>
                      <span className={styles.tMeta}>{log.status} · {fmt(log.createdAt)}</span>
                      {log.message && <span className={styles.tMsg}>{log.message}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Audit History">
            {!canAudit ? (
              <p className={styles.muted}>You do not have permission to view audit history.</p>
            ) : audit.length === 0 ? (
              <p className={styles.muted}>No audit entries for this camera yet.</p>
            ) : (
              <ul className={styles.timeline}>
                {audit.map((log) => (
                  <li key={log.id} className={styles.tItem}>
                    <span className={styles.tDot} />
                    <div className={styles.tBody}>
                      <span className={styles.tAction}>{log.action.replace(/^CAMERA_/, '').replace(/_/g, ' ')}</span>
                      <span className={styles.tMeta}>{log.user?.username || 'system'} · {fmt(log.timestamp)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <CameraFormModal
        isOpen={editOpen}
        onClose={() => { if (!submitting) setEditOpen(false); }}
        onSubmit={handleEdit}
        initialData={cam}
        isLoading={submitting}
        mode="edit"
      />
    </div>
  );
}

/* ── Layout / shared display primitives ────────────────────────────────────── */
function Panel({ title, tag, children }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {tag && <span className={styles.panelTag}>{tag}</span>}
      </div>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

function StreamChip({ status }) {
  const s = status || 'OFFLINE';
  const tone = STREAM_TONE[s] || 'idle';
  return (
    <span className={`${styles.streamChip} ${styles[`sc_${tone}`]}`}>
      {s === 'ONLINE' && <i className={styles.scDot} />}
      {s.charAt(0) + s.slice(1).toLowerCase()}
    </span>
  );
}

function Row({ k, v, mono, full }) {
  return (
    <div className={`${styles.row} ${full ? styles.rowFull : ''}`}>
      <dt className={styles.dt}>{k}</dt>
      <dd className={`${styles.dd} ${mono ? styles.mono : ''}`}>{v}</dd>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className={styles.cfgField}>
      <label className={styles.cfgLabel}>{label}</label>
      {children}
    </div>
  );
}

/* ── Friendly-config primitives ────────────────────────────────────────────── */
function StatusPill({ state }) {
  const map = {
    on: ['Enabled', styles.pillOn],
    off: ['Disabled', styles.pillOff],
    setup: ['Needs setup', styles.pillSetup],
  };
  const [label, cls] = map[state] || map.off;
  return <span className={`${styles.pill} ${cls}`}>{label}</span>;
}

function Switch({ checked, disabled, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`${styles.switch} ${checked ? styles.switchOn : ''}`}
      onClick={() => !disabled && onChange(!checked)}
      title={disabled ? 'You can view but not change this' : (checked ? 'On' : 'Off')}
    >
      <span className={styles.switchKnob} />
    </button>
  );
}

function Segmented({ value, choices, disabled, onChange }) {
  return (
    <div className={styles.segmented} role="group">
      {choices.map((c) => (
        <button
          key={c.value}
          type="button"
          disabled={disabled}
          className={`${styles.segBtn} ${value === c.value ? styles.segActive : ''}`}
          onClick={() => onChange(c.value)}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

function SimpleField({ label, help, children }) {
  return (
    <div className={styles.simpleField}>
      <div className={styles.simpleLabelRow}>
        <span className={styles.simpleLabel}>{label}</span>
        {help && <span className={styles.simpleHelp}>{help}</span>}
      </div>
      {children}
    </div>
  );
}

function Advanced({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.advanced}>
      <button type="button" className={styles.advToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg className={`${styles.advChev} ${open ? styles.advChevOpen : ''}`} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        Advanced settings
      </button>
      {open && <div className={styles.advBody}>{children}</div>}
    </div>
  );
}

function SaveRow({ canManage, show, dirty, saving, onSave }) {
  if (!canManage) return null;
  if (!show && !dirty) return null;
  return (
    <div className={styles.saveRow}>
      {dirty && <span className={styles.unsaved}><i /> Unsaved changes</span>}
      <button className={styles.cfgSave} onClick={onSave} disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
    </div>
  );
}

function OffNote({ children }) {
  return <p className={styles.offNote}>{children}</p>;
}

function LoadingCard({ icon, title }) {
  return (
    <section className={styles.feature}>
      <div className={styles.featureHead}>
        <span className={styles.featureIcon}>{FEATURE_ICONS[icon]}</span>
        <div className={styles.featureTitleWrap}>
          <div className={styles.featureTitleRow}><h3 className={styles.featureTitle}>{title}</h3></div>
          <p className={styles.featureDesc}>Loading…</p>
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ icon, iconTone, title, desc, pill, enabled, canManage, onToggle, children }) {
  return (
    <section className={`${styles.feature} ${enabled ? styles.featureOn : ''}`}>
      <div className={styles.featureHead}>
        <span className={`${styles.featureIcon} ${iconTone ? styles[iconTone] : ''}`}>{FEATURE_ICONS[icon]}</span>
        <div className={styles.featureTitleWrap}>
          <div className={styles.featureTitleRow}>
            <h3 className={styles.featureTitle}>{title}</h3>
            {pill}
          </div>
          <p className={styles.featureDesc}>{desc}</p>
        </div>
        <Switch checked={enabled} disabled={!canManage} onChange={onToggle} />
      </div>
      <div className={styles.featureBody}>{children}</div>
    </section>
  );
}

function ZoneRow({ label, help, configured, canManage, onConfigure, ctaConfigured, ctaEmpty }) {
  return (
    <div className={styles.zoneRow}>
      <div className={styles.zoneRowLeft}>
        <div className={styles.zoneRowTitle}>
          <span className={styles.zoneRowLabel}>{label}</span>
          <span className={`${styles.zoneStatus} ${configured ? styles.zoneStatusOk : styles.zoneStatusNo}`}>
            {configured ? '✓ Configured' : 'Not configured'}
          </span>
        </div>
        {help && <span className={styles.zoneRowHelp}>{help}</span>}
      </div>
      {canManage && (
        <button className={styles.zoneBtn} onClick={onConfigure}>{configured ? ctaConfigured : ctaEmpty}</button>
      )}
    </div>
  );
}

/** Fullscreen, step-based area editor built on the existing ZoneEditor. */
function ZoneConfigModal({ open, onClose, title, instruction, camera, zones, canManage, onSave, fixedType, defaultName, defaultType }) {
  if (!open) return null;
  const configured = zones.length > 0;
  return (
    <div className={styles.zoneModalBackdrop} onClick={onClose}>
      <div className={styles.zoneModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.zoneModalHead}>
          <div>
            <h3 className={styles.zoneModalTitle}>{title}</h3>
            <p className={styles.zoneModalSub}>{instruction}</p>
          </div>
          <button className={styles.zoneModalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.zoneModalBody}>
          <ol className={styles.zoneSteps}>
            <li><b>1</b> Click around the area to drop points (at least 3).</li>
            <li><b>2</b> Use <b>Undo</b> / <b>Clear</b> to adjust.</li>
            <li><b>3</b> Press <b>Save</b> to store the area.</li>
          </ol>
          {configured && <div className={styles.zoneDoneBanner}>✓ Boundary created — you can adjust it below or close.</div>}
          <ZoneEditor
            camera={camera}
            zones={zones}
            canManage={canManage}
            onSave={async (arr) => { await onSave(arr); onClose(); }}
            fixedType={fixedType}
            defaultName={defaultName}
            defaultType={defaultType}
          />
        </div>
      </div>
    </div>
  );
}

/** Friendly camera-calibration dialog that writes pixels-per-metre. */
function CalibrateModal({ open, onClose, value, onApply }) {
  const [v, setV] = useState(value);
  useEffect(() => { if (open) setV(value); }, [open, value]);
  if (!open) return null;
  return (
    <div className={styles.zoneModalBackdrop} onClick={onClose}>
      <div className={styles.calModal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.zoneModalHead}>
          <div>
            <h3 className={styles.zoneModalTitle}>Calibrate camera</h3>
            <p className={styles.zoneModalSub}>This tells the system how far vehicles really move, so speeds are accurate.</p>
          </div>
          <button className={styles.zoneModalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className={styles.calBody}>
          <p className={styles.calHelp}>Pick a landmark on the ground you know the real length of (a parking bay, a lane marking). Enter how many <b>pixels on the video</b> match <b>one metre</b> in real life. If you are unsure, leave the default.</p>
          <label className={styles.calField}>
            <span>Pixels per metre</span>
            <input type="number" step="0.5" min="0.1" value={v} onChange={(e) => setV(e.target.value)} className={styles.cfgInput} />
          </label>
          <div className={styles.saveRow}>
            <button className={styles.cfgSave} onClick={() => { onApply(Number(v)); onClose(); }}>Apply calibration</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Feature cards ─────────────────────────────────────────────────────────── */
function MotionCard({ motion, canManage, saving, onSave }) {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (motion) { setForm({ ...motion, operationalHours: { ...motion.operationalHours } }); setDirty(false); } }, [motion]);
  if (!form) return <LoadingCard icon="motion" title="Motion Detection" />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const setHours = (k, v) => { setForm((f) => ({ ...f, operationalHours: { ...f.operationalHours, [k]: v } })); setDirty(true); };
  const submit = () => onSave({
    enabled: form.enabled, sensitivity: form.sensitivity, armed: form.armed,
    minAreaPercent: Number(form.minAreaPercent), cooldownSec: Number(form.cooldownSec), severity: form.severity,
    operationalHours: { start: form.operationalHours.start, end: form.operationalHours.end, days: form.operationalHours.days },
  });

  return (
    <FeatureCard icon="motion" iconTone="toneBlue" title="Motion Detection"
      desc="Alerts when movement is seen — ideal for after-hours security."
      enabled={form.enabled} canManage={canManage} onToggle={(v) => set('enabled', v)}
      pill={<StatusPill state={form.enabled ? 'on' : 'off'} />}>
      {form.enabled ? (
        <>
          <SimpleField label="When should alerts happen?">
            <Segmented value={form.armed} disabled={!canManage} onChange={(v) => set('armed', v)}
              choices={[{ value: 'non_operational', label: 'After working hours' }, { value: 'always', label: 'Always' }]} />
          </SimpleField>
          {form.armed === 'non_operational' && (
            <SimpleField label="Working hours" help="Motion is ignored during these hours.">
              <div className={styles.hoursRow}>
                <input type="time" value={form.operationalHours.start} disabled={!canManage} onChange={(e) => setHours('start', e.target.value)} className={styles.cfgInput} />
                <span>to</span>
                <input type="time" value={form.operationalHours.end} disabled={!canManage} onChange={(e) => setHours('end', e.target.value)} className={styles.cfgInput} />
              </div>
            </SimpleField>
          )}
          <SimpleField label="Sensitivity" help="How much movement counts as an alert.">
            <Segmented value={form.sensitivity} disabled={!canManage} onChange={(v) => set('sensitivity', v)} choices={SENSITIVITY} />
          </SimpleField>
          <SimpleField label="Alert priority">
            <Segmented value={form.severity} disabled={!canManage} onChange={(v) => set('severity', v)} choices={PRIORITY} />
          </SimpleField>
          <Advanced>
            <div className={styles.cfgGrid}>
              <Field label="Minimum motion area (%)"><input type="number" step="0.1" min="0" max="100" value={form.minAreaPercent} disabled={!canManage} onChange={(e) => set('minAreaPercent', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Cooldown between alerts (sec)"><input type="number" min="0" max="3600" value={form.cooldownSec} disabled={!canManage} onChange={(e) => set('cooldownSec', e.target.value)} className={styles.cfgInput} /></Field>
            </div>
          </Advanced>
        </>
      ) : <OffNote>Turn this on to be alerted when movement is detected.</OffNote>}
      <SaveRow canManage={canManage} show={form.enabled} dirty={dirty} saving={saving} onSave={submit} />
    </FeatureCard>
  );
}

function WallCard({ wall, camera, zones, canManage, saving, onSave, onSaveZone }) {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  useEffect(() => { if (wall) { setForm({ ...wall }); setDirty(false); } }, [wall]);
  if (!form) return <LoadingCard icon="wall" title="Wall Intrusion Detection" />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const submit = () => onSave({ enabled: form.enabled, minConfidence: Number(form.minConfidence), severity: form.severity, cooldownSec: Number(form.cooldownSec) });
  const hasZone = zones.length > 0;
  const state = form.enabled ? (hasZone ? 'on' : 'setup') : 'off';

  return (
    <FeatureCard icon="wall" iconTone="toneAmber" title="Wall Intrusion Detection"
      desc="Alerts when a person enters a restricted or off-limits area."
      enabled={form.enabled} canManage={canManage} onToggle={(v) => set('enabled', v)}
      pill={<StatusPill state={state} />}>
      {form.enabled ? (
        <>
          {!hasZone && <div className={styles.setupHint}>Draw the restricted area so the camera knows where to watch.</div>}
          <ZoneRow label="Restricted area" help="The zone people must not enter." configured={hasZone} canManage={canManage} onConfigure={() => setZoneOpen(true)} ctaConfigured="Edit area" ctaEmpty="Draw restricted area" />
          <SimpleField label="Detection sensitivity" help="How readily a person triggers the alert.">
            <Segmented value={confToLevel(form.minConfidence)} disabled={!canManage} onChange={(lvl) => set('minConfidence', levelToConf(lvl))} choices={SENSITIVITY} />
          </SimpleField>
          <SimpleField label="Alert priority">
            <Segmented value={form.severity} disabled={!canManage} onChange={(v) => set('severity', v)} choices={PRIORITY} />
          </SimpleField>
          <Advanced>
            <div className={styles.cfgGrid}>
              <Field label="Person detection confidence (0–1)"><input type="number" step="0.05" min="0" max="1" value={form.minConfidence} disabled={!canManage} onChange={(e) => set('minConfidence', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Cooldown between alerts (sec)"><input type="number" min="0" max="3600" value={form.cooldownSec} disabled={!canManage} onChange={(e) => set('cooldownSec', e.target.value)} className={styles.cfgInput} /></Field>
            </div>
          </Advanced>
        </>
      ) : <OffNote>Turn this on to alert when someone enters a restricted area.</OffNote>}
      <SaveRow canManage={canManage} show={form.enabled} dirty={dirty} saving={saving} onSave={submit} />
      <ZoneConfigModal open={zoneOpen} onClose={() => setZoneOpen(false)}
        title="Draw the restricted area"
        instruction="Click around the area people must not enter, then Save."
        camera={camera} zones={zones} canManage={canManage} onSave={onSaveZone}
        defaultName="Warehouse Boundary" defaultType="BOUNDARY" />
    </FeatureCard>
  );
}

function WagonCard({ wagon, camera, zones, canManage, saving, onSave, onSaveZone }) {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [zoneOpen, setZoneOpen] = useState(false);
  useEffect(() => { if (wagon) { setForm({ ...wagon }); setDirty(false); } }, [wagon]);
  if (!form) return <LoadingCard icon="wagon" title="Wagon Safety Monitoring" />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const submit = () => onSave({ enabled: form.enabled, minConfidence: Number(form.minConfidence), minDurationSec: Number(form.minDurationSec), severity: form.severity, cooldownSec: Number(form.cooldownSec) });
  const hasZone = zones.length > 0;
  const state = form.enabled ? (hasZone ? 'on' : 'setup') : 'off';
  const waitPresets = [3, 5, 10, 30];

  return (
    <FeatureCard icon="wagon" iconTone="toneViolet" title="Wagon Safety Monitoring"
      desc="Alerts when a person stays inside a wagon too long."
      enabled={form.enabled} canManage={canManage} onToggle={(v) => set('enabled', v)}
      pill={<StatusPill state={state} />}>
      {form.enabled ? (
        <>
          {!hasZone && <div className={styles.setupHint}>Mark the wagon area so the camera knows where to watch.</div>}
          <ZoneRow label="Wagon area" help="The wagon interior to monitor." configured={hasZone} canManage={canManage} onConfigure={() => setZoneOpen(true)} ctaConfigured="Edit area" ctaEmpty="Mark wagon area" />
          <SimpleField label="Alert if a person stays inside for" help="Short waits are ignored to avoid false alarms.">
            <div className={styles.durationRow}>
              <div className={styles.presetChips}>
                {waitPresets.map((s) => (
                  <button key={s} type="button" disabled={!canManage}
                    className={`${styles.chip} ${Math.round(Number(form.minDurationSec)) === s ? styles.chipActive : ''}`}
                    onClick={() => set('minDurationSec', s)}>{s}s</button>
                ))}
              </div>
              <div className={styles.numUnit}>
                <input type="number" step="0.5" min="0" max="120" value={form.minDurationSec} disabled={!canManage} onChange={(e) => set('minDurationSec', e.target.value)} className={styles.cfgInput} />
                <span>seconds</span>
              </div>
            </div>
          </SimpleField>
          <SimpleField label="Alert priority">
            <Segmented value={form.severity} disabled={!canManage} onChange={(v) => set('severity', v)} choices={PRIORITY} />
          </SimpleField>
          <Advanced>
            <div className={styles.cfgGrid}>
              <Field label="Person detection confidence (0–1)"><input type="number" step="0.05" min="0" max="1" value={form.minConfidence} disabled={!canManage} onChange={(e) => set('minConfidence', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Cooldown between alerts (sec)"><input type="number" min="0" max="3600" value={form.cooldownSec} disabled={!canManage} onChange={(e) => set('cooldownSec', e.target.value)} className={styles.cfgInput} /></Field>
            </div>
          </Advanced>
        </>
      ) : <OffNote>Turn this on to alert when a person remains inside a wagon.</OffNote>}
      <SaveRow canManage={canManage} show={form.enabled} dirty={dirty} saving={saving} onSave={submit} />
      <ZoneConfigModal open={zoneOpen} onClose={() => setZoneOpen(false)}
        title="Mark the wagon area"
        instruction="Click around the wagon interior, then Save."
        camera={camera} zones={zones} canManage={canManage} onSave={onSaveZone}
        fixedType="WAGON_ZONE" defaultName="Wagon Zone" />
    </FeatureCard>
  );
}

function OverSpeedCard({ overspeed, canManage, saving, onSave }) {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  useEffect(() => { if (overspeed) { setForm({ ...overspeed }); setDirty(false); } }, [overspeed]);
  if (!form) return <LoadingCard icon="speed" title="Vehicle Speed Monitoring" />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const submit = () => onSave({ enabled: form.enabled, speedLimit: Number(form.speedLimit), pixelsPerMeter: Number(form.pixelsPerMeter), minConfidence: Number(form.minConfidence), severity: form.severity, cooldownSec: Number(form.cooldownSec) });
  const calibrated = Number(form.pixelsPerMeter) > 0;

  return (
    <FeatureCard icon="speed" iconTone="toneCyan" title="Vehicle Speed Monitoring"
      desc="Alerts when a vehicle drives faster than the yard speed limit."
      enabled={form.enabled} canManage={canManage} onToggle={(v) => set('enabled', v)}
      pill={<StatusPill state={form.enabled ? 'on' : 'off'} />}>
      {form.enabled ? (
        <>
          <SimpleField label="Speed limit">
            <div className={styles.numUnit}>
              <input type="number" step="1" min="1" max="300" value={form.speedLimit} disabled={!canManage} onChange={(e) => set('speedLimit', e.target.value)} className={styles.cfgInput} />
              <span>km/h</span>
            </div>
          </SimpleField>
          <div className={styles.zoneRow}>
            <div className={styles.zoneRowLeft}>
              <div className={styles.zoneRowTitle}>
                <span className={styles.zoneRowLabel}>Camera calibration</span>
                <span className={`${styles.zoneStatus} ${calibrated ? styles.zoneStatusOk : styles.zoneStatusNo}`}>{calibrated ? '✓ Calibrated' : 'Not calibrated'}</span>
              </div>
              <span className={styles.zoneRowHelp}>Needed to measure real speed accurately.</span>
            </div>
            {canManage && <button className={styles.zoneBtn} onClick={() => setCalOpen(true)}>Calibrate camera</button>}
          </div>
          <SimpleField label="Alert priority">
            <Segmented value={form.severity} disabled={!canManage} onChange={(v) => set('severity', v)} choices={PRIORITY} />
          </SimpleField>
          <Advanced>
            <div className={styles.cfgGrid}>
              <Field label="Calibration (pixels / metre)"><input type="number" step="0.5" min="0.1" value={form.pixelsPerMeter} disabled={!canManage} onChange={(e) => set('pixelsPerMeter', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Vehicle detection confidence (0–1)"><input type="number" step="0.05" min="0" max="1" value={form.minConfidence} disabled={!canManage} onChange={(e) => set('minConfidence', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Cooldown between alerts (sec)"><input type="number" min="0" max="3600" value={form.cooldownSec} disabled={!canManage} onChange={(e) => set('cooldownSec', e.target.value)} className={styles.cfgInput} /></Field>
            </div>
          </Advanced>
        </>
      ) : <OffNote>Turn this on to alert when vehicles exceed the speed limit.</OffNote>}
      <SaveRow canManage={canManage} show={form.enabled} dirty={dirty} saving={saving} onSave={submit} />
      <CalibrateModal open={calOpen} onClose={() => setCalOpen(false)} value={form.pixelsPerMeter} onApply={(v) => set('pixelsPerMeter', v)} />
    </FeatureCard>
  );
}

function CancelledCard({ cancelled, canManage, saving, onSave }) {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (cancelled) { setForm({ ...cancelled }); setDirty(false); } }, [cancelled]);
  if (!form) return <LoadingCard icon="cancelled" title="Cancelled Vehicle Monitoring" />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const submit = () => onSave({ enabled: form.enabled, minConfidence: Number(form.minConfidence), severity: form.severity, cooldownSec: Number(form.cooldownSec) });

  return (
    <FeatureCard icon="cancelled" iconTone="toneRose" title="Cancelled Vehicle Monitoring"
      desc="Alerts when a cancelled truck is detected entering the yard."
      enabled={form.enabled} canManage={canManage} onToggle={(v) => set('enabled', v)}
      pill={<StatusPill state={form.enabled ? 'on' : 'off'} />}>
      {form.enabled ? (
        <>
          <div className={styles.infoRow}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
            <span>Connected to the <b>vehicle database / WMS</b>. The cancelled-vehicle watchlist updates automatically — no list to maintain here.</span>
          </div>
          <SimpleField label="Alert priority">
            <Segmented value={form.severity} disabled={!canManage} onChange={(v) => set('severity', v)} choices={PRIORITY} />
          </SimpleField>
          <Advanced>
            <div className={styles.cfgGrid}>
              <Field label="Vehicle detection confidence (0–1)"><input type="number" step="0.05" min="0" max="1" value={form.minConfidence} disabled={!canManage} onChange={(e) => set('minConfidence', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Cooldown between alerts (sec)"><input type="number" min="0" max="3600" value={form.cooldownSec} disabled={!canManage} onChange={(e) => set('cooldownSec', e.target.value)} className={styles.cfgInput} /></Field>
            </div>
          </Advanced>
        </>
      ) : <OffNote>Turn this on to alert when a cancelled truck enters the yard.</OffNote>}
      <SaveRow canManage={canManage} show={form.enabled} dirty={dirty} saving={saving} onSave={submit} />
    </FeatureCard>
  );
}

function FaceCard({ face, registered, canManage, saving, onSave, onOpenRegistry }) {
  const [form, setForm] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (face) { setForm({ ...face }); setDirty(false); } }, [face]);
  if (!form) return <LoadingCard icon="face" title="Face Recognition" />;

  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setDirty(true); };
  const submit = () => onSave({ enabled: form.enabled, threshold: Number(form.threshold), minConfidence: Number(form.minConfidence), severity: form.severity, cooldownSec: Number(form.cooldownSec) });

  return (
    <FeatureCard icon="face" iconTone="tonePrimary" title="Face Recognition"
      desc="Recognises registered staff and alerts on any unknown person."
      enabled={form.enabled} canManage={canManage} onToggle={(v) => set('enabled', v)}
      pill={<StatusPill state={form.enabled ? 'on' : 'off'} />}>
      {form.enabled ? (
        <>
          <div className={styles.infoRow}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" /></svg>
            <span>
              <b>{registered != null ? registered : '—'}</b> registered {registered === 1 ? 'person' : 'people'}.
              {onOpenRegistry && <button type="button" className={styles.inlineLink} onClick={onOpenRegistry}>Manage people</button>}
            </span>
          </div>
          <SimpleField label="Recognition strictness" help="How closely a face must match to count as a known employee.">
            <Segmented value={thresholdToLevel(form.threshold)} disabled={!canManage} onChange={(lvl) => set('threshold', levelToThreshold(lvl))} choices={FACE_STRICTNESS} />
          </SimpleField>
          <SimpleField label="Unknown-person alert priority">
            <Segmented value={form.severity} disabled={!canManage} onChange={(v) => set('severity', v)} choices={PRIORITY} />
          </SimpleField>
          <Advanced>
            <div className={styles.cfgGrid}>
              <Field label="Recognition threshold (0–1)"><input type="number" step="0.01" min="0" max="1" value={form.threshold} disabled={!canManage} onChange={(e) => set('threshold', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Face detection confidence (0–1)"><input type="number" step="0.05" min="0" max="1" value={form.minConfidence} disabled={!canManage} onChange={(e) => set('minConfidence', e.target.value)} className={styles.cfgInput} /></Field>
              <Field label="Cooldown between alerts (sec)"><input type="number" min="0" max="3600" value={form.cooldownSec} disabled={!canManage} onChange={(e) => set('cooldownSec', e.target.value)} className={styles.cfgInput} /></Field>
            </div>
          </Advanced>
        </>
      ) : <OffNote>Turn this on to recognise staff and alert on unknown people.</OffNote>}
      <SaveRow canManage={canManage} show={form.enabled} dirty={dirty} saving={saving} onSave={submit} />
    </FeatureCard>
  );
}

export default CameraDetail;
