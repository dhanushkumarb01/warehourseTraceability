/**
 * GateValidation Page ("Exit gate") — exit gate dashboard + scan-to-exit.
 *
 * Shows what is waiting to exit (approved dispatches), the gate activity log
 * (validated / denied / exited records), KPI cards, and the scan-driven
 * validation modal. The scan button is the one primary action.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { getLots } from '../../services/lotService';
import { fetchGateValidations, fetchPendingExits, fetchGateSummary } from '../../services/gateValidationService';

import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import GateScanModal from '../../components/GateScanModal/GateScanModal';
import {
  PageHeader, StatCard, Card, Tabs, Button, IconButton, DataTable, LoadingRows, ErrorState, EmptyState, SearchInput,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './GateValidation.module.css';

const TABS = [
  { value: 'ALL', label: 'All checks' },
  { value: 'EXITED', label: 'Left the yard' },
  { value: 'DENIED', label: 'Stopped' },
];
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
  const [search, setSearch] = useState('');

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
      setFetchError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records
      .filter((r) => tab === 'ALL' || r.validationStatus === tab)
      .filter((r) => !q || [r.lot?.lotCode, r.lot?.material?.materialName, r.dispatch?.dispatchNumber, r.bay?.bayCode, r.remarks]
        .some((v) => v && String(v).toLowerCase().includes(q)));
  }, [records, tab, search]);

  const handleScanDone = (result) => {
    setToast({
      message: result.decision === 'EXITED' ? 'Cleared. The truck can leave the yard.' : `Stopped at the gate: ${result.reason}`,
      type: result.decision === 'EXITED' ? 'success' : 'error',
    });
    loadAll();
  };

  const scanButton = canValidate && (
    <Button variant="primary" size="lg" icon={Icons.scan} onClick={() => setScanOpen(true)}>Scan a truck’s batch</Button>
  );

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <PageHeader
        icon={Icons.gate}
        title="Exit gate"
        term="Gate validation"
        subtitle="Scan the batch on each truck before it leaves. We check it against the approved request and SAP."
        actions={(
          <>
            <IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={loadAll} disabled={isLoading} />
            {scanButton}
          </>
        )}
      />

      <section className={styles.kpis} aria-label="Gate summary">
        <StatCard
          icon={Icons.truckOut} label="Waiting at the gate" value={isLoading ? null : summary.readyForExit} loading={isLoading}
          tone={summary.readyForExit > 0 ? 'info' : 'neutral'} unit="trucks"
          hint="Approved and ready to be scanned out"
        />
        <StatCard
          icon={Icons.checkCircle} label="Left the yard" value={isLoading ? null : summary.EXITED} loading={isLoading}
          tone="success" hint="Scanned and allowed out" onClick={() => setTab('EXITED')}
        />
        <StatCard
          icon={Icons.xCircle} label="Stopped" value={isLoading ? null : summary.DENIED} loading={isLoading}
          tone={summary.DENIED > 0 ? 'danger' : 'neutral'} status={summary.DENIED > 0 ? 'Check why' : undefined}
          hint="Not allowed out — see the reason" onClick={() => setTab('DENIED')}
        />
        <StatCard
          icon={Icons.shieldCheck} label="All checks" value={isLoading ? null : summary.total} loading={isLoading}
          tone="neutral" hint="Every scan recorded at the gate" onClick={() => setTab('ALL')}
        />
      </section>

      <Card
        className={styles.section}
        icon={Icons.hourglass}
        title="Waiting at the gate"
        subtitle={isLoading ? 'Loading…' : pending.length ? `${pending.length} approved ${pending.length === 1 ? 'request is' : 'requests are'} ready to leave` : 'Nobody is waiting right now'}
        padded={false}
      >
        {isLoading ? <LoadingRows rows={2} /> : pending.length === 0 ? (
          <EmptyState icon={Icons.checkCircle} title="No trucks waiting" message="Approved outgoing trucks will appear here until they’re scanned at the gate." />
        ) : (
          <DataTable
            dense
            caption="Approved requests waiting at the gate"
            rows={pending}
            defaultSort={{ key: 'approvedAt', dir: 'asc' }}
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
              { key: 'bay', header: 'From spot', sortValue: (d) => d.bay?.bayCode, render: (d) => <span className={uiStyles.mono}>{d.bay?.bayCode || '—'}</span> },
              { key: 'approvedAt', header: 'Approved', sortValue: (d) => new Date(d.approvedAt).getTime(), render: (d) => <span className={uiStyles.muted}>{fmt(d.approvedAt)}</span> },
            ]}
          />
        )}
      </Card>

      <Tabs
        tabs={TABS.map((t) => ({ ...t, count: isLoading ? undefined : t.value === 'ALL' ? records.length : records.filter((r) => r.validationStatus === t.value).length }))}
        value={tab}
        onChange={setTab}
        ariaLabel="Filter gate checks"
      />

      <Card
        icon={Icons.history}
        title="Gate activity"
        subtitle="Every scan at the exit gate, newest first"
        padded={false}
        actions={<SearchInput className={styles.search} value={search} onChange={setSearch} placeholder="Search batch, request or spot" />}
      >
        {isLoading ? <LoadingRows rows={4} /> : fetchError ? (
          <ErrorState title="We couldn’t load gate activity" error={fetchError} onRetry={loadAll} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={search ? Icons.search : Icons.gate}
            title={search ? 'Nothing matches your search' : 'No gate checks yet'}
            message={search ? 'Try a batch code or request number.' : 'Each time a truck is scanned at the exit, it will be recorded here.'}
            action={search ? <Button onClick={() => setSearch('')}>Clear search</Button> : scanButton}
          />
        ) : (
          <DataTable
            caption="Gate activity"
            rows={filtered}
            defaultSort={{ key: 'time', dir: 'desc' }}
            rowTone={(r) => (r.validationStatus === 'DENIED' ? 'danger' : undefined)}
            columns={[
              {
                key: 'lot', header: 'Batch', primary: true, sortValue: (r) => r.lot?.lotCode,
                render: (r) => (
                  <>
                    <span className={uiStyles.strong}>{r.lot?.material?.materialName || 'Material'}</span>
                    <span className={uiStyles.sub}>batch <span className={uiStyles.mono}>{r.lot?.lotCode}</span></span>
                  </>
                ),
              },
              { key: 'dispatch', header: 'Request', sortValue: (r) => r.dispatch?.dispatchNumber, render: (r) => <span className={uiStyles.mono}>{r.dispatch?.dispatchNumber || '—'}</span> },
              { key: 'bay', header: 'Spot', sortValue: (r) => r.bay?.bayCode, hideOnMobile: true, render: (r) => <span className={uiStyles.mono}>{r.bay?.bayCode || '—'}</span> },
              { key: 'validationStatus', header: 'Result', render: (r) => <StatusBadge status={r.validationStatus} size="sm" /> },
              { key: 'time', header: 'Time', sortValue: (r) => new Date(r.gateExitTime || r.createdAt).getTime(), render: (r) => <span className={uiStyles.muted}>{fmt(r.gateExitTime || r.createdAt)}</span> },
              { key: 'remarks', header: 'Note', sortable: false, render: (r) => <span className={styles.note} title={r.remarks || ''}>{r.remarks || '—'}</span> },
            ]}
          />
        )}
      </Card>

      <GateScanModal isOpen={scanOpen} lots={lots} onClose={() => setScanOpen(false)} onDone={handleScanDone} />
    </div>
  );
}

export default GateValidation;
