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
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import { TRUCK_STAGES, STAGE_BY_KEY, stageLabel } from '../../config/truckStages';
import {
  PageHeader, StatCard, Card, Button, SegmentedControl, LiveIndicator, DataTable, LoadingRows, ErrorState,
  EmptyState, Modal, Field, FormAlert, Skeleton, StatusChip, DetailList, Banner,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './RFIDMonitoring.module.css';

const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Never';
const READER_TYPES = { FIXED: 'Fixed (mounted)', HANDHELD: 'Handheld', PORTAL: 'Portal (drive-through)' };

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
  const [updatedAt, setUpdatedAt] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
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
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Auto-refresh health every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      fetchReaderDashboard().then((d) => { setReaderDashboard(d); setUpdatedAt(new Date()); }).catch(() => {});
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
        showToast(`Reader ${readerForm.readerCode} updated.`, 'success');
      } else {
        await createReader(readerForm);
        showToast(`Reader ${readerForm.readerCode} added.`, 'success');
      }
      setShowReaderForm(false);
      loadAll();
    } catch (err) {
      setReaderFormError(err.message || 'Failed to save reader.');
    } finally {
      setReaderFormBusy(false);
    }
  };

  const handleDeleteReader = async () => {
    const r = deleteTarget;
    if (!r) return;
    setDeleting(true);
    try {
      await deleteReader(r.id);
      showToast(`Reader ${r.readerCode} deleted.`, 'success');
      setDeleteTarget(null);
      loadAll();
    } catch (err) {
      showToast(err.message || 'Failed to delete reader.', 'error');
    } finally {
      setDeleting(false);
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
      showToast(`Scan recorded at ${stageLabel(result.stage)}${result.alerts?.length ? ` — it raised ${result.alerts.length} ${result.alerts.length === 1 ? 'alert' : 'alerts'}` : ''}.`, result.alerts?.length ? 'warning' : 'success');
      // Refresh dashboard
      fetchReaderDashboard().then(setReaderDashboard).catch(() => {});
    } catch (err) {
      setSimError(err.message || 'Event ingestion failed.');
    } finally {
      setSimBusy(false);
    }
  };

  const dash = readerDashboard || {};
  const setRF = (k) => (e) => setReaderForm({ ...readerForm, [k]: e.target.value });
  const readerState = (r) => (r.live ? 'ONLINE' : r.status === 'MAINTENANCE' ? 'MAINTENANCE' : 'OFFLINE');

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <PageHeader
        icon={Icons.rfid}
        title="RFID readers"
        term="RFID infrastructure"
        subtitle="The tag readers at each step of a truck’s visit, and whether they’re working."
        meta={<LiveIndicator updatedAt={updatedAt} onRefresh={loadAll} refreshing={isLoading && Boolean(readerDashboard)} />}
        actions={(
          <>
            <SegmentedControl
              ariaLabel="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'health', label: 'Status', icon: Icons.signal },
                { value: 'registry', label: 'All readers', icon: Icons.list },
                ...(canEvent ? [{ value: 'simulator', label: 'Test a scan', icon: Icons.bolt }] : []),
              ]}
            />
            {canManage && view === 'registry' && <Button variant="primary" icon={Icons.plus} onClick={openCreateReader}>Add reader</Button>}
          </>
        )}
      />

      <section className={styles.kpis} aria-label="Reader summary">
        <StatCard icon={Icons.rfid} label="Readers" value={isLoading && !readerDashboard ? null : dash.total} loading={isLoading && !readerDashboard} tone="info" hint="Installed across the route" />
        <StatCard icon={Icons.signal} label="Working" value={isLoading && !readerDashboard ? null : dash.online} loading={isLoading && !readerDashboard} tone="success" hint="Checked in recently" />
        <StatCard icon={Icons.wifiOff} label="Not responding" value={isLoading && !readerDashboard ? null : dash.offline} loading={isLoading && !readerDashboard}
          tone={dash.offline > 0 ? 'danger' : 'success'} status={dash.offline > 0 ? 'Check' : 'All good'}
          hint="Trucks passing here won’t be tracked" help="A reader that hasn’t checked in recently. Trucks passing it are not recorded until it comes back." />
        <StatCard icon={Icons.cog} label="In maintenance" value={isLoading && !readerDashboard ? null : dash.maintenance} loading={isLoading && !readerDashboard} tone="warning" hint="Switched off on purpose" />
      </section>

      {error && !readerDashboard && (
        <Card><ErrorState title="We couldn’t load the RFID readers" error={error} onRetry={loadAll} /></Card>
      )}

      {/* ── Status view ── */}
      {view === 'health' && (
        <Card icon={Icons.route} title="Readers along the truck route" subtitle="Grouped by the step of the visit they record">
          {isLoading && !readerDashboard ? (
            <div className={styles.healthGrid}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={128} radius={16} />)}</div>
          ) : !dash.readers?.length ? (
            <EmptyState icon={Icons.rfid} title="No readers added yet" message="Add a reader for each gate or weighbridge so trucks are tracked automatically."
              action={canManage && <Button variant="primary" icon={Icons.plus} onClick={() => { setView('registry'); openCreateReader(); }}>Add reader</Button>} />
          ) : (
            <div className={styles.stageList}>
              {TRUCK_STAGES.map((stage, i) => {
                const stageReaders = (dash.readers || []).filter((r) => r.stage === stage.key);
                return (
                  <section key={stage.key} className={styles.stageGroup}>
                    <h3 className={styles.stageGroupTitle}>
                      <span className={styles.stageIcon}>{Icons[stage.icon]}</span>
                      {i + 1}. {stage.label}
                      <span className={styles.stageCount}>{stageReaders.length}</span>
                    </h3>
                    {stageReaders.length === 0 ? (
                      <p className={styles.noReader}>{Icons.warning}No reader here — trucks won’t be recorded at this step.</p>
                    ) : (
                      <div className={styles.healthGrid}>
                        {stageReaders.map((r) => (
                          <article key={r.id} className={`${styles.healthCard} ${styles[`rs_${readerState(r)}`]}`}>
                            <div className={styles.healthCardHeader}>
                              <span className={styles.readerCode}>{r.readerCode}</span>
                              <StatusBadge status={readerState(r)} size="sm" />
                            </div>
                            <p className={styles.readerName}>{r.readerName}</p>
                            <div className={styles.healthMeta}>
                              {r.location && <span>{Icons.pin}{r.location}</span>}
                              {r.ipAddress && <span>{Icons.link}{r.ipAddress}</span>}
                              <span>{Icons.clock}Last check-in: {fmtTime(r.lastHeartbeat)}</span>
                            </div>
                          </article>
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ── All readers ── */}
      {view === 'registry' && (
        <Card icon={Icons.list} title="All readers" subtitle={`${readers.length} ${readers.length === 1 ? 'reader' : 'readers'}`} padded={false}>
          {isLoading ? <LoadingRows rows={4} /> : readers.length === 0 ? (
            <EmptyState icon={Icons.rfid} title="No readers added yet" message="Add a reader for each gate or weighbridge."
              action={canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreateReader}>Add reader</Button>} />
          ) : (
            <DataTable
              caption="RFID readers"
              rows={readers}
              defaultSort={{ key: 'stage', dir: 'asc' }}
              rowTone={(r) => (readerState(r) === 'OFFLINE' ? 'danger' : undefined)}
              columns={[
                {
                  key: 'readerCode', header: 'Reader', primary: true,
                  render: (r) => (
                    <>
                      <span className={uiStyles.strong}>{r.readerName}</span>
                      <span className={uiStyles.sub}><span className={uiStyles.mono}>{r.readerCode}</span> · {READER_TYPES[r.readerType] || r.readerType}</span>
                    </>
                  ),
                },
                { key: 'stage', header: 'Route step', sortValue: (r) => STAGE_BY_KEY[r.stage]?.index ?? 99, render: (r) => <StatusChip tone="brand" icon={Icons[STAGE_BY_KEY[r.stage]?.icon] || Icons.pin} size="sm">{stageLabel(r.stage)}</StatusChip> },
                { key: 'location', header: 'Location', render: (r) => r.location || <span className={uiStyles.soft}>—</span> },
                { key: 'ipAddress', header: 'Network address', hideOnMobile: true, render: (r) => (r.ipAddress ? <span className={uiStyles.mono}>{r.ipAddress}</span> : <span className={uiStyles.soft}>—</span>) },
                { key: 'status', header: 'Status', sortValue: (r) => readerState(r), render: (r) => <StatusBadge status={readerState(r)} size="sm" /> },
                { key: 'lastHeartbeat', header: 'Last check-in', sortValue: (r) => (r.lastHeartbeat ? new Date(r.lastHeartbeat).getTime() : 0), render: (r) => <span className={uiStyles.muted}>{fmtTime(r.lastHeartbeat)}</span> },
              ]}
              actions={canManage ? (r) => [
                { label: 'Edit reader', icon: Icons.edit, onClick: () => openEditReader(r) },
                { label: 'Delete reader', icon: Icons.trash, onClick: () => setDeleteTarget(r), danger: true },
              ] : undefined}
            />
          )}
        </Card>
      )}

      {/* ── Test a scan ── */}
      {view === 'simulator' && canEvent && (
        <div className={styles.simLayout}>
          <Card icon={Icons.bolt} title="Test a scan" subtitle="Pretend a truck’s tag passed a reader. It goes through the same steps as a real scan.">
            <form onSubmit={handleSimulate} className={styles.simForm} noValidate>
              <Banner tone="warning">This records a real event on the truck’s visit. Use it for testing and training only.</Banner>
              <FormAlert>{simError}</FormAlert>
              <Field label="Truck" required>
                {(p) => (
                  <select {...p} required value={simForm.truckId} onChange={(e) => setSimForm({ ...simForm, truckId: e.target.value })}>
                    <option value="">Choose a truck…</option>
                    {trucks.filter((t) => t.status === 'ACTIVE').map((t) => (
                      <option key={t.id} value={t.id}>{t.truckNumber} — {t.driverName}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Reader" required hint="Where the truck is pretending to be.">
                {(p) => (
                  <select {...p} required value={simForm.readerId} onChange={(e) => setSimForm({ ...simForm, readerId: e.target.value })}>
                    <option value="">Choose a reader…</option>
                    {readers.map((r) => <option key={r.id} value={r.id}>{r.readerCode} — {stageLabel(r.stage)}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Recorded as" help="How the event will be labelled in the truck’s history.">
                {(p) => (
                  <select {...p} value={simForm.source} onChange={(e) => setSimForm({ ...simForm, source: e.target.value })}>
                    <option value="SIMULATED">Test scan</option>
                    <option value="RFID">RFID reader</option>
                    <option value="MANUAL">Manual entry</option>
                  </select>
                )}
              </Field>
              <Button type="submit" variant="primary" block icon={Icons.bolt} loading={simBusy} disabled={!simForm.truckId || !simForm.readerId}>
                {simBusy ? 'Recording…' : 'Record test scan'}
              </Button>
            </form>
          </Card>

          <Card icon={Icons.checkCircle} title="Result">
            {simResult ? (
              <div className={styles.result}>
                <div className={styles.resultHeader}>
                  <StatusChip tone="success" icon={Icons.check}>Scan recorded</StatusChip>
                  {simResult.alerts?.length > 0 && <StatusChip tone="warning">{simResult.alerts.length} {simResult.alerts.length === 1 ? 'alert' : 'alerts'} raised</StatusChip>}
                </div>
                <DetailList
                  items={[
                    { label: 'Truck', value: <span className={uiStyles.mono}>{simResult.truck?.truckNumber || '—'}</span> },
                    { label: 'Step', value: stageLabel(simResult.stage) },
                    { label: 'Reader', value: <span className={uiStyles.mono}>{simResult.reader?.readerCode || '—'}</span> },
                    { label: 'Visit', value: <span className={uiStyles.mono}>{simResult.visit?.visitNumber || '—'}</span> },
                    { label: 'Visit status', value: simResult.visit?.status ? simResult.visit.status.toLowerCase() : '—' },
                    { label: 'Risk', value: simResult.visit?.riskStatus ? <StatusBadge status={simResult.visit.riskStatus} size="sm" /> : '—' },
                  ]}
                />
                {simResult.alerts?.length > 0 && (
                  <ul className={styles.resultAlerts}>
                    {simResult.alerts.map((a) => (
                      <li key={a.id}>{Icons.warning}<span><strong>{a.alertType.replace(/_/g, ' ').toLowerCase()}</strong> — {a.message}</span></li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <EmptyState icon={Icons.rfid} title="No test scan yet" message="Choose a truck and a reader, then record a test scan to see what happens." />
            )}
          </Card>
        </div>
      )}

      {/* ── Reader form ── */}
      <Modal
        isOpen={showReaderForm}
        onClose={() => setShowReaderForm(false)}
        busy={readerFormBusy}
        icon={Icons.rfid}
        title={editReader ? `Edit reader ${editReader.readerCode}` : 'Add a reader'}
        subtitle="Each reader records trucks at one step of their visit."
        as="form"
        onSubmit={handleReaderSubmit}
        footer={(
          <>
            <Button onClick={() => setShowReaderForm(false)} disabled={readerFormBusy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={readerFormBusy} disabled={!readerForm.readerCode.trim() || !readerForm.readerName.trim()}>
              {editReader ? 'Save changes' : 'Add reader'}
            </Button>
          </>
        )}
      >
        <div className={uiStyles.formSection}>
          <FormAlert>{readerFormError}</FormAlert>
          <div className={uiStyles.formGrid}>
            <Field label="Reader code" required hint="Printed on the device">
              {(p) => <input {...p} maxLength={40} value={readerForm.readerCode} onChange={setRF('readerCode')} placeholder="e.g. RDR-ENTRY-01" />}
            </Field>
            <Field label="Name" required>
              {(p) => <input {...p} maxLength={100} value={readerForm.readerName} onChange={setRF('readerName')} placeholder="e.g. Entry gate reader 1" />}
            </Field>
            <Field label="Route step" required help="Which step of the truck’s visit this reader records.">
              {(p) => (
                <select {...p} value={readerForm.stage} onChange={setRF('stage')}>
                  {TRUCK_STAGES.map((st, i) => <option key={st.key} value={st.key}>{i + 1}. {st.label}</option>)}
                </select>
              )}
            </Field>
            <Field label="Type">
              {(p) => (
                <select {...p} value={readerForm.readerType} onChange={setRF('readerType')}>
                  {Object.entries(READER_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              )}
            </Field>
            <Field label="Location" optional>
              {(p) => <input {...p} maxLength={120} value={readerForm.location} onChange={setRF('location')} placeholder="e.g. Main entry, left lane" />}
            </Field>
            <Field label="Network (IP) address" optional>
              {(p) => <input {...p} maxLength={64} value={readerForm.ipAddress} onChange={setRF('ipAddress')} placeholder="e.g. 192.168.1.100" />}
            </Field>
            <Field label="Status" className={uiStyles.span2} hint="Readers switch to Working automatically when they check in.">
              {(p) => (
                <select {...p} value={readerForm.status} onChange={setRF('status')}>
                  <option value="OFFLINE">Not responding</option>
                  <option value="ONLINE">Working</option>
                  <option value="MAINTENANCE">In maintenance</option>
                </select>
              )}
            </Field>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title="Delete this reader?"
        message={`Reader ${deleteTarget?.readerCode} (${deleteTarget?.readerName}) will be removed.`}
        details={['Trucks passing this spot won’t be recorded any more.', 'Past scans stay in each truck’s history.']}
        confirmLabel="Delete reader"
        isProcessing={deleting}
        onConfirm={handleDeleteReader}
        onCancel={() => { if (!deleting) setDeleteTarget(null); }}
      />
    </div>
  );
}

export default RFIDMonitoring;
