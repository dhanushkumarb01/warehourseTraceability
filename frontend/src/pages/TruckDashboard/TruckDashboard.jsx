/**
 * Truck Dashboard ("Trucks in yard") — live truck operations.
 *
 * KPI cards (inside, delayed, alerts, left today, time inside, parked), a
 * "Where are the trucks now?" stage pipeline, one card per truck inside the
 * yard, recent truck alerts, and the fleet registry with the register/edit
 * form. The dashboard refreshes itself every 30s.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { TRUCK_STAGES, STAGE_BY_KEY, stageLabel } from '../../config/truckStages';
import { fetchTruckDashboard, fetchTrucks, createTruck, updateTruck } from '../../services/truckService';
import Toast from '../../components/Toast/Toast';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import {
  PageHeader, StatCard, Card, Button, IconButton, SegmentedControl, LiveIndicator, DataTable, LoadingRows,
  ErrorState, EmptyState, Modal, Field, FormAlert, Skeleton, StatusChip,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './TruckDashboard.module.css';

const fmt = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const ALERT_TEXT = {
  DELAY: { label: 'Taking too long', icon: Icons.clock, tone: 'warning' },
  UNAUTHORIZED_REENTRY: { label: 'Came back in without a new visit', icon: Icons.ban, tone: 'danger' },
  SEQUENCE_VIOLATION: { label: 'Skipped a step', icon: Icons.warning, tone: 'warning' },
};
const EMPTY_FORM = { truckNumber: '', driverName: '', driverContact: '', transporter: '', vehicleType: '', rfidTag: '' };

function TruckDashboard() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const canManage = can(GROUPS.TRUCK_MANAGE);

  const [dashboard, setDashboard] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });
  const showToast = (message, type = 'info') => setToast({ message, type });

  // Truck form
  const [showForm, setShowForm] = useState(false);
  const [editTruck, setEditTruck] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
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
      setUpdatedAt(new Date());
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Auto-refresh every 30s
  useEffect(() => {
    const iv = setInterval(() => {
      fetchTruckDashboard().then((d) => { setDashboard(d); setUpdatedAt(new Date()); }).catch(() => {});
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const openCreate = () => {
    setEditTruck(null);
    setFormData(EMPTY_FORM);
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
    if (!formData.truckNumber.trim() || !formData.driverName.trim()) {
      setFormError('Enter the truck number and the driver’s name.');
      return;
    }
    setFormBusy(true); setFormError(null);
    try {
      if (editTruck) {
        await updateTruck(editTruck.id, formData);
        showToast(`Truck ${formData.truckNumber} updated.`, 'success');
      } else {
        await createTruck(formData);
        showToast(`Truck ${formData.truckNumber} registered.`, 'success');
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
  const inside = stats.insideYard || [];
  const flagged = inside.filter((t) => t.riskStatus === 'FLAGGED').length;
  const setField = (k) => (e) => setFormData({ ...formData, [k]: e.target.value });

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <PageHeader
        icon={Icons.truck}
        title="Trucks in yard"
        term="Truck operations"
        subtitle="Which trucks are inside, where they are, and which ones are held up."
        meta={<LiveIndicator updatedAt={updatedAt} onRefresh={loadData} refreshing={isLoading && Boolean(dashboard)} />}
        actions={(
          <>
            <SegmentedControl
              ariaLabel="View"
              value={view}
              onChange={setView}
              options={[
                { value: 'yard', label: 'Live yard', icon: Icons.map },
                { value: 'registry', label: 'All trucks', icon: Icons.list, count: isLoading ? undefined : trucks.length },
              ]}
            />
            {canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Register truck</Button>}
          </>
        )}
      />

      <section className={styles.kpis} aria-label="Truck summary">
        <StatCard icon={Icons.truck} label="Inside the yard" value={isLoading ? null : stats.insideYardCount} unit="trucks" loading={isLoading && !dashboard}
          tone="info" hint="Entered and not left yet" />
        <StatCard icon={Icons.clock} label="Delayed" value={isLoading ? null : stats.delayedCount} loading={isLoading && !dashboard}
          tone={stats.delayedCount > 0 ? 'warning' : 'success'} status={stats.delayedCount > 0 ? 'Check' : 'None'}
          hint="At one step longer than usual" help="Each step has a normal time limit. A truck past that limit is shown as delayed." />
        <StatCard icon={Icons.warning} label="Open truck alerts" value={isLoading ? null : stats.exceptionsCount} loading={isLoading && !dashboard}
          tone={flagged > 0 || stats.exceptionsCount > 0 ? 'danger' : 'success'}
          status={flagged > 0 ? `${flagged} flagged` : stats.exceptionsCount > 0 ? 'Unresolved' : 'All clear'}
          hint="Skipped steps, re-entry or delays" />
        <StatCard icon={Icons.truckOut} label="Left today" value={isLoading ? null : stats.exitedTodayCount} unit="trucks" loading={isLoading && !dashboard}
          tone="success" hint="Completed and checked out" />
        <StatCard icon={Icons.hourglass} label="Average time inside" value={isLoading ? null : stats.avgTurnaroundMins || 0} unit="min" loading={isLoading && !dashboard}
          tone="neutral" hint="For trucks that left today" help="From entering the gate to leaving it, averaged over today’s completed visits." />
        <StatCard icon={Icons.pin} label="Parked" value={isLoading ? null : stats.parkedCount} unit="trucks" loading={isLoading && !dashboard}
          tone="neutral" hint="Waiting inside the yard" />
      </section>

      {error && !dashboard && (
        <Card><ErrorState title="We couldn’t load truck data" error={error} onRetry={loadData} /></Card>
      )}

      {view === 'yard' ? (
        <div className={styles.yardLayout}>
          <div className={styles.yardMain}>
            <Card
              icon={Icons.route}
              title="Where are the trucks now?"
              subtitle="Number of trucks at each step of the visit"
              className={styles.block}
            >
              {isLoading && !dashboard ? <Skeleton height={86} radius={14} /> : (
                <ol className={styles.pipeline}>
                  {TRUCK_STAGES.map((stage, i) => {
                    const count = inside.filter((t) => t.currentStage === stage.key).length;
                    return (
                      <li key={stage.key} className={`${styles.pipeStep} ${count > 0 ? styles.pipeActive : ''}`} title={stage.hint}>
                        <span className={styles.pipeIcon}>{Icons[stage.icon]}</span>
                        <span className={`${styles.pipeCount} wt-num`}>{count}</span>
                        <span className={styles.pipeLabel}>{i + 1}. {stage.label}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>

            <Card
              icon={Icons.truck}
              title="Trucks inside the yard"
              subtitle={inside.length ? `${inside.length} ${inside.length === 1 ? 'truck' : 'trucks'} · held-up trucks first` : undefined}
              className={styles.block}
            >
              {isLoading && !dashboard ? (
                <div className={styles.truckGrid}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={150} radius={16} />)}</div>
              ) : inside.length === 0 ? (
                <EmptyState icon={Icons.truck} title="No trucks inside right now" message="Trucks appear here as soon as they pass the entry gate." />
              ) : (
                <div className={styles.truckGrid}>
                  {[...inside].sort((a, b) => riskRank(a) - riskRank(b) || b.minutesInStage - a.minutesInStage).map((t) => {
                    const stage = STAGE_BY_KEY[t.currentStage];
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className={`${styles.truckCard} ${styles[`risk_${t.riskStatus}`] || ''}`}
                        onClick={() => navigate(`/trucks/journey/${t.id}`)}
                        aria-label={`Truck ${t.truckNumber}, ${stageLabel(t.currentStage)}, ${t.riskStatus.toLowerCase()} — open journey`}
                      >
                        <span className={styles.truckTop}>
                          <span className={styles.truckNumber}>{t.truckNumber}</span>
                          <StatusBadge status={t.riskStatus} size="sm" />
                        </span>
                        <span className={styles.truckStage}>
                          <span className={styles.truckStageIcon}>{stage ? Icons[stage.icon] : Icons.pin}</span>
                          {stageLabel(t.currentStage)}
                        </span>
                        <span className={styles.truckMeta}>
                          <span>{Icons.user}{t.driverName}</span>
                          <span>{Icons.clock}{t.minutesInStage} min at this step · {t.minutesInYard} min inside</span>
                        </span>
                        <span className={styles.truckFoot}>
                          Entered {fmt(t.entryTime)}
                          <span className={styles.truckOpen}>See journey {Icons.arrowRight}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          <Card icon={Icons.bell} title="Recent truck alerts" subtitle="Latest problems spotted by the gate readers" className={styles.alertsCard}>
            {isLoading && !dashboard ? <LoadingRows rows={3} /> : !stats.recentAlerts?.length ? (
              <EmptyState icon={Icons.checkCircle} title="No truck alerts" message="Skipped steps, re-entries and long waits will be listed here." />
            ) : (
              <ul className={styles.alertList}>
                {stats.recentAlerts.map((a) => {
                  const meta = ALERT_TEXT[a.alertType] || { label: a.alertType.replace(/_/g, ' ').toLowerCase(), icon: Icons.warning, tone: 'warning' };
                  return (
                    <li key={a.id} className={`${styles.alertRow} ${styles[`alert_${meta.tone}`]}`}>
                      <span className={styles.alertIcon}>{meta.icon}</span>
                      <div className={styles.alertText}>
                        <span className={styles.alertTitle}>{meta.label}</span>
                        <span className={styles.alertMsg}>{a.message}</span>
                        <span className={styles.alertMeta}>
                          {a.visit?.truck?.truckNumber && <strong>{a.visit.truck.truckNumber}</strong>} {fmt(a.createdAt)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      ) : (
        <Card icon={Icons.list} title="All registered trucks" subtitle={`${trucks.length} ${trucks.length === 1 ? 'truck' : 'trucks'} in the fleet list`} padded={false}>
          {isLoading ? <LoadingRows rows={5} /> : trucks.length === 0 ? (
            <EmptyState
              icon={Icons.truck}
              title="No trucks registered yet"
              message="Register a truck so its RFID tag is recognised at the gates."
              action={canManage && <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Register truck</Button>}
            />
          ) : (
            <DataTable
              caption="Registered trucks"
              rows={trucks}
              defaultSort={{ key: 'truckNumber', dir: 'asc' }}
              columns={[
                {
                  key: 'truckNumber', header: 'Truck', primary: true,
                  render: (t) => (
                    <>
                      <span className={uiStyles.mono}>{t.truckNumber}</span>
                      <span className={uiStyles.sub}>{t.vehicleType || 'Vehicle type not set'}</span>
                    </>
                  ),
                },
                { key: 'driverName', header: 'Driver', render: (t) => <>{t.driverName}{t.driverContact && <span className={uiStyles.sub}>{t.driverContact}</span>}</> },
                { key: 'transporter', header: 'Transport company', render: (t) => t.transporter || <span className={uiStyles.soft}>—</span> },
                { key: 'rfidTag', header: 'RFID tag', help: 'The tag on the truck that the gate readers detect.', render: (t) => (t.rfidTag ? <span className={uiStyles.mono}>{t.rfidTag}</span> : <StatusChip tone="warning" size="sm">No tag</StatusChip>) },
                { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} size="sm" /> },
                { key: 'visits', header: 'Visits', align: 'right', sortValue: (t) => t._count?.visits ?? 0, render: (t) => <span className="wt-num">{t._count?.visits ?? '—'}</span> },
              ]}
              actions={canManage ? (t) => <IconButton icon={Icons.edit} label={`Edit truck ${t.truckNumber}`} size="sm" onClick={() => openEdit(t)} /> : undefined}
            />
          )}
        </Card>
      )}

      {/* ── Truck form ───────────────────────────────────────────────────── */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        busy={formBusy}
        icon={Icons.truck}
        title={editTruck ? `Edit truck ${editTruck.truckNumber}` : 'Register a truck'}
        subtitle="Registered trucks are recognised automatically when their RFID tag passes a gate reader."
        as="form"
        onSubmit={handleSubmit}
        footer={(
          <>
            <Button onClick={() => setShowForm(false)} disabled={formBusy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={formBusy}>{editTruck ? 'Save changes' : 'Register truck'}</Button>
          </>
        )}
      >
        <div className={uiStyles.formSection}>
          <FormAlert>{formError}</FormAlert>
          <p className={uiStyles.sectionTitle}>Truck</p>
          <div className={uiStyles.formGrid}>
            <Field label="Truck number" required hint="As written on the number plate">
              {(p) => <input {...p} maxLength={32} value={formData.truckNumber} onChange={setField('truckNumber')} placeholder="e.g. MH-12-AB-1234" />}
            </Field>
            <Field label="Vehicle type" optional>
              {(p) => <input {...p} maxLength={60} value={formData.vehicleType} onChange={setField('vehicleType')} placeholder="e.g. 16-wheeler" />}
            </Field>
            <Field label="Transport company" optional>
              {(p) => <input {...p} maxLength={120} value={formData.transporter} onChange={setField('transporter')} placeholder="Who owns or runs the truck" />}
            </Field>
            <Field label="RFID tag" optional help="The code printed on the tag fixed to the truck. Without it, gate readers can’t track this truck.">
              {(p) => <input {...p} maxLength={64} value={formData.rfidTag} onChange={setField('rfidTag')} placeholder="e.g. RFID-001" />}
            </Field>
          </div>
        </div>
        <div className={uiStyles.formSection}>
          <p className={uiStyles.sectionTitle}>Driver</p>
          <div className={uiStyles.formGrid}>
            <Field label="Driver name" required>
              {(p) => <input {...p} maxLength={100} value={formData.driverName} onChange={setField('driverName')} placeholder="Full name" />}
            </Field>
            <Field label="Driver phone" optional>
              {(p) => <input {...p} type="tel" maxLength={32} value={formData.driverContact} onChange={setField('driverContact')} placeholder="Phone number" />}
            </Field>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const riskRank = (t) => (t.riskStatus === 'FLAGGED' ? 0 : t.riskStatus === 'DELAYED' ? 1 : 2);

export default TruckDashboard;
