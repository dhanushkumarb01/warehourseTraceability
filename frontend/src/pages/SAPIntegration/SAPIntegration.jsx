/**
 * SAPIntegration Page — SAP integration dashboard.
 *
 * Connection status, sync & validation statistics, recent SAP events, and
 * retry actions for failed syncs. Read access: ADMIN + MANAGER; retry: ADMIN.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchDashboard, retrySync } from '../../services/sapService';
import Toast from '../../components/Toast/Toast';
import styles from './SAPIntegration.module.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const SYNC_BADGE = { SUCCESS: 'sOk', FAILED: 'sFail', PENDING: 'sPend', IN_PROGRESS: 'sProg' };
const VAL_BADGE = { VALIDATED: 'sOk', WARNING: 'sWarn', BLOCKED: 'sFail' };

function SAPIntegration() {
  const { can } = useAuth();
  const canRetry = can(GROUPS.USER_ADMIN);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });
  const [retrying, setRetrying] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await fetchDashboard()); }
    catch (err) { setError(err.message || 'Failed to load SAP dashboard.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleRetry = async (id) => {
    setRetrying(id);
    try {
      const res = await retrySync(id);
      setToast({ message: `Retry ${res.status.toLowerCase()}.`, type: res.status === 'SUCCESS' ? 'success' : 'error' });
      load();
    } catch (err) {
      setToast({ message: err.message || 'Retry failed.', type: 'error' });
    } finally {
      setRetrying(null);
    }
  };

  const conn = data?.connection;
  const sync = data?.sync || {};
  const validation = data?.validation || {};

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3V7M4 7c0-2 1.5-3 4-3h8c2.5 0 4 1 4 3M4 7c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3M9 13h6" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>SAP Integration</h1>
            <p className={styles.pageBreadcrumb}>ERP synchronization, validation &amp; connection health</p>
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={load} disabled={loading}>Refresh</button>
      </div>

      {/* Connection status */}
      <div className={`${styles.connBanner} ${conn?.connected ? styles.connOk : styles.connDown}`}>
        <span className={styles.connDot} />
        <div>
          <span className={styles.connTitle}>
            {loading ? 'Checking connection…' : conn?.connected ? 'SAP Connected' : 'SAP Unreachable'}
          </span>
          <span className={styles.connSub}>
            Mode: <strong>{conn?.mode || '—'}</strong>
            {conn?.info?.system ? ` · ${conn.info.system}` : ''}
            {data?.lastSyncTime ? ` · Last sync ${fmt(data.lastSyncTime)}` : ''}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsStrip}>
        <StatCard label="Successful Syncs" value={loading ? '—' : sync.SUCCESS || 0} color="#16a34a" />
        <StatCard label="Failed Syncs" value={loading ? '—' : sync.FAILED || 0} color="#dc2626" />
        <StatCard label="Pending Syncs" value={loading ? '—' : (sync.PENDING || 0) + (sync.IN_PROGRESS || 0)} color="#ca8a04" />
        <StatCard label="SAP Validated" value={loading ? '—' : validation.VALIDATED || 0} color="#2563eb" />
        <StatCard label="SAP Blocked" value={loading ? '—' : validation.BLOCKED || 0} color="#7c3aed" />
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* Recent syncs */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Recent Sync Events</h3></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Type</th><th>Entity</th><th>Status</th><th>Attempts</th><th>Updated</th><th>Detail</th><th></th></tr></thead>
            <tbody>
              {(data?.recentSyncs || []).length === 0 ? (
                <tr><td colSpan={7} className={styles.empty}>No sync events yet.</td></tr>
              ) : data.recentSyncs.map((s) => (
                <tr key={s.id}>
                  <td><span className={styles.typeChip}>{s.entityType}</span></td>
                  <td className={styles.mono}>{s.entityId.slice(0, 8)}…</td>
                  <td><span className={`${styles.badge} ${styles[SYNC_BADGE[s.status] || 'sPend']}`}>{s.status}</span></td>
                  <td>{s.attemptCount}</td>
                  <td className={styles.muted}>{fmt(s.updatedAt)}</td>
                  <td className={styles.detail} title={s.errorMessage || ''}>{s.errorMessage || '—'}</td>
                  <td>
                    {s.status === 'FAILED' && canRetry && (
                      <button className={styles.retryBtn} onClick={() => handleRetry(s.id)} disabled={retrying === s.id}>
                        {retrying === s.id ? '…' : 'Retry'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent validations */}
      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Recent SAP Validations</h3></div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr><th>Type</th><th>Entity</th><th>Result</th><th>Message</th><th>When</th></tr></thead>
            <tbody>
              {(data?.recentValidations || []).length === 0 ? (
                <tr><td colSpan={5} className={styles.empty}>No validations yet.</td></tr>
              ) : data.recentValidations.map((v) => (
                <tr key={v.id}>
                  <td><span className={styles.typeChip}>{v.validationType}</span></td>
                  <td className={styles.mono}>{v.entityId.slice(0, 8)}…</td>
                  <td><span className={`${styles.badge} ${styles[VAL_BADGE[v.status] || 'sPend']}`}>{v.status}</span></td>
                  <td className={styles.detail} title={v.message || ''}>{v.message || '—'}</td>
                  <td className={styles.muted}>{fmt(v.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className={styles.statCard} style={{ '--stat-color': color }}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default SAPIntegration;
