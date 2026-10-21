/**
 * RFID Monitoring — Infrastructure Control Panel
 *
 * Three operational views:
 *   1. Reader Health Dashboard — live reader status, online/offline/maintenance
 *   2. Reader Registry — CRUD management of RFID readers
 *   3. Event Simulator — generate RFID events using the exact same API pipeline
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import {
  fetchReaderDashboard, fetchReaders, createReader, updateReader, deleteReader,
  fetchTrucks, ingestRFIDEvent,
} from '../../services/truckService';
import Toast from '../../components/Toast/Toast';
import styles from './RFIDMonitoring.module.css';

const STAGES = [
  { key: 'ENTRY_GATE', label: 'Entry Gate', icon: '🚪', color: '#3b82f6' },
  { key: 'WEIGH_BRIDGE_1', label: 'Weigh Bridge 1', icon: '⚖️', color: '#8b5cf6' },
  { key: 'LOADING_DOCK', label: 'Loading Dock', icon: '📦', color: '#f59e0b' },
  { key: 'WEIGH_BRIDGE_2', label: 'Weigh Bridge 2', icon: '⚖️', color: '#8b5cf6' },
  { key: 'INVOICE', label: 'Invoice', icon: '📋', color: '#0d9488' },
  { key: 'PARKING', label: 'Parking', icon: '🅿️', color: '#64748b' },
  { key: 'EXIT_GATE', label: 'Exit Gate', icon: '🚛', color: '#16a34a' },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never';

function RFIDMonitoring() {
  const { can } = useAuth();
  const canManage = can(GROUPS.RFID_MANAGE);
  const canEvent = can(GROUPS.RFID_EVENT);

  const [view, setView] = useState('health'); // health | registry | simulator
  const [readerDashboard, setReaderDashboard] = useState(null);
  const [readers, setReaders] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });
  const showToast = (message, type = 'info') => setToast({ message, type });

  // Reader form
  const [showReaderForm, setShowReaderForm] = useState(false);
  const [editReader, setEditReader] = useState(null);
  const [readerForm, setReaderForm] = useState({ readerCode: '', readerName: '', readerType: 'FIXED', stage: 'ENTRY_GATE', ipAddress: '', location: '', status: 'OFFLINE' });
  const [readerFormBusy, setReaderFormBusy] = useState(false);
  const [readerFormError, setReaderFormError] = useState(null);

  // Simulator
  const [simForm, setSimForm] = useState({ truckId: '', readerId: '', source: 'SIMULATED' });
  const [simBusy, setSimBusy] = useState(false);
  const [simResult, setSimResult] = useState(null);
  const [simError, setSimError] = useState(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const [dash, rdr, trk] = await Promise.all([
        fetchReaderDashboard(),
        fetchReaders(),
        fetchTrucks().catch(() => []),
      ]);
      setReaderDashboard(dash);
      setReaders(rdr);
      setTrucks(trk);
    } catch (err) {
      setError(err.message || 'Failed to load RFID data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh health every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      fetchReaderDashboard().then(setReaderDashboard).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  // ── Reader CRUD ──────────────────────────────────────────────────────────
  const openCreateReader = () => {
    setEditReader(null);
    setReaderForm({ readerCode: '', readerName: '', readerType: 'FIXED', stage: 'ENTRY_GATE', ipAddress: '', location: '', status: 'OFFLINE' });
    setReaderFormError(null);
    setShowReaderForm(true);
  };

  const openEditReader = (r) => {
    setEditReader(r);
    setReaderForm({ readerCode: r.readerCode, readerName: r.readerName, readerType: r.readerType || 'FIXED', stage: r.stage, ipAddress: r.ipAddress || '', location: r.location || '', status: r.status });
    setReaderFormError(null);
    setShowReaderForm(true);
  };

  const handleReaderSubmit = async (e) => {
    e.preventDefault();
    setReaderFormBusy(true); setReaderFormError(null);
    try {
      if (editReader) {
        await updateReader(editReader.id, readerForm);
        showToast('Reader updated.', 'success');
      } else {
        await createReader(readerForm);
        showToast('Reader created.', 'success');
      }
      setShowReaderForm(false);
      loadAll();
    } catch (err) {
      setReaderFormError(err.message || 'Failed to save reader.');
    } finally {
      setReaderFormBusy(false);
    }
  };

  const handleDeleteReader = async (r) => {
    if (!window.confirm(`Delete reader ${r.readerCode}?`)) return;
    try {
      await deleteReader(r.id);
      showToast('Reader deleted.', 'success');
      loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to delete reader.', 'error');
    }
  };

  // ── Simulator ────────────────────────────────────────────────────────────
  const handleSimulate = async (e) => {
    e.preventDefault();
    setSimBusy(true); setSimError(null); setSimResult(null);
    try {
      const payload = {};
      if (simForm.truckId) payload.truckId = simForm.truckId;
      if (simForm.readerId) payload.readerId = simForm.readerId;
      payload.source = simForm.source || 'SIMULATED';
      const result = await ingestRFIDEvent(payload);
      setSimResult(result);
      showToast(`Event recorded at ${result.stage}${result.alerts?.length ? ` — ${result.alerts.length} alert(s)!` : ''}`, result.alerts?.length ? 'warning' : 'success');
      // Refresh dashboard
      fetchReaderDashboard().then(setReaderDashboard).catch(() => {});
    } catch (err) {
      setSimError(err.message || 'Event ingestion failed.');
    } finally {
      setSimBusy(false);
    }
  };

  const dash = readerDashboard || {};

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>RFID Infrastructure</h1>
            <p className={styles.pageBreadcrumb}>Reader monitoring, health metrics & event simulation</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === 'health' ? styles.viewActive : ''}`} onClick={() => setView('health')}>
              📡 Health
            </button>
            <button className={`${styles.viewBtn} ${view === 'registry' ? styles.viewActive : ''}`} onClick={() => setView('registry')}>
              📋 Registry
            </button>
            {canEvent && (
              <button className={`${styles.viewBtn} ${view === 'simulator' ? styles.viewActive : ''}`} onClick={() => setView('simulator')}>
                🧪 Simulator
              </button>
            )}
          </div>
          <button className={styles.refreshBtn} onClick={loadAll} disabled={isLoading} title="Refresh">
            <svg viewBox="0 0 20 20" fill="currentColor" className={isLoading ? styles.spinning : ''}><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      {/* ── Health Metrics ──────────────────────────────────────────────── */}
      <div className={styles.metricsStrip}>
        <MetricCard label="Total Readers" value={isLoading ? '—' : dash.total} icon="📡" color="#3b82f6" />
        <MetricCard label="Online" value={isLoading ? '—' : dash.online} icon="🟢" color="#16a34a" />
        <MetricCard label="Offline" value={isLoading ? '—' : dash.offline} icon="🔴" color="#dc2626" />
        <MetricCard label="Maintenance" value={isLoading ? '—' : dash.maintenance} icon="🔧" color="#d97706" />
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <p>{error}</p>
          <button onClick={loadAll}>Retry</button>
        </div>
      )}

      {/* ── Health View ─────────────────────────────────────────────────── */}
      {view === 'health' && (
        <div className={styles.healthView}>
          <h2 className={styles.sectionTitle}>
            <span className={styles.liveDot} />
            Reader Health Grid
          </h2>
          {isLoading ? (
            <div className={styles.healthGrid}>
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${styles.healthCard} wt-skeleton`} style={{ height: 140 }} />)}
            </div>
          ) : !dash.readers?.length ? (
            <div className={styles.emptyState}>
              <p>No readers registered. Add readers to start monitoring.</p>
            </div>
          ) : (
            <>
              {/* Group by stage */}
              {STAGES.map((stage) => {
                const stageReaders = (dash.readers || []).filter((r) => r.stage === stage.key);
                if (stageReaders.length === 0) return null;
                return (
                  <div key={stage.key} className={styles.stageGroup}>
                    <h3 className={styles.stageGroupTitle} style={{ '--stage-color': stage.color }}>
                      {stage.icon} {stage.label}
                      <span className={styles.stageCount}>{stageReaders.length}</span>
                    </h3>
                    <div className={styles.healthGrid}>
                      {stageReaders.map((r) => (
                        <div key={r.id} className={`${styles.healthCard} ${r.live ? styles.cardOnline : r.status === 'MAINTENANCE' ? styles.cardMaintenance : styles.cardOffline}`}>
                          <div className={styles.healthCardHeader}>
                            <span className={styles.readerCode}>{r.readerCode}</span>
                            <span className={`${styles.statusIndicator} ${r.live ? styles.indicatorOnline : r.status === 'MAINTENANCE' ? styles.indicatorMaint : styles.indicatorOffline}`}>
                              {r.live ? 'ONLINE' : r.status}
                            </span>
                          </div>
                          <p className={styles.readerName}>{r.readerName}</p>
                          <div className={styles.healthMeta}>
                            {r.ipAddress && <span>🌐 {r.ipAddress}</span>}
                            {r.location && <span>📍 {r.location}</span>}
                            <span>⏰ {fmtTime(r.lastHeartbeat)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ── Registry View ───────────────────────────────────────────────── */}
      {view === 'registry' && (
        <div className={styles.registryView}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Reader Registry</h2>
            {canManage && (
              <button className={styles.primaryBtn} onClick={openCreateReader}>
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                Add Reader
              </button>
            )}
          </div>
          {isLoading ? (
            <div className={styles.loadingRows}>{Array.from({ length: 3 }).map((_, i) => <div key={i} className="wt-skeleton" style={{ height: 44, width: '100%', marginBottom: 8 }} />)}</div>
          ) : readers.length === 0 ? (
            <div className={styles.emptyState}><p>No readers in registry.</p></div>
          ) : (
            <div className={styles.card}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Stage</th><th>IP</th><th>Location</th><th>Status</th><th>Heartbeat</th>{canManage && <th></th>}</tr></thead>
                  <tbody>
                    {readers.map((r) => {
                      const stg = STAGE_MAP[r.stage] || {};
                      return (
                        <tr key={r.id}>
                          <td><span className={styles.code}>{r.readerCode}</span></td>
                          <td>{r.readerName}</td>
                          <td>{r.readerType}</td>
                          <td>
                            <span className={styles.stagePill} style={{ '--stage-color': stg.color || '#64748b' }}>
                              {stg.icon} {stg.label || r.stage}
                            </span>
                          </td>
                          <td className={styles.muted}>{r.ipAddress || '—'}</td>
                          <td className={styles.muted}>{r.location || '—'}</td>
                          <td>
                            <span className={`${styles.statusPill} ${styles[`s_${r.live ? 'LIVE' : r.status}`]}`}>
                              {r.live ? '● ONLINE' : r.status}
                            </span>
                          </td>
                          <td className={styles.muted}>{fmtTime(r.lastHeartbeat)}</td>
                          {canManage && (
                            <td className={styles.actions}>
                              <button className={styles.actionBtn} onClick={() => openEditReader(r)} title="Edit">✏️</button>
                              <button className={styles.actionBtn} onClick={() => handleDeleteReader(r)} title="Delete">🗑️</button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Simulator View ──────────────────────────────────────────────── */}
      {view === 'simulator' && canEvent && (
        <div className={styles.simulatorView}>
          <div className={styles.simLayout}>
            <div className={styles.simPanel}>
              <h2 className={styles.sectionTitle}>🧪 RFID Event Simulator</h2>
              <p className={styles.simDesc}>
                Simulate RFID tag scans using the exact same API pipeline that future hardware will use.
                Select a truck and a reader, then generate the event.
              </p>
              <form onSubmit={handleSimulate} className={styles.simForm}>
                <label className={styles.formGroup}>
                  <span>Truck *</span>
                  <select required value={simForm.truckId} onChange={(e) => setSimForm({ ...simForm, truckId: e.target.value })}>
                    <option value="">Select a truck…</option>
                    {trucks.filter((t) => t.status === 'ACTIVE').map((t) => (
                      <option key={t.id} value={t.id}>{t.truckNumber} — {t.driverName}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.formGroup}>
                  <span>Reader *</span>
                  <select required value={simForm.readerId} onChange={(e) => setSimForm({ ...simForm, readerId: e.target.value })}>
                    <option value="">Select a reader…</option>
                    {readers.map((r) => {
                      const stg = STAGE_MAP[r.stage] || {};
                      return <option key={r.id} value={r.id}>{r.readerCode} — {stg.icon} {stg.label}</option>;
                    })}
                  </select>
                </label>
                <label className={styles.formGroup}>
                  <span>Source</span>
                  <select value={simForm.source} onChange={(e) => setSimForm({ ...simForm, source: e.target.value })}>
                    <option value="SIMULATED">SIMULATED</option>
                    <option value="RFID">RFID</option>
                    <option value="MANUAL">MANUAL</option>
                  </select>
                </label>
                {simError && <p className={styles.formError}>{simError}</p>}
                <button type="submit" className={styles.primaryBtn} disabled={simBusy} style={{ width: '100%', justifyContent: 'center' }}>
                  {simBusy ? 'Processing…' : '⚡ Generate RFID Event'}
                </button>
              </form>
            </div>

            <div className={styles.simResults}>
              <h2 className={styles.sectionTitle}>Event Result</h2>
              {simResult ? (
                <div className={styles.resultCard}>
                  <div className={styles.resultHeader}>
                    <span className={styles.resultSuccess}>✅ Event Recorded</span>
                    {simResult.alerts?.length > 0 && <span className={styles.resultAlertBadge}>⚠️ {simResult.alerts.length} alert(s)</span>}
                  </div>
                  <div className={styles.resultGrid}>
                    <ResultRow label="Truck" value={simResult.truck?.truckNumber} />
                    <ResultRow label="Stage" value={simResult.stage} />
                    <ResultRow label="Reader" value={simResult.reader?.readerCode} />
                    <ResultRow label="Visit" value={simResult.visit?.visitNumber} />
                    <ResultRow label="Visit Status" value={simResult.visit?.status} />
                    <ResultRow label="Risk" value={simResult.visit?.riskStatus} />
                  </div>
                  {simResult.alerts?.length > 0 && (
                    <div className={styles.resultAlerts}>
                      <h4>Alerts Raised</h4>
                      {simResult.alerts.map((a) => (
                        <div key={a.id} className={styles.resultAlertRow}>
                          <span className={styles.alertTypeTag}>{a.alertType.replace(/_/g, ' ')}</span>
                          <span>{a.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.simPlaceholder}>
                  <span className={styles.simPlaceholderIcon}>📡</span>
                  <p>Select a truck and reader, then generate an event to see results here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Reader Form Modal ────────────────────────────────────────────── */}
      {showReaderForm && (
        <div className={styles.modalOverlay} onClick={() => setShowReaderForm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editReader ? 'Edit Reader' : 'Add Reader'}</h3>
              <button className={styles.modalClose} onClick={() => setShowReaderForm(false)}>✕</button>
            </div>
            <form onSubmit={handleReaderSubmit}>
              <div className={styles.formGrid}>
                <label className={styles.formGroup}>
                  <span>Reader Code *</span>
                  <input required maxLength={40} value={readerForm.readerCode} onChange={(e) => setReaderForm({ ...readerForm, readerCode: e.target.value })} placeholder="e.g. RDR-ENTRY-01" />
                </label>
                <label className={styles.formGroup}>
                  <span>Reader Name *</span>
                  <input required maxLength={100} value={readerForm.readerName} onChange={(e) => setReaderForm({ ...readerForm, readerName: e.target.value })} placeholder="e.g. Entry Gate Reader 1" />
                </label>
                <label className={styles.formGroup}>
                  <span>Type</span>
                  <select value={readerForm.readerType} onChange={(e) => setReaderForm({ ...readerForm, readerType: e.target.value })}>
                    <option value="FIXED">FIXED</option>
                    <option value="HANDHELD">HANDHELD</option>
                    <option value="PORTAL">PORTAL</option>
                  </select>
                </label>
                <label className={styles.formGroup}>
                  <span>Stage *</span>
                  <select value={readerForm.stage} onChange={(e) => setReaderForm({ ...readerForm, stage: e.target.value })}>
                    {STAGES.map((s) => <option key={s.key} value={s.key}>{s.icon} {s.label}</option>)}
                  </select>
                </label>
                <label className={styles.formGroup}>
                  <span>IP Address</span>
                  <input maxLength={64} value={readerForm.ipAddress} onChange={(e) => setReaderForm({ ...readerForm, ipAddress: e.target.value })} placeholder="e.g. 192.168.1.100" />
                </label>
                <label className={styles.formGroup}>
                  <span>Location</span>
                  <input maxLength={120} value={readerForm.location} onChange={(e) => setReaderForm({ ...readerForm, location: e.target.value })} placeholder="e.g. Main Entry, Left Lane" />
                </label>
                <label className={styles.formGroup}>
                  <span>Status</span>
                  <select value={readerForm.status} onChange={(e) => setReaderForm({ ...readerForm, status: e.target.value })}>
                    <option value="OFFLINE">OFFLINE</option>
                    <option value="ONLINE">ONLINE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                  </select>
                </label>
              </div>
              {readerFormError && <p className={styles.formError}>{readerFormError}</p>}
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowReaderForm(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={readerFormBusy}>
                  {readerFormBusy ? 'Saving…' : editReader ? 'Update Reader' : 'Add Reader'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, color }) {
  return (
    <div className={styles.metricCard} style={{ '--metric-color': color }}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricBody}>
        <span className={styles.metricValue}>{value}</span>
        <span className={styles.metricLabel}>{label}</span>
      </div>
    </div>
  );
}

function ResultRow({ label, value }) {
  return (
    <div className={styles.resultRow}>
      <span className={styles.resultLabel}>{label}</span>
      <span className={styles.resultValue}>{value || '—'}</span>
    </div>
  );
}

export default RFIDMonitoring;
