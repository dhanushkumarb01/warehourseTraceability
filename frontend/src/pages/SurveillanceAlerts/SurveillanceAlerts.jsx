/**
 * SurveillanceAlerts ("Alerts") — camera alerts and live detection.
 *
 *   - Detection service status + KPI cards (open, critical, today)
 *   - Live camera with what the detector currently sees, in plain words
 *   - Open alerts, each with one obvious next step (mark seen / resolve)
 *   - Alert history with filters + pagination
 *   - Alert detail with snapshot evidence + detection details
 *
 * Generic over alert type — new detectors surface here with no redesign; the
 * ALERT_TYPES map only supplies friendlier names.
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
import {
  PageHeader, StatCard, Card, Button, SearchInput, DataTable, EmptyState, Modal, DetailList, StatusChip, Menu, Tooltip,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './SurveillanceAlerts.module.css';

const POLL_MS = 8000;
const fmt = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

const ALERT_TYPES = {
  MOTION: 'Movement seen',
  WALL_INTRUSION: 'Someone crossed the boundary',
  MAN_INSIDE_WAGON: 'Person inside a wagon',
  OVER_SPEED: 'Vehicle over the speed limit',
  CANCELLED_VEHICLE: 'Cancelled vehicle seen',
  FACE_DETECTION: 'Unknown person',
};
const typeLabel = (t) => ALERT_TYPES[t] || (t ? t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Alert');
const humanKey = (k) => k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

function SurveillanceAlerts() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const canManage = can(GROUPS.SURVEILLANCE_MANAGE);

  const [summary, setSummary] = useState(null);
  const [service, setService] = useState(null);
  const [active, setActive] = useState([]);
  const [liveLoaded, setLiveLoaded] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [selectedCam, setSelectedCam] = useState(null);
  const [detail, setDetail] = useState(null);

  // history
  const [history, setHistory] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [filters, setFilters] = useState({ status: '', severity: '', alertType: '', search: '' });
  const [searchText, setSearchText] = useState('');
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
    } catch { /* transient */ } finally { setLiveLoaded(true); }
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

  const ACT_TOAST = { acknowledged: 'Marked as seen.', resolved: 'Alert resolved.', dismissed: 'Alert dismissed as a false alarm.' };
  const act = async (fn, id, label) => {
    try { await fn(id); showToast(ACT_TOAST[label] || `Alert ${label}.`, 'success'); loadLive(); loadHistory(); if (detail?.id === id) setDetail(null); }
    catch (err) { showToast(err.response?.data?.message || err.message || 'Action failed.', 'error'); }
  };

  const onSearch = (v) => {
    setSearchText(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setFilters((f) => ({ ...f, search: v })), 300);
  };
  const setFilter = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
  const filterCount = [filters.status, filters.severity, filters.alertType, filters.search].filter(Boolean).length;

  const liveMotion = service?.cameras?.find((c) => c.cameraId === selectedCam?.id);
  const serviceOnline = service?.online;
  const critical = summary?.severity?.CRITICAL ?? 0;

  const signals = liveMotion ? [
    liveMotion.motion ? { tone: 'warning', text: 'Movement' } : { tone: 'success', text: 'No movement' },
    liveMotion.intrusion && { tone: 'danger', text: 'Boundary crossed' },
    !liveMotion.intrusion && liveMotion.persons > 0 && { tone: 'info', text: `${liveMotion.persons} ${liveMotion.persons === 1 ? 'person' : 'people'}` },
    liveMotion.wagon > 0 && { tone: 'danger', text: `Person in wagon${liveMotion.wagon > 1 ? ` (${liveMotion.wagon})` : ''}` },
    liveMotion.vehicles > 0 && {
      tone: liveMotion.speedLimit && liveMotion.maxSpeedKmh > liveMotion.speedLimit ? 'danger' : 'info',
      text: `Vehicle ${liveMotion.maxSpeedKmh || 0} km/h${liveMotion.speedLimit ? ` (limit ${liveMotion.speedLimit})` : ''}`,
    },
    liveMotion.faces > 0 && (liveMotion.unknownFaces > 0
      ? { tone: 'danger', text: `Unknown person${liveMotion.unknownFaces > 1 ? ` (${liveMotion.unknownFaces})` : ''}` }
      : { tone: 'success', text: `${liveMotion.faces} recognised` }),
  ].filter(Boolean) : [];

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <PageHeader
        icon={Icons.bell}
        title="Alerts"
        term="Surveillance alerts"
        subtitle="What the cameras have spotted, and what still needs someone to look at it."
        actions={(
          <Tooltip content={service?.lastHeartbeatAt ? `Last check-in ${fmtTime(service.lastHeartbeatAt)}` : 'The detection service hasn’t checked in yet'} side="bottom">
            <span className={`${styles.serviceBadge} ${serviceOnline ? styles.svcOnline : styles.svcOffline}`} tabIndex={0}>
              <span className={styles.svcDot} />
              {serviceOnline ? 'Detection is running' : 'Detection is offline'}
            </span>
          </Tooltip>
        )}
      />

      {!liveLoaded ? null : !serviceOnline && (
        <div className={styles.offlineNote} role="note">
          {Icons.wifiOff}
          <span>The detection service isn’t running, so no new alerts will be raised. Ask your administrator to check it.</span>
        </div>
      )}

      <section className={styles.kpis} aria-label="Alert summary">
        <StatCard icon={Icons.bell} label="Open alerts" value={summary ? summary.active : null} loading={!liveLoaded}
          tone={critical > 0 ? 'danger' : summary?.active > 0 ? 'warning' : 'success'}
          status={summary ? (summary.active > 0 ? 'Needs a look' : 'All clear') : undefined}
          hint="New or seen, but not resolved yet" help="Open means nobody has resolved or dismissed it yet." />
        <StatCard icon={Icons.error} label="Critical" value={summary ? critical : null} loading={!liveLoaded}
          tone={critical > 0 ? 'danger' : 'neutral'} hint="Check these straight away"
          onClick={() => setFilters((f) => ({ ...f, severity: 'CRITICAL' }))} />
        <StatCard icon={Icons.warning} label="High" value={summary ? summary.severity?.HIGH ?? 0 : null} loading={!liveLoaded}
          tone="orange" hint="Check soon" onClick={() => setFilters((f) => ({ ...f, severity: 'HIGH' }))} />
        <StatCard icon={Icons.calendar} label="Raised today" value={summary ? summary.today : null} loading={!liveLoaded}
          tone="info" hint={`${summary?.total ?? '—'} recorded in total`} />
      </section>

      <div className={styles.mainGrid}>
        <Card
          icon={Icons.video}
          title="What does the camera see now?"
          padded={false}
          actions={(
            <select className={`${uiStyles.input} ${styles.camSelect}`} aria-label="Choose camera" value={selectedCam?.id || ''} onChange={(e) => setSelectedCam(cameras.find((c) => c.id === e.target.value) || null)}>
              {cameras.length === 0 && <option value="">No cameras</option>}
              {cameras.map((c) => <option key={c.id} value={c.id}>{c.cameraName}{c.location ? ` — ${c.location}` : ''}</option>)}
            </select>
          )}
        >
          <div className={styles.livePlayer}>
            {selectedCam
              ? <LiveStreamPlayer key={selectedCam.id} camera={selectedCam} />
              : <EmptyState icon={Icons.camera} title="No cameras yet" message="Add a camera to watch it here." />}
          </div>
          {selectedCam && (
            <div className={styles.motionBar}>
              {liveMotion
                ? signals.map((sg) => <StatusChip key={sg.text} tone={sg.tone}>{sg.text}</StatusChip>)
                : <StatusChip tone="neutral" icon={Icons.wifiOff}>No detection signal for this camera</StatusChip>}
              <span className={styles.motionMeta}>
                {liveMotion?.fps != null && <span>{liveMotion.fps} fps</span>}
                {liveMotion?.resolution && <span>{liveMotion.resolution}</span>}
                <Button size="sm" variant="ghost" iconRight={Icons.arrowRight} onClick={() => navigate(`/surveillance/cameras/${selectedCam.id}`)}>Camera details</Button>
              </span>
            </div>
          )}
        </Card>

        <Card
          icon={Icons.bell}
          title="Open alerts"
          subtitle={active.length ? `${active.length} waiting · newest first` : undefined}
          className={styles.activePanel}
          bodyClassName={styles.activeBody}
        >
          {active.length === 0 ? (
            <EmptyState icon={Icons.checkCircle} title="All clear" message="No open alerts. New ones show up here within a few seconds." />
          ) : (
            <ul className={styles.activeList}>
              {active.map((a) => (
                <AlertRow key={a.id} alert={a} canManage={canManage} onOpen={() => setDetail(a)}
                  onAck={() => act(acknowledgeAlert, a.id, 'acknowledged')}
                  onResolve={() => act(resolveAlert, a.id, 'resolved')}
                  onDismiss={() => act(dismissAlert, a.id, 'dismissed')} />
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        icon={Icons.history}
        title="Alert history"
        subtitle={`${history.total} ${history.total === 1 ? 'alert' : 'alerts'}`}
        padded={false}
      >
        <div className={styles.filters}>
          <SearchInput className={styles.search} value={searchText} onChange={onSearch} placeholder="Search camera, place or message" />
          <select className={uiStyles.input} aria-label="Status" value={filters.status} onChange={setFilter('status')}>
            <option value="">Any status</option><option value="NEW">New</option><option value="ACKNOWLEDGED">Seen</option><option value="RESOLVED">Resolved</option><option value="DISMISSED">Dismissed</option>
          </select>
          <select className={uiStyles.input} aria-label="Severity" value={filters.severity} onChange={setFilter('severity')}>
            <option value="">Any severity</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
          </select>
          <select className={uiStyles.input} aria-label="Type" value={filters.alertType} onChange={setFilter('alertType')}>
            <option value="">Any type</option>
            {Object.entries(ALERT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {filterCount > 0 && (
            <Button size="sm" variant="ghost" icon={Icons.close} onClick={() => { setFilters({ status: '', severity: '', alertType: '', search: '' }); setSearchText(''); }}>
              Clear {filterCount} {filterCount === 1 ? 'filter' : 'filters'}
            </Button>
          )}
        </div>

        {history.items.length === 0 ? (
          <EmptyState icon={filterCount ? Icons.search : Icons.bell} title={filterCount ? 'No alerts match these filters' : 'No alerts yet'} message={filterCount ? 'Try removing a filter.' : 'Alerts raised by the cameras will be listed here.'} />
        ) : (
          <DataTable
            caption="Alert history"
            rows={history.items}
            onRowClick={(a) => setDetail(a)}
            rowTone={(a) => (a.severity === 'CRITICAL' && (a.status === 'NEW' || a.status === 'ACKNOWLEDGED') ? 'danger' : undefined)}
            columns={[
              { key: 'evidence', header: 'Photo', sortable: false, hideOnMobile: true, width: 76, render: (a) => <Thumb alert={a} /> },
              {
                key: 'alertType', header: 'What happened', primary: true, sortValue: (a) => typeLabel(a.alertType),
                render: (a) => (
                  <>
                    <span className={uiStyles.strong}>{typeLabel(a.alertType)}</span>
                    <span className={uiStyles.sub}>{a.camera?.cameraName || 'Camera'}{a.location ? ` · ${a.location}` : ''}</span>
                  </>
                ),
              },
              { key: 'severity', header: 'Severity', sortValue: (a) => ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].indexOf(a.severity), render: (a) => <StatusBadge status={a.severity} size="sm" /> },
              { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} size="sm" /> },
              { key: 'detectedAt', header: 'Spotted', sortValue: (a) => new Date(a.detectedAt).getTime(), render: (a) => <span className={uiStyles.muted}>{fmt(a.detectedAt)}</span> },
            ]}
          />
        )}

        <div className={styles.pagination}>
          <span className={styles.pageInfo}>Page {history.page} of {history.totalPages}</span>
          <div className={styles.pageBtns}>
            <Button size="sm" icon={Icons.chevronLeft} disabled={history.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" iconRight={Icons.chevronRight} disabled={history.page >= history.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>

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

function Thumb({ alert, large = false }) {
  const [err, setErr] = useState(false);
  if (!alert.hasSnapshot || err) {
    return <span className={`${styles.thumbPh} ${large ? styles.thumbLg : ''}`} aria-label="No photo">{Icons.camera}</span>;
  }
  return <img className={`${styles.thumb} ${large ? styles.thumbLg : ''}`} src={snapshotUrl(alert.id)} alt={`Photo: ${typeLabel(alert.alertType)}`} onError={() => setErr(true)} />;
}

function AlertRow({ alert, canManage, onOpen, onAck, onResolve, onDismiss }) {
  return (
    <li className={`${styles.alertRow} ${styles[`sev_${alert.severity}`] || ''}`}>
      <button type="button" className={styles.alertMain} onClick={onOpen} aria-label={`Open alert: ${typeLabel(alert.alertType)}`}>
        <Thumb alert={alert} />
        <span className={styles.alertInfo}>
          <span className={styles.alertTop}>
            <span className={styles.alertType}>{typeLabel(alert.alertType)}</span>
          </span>
          <span className={styles.alertMsg} title={alert.message}>{alert.message}</span>
          <span className={styles.alertMeta}>{alert.camera?.cameraName || alert.location} · {fmtTime(alert.detectedAt)}</span>
          <span className={styles.alertChips}>
            <StatusBadge status={alert.severity} size="sm" />
            <StatusBadge status={alert.status} size="sm" />
          </span>
        </span>
      </button>
      {canManage && (
        <div className={styles.alertActions}>
          {alert.status === 'NEW'
            ? <Button size="sm" variant="secondary" icon={Icons.eye} onClick={onAck}>Mark seen</Button>
            : <Button size="sm" variant="success" icon={Icons.check} onClick={onResolve}>Resolve</Button>}
          <Menu
            label="More alert actions"
            items={[
              { label: 'Resolve', icon: Icons.check, onClick: onResolve, hidden: alert.status !== 'NEW' },
              { label: 'Dismiss (false alarm)', icon: Icons.ban, onClick: onDismiss },
            ]}
          />
        </div>
      )}
    </li>
  );
}

function AlertDetailModal({ alert, canManage, onClose, onAck, onResolve, onDismiss, onCamera }) {
  const details = alert.detectionDetails || {};
  const detailItems = Object.entries(details).filter(([k]) => k !== 'regions')
    .map(([k, v]) => ({ label: humanKey(k), value: typeof v === 'object' ? JSON.stringify(v) : String(v) }));
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={Icons.bell}
      tone={alert.severity === 'CRITICAL' || alert.severity === 'HIGH' ? 'danger' : 'warning'}
      title={typeLabel(alert.alertType)}
      subtitle={`${alert.camera?.cameraName || 'Camera'}${alert.location ? ` · ${alert.location}` : ''} · ${fmt(alert.detectedAt)}`}
      footer={(
        <>
          <Button variant="ghost" icon={Icons.camera} onClick={onCamera}>View camera</Button>
          {canManage && (
            <>
              <Button onClick={onDismiss}>Dismiss as false alarm</Button>
              {alert.status === 'NEW' && <Button onClick={onAck} icon={Icons.eye}>Mark seen</Button>}
              <Button variant="primary" icon={Icons.check} onClick={onResolve}>Resolve</Button>
            </>
          )}
        </>
      )}
    >
      <div className={styles.modalGrid}>
        <div className={styles.modalEvidence}>
          {alert.hasSnapshot
            ? <img src={snapshotUrl(alert.id)} alt={`Photo: ${typeLabel(alert.alertType)}`} className={styles.modalSnap} />
            : <div className={styles.modalNoSnap}>{Icons.camera}<span>No photo was saved for this alert</span></div>}
        </div>
        <div className={styles.modalMeta}>
          <p className={styles.modalMessage}>{alert.message}</p>
          <DetailList
            items={[
              { label: 'Severity', value: <StatusBadge status={alert.severity} size="sm" /> },
              { label: 'Status', value: <StatusBadge status={alert.status} size="sm" /> },
              { label: 'Spotted by', value: alert.detectorType ? humanKey(alert.detectorType) : '—', help: 'The detector (AI model) that raised this alert.' },
              { label: 'Spotted at', value: fmt(alert.detectedAt) },
              alert.acknowledgedAt && { label: 'Marked seen', value: fmt(alert.acknowledgedAt) },
              alert.resolvedAt && { label: 'Resolved', value: fmt(alert.resolvedAt) },
            ]}
          />
          {detailItems.length > 0 && (
            <details className={styles.techDetails}>
              <summary>Detection details</summary>
              <DetailList items={detailItems} />
            </details>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default SurveillanceAlerts;
