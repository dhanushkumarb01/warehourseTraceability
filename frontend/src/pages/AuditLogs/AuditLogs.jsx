/**
 * AuditLogs Page (ADMIN / MANAGER)
 *
 * Read-only view of the audit trail with a module filter. Each row shows who
 * did what, when, and the captured metadata — the backbone of traceability and
 * audit compliance.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuditLogs } from '../../services/authApi';
import styles from './AuditLogs.module.css';

const MODULES = ['ALL', 'AUTH', 'USER', 'MATERIAL', 'MATERIAL_LOT', 'QR', 'MAPPING', 'DISPATCH', 'GATE_VALIDATION'];
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');

const prettyMeta = (remarks) => {
  if (!remarks) return '—';
  try {
    const obj = JSON.parse(remarks);
    if (obj && typeof obj === 'object') {
      return Object.entries(obj)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${v}`)
        .join(' · ') || '—';
    }
  } catch { /* not JSON — plain text */ }
  return remarks;
};

function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [moduleFilter, setModuleFilter] = useState('ALL');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = moduleFilter === 'ALL' ? { limit: 300 } : { module: moduleFilter, limit: 300 };
      setLogs(await fetchAuditLogs(params));
    } catch (err) {
      setError(err.message || 'Failed to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [moduleFilter]);
  useEffect(() => { load(); }, [load]);

  const count = useMemo(() => logs.length, [logs]);

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Audit Logs</h1>
            <p className={styles.pageBreadcrumb}>Complete, attributable activity trail</p>
          </div>
        </div>
        <button className={styles.refreshBtn} onClick={load} disabled={loading}>Refresh</button>
      </div>

      <div className={styles.tabs}>
        {MODULES.map((m) => (
          <button key={m} className={`${styles.tab} ${moduleFilter === m ? styles.tabActive : ''}`} onClick={() => setModuleFilter(m)}>
            {m === 'ALL' ? 'All' : m.replace('_', ' ')}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}><span className={styles.count}>{count} entries</span></div>
        {loading ? (
          <div className={styles.loadingState}><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        ) : error ? (
          <div className={styles.emptyRow}>{error}</div>
        ) : logs.length === 0 ? (
          <div className={styles.emptyRow}>No audit entries{moduleFilter !== 'ALL' ? ` for ${moduleFilter}` : ''}.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Time</th><th>User</th><th>Module</th><th>Action</th><th>Details</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className={styles.muted}>{fmt(l.timestamp)}</td>
                    <td>{l.user ? <span className={styles.userCell}>{l.user.username}<span className={styles.roleTag}>{l.user.role}</span></span> : '—'}</td>
                    <td><span className={styles.moduleChip}>{l.module}</span></td>
                    <td className={styles.action}>{l.action}</td>
                    <td className={styles.details} title={prettyMeta(l.remarks)}>{prettyMeta(l.remarks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AuditLogs;
