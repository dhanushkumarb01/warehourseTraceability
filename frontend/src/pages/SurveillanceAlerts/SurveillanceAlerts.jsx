/**
 * SurveillanceAlerts — the AI Surveillance dashboard (Phase 13).
 *
 * A professional, command-center view over the motion-detection module:
 *   - AI service status + summary metrics
 *   - Live camera feed with a real-time motion indicator
 *   - Active alerts (acknowledge / resolve / dismiss)
 *   - Alert history with filtering + pagination
 *   - Alert detail with snapshot evidence + detection details
 *
 * It reuses the existing streaming player, status badges, toasts and design
 * tokens, so it reads as a natural extension of the enterprise dashboard. It is
 * generic over alert type — future detectors surface here with no UI redesign.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchAlerts, fetchAlertSummary, fetchServiceStatus,
  acknowledgeAlert, resolveAlert, dismissAlert, snapshotUrl,
} from '../../services/surveillanceService';
import { fetchLiveCameras } from '../../services/streamService';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import LiveStreamPlayer from '../../components/LiveStreamPlayer/LiveStreamPlayer';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import styles from './SurveillanceAlerts.module.css';

const POLL_MS = 8000;
const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

function SurveillanceAlerts() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can(GROUPS.SURVEILLANCE_MANAGE);

  const [summary, setSummary] = useState(null);
  const [service, setService] = useState(null);
  const [active, setActive] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState(null);
  const [detail, setDetail] = useState(null);

  // history
  const [history, setHistory] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [filters, setFilters] = useState({ status: '', severity: '', alertType: '', search: '' });
  const [page, setPage] = useState(1);

  const [toast, setToast] = useState({ message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = useCallback(() => setToast({ message: '', type: 'info' }), []);
  const searchTimer = useRef(null);

  const loadLive = useCallback(async () => {
    try {
      const [sum, svc, act] = await Promise.all([
        fetchAlertSummary(), fetchServiceStatus(), fetchAlerts({ active: 'true', pageSize: 30 }),
      ]);
      setSummary(sum); setService(svc); setActive(act.items);
    } catch { /* transient */ }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const data = await fetchAlerts({
        page, pageSize: 10,
        status: filters.status || undefined,
        severity: filters.severity || undefined,
        alertType: filters.alertType || undefined,
        search: filters.search || undefined,
      });
      setHistory(data);
    } catch { /* transient */ }
  }, [page, filters]);

  useEffect(() => {
    fetchLiveCameras().then((c) => { setCameras(c); if (c.length && !selectedCam) setSelectedCam(c[0]); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { loadLive(); const t = setInterval(loadLive, POLL_MS); return () => clearInterval(t); }, [loadLive]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => { setPage(1); }, [filters]);

  const act = async (fn, id, label) => {
    try { await fn(id); showToast(`Alert ${label}.`, 'success'); loadLive(); loadHistory(); if (detail?.id === id) setDetail(null); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Action failed.', 'error'); }
  };

  const onSearch = (e) => {
    const v = e.target.value;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilters((f) => ({ ...f, search: v })), 300);
  };

  const liveMotion = service?.cameras?.find((c) => c.cameraId === selectedCam?.id);
  const serviceOnline = service?.online;

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>AI Surveillance</h1>
            <p className={styles.pageBreadcrumb}>Surveillance &rsaquo; Motion Detection &amp; Alerts</p>
          </div>
        </div>
        <div className={`${styles.serviceBadge} ${serviceOnline ? styles.svcOnline : styles.svcOffline}`}>
          <span className={styles.svcDot} />
          <div>
            <span className={styles.svcLabel}>AI Service {serviceOnline ? 'Online' : 'Offline'}</span>
            <span className={styles.svcMeta}>{service?.lastHeartbeatAt ? `Heartbeat ${fmtTime(service.lastHeartbeatAt)}` : 'No heartbeat yet'}</span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className={styles.statsStrip}>
        <Stat label="Active Alerts" value={summary?.active ?? 0} tone="danger" />
        <Stat label="Today" value={summary?.today ?? 0} tone="info" />
        <Stat label="Critical" value={summary?.severity?.CRITICAL ?? 0} tone="critical" />
        <Stat label="High" value={summary?.severity?.HIGH ?? 0} tone="high" />
        <Stat label="Total" value={summary?.total ?? 0} tone="muted" />
      </div>

      <div className={styles.mainGrid}>
        {/* Live feed */}
        <section className={styles.livePanel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Live Camera</h2>
            <select className={styles.camSelect} value={selectedCam?.id || ''} onChange={(e) => setSelectedCam(cameras.find((c) => c.id === e.target.value) || null)}>
              {cameras.length === 0 && <option value="">No cameras</option>}
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.cameraName} — {c.location}</option>)}
            </select>
          </div>
          <div className={styles.livePlayer}>
            {selectedCam
              ? <LiveStreamPlayer key={selectedCam.id} camera={selectedCam} />
              : <div className={styles.noCam}>No cameras available</div>}
          </div>
          {selectedCam && (
            <div className={styles.motionBar}>
              <span className={`${styles.motionState} ${liveMotion?.motion ? styles.motionOn : styles.motionClear}`}>
                <span className={styles.motionDot} />
                {liveMotion ? (liveMotion.motion ? 'MOTION DETECTED' : 'CLEAR') : 'NO AI SIGNAL'}
              </span>
              {liveMotion && (liveMotion.intrusion || liveMotion.persons > 0) && (
                <span className={`${styles.motionState} ${liveMotion.intrusion ? styles.motionOn : styles.personInfo}`}>
                  <span className={styles.motionDot} />
                  {liveMotion.intrusion ? 'BOUNDARY BREACH' : `${liveMotion.persons} PERSON${liveMotion.persons === 1 ? '' : 'S'}`}
                </span>
              )}
              {liveMotion && liveMotion.wagon > 0 && (
                <span className={`${styles.motionState} ${styles.motionOn}`}>
                  <span className={styles.motionDot} />
                  {`WAGON OCCUPIED${liveMotion.wagon > 1 ? ` (${liveMotion.wagon})` : ''}`}
                </span>
              )}
              {liveMotion && liveMotion.vehicles > 0 && (
                <span className={`${styles.motionState} ${liveMotion.speedLimit && liveMotion.maxSpeedKmh > liveMotion.speedLimit ? styles.motionOn : styles.personInfo}`}>
                  <span className={styles.motionDot} />
                  {`${liveMotion.maxSpeedKmh || 0} km/h`}{liveMotion.speedLimit ? ` / ${liveMotion.speedLimit}` : ''}
                </span>
              )}
              {liveMotion && liveMotion.faces > 0 && (
                <span className={`${styles.motionState} ${liveMotion.unknownFaces > 0 ? styles.motionOn : styles.personInfo}`}>
                  <span className={styles.motionDot} />
                  {liveMotion.unknownFaces > 0
                    ? `UNKNOWN PERSON${liveMotion.unknownFaces > 1 ? ` (${liveMotion.unknownFaces})` : ''}`
                    : `${liveMotion.faces - liveMotion.unknownFaces} RECOGNISED`}
                </span>
              )}
              <span className={styles.motionMeta}>
                {liveMotion?.fps != null && <span>{liveMotion.fps} fps</span>}
                {liveMotion?.resolution && <span>{liveMotion.resolution}</span>}
                <button className={styles.linkBtn} onClick={() => navigate(`/surveillance/cameras/${selectedCam.id}`)}>Camera details</button>
              </span>
            </div>
          )}
        </section>

        {/* Active alerts */}
        <section className={styles.activePanel}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Active Alerts</h2>
            <span className={styles.count}>{active.length}</span>
          </div>
          <div className={styles.activeList}>
            {active.length === 0 && <div className={styles.emptyMini}>No active alerts. All clear.</div>}
            {active.map((a) => (
              <AlertRow key={a.id} alert={a} canManage={canManage} onOpen={() => setDetail(a)}
                onAck={() => act(acknowledgeAlert, a.id, 'acknowledged')}
                onResolve={() => act(resolveAlert, a.id, 'resolved')}
                onDismiss={() => act(dismissAlert, a.id, 'dismissed')} />
            ))}
          </div>
        </section>
      </div>

      {/* History */}
      <section className={styles.historyPanel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Alert History</h2>
          <div className={styles.filters}>
            <input className={styles.searchInput} placeholder="Search…" onChange={onSearch} />
            <select className={styles.filterSelect} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">All statuses</option><option value="NEW">New</option><option value="ACKNOWLEDGED">Acknowledged</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option>
            </select>
            <select className={styles.filterSelect} value={filters.severity} onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}>
              <option value="">All severities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
            </select>
            <select className={styles.filterSelect} value={filters.alertType} onChange={(e) => setFilters((f) => ({ ...f, alertType: e.target.value }))}>
              <option value="">All types</option><option value="MOTION">Motion</option><option value="WALL_INTRUSION">Wall Intrusion</option><option value="MAN_INSIDE_WAGON">Man Inside Wagon</option><option value="OVER_SPEED">Over Speed</option><option value="CANCELLED_VEHICLE">Cancelled Vehicle</option><option value="FACE_DETECTION">Unknown Person</option>
            </select>
          </div>
        </div>

        {history.items.length === 0 ? (
          <div className={styles.emptyMini}>No alerts match these filters.</div>
        ) : (
          <div className={styles.historyTableWrap}>
            <table className={styles.historyTable}>
              <thead><tr><th>Evidence</th><th>Type</th><th>Camera</th><th>Location</th><th>Severity</th><th>Status</th><th>Detected</th><th></th></tr></thead>
              <tbody>
                {history.items.map((a) => (
                  <tr key={a.id} onClick={() => setDetail(a)} className={styles.histRow}>
                    <td><Thumb alert={a} /></td>
                    <td><span className={styles.typeChip}>{a.alertType}</span></td>
                    <td className={styles.camCell}>{a.camera?.cameraName || '—'}</td>
                    <td>{a.location}</td>
                    <td><StatusBadge status={a.severity} /></td>
                    <td><StatusBadge status={a.status} /></td>
                    <td className={styles.timeCell}>{fmt(a.detectedAt)}</td>
                    <td><button className={styles.viewBtn} onClick={(e) => { e.stopPropagation(); setDetail(a); }}>View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.pagination}>
          <span className={styles.pageInfo}>{history.total} alerts</span>
          <div className={styles.pageBtns}>
            <button className={styles.pageBtn} disabled={history.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span className={styles.pageNum}>Page {history.page} / {history.totalPages}</span>
            <button className={styles.pageBtn} disabled={history.page >= history.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </section>

      {detail && (
        <AlertDetailModal alert={detail} canManage={canManage} onClose={() => setDetail(null)}
          onAck={() => act(acknowledgeAlert, detail.id, 'acknowledged')}
          onResolve={() => act(resolveAlert, detail.id, 'resolved')}
          onDismiss={() => act(dismissAlert, detail.id, 'dismissed')}
          onCamera={() => navigate(`/surveillance/cameras/${detail.cameraId}`)} />
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className={`${styles.statCard} ${styles[`tone_${tone}`]}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function Thumb({ alert }) {
  const [err, setErr] = useState(false);
  if (!alert.hasSnapshot || err) {
    return <span className={styles.thumbPh}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5" /><circle cx="9" cy="9" r="1.6" /></svg></span>;
  }
  return <img className={styles.thumb} src={snapshotUrl(alert.id)} alt="Evidence" onError={() => setErr(true)} />;
}

function AlertRow({ alert, canManage, onOpen, onAck, onResolve, onDismiss }) {
  return (
    <div className={styles.alertRow}>
      <button className={styles.alertThumbBtn} onClick={onOpen}><Thumb alert={alert} /></button>
      <div className={styles.alertInfo} onClick={onOpen}>
        <div className={styles.alertTop}>
          <StatusBadge status={alert.severity} />
          <span className={styles.alertType}>{alert.alertType}</span>
        </div>
        <span className={styles.alertMsg} title={alert.message}>{alert.message}</span>
        <span className={styles.alertMeta}>{alert.camera?.cameraName || alert.location} · {fmtTime(alert.detectedAt)}</span>
      </div>
      {canManage && (
        <div className={styles.alertActions}>
          {alert.status === 'NEW' && <button className={styles.miniBtn} onClick={onAck} title="Acknowledge">Ack</button>}
          <button className={`${styles.miniBtn} ${styles.miniOk}`} onClick={onResolve} title="Resolve">Resolve</button>
          <button className={styles.miniGhost} onClick={onDismiss} title="Dismiss">✕</button>
        </div>
      )}
    </div>
  );
}

function AlertDetailModal({ alert, canManage, onClose, onAck, onResolve, onDismiss, onCamera }) {
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const details = alert.detectionDetails || {};
  return (
    <div className={styles.modalOverlay} role="dialog" aria-modal="true" onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <div>
            <h2 className={styles.modalTitle}>{alert.alertType} Alert</h2>
            <span className={styles.modalSub}>{alert.camera?.cameraName || 'Camera'} · {alert.location}</span>
          </div>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.modalEvidence}>
            {alert.hasSnapshot
              ? <img src={snapshotUrl(alert.id)} alt="Snapshot evidence" className={styles.modalSnap} />
              : <div className={styles.modalNoSnap}>No snapshot evidence</div>}
          </div>
          <div className={styles.modalMeta}>
            <div className={styles.modalRow}><span>Severity</span><StatusBadge status={alert.severity} /></div>
            <div className={styles.modalRow}><span>Status</span><StatusBadge status={alert.status} /></div>
            <div className={styles.modalRow}><span>Detector</span><strong>{alert.detectorType}</strong></div>
            <div className={styles.modalRow}><span>Detected</span><strong>{fmt(alert.detectedAt)}</strong></div>
            {alert.acknowledgedAt && <div className={styles.modalRow}><span>Acknowledged</span><strong>{fmt(alert.acknowledgedAt)}</strong></div>}
            {alert.resolvedAt && <div className={styles.modalRow}><span>Resolved</span><strong>{fmt(alert.resolvedAt)}</strong></div>}
            <p className={styles.modalMessage}>{alert.message}</p>
            {Object.keys(details).length > 0 && (
              <div className={styles.detailGrid}>
                <span className={styles.detailHead}>Detection details</span>
                {Object.entries(details).filter(([k]) => k !== 'regions').map(([k, v]) => (
                  <div key={k} className={styles.detailKv}><span>{k}</span><strong>{String(v)}</strong></div>
                ))}
              </div>
            )}
            <div className={styles.modalActions}>
              <button className={styles.secBtn} onClick={onCamera}>View Camera</button>
              {canManage && (
                <>
                  {alert.status === 'NEW' && <button className={styles.secBtn} onClick={onAck}>Acknowledge</button>}
                  <button className={styles.secBtn} onClick={onDismiss}>Dismiss</button>
                  <button className={styles.primaryBtn} onClick={onResolve}>Resolve</button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SurveillanceAlerts;
