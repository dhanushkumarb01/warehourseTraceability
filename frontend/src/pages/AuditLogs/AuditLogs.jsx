/**
 * AuditLogs Page ("Activity log", ADMIN / MANAGER)
 *
 * Read-only view of the audit trail with an area filter and search. Each row
 * shows who did what, when, and the captured details — the backbone of
 * traceability and audit compliance.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAuditLogs } from '../../services/authApi';
import { ROLE_LABELS } from '../../config/navigation';
import {
  PageHeader, Card, Tabs, Button, IconButton, SearchInput, DataTable, LoadingRows, ErrorState, EmptyState, Tag,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './AuditLogs.module.css';

const MODULES = [
  { value: 'ALL', label: 'Everything' },
  { value: 'AUTH', label: 'Sign-ins' },
  { value: 'USER', label: 'Users' },
  { value: 'MATERIAL', label: 'Materials' },
  { value: 'MATERIAL_LOT', label: 'Batches' },
  { value: 'QR', label: 'QR labels' },
  { value: 'MAPPING', label: 'Storage' },
  { value: 'DISPATCH', label: 'Outgoing trucks' },
  { value: 'GATE_VALIDATION', label: 'Exit gate' },
];
const MODULE_LABEL = Object.fromEntries(MODULES.map((m) => [m.value, m.label]));
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
const words = (v) => (v ? v.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—');

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
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = moduleFilter === 'ALL' ? { limit: 300 } : { module: moduleFilter, limit: 300 };
      setLogs(await fetchAuditLogs(params));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [moduleFilter]);
  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => [l.user?.username, l.module, l.action, l.remarks].some((v) => v && String(v).toLowerCase().includes(q)));
  }, [logs, search]);

  return (
    <div className={styles.page}>
      <PageHeader
        icon={Icons.document}
        title="Activity log"
        term="Audit logs"
        subtitle="Who did what, and when. Every change in the system is recorded here and can’t be edited."
        actions={<IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={load} disabled={loading} />}
      />

      <Tabs tabs={MODULES} value={moduleFilter} onChange={setModuleFilter} ariaLabel="Filter by area" />

      <Card
        icon={Icons.history}
        title={MODULE_LABEL[moduleFilter]}
        subtitle={loading ? 'Loading…' : `${rows.length} of ${logs.length} ${logs.length === 1 ? 'entry' : 'entries'} · showing the latest 300`}
        actions={<SearchInput className={styles.search} value={search} onChange={setSearch} placeholder="Search user, action or details" />}
        padded={false}
      >
        {loading ? <LoadingRows rows={6} /> : error ? (
          <ErrorState title="We couldn’t load the activity log" error={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={search ? Icons.search : Icons.document}
            title={search ? 'Nothing matches your search' : 'No activity recorded yet'}
            message={search ? 'Try a username or action name.' : moduleFilter === 'ALL' ? 'Actions taken in the system will be listed here.' : 'Try another area.'}
            action={search && <Button onClick={() => setSearch('')}>Clear search</Button>}
          />
        ) : (
          <DataTable
            caption="Activity log"
            rows={rows}
            dense
            defaultSort={{ key: 'timestamp', dir: 'desc' }}
            columns={[
              {
                key: 'action', header: 'What happened', primary: true,
                render: (l) => (
                  <>
                    <span className={uiStyles.strong}>{words(l.action)}</span>
                    <span className={uiStyles.sub}>{MODULE_LABEL[l.module] || words(l.module)}</span>
                  </>
                ),
              },
              {
                key: 'user', header: 'By', sortValue: (l) => l.user?.username,
                render: (l) => (l.user ? (
                  <span className={styles.userCell}>
                    <span className={styles.avatar} aria-hidden="true">{l.user.username.slice(0, 2).toUpperCase()}</span>
                    <span>{l.user.username}<span className={uiStyles.sub}>{ROLE_LABELS[l.user.role] || l.user.role}</span></span>
                  </span>
                ) : <Tag tone="neutral">System</Tag>),
              },
              { key: 'timestamp', header: 'When', sortValue: (l) => new Date(l.timestamp).getTime(), render: (l) => <span className={uiStyles.muted}>{fmt(l.timestamp)}</span> },
              { key: 'remarks', header: 'Details', sortable: false, render: (l) => <span className={styles.details} title={prettyMeta(l.remarks)}>{prettyMeta(l.remarks)}</span> },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

export default AuditLogs;
