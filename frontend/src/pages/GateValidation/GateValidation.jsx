/**
 * GateValidation Page — exit gate dashboard + scan-to-exit workflow.
 *
 * Shows what is waiting to exit (approved dispatches), the gate activity log
 * (validated / denied / exited records), inventory-impact stats, and the
 * scan-driven validation modal.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { getLots } from '../../services/lotService';
import { fetchGateValidations, fetchPendingExits, fetchGateSummary } from '../../services/gateValidationService';

import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import GateScanModal from '../../components/GateScanModal/GateScanModal';
import styles from './GateValidation.module.css';

const TABS = ['ALL', 'EXITED', 'DENIED'];
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function GateValidation() {
  const { can } = useAuth();
  const canValidate = can(GROUPS.GATE);
  const [records, setRecords] = useState([]);
  const [pending, setPending] = useState([]);
  const [summary, setSummary] = useState({ PENDING: 0, VALIDATED: 0, DENIED: 0, EXITED: 0, readyForExit: 0 });
  const [lots, setLots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [tab, setTab] = useState('ALL');

  const [scanOpen, setScanOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', type: '' });

  const loadAll = useCallback(async () => {
    setIsLoading(true); setFetchError(null);
    try {
      const [recs, pend, sum, lotsRes] = await Promise.all([
        fetchGateValidations(),
        fetchPendingExits(),
        fetchGateSummary(),
        getLots().then((r) => r.data || []).catch(() => []),
      ]);
      setRecords(recs); setPending(pend); setSummary(sum); setLots(lotsRes);
    } catch (err) {
      setFetchError(err.message || 'Failed to load gate validation data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(
    () => (tab === 'ALL' ? records : records.filter((r) => r.validationStatus === tab)),
    [records, tab]
  );

  const handleScanDone = (result) => {
    setToast({
      message: result.decision === 'EXITED' ? 'Material exit authorised.' : `Exit denied: ${result.reason}`,
      type: result.decision === 'EXITED' ? 'success' : 'error',
    });
    loadAll();
  };

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21V5a2 2 0 012-2h6m0 18V3m0 18h10M11 3h6a2 2 0 012 2v16M7 8h.01M7 12h.01" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Exit Gate Validation</h1>
            <p className={styles.pageBreadcrumb}>Authorise and record material leaving the warehouse</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {canValidate && (
            <button className={styles.primaryBtn} onClick={() => setScanOpen(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path strokeLinecap="round" d="M14 14h3m4 0v.01M17 21h4M14 17v4" /></svg>
              Scan to Exit
            </button>
          )}
          <button className={styles.refreshBtn} onClick={loadAll} disabled={isLoading} title="Refresh">
            <svg viewBox="0 0 20 20" fill="currentColor" className={isLoading ? styles.spinning : ''}><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      <div className={styles.statsStrip}>
        <StatCard label="Ready for Exit" value={isLoading ? '—' : summary.readyForExit} color="#2563eb" />
        <StatCard label="Exited" value={isLoading ? '—' : summary.EXITED} color="#7c3aed" />
        <StatCard label="Denied" value={isLoading ? '—' : summary.DENIED} color="#dc2626" />
        <StatCard label="Total Checks" value={isLoading ? '—' : summary.total} color="#0d9488" />
      </div>

      {/* Awaiting exit */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>Awaiting Exit</h3>
          <span className={styles.count}>{pending.length} approved dispatches</span>
        </div>
        {isLoading ? (
          <div className={styles.loadingState}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        ) : pending.length === 0 ? (
          <div className={styles.emptyRow}>No approved dispatches are waiting at the gate.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Dispatch #</th><th>Lot</th><th>Material</th><th>Bay</th><th>Approved</th></tr></thead>
              <tbody>
                {pending.map((d) => (
                  <tr key={d.id}>
                    <td><span className={styles.code}>{d.dispatchNumber}</span></td>
                    <td>{d.lot?.lotCode}</td>
                    <td className={styles.nameCell}>{d.lot?.material?.materialName || '—'}</td>
                    <td><span className={styles.bayChip}>{d.bay?.bayCode}</span></td>
                    <td className={styles.muted}>{fmt(d.approvedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gate activity */}
      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}><h3 className={styles.cardTitle}>Gate Activity Log</h3></div>
        {isLoading ? (
          <div className={styles.loadingState}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        ) : fetchError ? (
          <div className={styles.emptyRow}>{fetchError}</div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyRow}>No gate validation records{tab !== 'ALL' ? ` (${tab.toLowerCase()})` : ''} yet.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Lot</th><th>Material</th><th>Dispatch #</th><th>Bay</th><th>Decision</th><th>Time</th><th>Note</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>{r.lot?.lotCode}</td>
                    <td className={styles.nameCell}>{r.lot?.material?.materialName || '—'}</td>
                    <td><span className={styles.code}>{r.dispatch?.dispatchNumber}</span></td>
                    <td><span className={styles.bayChip}>{r.bay?.bayCode}</span></td>
                    <td><StatusBadge status={r.validationStatus} /></td>
                    <td className={styles.muted}>{fmt(r.gateExitTime || r.createdAt)}</td>
                    <td className={styles.note} title={r.remarks || ''}>{r.remarks || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <GateScanModal isOpen={scanOpen} lots={lots} onClose={() => setScanOpen(false)} onDone={handleScanDone} />
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

export default GateValidation;
