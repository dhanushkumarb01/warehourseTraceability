/**
 * Dispatch Page ("Outgoing trucks") — dispatch dashboard + workflow.
 *
 * KPI cards (waiting / approved / completed / stopped), status tabs, the
 * dispatch table, create-request workflow and the detail/approval modal.
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
import {
  PageHeader, StatCard, Tabs, Button, IconButton, SearchInput, DataTable, LoadingRows, ErrorState, EmptyState,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './Dispatch.module.css';

const TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Waiting for approval' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');

const ACTION_TOAST = {
  approved: 'Approved. The truck can now go to the exit gate.',
  rejected: 'Request rejected. The batch stays in storage.',
  cancelled: 'Request cancelled.',
};

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
  const [search, setSearch] = useState('');

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
      setFetchError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dispatches
      .filter((d) => tab === 'ALL' || d.dispatchStatus === tab)
      .filter((d) => !q || [d.dispatchNumber, d.lot?.lotCode, d.lot?.material?.materialName, d.bay?.bayCode]
        .some((v) => v && String(v).toLowerCase().includes(q)));
  }, [dispatches, tab, search]);

  const handleCreate = async (payload) => {
    setIsSubmitting(true); setFormError(null);
    try {
      await createDispatch(payload);
      showToast('Request sent. A supervisor will approve it before the truck can leave.', 'success');
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
      showToast(ACTION_TOAST[label] || `Dispatch ${label}.`, 'success');
      loadAll();
    } catch (err) {
      setActionError(err.message || `Failed to ${label} dispatch.`);
    } finally {
      setActionBusy(null);
    }
  };

  const openNew = () => { setFormError(null); setFormOpen(true); };
  const tabs = TABS.map((t) => ({ ...t, count: isLoading ? undefined : t.value === 'ALL' ? dispatches.length : summary[t.value] }));
  const stopped = (summary.REJECTED || 0) + (summary.CANCELLED || 0);

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <PageHeader
        icon={Icons.truckOut}
        title="Outgoing trucks"
        term="Dispatch"
        subtitle="Ask to send a batch out, get it approved, and follow it to the exit gate."
        actions={(
          <>
            <IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={loadAll} disabled={isLoading} />
            {canCreate && <Button variant="primary" icon={Icons.plus} onClick={openNew}>New request</Button>}
          </>
        )}
      />

      <section className={styles.kpis} aria-label="Outgoing summary">
        <StatCard
          icon={Icons.hourglass} label="Waiting for approval" value={isLoading ? null : summary.PENDING} loading={isLoading}
          tone={summary.PENDING > 0 ? 'warning' : 'neutral'} status={summary.PENDING > 0 ? 'Needs a supervisor' : undefined}
          hint={canApprove ? 'You can approve these' : 'A supervisor approves these'}
          onClick={() => setTab('PENDING')}
        />
        <StatCard
          icon={Icons.checkCircle} label="Approved" value={isLoading ? null : summary.APPROVED} loading={isLoading}
          tone="info" hint="Cleared to load and leave" onClick={() => setTab('APPROVED')}
        />
        <StatCard
          icon={Icons.check} label="Completed" value={isLoading ? null : summary.COMPLETED} loading={isLoading}
          tone="success" hint="Left through the exit gate" onClick={() => setTab('COMPLETED')}
        />
        <StatCard
          icon={Icons.ban} label="Stopped" value={isLoading ? null : stopped} loading={isLoading}
          tone="neutral" hint={`${summary.REJECTED || 0} rejected · ${summary.CANCELLED || 0} cancelled`}
          onClick={() => setTab('REJECTED')}
          help="Requests that were rejected by a supervisor or cancelled by the requester."
        />
      </section>

      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Filter by status" />

      <div className={uiStyles.card}>
        <div className={styles.toolbar}>
          <SearchInput className={styles.search} value={search} onChange={setSearch} placeholder="Search request, batch, material or spot" />
          {!isLoading && <span className={uiStyles.muted}>{filtered.length} {filtered.length === 1 ? 'request' : 'requests'}</span>}
        </div>

        {isLoading ? <LoadingRows rows={5} /> : fetchError ? (
          <ErrorState title="We couldn’t load outgoing trucks" error={fetchError} onRetry={loadAll} />
        ) : filtered.length === 0 ? (
          search ? (
            <EmptyState icon={Icons.search} title="Nothing matches your search" message="Try a request number, batch code or material name." action={<Button onClick={() => setSearch('')}>Clear search</Button>} />
          ) : (
            <EmptyState
              icon={Icons.truckOut}
              title={tab === 'ALL' ? 'No outgoing requests yet' : `Nothing ${TABS.find((t) => t.value === tab).label.toLowerCase()}`}
              message={tab === 'ALL' ? 'When material needs to leave the yard, start a request here.' : 'Requests with this status will show up here.'}
              action={canCreate && tab === 'ALL' && <Button variant="primary" icon={Icons.plus} onClick={openNew}>New request</Button>}
            />
          )
        ) : (
          <DataTable
            caption="Outgoing truck requests"
            rows={filtered}
            defaultSort={{ key: 'createdAt', dir: 'desc' }}
            onRowClick={(d) => { setActionError(null); setDetail(d); }}
            rowTone={(d) => (d.dispatchStatus === 'PENDING' ? 'warning' : undefined)}
            columns={[
              {
                key: 'dispatchNumber', header: 'Request', primary: true,
                render: (d) => (
                  <>
                    <span className={uiStyles.strong}>{d.lot?.material?.materialName || 'Material'}</span>
                    <span className={uiStyles.sub}><span className={uiStyles.mono}>{d.dispatchNumber}</span> · batch {d.lot?.lotCode}</span>
                  </>
                ),
              },
              { key: 'qty', header: 'Quantity', align: 'right', sortValue: (d) => Number(d.approvedQuantity ?? d.requestedQuantity), render: (d) => <span className="wt-num">{d.approvedQuantity ?? d.requestedQuantity} {d.lot?.unit}</span> },
              { key: 'bay', header: 'From spot', sortValue: (d) => d.bay?.bayCode, render: (d) => <span className={uiStyles.mono}>{d.bay?.bayCode || '—'}</span> },
              { key: 'dispatchStatus', header: 'Status', render: (d) => <StatusBadge status={d.dispatchStatus} size="sm" /> },
              { key: 'createdAt', header: 'Requested', sortValue: (d) => new Date(d.createdAt).getTime(), render: (d) => <span className={uiStyles.muted}>{fmt(d.createdAt)}</span> },
              { key: 'open', header: '', sortable: false, hideOnMobile: true, width: 40, render: () => <span className={styles.chev}>{Icons.chevronRight}</span> },
            ]}
          />
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

export default Dispatch;
