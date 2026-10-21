/**
 * Truck Dashboard — Operations Command Center
 *
 * Real-time yard overview: trucks inside, exited today, parked, delayed,
 * active alerts, average turnaround. Live yard status with operational
 * visibility into the truck lifecycle.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchTruckDashboard, fetchTrucks, createTruck, updateTruck } from '../../services/truckService';
import Toast from '../../components/Toast/Toast';
import styles from './TruckDashboard.module.css';

const STAGES = {
  ENTRY_GATE: { label: 'Entry Gate', icon: '🚪', color: '#3b82f6' },
  WEIGH_BRIDGE_1: { label: 'Weigh Bridge 1', icon: '⚖️', color: '#8b5cf6' },
  LOADING_DOCK: { label: 'Loading Dock', icon: '📦', color: '#f59e0b' },
  WEIGH_BRIDGE_2: { label: 'Weigh Bridge 2', icon: '⚖️', color: '#8b5cf6' },
  INVOICE: { label: 'Invoice', icon: '📋', color: '#0d9488' },
  PARKING: { label: 'Parking', icon: '🅿️', color: '#64748b' },
  EXIT_GATE: { label: 'Exit Gate', icon: '🚛', color: '#16a34a' },
};

const RISK_COLORS = { NORMAL: '#16a34a', DELAYED: '#d97706', FLAGGED: '#dc2626' };
const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

function TruckDashboard() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canManage = can(GROUPS.TRUCK_MANAGE);

  const [dashboard, setDashboard] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });
  const showToast = (message, type = 'info') => setToast({ message, type });

  // Truck form
  const [showForm, setShowForm] = useState(false);
  const [editTruck, setEditTruck] = useState(null);
  const [formData, setFormData] = useState({ truckNumber: '', driverName: '', driverContact: '', transporter: '', vehicleType: '', rfidTag: '' });
  const [formBusy, setFormBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  // View mode
  const [view, setView] = useState('yard'); // yard | registry

  const loadData = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const [dash, trk] = await Promise.all([fetchTruckDashboard(), fetchTrucks()]);
      setDashboard(dash);
      setTrucks(trk);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      fetchTruckDashboard().then(setDashboard).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const openCreate = () => {
    setEditTruck(null);
    setFormData({ truckNumber: '', driverName: '', driverContact: '', transporter: '', vehicleType: '', rfidTag: '' });
    setFormError(null);
    setShowForm(true);
  };

  const openEdit = (t) => {
    setEditTruck(t);
    setFormData({ truckNumber: t.truckNumber, driverName: t.driverName, driverContact: t.driverContact || '', transporter: t.transporter || '', vehicleType: t.vehicleType || '', rfidTag: t.rfidTag || '' });
    setFormError(null);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormBusy(true); setFormError(null);
    try {
      if (editTruck) {
        await updateTruck(editTruck.id, formData);
        showToast('Truck updated.', 'success');
      } else {
        await createTruck(formData);
        showToast('Truck registered.', 'success');
      }
      setShowForm(false);
      loadData();
    } catch (err) {
      setFormError(err.message || 'Failed to save truck.');
    } finally {
      setFormBusy(false);
    }
  };

  const stats = dashboard || {};

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6m0 0V9.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0015.5 6H13" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Truck Operations</h1>
            <p className={styles.pageBreadcrumb}>Real-time yard monitoring & truck lifecycle management</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.viewToggle}>
            <button className={`${styles.viewBtn} ${view === 'yard' ? styles.viewActive : ''}`} onClick={() => setView('yard')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
              Yard View
            </button>
            <button className={`${styles.viewBtn} ${view === 'registry' ? styles.viewActive : ''}`} onClick={() => setView('registry')}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
              Fleet Registry
            </button>
          </div>
          {canManage && (
            <button className={styles.primaryBtn} onClick={openCreate}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              Register Truck
            </button>
          )}
          <button className={styles.refreshBtn} onClick={loadData} disabled={isLoading} title="Refresh">
            <svg viewBox="0 0 20 20" fill="currentColor" className={isLoading ? styles.spinning : ''}><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      {/* ── Live Metrics Strip ──────────────────────────────────────────── */}
      <div className={styles.metricsStrip}>
        <MetricCard label="Inside Yard" value={isLoading ? '—' : stats.insideYardCount} icon="🏗️" color="#3b82f6" sub="active now" />
        <MetricCard label="Exited Today" value={isLoading ? '—' : stats.exitedTodayCount} icon="🚛" color="#16a34a" sub="completed" />
        <MetricCard label="Parked" value={isLoading ? '—' : stats.parkedCount} icon="🅿️" color="#8b5cf6" sub="on premises" />
        <MetricCard label="Delayed" value={isLoading ? '—' : stats.delayedCount} icon="⏱️" color="#d97706" sub="over threshold" />
        <MetricCard label="Active Alerts" value={isLoading ? '—' : stats.exceptionsCount} icon="⚠️" color="#dc2626" sub="unresolved" />
        <MetricCard label="Avg Turnaround" value={isLoading ? '—' : `${stats.avgTurnaroundMins || 0}m`} icon="⏳" color="#0d9488" sub="today" />
      </div>

      {error && (
        <div className={styles.errorBanner}>
          <p>{error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      )}

      {view === 'yard' ? (
        <>
          {/* ── Live Yard Status ─────────────────────────────────────────── */}
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>
              <span className={styles.liveDot} />
              Live Yard Status
            </h2>
            <span className={styles.sectionBadge}>{stats.insideYard?.length || 0} trucks</span>
          </div>

          {isLoading ? (
            <div className={styles.skeletonGrid}>{Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${styles.skeletonCard} wt-skeleton`} />)}</div>
          ) : !stats.insideYard?.length ? (
            <div className={styles.emptyYard}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6" /></svg>
              <p>No trucks currently in the yard</p>
            </div>
          ) : (
            <div className={styles.yardGrid}>
              {stats.insideYard.map((t) => {
                const stage = STAGES[t.currentStage] || {};
                return (
                  <div key={t.id} className={`${styles.truckCard} ${t.riskStatus === 'FLAGGED' ? styles.flagged : t.riskStatus === 'DELAYED' ? styles.delayed : ''}`} onClick={() => navigate(`/trucks/journey/${t.id}`)}>
                    <div className={styles.truckCardHeader}>
                      <span className={styles.truckNumber}>{t.truckNumber}</span>
                      <span className={styles.riskBadge} style={{ '--risk': RISK_COLORS[t.riskStatus] || '#16a34a' }}>{t.riskStatus}</span>
                    </div>
                    <div className={styles.truckCardBody}>
                      <div className={styles.stageTag} style={{ '--stage-color': stage.color || '#64748b' }}>
                        <span>{stage.icon || '📍'}</span>
                        <span>{stage.label || t.currentStage || 'Entering'}</span>
                      </div>
                      <div className={styles.truckMeta}>
                        <span className={styles.metaItem}>👤 {t.driverName}</span>
                        <span className={styles.metaItem}>🕐 {t.minutesInYard}m in yard</span>
                        <span className={styles.metaItem}>⏱️ {t.minutesInStage}m at stage</span>
                      </div>
                    </div>
                    <div className={styles.truckCardFooter}>
                      <span>Entered {fmt(t.entryTime)}</span>
                      <span className={styles.chevron}>→</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Stage Pipeline Overview ────────────────────────────────── */}
          {stats.insideYard?.length > 0 && (
            <div className={styles.pipelineSection}>
              <h2 className={styles.sectionTitle}>Stage Pipeline</h2>
              <div className={styles.pipeline}>
                {Object.entries(STAGES).map(([key, stage]) => {
                  const count = (stats.insideYard || []).filter((t) => t.currentStage === key).length;
                  return (
                    <div key={key} className={`${styles.pipelineNode} ${count > 0 ? styles.pipelineActive : ''}`}>
                      <div className={styles.pipelineIcon} style={{ '--stage-color': stage.color }}>{stage.icon}</div>
                      <span className={styles.pipelineLabel}>{stage.label}</span>
                      <span className={styles.pipelineCount}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Recent Alerts ────────────────────────────────────────────── */}
          {stats.recentAlerts?.length > 0 && (
            <div className={styles.alertsSection}>
              <h2 className={styles.sectionTitle}>Recent Alerts</h2>
              <div className={styles.alertsList}>
                {stats.recentAlerts.map((a) => (
                  <div key={a.id} className={`${styles.alertRow} ${styles[`alert_${a.alertType}`]}`}>
                    <span className={styles.alertIcon}>
                      {a.alertType === 'DELAY' ? '⏱️' : a.alertType === 'UNAUTHORIZED_REENTRY' ? '🚫' : '⚠️'}
                    </span>
                    <div className={styles.alertContent}>
                      <span className={styles.alertType}>{a.alertType.replace(/_/g, ' ')}</span>
                      <span className={styles.alertMsg}>{a.message}</span>
                    </div>
                    <div className={styles.alertMeta}>
                      <span>{a.visit?.truck?.truckNumber}</span>
                      <span className={styles.muted}>{fmt(a.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /* ── Fleet Registry ──────────────────────────────────────────────── */
        <div className={styles.registrySection}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Fleet Registry</h2>
            <span className={styles.sectionBadge}>{trucks.length} trucks</span>
          </div>
          {isLoading ? (
            <div className={styles.loadingState}><div className="wt-skeleton" style={{ height: 40, width: '100%', marginBottom: 8 }} /><div className="wt-skeleton" style={{ height: 40, width: '100%', marginBottom: 8 }} /><div className="wt-skeleton" style={{ height: 40, width: '100%' }} /></div>
          ) : trucks.length === 0 ? (
            <div className={styles.emptyYard}><p>No trucks registered yet.</p></div>
          ) : (
            <div className={styles.card}>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr><th>Truck #</th><th>Driver</th><th>Transporter</th><th>Vehicle Type</th><th>RFID Tag</th><th>Status</th><th>Visits</th><th></th></tr></thead>
                  <tbody>
                    {trucks.map((t) => (
                      <tr key={t.id}>
                        <td><span className={styles.code}>{t.truckNumber}</span></td>
                        <td>{t.driverName}</td>
                        <td>{t.transporter || '—'}</td>
                        <td>{t.vehicleType || '—'}</td>
                        <td>{t.rfidTag ? <span className={styles.rfidTag}>{t.rfidTag}</span> : <span className={styles.muted}>—</span>}</td>
                        <td><span className={`${styles.statusDot} ${t.status === 'ACTIVE' ? styles.dotActive : styles.dotInactive}`} />{t.status}</td>
                        <td>{t._count?.visits ?? '—'}</td>
                        <td>
                          {canManage && (
                            <button className={styles.editBtn} onClick={() => openEdit(t)} title="Edit">
                              <svg viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Truck Form Modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3>{editTruck ? 'Edit Truck' : 'Register Truck'}</h3>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <label className={styles.formGroup}>
                  <span>Truck Number *</span>
                  <input required maxLength={32} value={formData.truckNumber} onChange={(e) => setFormData({ ...formData, truckNumber: e.target.value })} placeholder="e.g. MH-12-AB-1234" />
                </label>
                <label className={styles.formGroup}>
                  <span>Driver Name *</span>
                  <input required maxLength={100} value={formData.driverName} onChange={(e) => setFormData({ ...formData, driverName: e.target.value })} placeholder="Full name" />
                </label>
                <label className={styles.formGroup}>
                  <span>Driver Contact</span>
                  <input maxLength={32} value={formData.driverContact} onChange={(e) => setFormData({ ...formData, driverContact: e.target.value })} placeholder="Phone number" />
                </label>
                <label className={styles.formGroup}>
                  <span>Transporter</span>
                  <input maxLength={120} value={formData.transporter} onChange={(e) => setFormData({ ...formData, transporter: e.target.value })} placeholder="Transport company" />
                </label>
                <label className={styles.formGroup}>
                  <span>Vehicle Type</span>
                  <input maxLength={60} value={formData.vehicleType} onChange={(e) => setFormData({ ...formData, vehicleType: e.target.value })} placeholder="e.g. 16-Wheeler" />
                </label>
                <label className={styles.formGroup}>
                  <span>RFID Tag</span>
                  <input maxLength={64} value={formData.rfidTag} onChange={(e) => setFormData({ ...formData, rfidTag: e.target.value })} placeholder="e.g. RFID-001" />
                </label>
              </div>
              {formError && <p className={styles.formError}>{formError}</p>}
              <div className={styles.formActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className={styles.primaryBtn} disabled={formBusy}>
                  {formBusy ? 'Saving…' : editTruck ? 'Update Truck' : 'Register Truck'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, color, sub }) {
  return (
    <div className={styles.metricCard} style={{ '--metric-color': color }}>
      <div className={styles.metricIcon}>{icon}</div>
      <div className={styles.metricBody}>
        <span className={styles.metricValue}>{value}</span>
        <span className={styles.metricLabel}>{label}</span>
        {sub && <span className={styles.metricSub}>{sub}</span>}
      </div>
    </div>
  );
}

export default TruckDashboard;
