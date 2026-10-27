/**
 * SAPIntegration Page ("SAP connection") — SAP integration dashboard.
 *
 * Connection status, sync & validation KPIs, recent SAP events, and retry
 * actions for failed syncs. Read access: ADMIN + MANAGER; retry: ADMIN.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchDashboard, retrySync } from '../../services/sapService';
import Toast from '../../components/Toast/Toast';
import {
  PageHeader, StatCard, Card, Button, IconButton, DataTable, LoadingRows, ErrorState, EmptyState, StatusChip, Skeleton,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './SAPIntegration.module.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const words = (v) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

const SYNC = {
  SUCCESS: { tone: 'success', label: 'Sent', icon: Icons.checkCircle },
  FAILED: { tone: 'danger', label: 'Failed', icon: Icons.xCircle },
  PENDING: { tone: 'warning', label: 'Waiting', icon: Icons.hourglass },
  IN_PROGRESS: { tone: 'info', label: 'Sending', icon: Icons.sync },
};
const VALIDATION = {
  VALIDATED: { tone: 'success', label: 'Passed', icon: Icons.checkCircle },
  WARNING: { tone: 'warning', label: 'Passed with warning', icon: Icons.warning },
  BLOCKED: { tone: 'danger', label: 'Blocked', icon: Icons.ban },
};

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
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const handleRetry = async (id) => {
    setRetrying(id);
    try {
      const res = await retrySync(id);
      setToast({
        message: res.status === 'SUCCESS' ? 'Sent to SAP successfully.' : `Retry finished: ${res.status.toLowerCase().replace(/_/g, ' ')}.`,
        type: res.status === 'SUCCESS' ? 'success' : 'error',
      });
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
  const pending = (sync.PENDING || 0) + (sync.IN_PROGRESS || 0);

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <PageHeader
        icon={Icons.database}
        title="SAP connection"
        term="SAP integration"
        subtitle="Whether our records are reaching SAP, and the checks SAP runs on outgoing trucks."
        actions={<IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={load} disabled={loading} />}
      />

      {/* Connection status */}
      {loading && !data ? <Skeleton height={74} radius={20} className={styles.connSkel} /> : (
        <div className={`${styles.connBanner} ${conn?.connected ? styles.connOk : styles.connDown}`} role="status">
          <span className={styles.connIcon}>{conn?.connected ? Icons.checkCircle : Icons.wifiOff}</span>
          <div className={styles.connText}>
            <span className={styles.connTitle}>{conn?.connected ? 'SAP is connected' : 'SAP can’t be reached'}</span>
            <span className={styles.connSub}>
              {conn?.connected
                ? 'Records are being sent and checked normally.'
                : 'New records wait in a queue and are sent once SAP is back. Nothing is lost.'}
              {' '}Mode: <strong>{conn?.mode || '—'}</strong>
              {conn?.info?.system ? ` · ${conn.info.system}` : ''}
              {data?.lastSyncTime ? ` · last sent ${fmt(data.lastSyncTime)}` : ''}
            </span>
          </div>
        </div>
      )}

      {error && !data && <Card><ErrorState title="We couldn’t load the SAP dashboard" error={error} onRetry={load} /></Card>}

      <section className={styles.kpis} aria-label="SAP summary">
        <StatCard icon={Icons.checkCircle} label="Sent to SAP" value={loading && !data ? null : sync.SUCCESS || 0} loading={loading && !data} tone="success" hint="Records accepted by SAP" />
        <StatCard icon={Icons.xCircle} label="Failed to send" value={loading && !data ? null : sync.FAILED || 0} loading={loading && !data}
          tone={sync.FAILED > 0 ? 'danger' : 'success'} status={sync.FAILED > 0 ? 'Retry needed' : 'None'} hint={canRetry ? 'You can retry these below' : 'An administrator can retry these'} />
        <StatCard icon={Icons.hourglass} label="Waiting to send" value={loading && !data ? null : pending} loading={loading && !data} tone={pending > 0 ? 'warning' : 'neutral'} hint="In the queue" />
        <StatCard icon={Icons.shieldCheck} label="Checks passed" value={loading && !data ? null : validation.VALIDATED || 0} loading={loading && !data} tone="info" hint="SAP approved the truck or batch" />
        <StatCard icon={Icons.ban} label="Checks blocked" value={loading && !data ? null : validation.BLOCKED || 0} loading={loading && !data}
          tone={validation.BLOCKED > 0 ? 'danger' : 'neutral'} hint="SAP said no — see the reason" />
      </section>

      <Card icon={Icons.sync} title="Recent records sent to SAP" subtitle="Newest first" padded={false} className={styles.block}>
        {loading && !data ? <LoadingRows rows={4} /> : (data?.recentSyncs || []).length === 0 ? (
          <EmptyState icon={Icons.sync} title="Nothing sent yet" message="Records appear here as they’re sent to SAP." />
        ) : (
          <DataTable
            caption="Recent SAP sync events"
            rows={data.recentSyncs}
            defaultSort={{ key: 'updatedAt', dir: 'desc' }}
            rowTone={(r) => (r.status === 'FAILED' ? 'danger' : undefined)}
            columns={[
              {
                key: 'entityType', header: 'Record', primary: true,
                render: (r) => (
                  <>
                    <span className={uiStyles.strong}>{words(r.entityType)}</span>
                    <span className={uiStyles.sub}>ID <span className={uiStyles.mono}>{r.entityId.slice(0, 8)}…</span></span>
                  </>
                ),
              },
              { key: 'status', header: 'Result', render: (r) => { const m = SYNC[r.status] || { tone: 'neutral', label: words(r.status) }; return <StatusChip tone={m.tone} icon={m.icon} size="sm">{m.label}</StatusChip>; } },
              { key: 'attemptCount', header: 'Tries', align: 'right', render: (r) => <span className="wt-num">{r.attemptCount}</span> },
              { key: 'updatedAt', header: 'Updated', sortValue: (r) => new Date(r.updatedAt).getTime(), render: (r) => <span className={uiStyles.muted}>{fmt(r.updatedAt)}</span> },
              { key: 'errorMessage', header: 'Reason', sortable: false, render: (r) => <span className={styles.detail} title={r.errorMessage || ''}>{r.errorMessage || '—'}</span> },
            ]}
            actions={canRetry ? (r) => (r.status === 'FAILED'
              ? <Button size="sm" variant="secondary" icon={Icons.refresh} loading={retrying === r.id} onClick={() => handleRetry(r.id)}>Retry</Button>
              : null) : undefined}
          />
        )}
      </Card>

      <Card icon={Icons.shieldCheck} title="Recent SAP checks" subtitle="What SAP said about outgoing trucks and batches" padded={false}>
        {loading && !data ? <LoadingRows rows={4} /> : (data?.recentValidations || []).length === 0 ? (
          <EmptyState icon={Icons.shieldCheck} title="No checks yet" message="Checks appear when an outgoing truck or gate scan is verified with SAP." />
        ) : (
          <DataTable
            caption="Recent SAP validations"
            rows={data.recentValidations}
            defaultSort={{ key: 'createdAt', dir: 'desc' }}
            rowTone={(r) => (r.status === 'BLOCKED' ? 'danger' : undefined)}
            columns={[
              {
                key: 'validationType', header: 'Check', primary: true,
                render: (v) => (
                  <>
                    <span className={uiStyles.strong}>{words(v.validationType)}</span>
                    <span className={uiStyles.sub}>ID <span className={uiStyles.mono}>{v.entityId.slice(0, 8)}…</span></span>
                  </>
                ),
              },
              { key: 'status', header: 'Result', render: (v) => { const m = VALIDATION[v.status] || { tone: 'neutral', label: words(v.status) }; return <StatusChip tone={m.tone} icon={m.icon} size="sm">{m.label}</StatusChip>; } },
              { key: 'message', header: 'What SAP said', sortable: false, render: (v) => <span className={styles.detail} title={v.message || ''}>{v.message || '—'}</span> },
              { key: 'createdAt', header: 'When', sortValue: (v) => new Date(v.createdAt).getTime(), render: (v) => <span className={uiStyles.muted}>{fmt(v.createdAt)}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

export default SAPIntegration;
