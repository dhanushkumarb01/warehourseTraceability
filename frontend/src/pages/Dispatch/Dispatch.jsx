/**
 * Dispatch Page — dispatch dashboard + workflow.
 *
 * Stats strip (Pending/Approved/Rejected/Completed/Cancelled), status tabs,
 * the dispatch table, create-request workflow and the detail/approval modal.
 *
 * Reuses existing services — active inventory feeds the create modal's lot
 * picker so only mapped lots can be dispatched.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchActiveInventory } from '../../services/mappingService';
import {
  fetchDispatches, fetchDispatchSummary,
  createDispatch, approveDispatch, rejectDispatch, cancelDispatch,
} from '../../services/dispatchService';

import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import DispatchFormModal from '../../components/DispatchFormModal/DispatchFormModal';
import DispatchDetailModal from '../../components/DispatchDetailModal/DispatchDetailModal';
import styles from './Dispatch.module.css';

const TABS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

function Dispatch() {
  const { can } = useAuth();
  const canCreate = can(GROUPS.DISPATCH_CREATE);
  const canApprove = can(GROUPS.DISPATCH_APPROVE);
  const [dispatches, setDispatches] = useState([]);
  const [summary, setSummary] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, COMPLETED: 0, CANCELLED: 0, total: 0 });
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [tab, setTab] = useState('ALL');

  const [toast, setToast] = useState({ message: '', type: '' });
  const showToast = (message, type = 'info') => setToast({ message, type });

  const [formOpen, setFormOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const [detail, setDetail] = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [actionError, setActionError] = useState(null);

  const loadAll = useCallback(async () => {
    setIsLoading(true); setFetchError(null);
    try {
      const [list, sum, inv] = await Promise.all([
        fetchDispatches(),
        fetchDispatchSummary(),
        fetchActiveInventory().catch(() => []),
      ]);
      setDispatches(list); setSummary(sum); setInventory(inv);
    } catch (err) {
      setFetchError(err.message || 'Failed to load dispatches.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(
    () => (tab === 'ALL' ? dispatches : dispatches.filter((d) => d.dispatchStatus === tab)),
    [dispatches, tab]
  );

  const handleCreate = async (payload) => {
    setIsSubmitting(true); setFormError(null);
    try {
      await createDispatch(payload);
      showToast('Dispatch request created.', 'success');
      setFormOpen(false);
      loadAll();
    } catch (err) {
      setFormError(err.message || 'Failed to create dispatch.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const runAction = async (fn, label) => {
    setActionBusy(label); setActionError(null);
    try {
      const updated = await fn();
      setDetail(updated);
      showToast(`Dispatch ${label}.`, 'success');
      loadAll();
    } catch (err) {
      setActionError(err.message || `Failed to ${label} dispatch.`);
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6m0 0V9.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0015.5 6H13" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Dispatch</h1>
            <p className={styles.pageBreadcrumb}>Request, approve and track material dispatches</p>
          </div>
        </div>
        <div className={styles.headerActions}>
          {canCreate && (
            <button className={styles.primaryBtn} onClick={() => { setFormError(null); setFormOpen(true); }}>
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              New Request
            </button>
          )}
          <button className={styles.refreshBtn} onClick={loadAll} disabled={isLoading} title="Refresh">
            <svg viewBox="0 0 20 20" fill="currentColor" className={isLoading ? styles.spinning : ''}><path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" /></svg>
          </button>
        </div>
      </div>

      <div className={styles.statsStrip}>
        <StatCard label="Pending" value={isLoading ? '—' : summary.PENDING} color="#ca8a04" />
        <StatCard label="Approved" value={isLoading ? '—' : summary.APPROVED} color="#2563eb" />
        <StatCard label="Completed" value={isLoading ? '—' : summary.COMPLETED} color="#16a34a" />
        <StatCard label="Rejected" value={isLoading ? '—' : summary.REJECTED} color="#dc2626" />
        <StatCard label="Cancelled" value={isLoading ? '—' : summary.CANCELLED} color="#64748b" />
      </div>

      <div className={styles.tabs}>
        {TABS.map((t) => (
          <button key={t} className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0) + t.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {isLoading ? (
          <div className={styles.loadingState}><div className={styles.skeleton} /><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        ) : fetchError ? (
          <div className={styles.errorState}><p>{fetchError}</p><button className={styles.retryBtn} onClick={loadAll}>Try Again</button></div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6" /></svg>
            <p className={styles.emptyTitle}>No dispatches{tab !== 'ALL' ? ` in ${tab.toLowerCase()}` : ''}</p>
            <p className={styles.emptySubtitle}>Create a dispatch request to get started.</p>
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr><th>Dispatch #</th><th>Lot</th><th>Material</th><th>Qty</th><th>Bay</th><th>Status</th><th>Requested</th><th></th></tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} className={styles.clickable} onClick={() => { setActionError(null); setDetail(d); }}>
                    <td><span className={styles.code}>{d.dispatchNumber}</span></td>
                    <td>{d.lot?.lotCode}</td>
                    <td className={styles.nameCell}>{d.lot?.material?.materialName || '—'}</td>
                    <td>{d.approvedQuantity ?? d.requestedQuantity} {d.lot?.unit}</td>
                    <td><span className={styles.bayChip}>{d.bay?.bayCode}</span></td>
                    <td><StatusBadge status={d.dispatchStatus} /></td>
                    <td className={styles.muted}>{fmt(d.createdAt)}</td>
                    <td className={styles.chev}>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DispatchFormModal
        isOpen={formOpen}
        inventory={inventory}
        isSubmitting={isSubmitting}
        error={formError}
        onClose={() => setFormOpen(false)}
        onSubmit={handleCreate}
      />

      <DispatchDetailModal
        isOpen={Boolean(detail)}
        dispatch={detail}
        canApprove={canApprove}
        canCancel={canCreate}
        busy={actionBusy}
        error={actionError}
        onClose={() => setDetail(null)}
        onApprove={(p) => runAction(() => approveDispatch(detail.id, p), 'approved')}
        onReject={(p) => runAction(() => rejectDispatch(detail.id, p), 'rejected')}
        onCancel={(p) => runAction(() => cancelDispatch(detail.id, p), 'cancelled')}
      />
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

export default Dispatch;
