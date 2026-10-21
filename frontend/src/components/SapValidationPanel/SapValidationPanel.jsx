/**
 * SapValidationPanel — reusable SAP validation result display.
 *
 * Renders the decision (VALIDATED / WARNING / BLOCKED) with a clear indicator
 * and the granular per-check breakdown, so the approving / gate operator
 * instantly understands why an action is allowed or denied. Used in both the
 * dispatch approval modal and the gate scan modal.
 *
 * Props:
 *   loading {boolean}
 *   error   {string|null}
 *   result  {object|null}  { decision, recommendation, unavailable, reasons[], checks[] }
 *   variant {'dispatch'|'gate'}
 */

import styles from './SapValidationPanel.module.css';

const DECISION_META = {
  VALIDATED: { label: 'SAP Validated', cls: 'ok', icon: 'M5 13l4 4L19 7' },
  WARNING:   { label: 'SAP Warning',   cls: 'warn', icon: 'M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
  BLOCKED:   { label: 'SAP Blocked',   cls: 'block', icon: 'M6 18L18 6M6 6l12 12' },
};

const CHECK_META = {
  PASS: { cls: 'cPass', sym: '✓' },
  WARN: { cls: 'cWarn', sym: '!' },
  FAIL: { cls: 'cFail', sym: '✕' },
};

function SapValidationPanel({ loading = false, error = null, result = null, variant = 'dispatch' }) {
  return (
    <div className={styles.panel}>
      <div className={styles.head}>
        <span className={styles.title}>SAP Validation</span>
        {result && (
          <span className={`${styles.badge} ${styles[DECISION_META[result.decision]?.cls || 'warn']}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d={DECISION_META[result.decision]?.icon} /></svg>
            {DECISION_META[result.decision]?.label || result.decision}
          </span>
        )}
      </div>

      {loading && <p className={styles.muted}>Checking SAP…</p>}
      {error && !loading && <p className={styles.error}>{error}</p>}

      {!loading && !error && result && (
        <>
          <div className={styles.recommendation}>
            {result.decision === 'BLOCKED'
              ? (variant === 'gate' ? 'DENY EXIT — SAP checks failed.' : 'Approval blocked by SAP.')
              : result.decision === 'WARNING'
                ? (result.unavailable ? 'SAP unreachable — proceed with caution (fail-open).' : 'Proceed with review.')
                : (variant === 'gate' ? 'ALLOW EXIT — SAP checks passed.' : 'Approval recommended — SAP checks passed.')}
          </div>

          <ul className={styles.checks}>
            {result.checks.map((c) => (
              <li key={c.key} className={styles.check}>
                <span className={`${styles.checkSym} ${styles[CHECK_META[c.status]?.cls || 'cWarn']}`}>{CHECK_META[c.status]?.sym || '?'}</span>
                <span className={styles.checkLabel}>{c.label}</span>
                <span className={styles.checkDetail}>{c.detail}</span>
              </li>
            ))}
          </ul>

          {result.reasons?.length > 0 && (
            <ul className={styles.reasons}>
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

export default SapValidationPanel;
