/**
 * Truck Journey Timeline — Showcase Feature
 *
 * Full lifecycle visualization for a single truck visit:
 * RFID events on a vertical timeline, current stage, alerts, dispatch linkage,
 * gate validation linkage, SAP validation history, audit trail.
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchJourney } from '../../services/truckService';
import styles from './TruckJourney.module.css';

const STAGES = [
  { key: 'ENTRY_GATE', label: 'Entry Gate', icon: '🚪', color: '#3b82f6' },
  { key: 'WEIGH_BRIDGE_1', label: 'Weigh Bridge 1', icon: '⚖️', color: '#8b5cf6' },
  { key: 'LOADING_DOCK', label: 'Loading Dock', icon: '📦', color: '#f59e0b' },
  { key: 'WEIGH_BRIDGE_2', label: 'Weigh Bridge 2', icon: '⚖️', color: '#8b5cf6' },
  { key: 'INVOICE', label: 'Invoice', icon: '📋', color: '#0d9488' },
  { key: 'PARKING', label: 'Parking', icon: '🅿️', color: '#64748b' },
  { key: 'EXIT_GATE', label: 'Exit Gate', icon: '🚛', color: '#16a34a' },
];

const STAGE_MAP = Object.fromEntries(STAGES.map((s) => [s.key, s]));
const ALERT_ICONS = { DELAY: '⏱️', UNAUTHORIZED_REENTRY: '🚫', SEQUENCE_VIOLATION: '⚠️' };
const ALERT_COLORS = { DELAY: '#d97706', UNAUTHORIZED_REENTRY: '#dc2626', SEQUENCE_VIOLATION: '#f59e0b' };
const RISK_COLORS = { NORMAL: '#16a34a', DELAYED: '#d97706', FLAGGED: '#dc2626' };

const fmtFull = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const minsBetween = (a, b) => { if (!a || !b) return 0; return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)); };

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
      setError(err.message || 'Failed to load journey.');
    } finally {
      setIsLoading(false);
    }
  }, [visitId]);

  useEffect(() => { load(); }, [load]);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingState}>
          <div className="wt-skeleton" style={{ height: 80, width: '100%', borderRadius: 14, marginBottom: 20 }} />
          <div className="wt-skeleton" style={{ height: 300, width: '100%', borderRadius: 14, marginBottom: 20 }} />
          <div className="wt-skeleton" style={{ height: 200, width: '100%', borderRadius: 14 }} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorState}>
          <p>{error}</p>
          <button onClick={load}>Retry</button>
          <button onClick={() => navigate('/trucks')}>Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const { visit, dispatch, sapValidations } = journey;
  const truck = visit.truck;
  const events = visit.events || [];
  const alerts = visit.alerts || [];
  const currentStageInfo = STAGE_MAP[visit.currentStage] || {};

  // Duration
  const durationMins = visit.exitTime ? minsBetween(visit.entryTime, visit.exitTime) : minsBetween(visit.entryTime, new Date());

  // Build the progress bar
  const visitedStages = new Set(events.map((e) => e.stage));
  const currentIdx = STAGES.findIndex((s) => s.key === visit.currentStage);

  return (
    <div className={styles.page}>
      {/* ── Back + Breadcrumb ───────────────────────────────────────────── */}
      <button className={styles.backBtn} onClick={() => navigate('/trucks')}>
        <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
        Back to Truck Operations
      </button>

      {/* ── Journey Header ──────────────────────────────────────────────── */}
      <div className={styles.journeyHeader}>
        <div className={styles.headerMain}>
          <div className={styles.truckBadge}>
            <span className={styles.truckIcon}>🚛</span>
            <div>
              <h1 className={styles.truckNumber}>{truck.truckNumber}</h1>
              <span className={styles.visitNumber}>{visit.visitNumber}</span>
            </div>
          </div>
          <div className={styles.headerMeta}>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Driver</span>
              <span className={styles.metaValue}>{truck.driverName}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Transporter</span>
              <span className={styles.metaValue}>{truck.transporter || '—'}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Entry Time</span>
              <span className={styles.metaValue}>{fmtFull(visit.entryTime)}</span>
            </div>
            <div className={styles.metaItem}>
              <span className={styles.metaLabel}>Duration</span>
              <span className={styles.metaValue}>{durationMins} min</span>
            </div>
          </div>
        </div>
        <div className={styles.headerStatus}>
          <div className={styles.statusGroup}>
            <span className={styles.statusLabel}>Status</span>
            <span className={`${styles.statusBadge} ${styles[`status_${visit.status}`]}`}>{visit.status}</span>
          </div>
          <div className={styles.statusGroup}>
            <span className={styles.statusLabel}>Risk</span>
            <span className={styles.riskBadge} style={{ '--risk': RISK_COLORS[visit.riskStatus] || '#16a34a' }}>{visit.riskStatus}</span>
          </div>
          <div className={styles.statusGroup}>
            <span className={styles.statusLabel}>Current Stage</span>
            <span className={styles.stageBadge} style={{ '--stage-color': currentStageInfo.color || '#64748b' }}>
              {currentStageInfo.icon || '📍'} {currentStageInfo.label || visit.currentStage || '—'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Progress Pipeline ───────────────────────────────────────────── */}
      <div className={styles.progressSection}>
        <div className={styles.progressBar}>
          {STAGES.map((s, i) => {
            const visited = visitedStages.has(s.key);
            const isCurrent = s.key === visit.currentStage;
            return (
              <div key={s.key} className={`${styles.progressNode} ${visited ? styles.progressVisited : ''} ${isCurrent ? styles.progressCurrent : ''}`}>
                <div className={styles.progressDot} style={{ '--node-color': visited ? s.color : '#cbd5e1' }}>
                  {isCurrent ? <span className={styles.progressPulse} /> : null}
                  <span>{s.icon}</span>
                </div>
                <span className={styles.progressLabel}>{s.label}</span>
                {i < STAGES.length - 1 && (
                  <div className={`${styles.progressLine} ${i < currentIdx ? styles.progressLineFilled : ''}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.contentGrid}>
        {/* ── Timeline (Left) ─────────────────────────────────────────── */}
        <div className={styles.timelineColumn}>
          <h2 className={styles.columnTitle}>
            <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
            RFID Event Timeline
          </h2>
          {events.length === 0 ? (
            <div className={styles.emptyTimeline}>No events recorded.</div>
          ) : (
            <div className={styles.timeline}>
              {events.map((evt, i) => {
                const stageInfo = STAGE_MAP[evt.stage] || {};
                const nextEvt = events[i + 1];
                const dwellMins = nextEvt ? minsBetween(evt.eventTime, nextEvt.eventTime) : null;
                // Check if any alerts are associated with this stage
                const stageAlerts = alerts.filter((a) => a.stage === evt.stage);

                return (
                  <div key={evt.id} className={styles.timelineItem}>
                    <div className={styles.timelineDot} style={{ background: stageInfo.color || '#64748b' }}>
                      <span>{stageInfo.icon || '📍'}</span>
                    </div>
                    {i < events.length - 1 && <div className={styles.timelineLine} />}
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineHeader}>
                        <span className={styles.timelineStage}>{stageInfo.label || evt.stage}</span>
                        <span className={styles.timelineTime}>{fmtTime(evt.eventTime)}</span>
                      </div>
                      <div className={styles.timelineDetails}>
                        {evt.reader && (
                          <span className={styles.readerTag}>
                            📡 {evt.reader.readerName} ({evt.reader.readerCode})
                          </span>
                        )}
                        <span className={styles.sourceTag}>{evt.source}</span>
                        {dwellMins !== null && (
                          <span className={styles.dwellTag}>⏱ {dwellMins}m at stage</span>
                        )}
                      </div>
                      {stageAlerts.length > 0 && (
                        <div className={styles.timelineAlerts}>
                          {stageAlerts.map((a) => (
                            <div key={a.id} className={styles.timelineAlert} style={{ '--alert-color': ALERT_COLORS[a.alertType] || '#d97706' }}>
                              <span>{ALERT_ICONS[a.alertType] || '⚠️'}</span>
                              <span>{a.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Side Panels (Right) ─────────────────────────────────────── */}
        <div className={styles.sideColumn}>
          {/* Alerts */}
          {alerts.length > 0 && (
            <div className={styles.sidePanel}>
              <h3 className={styles.panelTitle}>
                ⚠️ Alerts <span className={styles.alertCount}>{alerts.length}</span>
              </h3>
              <div className={styles.panelList}>
                {alerts.map((a) => (
                  <div key={a.id} className={styles.alertCard} style={{ '--alert-border': ALERT_COLORS[a.alertType] || '#d97706' }}>
                    <div className={styles.alertCardHeader}>
                      <span>{ALERT_ICONS[a.alertType]}</span>
                      <span className={styles.alertCardType}>{a.alertType.replace(/_/g, ' ')}</span>
                      <span className={`${styles.resolvedBadge} ${a.resolved ? styles.resolvedTrue : ''}`}>
                        {a.resolved ? 'Resolved' : 'Open'}
                      </span>
                    </div>
                    <p className={styles.alertCardMsg}>{a.message}</p>
                    <span className={styles.alertCardTime}>{fmtFull(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Dispatch Linkage */}
          {dispatch && (
            <div className={styles.sidePanel}>
              <h3 className={styles.panelTitle}>📦 Linked Dispatch</h3>
              <div className={styles.detailGrid}>
                <DetailRow label="Dispatch #" value={dispatch.dispatchNumber} mono />
                <DetailRow label="Status" value={dispatch.dispatchStatus} />
                <DetailRow label="Material" value={dispatch.lot?.material?.materialName || '—'} />
                <DetailRow label="Lot" value={dispatch.lot?.lotCode} mono />
                <DetailRow label="Bay" value={dispatch.bay?.bayCode} mono />
                <DetailRow label="Qty" value={`${dispatch.approvedQuantity ?? dispatch.requestedQuantity} ${dispatch.lot?.unit || ''}`} />
                <DetailRow label="Vehicle" value={dispatch.vehicleNumber} />
              </div>

              {/* Gate Validations */}
              {dispatch.gateValidations?.length > 0 && (
                <div className={styles.subSection}>
                  <h4 className={styles.subTitle}>🚪 Gate Validations</h4>
                  {dispatch.gateValidations.map((gv) => (
                    <div key={gv.id} className={styles.gateRow}>
                      <span className={`${styles.gateStatus} ${styles[`gate_${gv.validationStatus}`]}`}>
                        {gv.validationStatus}
                      </span>
                      <span className={styles.gateTime}>{fmtFull(gv.gateExitTime || gv.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SAP Validations */}
          {sapValidations?.length > 0 && (
            <div className={styles.sidePanel}>
              <h3 className={styles.panelTitle}>🔗 SAP Validations</h3>
              <div className={styles.panelList}>
                {sapValidations.map((sv) => (
                  <div key={sv.id} className={styles.sapRow}>
                    <span className={`${styles.sapStatus} ${styles[`sap_${sv.status}`]}`}>{sv.status}</span>
                    <span className={styles.sapType}>{sv.validationType}</span>
                    {sv.message && <span className={styles.sapMsg}>{sv.message}</span>}
                    <span className={styles.sapTime}>{fmtFull(sv.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.detailLabel}>{label}</span>
      <span className={`${styles.detailValue} ${mono ? styles.mono : ''}`}>{value || '—'}</span>
    </div>
  );
}

export default TruckJourney;
