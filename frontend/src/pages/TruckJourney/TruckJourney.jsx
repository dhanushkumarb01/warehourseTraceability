/**
 * Truck Journey — one truck visit, step by step.
 *
 * A step timeline over the standard visit route (done / now / next / problem),
 * built from the visit's RFID events and alerts, plus the raw reader log,
 * open alerts, the linked outgoing request (dispatch), gate checks and SAP
 * checks. Read-only: data comes from fetchJourney.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchJourney } from '../../services/truckService';
import { TRUCK_STAGES, STAGE_BY_KEY, stageLabel } from '../../config/truckStages';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import {
  Card, Button, Timeline, DetailList, StatusChip, ErrorState, EmptyState, Skeleton, ProgressBar,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './TruckJourney.module.css';

const ALERT_TEXT = {
  DELAY: 'Took longer than usual',
  UNAUTHORIZED_REENTRY: 'Came back in without a new visit',
  SEQUENCE_VIOLATION: 'Skipped a step or went out of order',
};
const VISIT_STATUS = {
  ACTIVE: { label: 'Inside the yard', tone: 'info', icon: Icons.truck },
  PARKED: { label: 'Parked', tone: 'neutral', icon: Icons.pin },
  EXITED: { label: 'Left the yard', tone: 'success', icon: Icons.truckOut },
};

const fmtFull = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const minsBetween = (a, b) => { if (!a || !b) return 0; return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)); };
const duration = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);

function TruckJourney() {
  const { visitId } = useParams();
  const navigate = useNavigate();
  const [journey, setJourney] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true); setError(null);
    try {
      const data = await fetchJourney(visitId);
      setJourney(data);
    } catch (err) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [visitId]);

  useEffect(() => { load(); }, [load]);

  const steps = useMemo(() => {
    if (!journey) return [];
    const { visit } = journey;
    const events = visit.events || [];
    const alerts = visit.alerts || [];
    const exited = visit.status === 'EXITED';
    const currentIdx = STAGE_BY_KEY[visit.currentStage]?.index ?? -1;

    return TRUCK_STAGES.map((stage, i) => {
      const stageEvents = events.filter((e) => e.stage === stage.key);
      const first = stageEvents[0];
      const nextEvt = first ? events.find((e) => new Date(e.eventTime) > new Date(first.eventTime) && e.stage !== stage.key) : null;
      const stageAlerts = alerts.filter((a) => a.stage === stage.key);
      const openAlert = stageAlerts.some((a) => !a.resolved);
      let state = 'upcoming';
      if (exited || i < currentIdx || (first && i !== currentIdx)) state = 'done';
      if (!exited && i === currentIdx) state = 'current';
      if (openAlert) state = 'error';
      const reachedSkipped = !first && i < currentIdx;

      const spent = first ? minsBetween(first.eventTime, nextEvt?.eventTime || (state === 'current' ? new Date() : first.eventTime)) : null;
      return {
        key: stage.key,
        icon: state === 'upcoming' ? Icons[stage.icon] : undefined,
        title: stage.label,
        state,
        time: first ? fmtTime(first.eventTime) : reachedSkipped ? 'No reader record' : state === 'upcoming' ? stage.hint : undefined,
        meta: spent !== null && spent > 0 ? `${duration(spent)} here${state === 'current' ? ' so far' : ''}` : undefined,
        description: (first?.reader || stageAlerts.length > 0) && (
          <div className={styles.stepDetail}>
            {first?.reader && <span className={styles.reader}>{Icons.rfid}Seen by {first.reader.readerName} <span className={uiStyles.mono}>({first.reader.readerCode})</span></span>}
            {stageAlerts.map((a) => (
              <span key={a.id} className={`${styles.stepAlert} ${a.resolved ? styles.stepAlertResolved : ''}`}>
                {a.resolved ? Icons.checkCircle : Icons.warning}
                {ALERT_TEXT[a.alertType] || a.alertType.replace(/_/g, ' ').toLowerCase()} — {a.message}
                {a.resolved && ' (resolved)'}
              </span>
            ))}
          </div>
        ),
      };
    });
  }, [journey]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Skeleton height={150} radius={20} />
        <div className={styles.grid}>
          <Skeleton height={520} radius={20} />
          <Skeleton height={320} radius={20} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <Card>
          <ErrorState title="We couldn’t load this truck’s journey" error={error} onRetry={load} />
          <div className={styles.center}><Button variant="ghost" icon={Icons.arrowLeft} onClick={() => navigate('/trucks')}>Back to trucks</Button></div>
        </Card>
      </div>
    );
  }

  const { visit, dispatch, sapValidations } = journey;
  const truck = visit.truck;
  const events = visit.events || [];
  const alerts = visit.alerts || [];
  const openAlerts = alerts.filter((a) => !a.resolved);
  const status = VISIT_STATUS[visit.status] || { label: visit.status, tone: 'neutral', icon: Icons.truck };
  const durationMins = visit.exitTime ? minsBetween(visit.entryTime, visit.exitTime) : minsBetween(visit.entryTime, new Date());
  const doneCount = steps.filter((s) => s.state === 'done').length;
  const progress = visit.status === 'EXITED' ? 100 : Math.round((doneCount / TRUCK_STAGES.length) * 100);

  return (
    <div className={styles.page}>
      {/* ── Summary ─────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <span className={styles.heroIcon}>{Icons.truck}</span>
          <div className={styles.heroTitles}>
            <h1 className={styles.truckNumber}>{truck.truckNumber}</h1>
            <p className={styles.heroSub}>Visit <span className={uiStyles.mono}>{visit.visitNumber}</span> · {truck.driverName}{truck.transporter ? ` · ${truck.transporter}` : ''}</p>
            <div className={styles.heroChips}>
              <StatusChip tone={status.tone} icon={status.icon}>{status.label}</StatusChip>
              <StatusBadge status={visit.riskStatus} />
              {visit.status !== 'EXITED' && <StatusChip tone="brand" icon={Icons.pin}>Now at: {stageLabel(visit.currentStage)}</StatusChip>}
            </div>
          </div>
        </div>
        <div className={styles.heroStats}>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>{visit.exitTime ? 'Total time inside' : 'Inside for'}</span>
            <span className={`${styles.heroStatValue} wt-num`}>{duration(durationMins)}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>Entered</span>
            <span className={styles.heroStatValueSm}>{fmtFull(visit.entryTime)}</span>
          </div>
          <div className={styles.heroStat}>
            <span className={styles.heroStatLabel}>Route progress</span>
            <ProgressBar value={progress} tone={openAlerts.length ? 'warning' : 'brand'} showValue label="Route progress" />
          </div>
        </div>
      </section>

      <div className={styles.grid}>
        {/* ── Step timeline ─────────────────────────────────────────────── */}
        <Card icon={Icons.route} title="Where has this truck been?" subtitle="Each step of the visit, in order">
          <Timeline items={steps} />

          <details className={styles.rawLog}>
            <summary>Reader log ({events.length} {events.length === 1 ? 'scan' : 'scans'})</summary>
            {events.length === 0 ? <p className={uiStyles.muted}>No RFID scans recorded for this visit.</p> : (
              <ul className={styles.logList}>
                {events.map((evt) => (
                  <li key={evt.id}>
                    <span className={`${uiStyles.mono} ${styles.logTime}`}>{fmtTime(evt.eventTime)}</span>
                    <span>{stageLabel(evt.stage)}</span>
                    <span className={uiStyles.muted}>{evt.reader ? evt.reader.readerName : evt.source}</span>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </Card>

        {/* ── Side panels ───────────────────────────────────────────────── */}
        <div className={styles.side}>
          <Card
            icon={Icons.warning}
            title="Problems on this visit"
            subtitle={alerts.length ? `${openAlerts.length} open · ${alerts.length - openAlerts.length} resolved` : undefined}
          >
            {alerts.length === 0 ? (
              <EmptyState icon={Icons.checkCircle} title="No problems" message="This truck has followed the expected route." />
            ) : (
              <ul className={styles.alertList}>
                {alerts.map((a) => (
                  <li key={a.id} className={`${styles.alertItem} ${a.resolved ? styles.alertResolved : ''}`}>
                    <span className={styles.alertIcon}>{a.resolved ? Icons.checkCircle : Icons.warning}</span>
                    <div>
                      <p className={styles.alertTitle}>{ALERT_TEXT[a.alertType] || a.alertType.replace(/_/g, ' ').toLowerCase()}</p>
                      <p className={styles.alertMsg}>{a.message}</p>
                      <p className={styles.alertTime}>{a.stage ? `${stageLabel(a.stage)} · ` : ''}{fmtFull(a.createdAt)} · {a.resolved ? 'Resolved' : 'Open'}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card icon={Icons.truckOut} title="Outgoing request" subtitle={dispatch ? 'The material this truck is collecting' : undefined}>
            {!dispatch ? (
              <EmptyState icon={Icons.link} title="Not linked to a request" message="This visit isn’t tied to an outgoing (dispatch) request." />
            ) : (
              <>
                <DetailList
                  items={[
                    { label: 'Request', value: <span className={uiStyles.mono}>{dispatch.dispatchNumber}</span> },
                    { label: 'Status', value: <StatusBadge status={dispatch.dispatchStatus} size="sm" /> },
                    { label: 'Material', value: dispatch.lot?.material?.materialName || '—' },
                    { label: 'Batch', value: <span className={uiStyles.mono}>{dispatch.lot?.lotCode}</span> },
                    { label: 'From spot', value: <span className={uiStyles.mono}>{dispatch.bay?.bayCode || '—'}</span> },
                    { label: 'Quantity', value: `${dispatch.approvedQuantity ?? dispatch.requestedQuantity} ${dispatch.lot?.unit || ''}` },
                    dispatch.vehicleNumber && { label: 'Vehicle', value: dispatch.vehicleNumber },
                  ]}
                />
                {dispatch.gateValidations?.length > 0 && (
                  <div className={styles.subSection}>
                    <p className={uiStyles.sectionTitle}>Exit gate checks</p>
                    {dispatch.gateValidations.map((gv) => (
                      <div key={gv.id} className={styles.subRow}>
                        <StatusBadge status={gv.validationStatus} size="sm" />
                        <span className={uiStyles.muted}>{fmtFull(gv.gateExitTime || gv.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Card>

          {sapValidations?.length > 0 && (
            <Card icon={Icons.database} title="SAP checks" subtitle="Verified against the company’s SAP system">
              <ul className={styles.sapList}>
                {sapValidations.map((sv) => (
                  <li key={sv.id} className={styles.subRow}>
                    <StatusChip tone={/VALID|SUCCESS|PASS/i.test(sv.status) ? 'success' : /BLOCK|FAIL|DENI/i.test(sv.status) ? 'danger' : 'neutral'} size="sm">{sv.status.replace(/_/g, ' ').toLowerCase()}</StatusChip>
                    <span className={styles.sapText}>
                      <span>{sv.validationType.replace(/_/g, ' ').toLowerCase()}</span>
                      {sv.message && <span className={uiStyles.sub}>{sv.message}</span>}
                      <span className={uiStyles.sub}>{fmtFull(sv.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

export default TruckJourney;
