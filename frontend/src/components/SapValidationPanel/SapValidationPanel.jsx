/**
 * SapValidationPanel — reusable SAP check result display.
 *
 * Shows SAP's decision (passed / warning / blocked) as icon + words + colour,
 * a one-line plain recommendation, and the per-check breakdown, so the
 * approver or gate operator understands why something is allowed or not.
 * Used in the dispatch approval modal and the gate scan modal.
 *
 * Props:
 *   loading {boolean}
 *   error   {string|null}
 *   result  {object|null}  { decision, recommendation, unavailable, reasons[], checks[] }
 *   variant {'dispatch'|'gate'}
 */

import { StatusChip, Skeleton } from '../ui';
import { Icons } from '../ui/icons';
import styles from './SapValidationPanel.module.css';

const DECISION_META = {
  VALIDATED: { label: 'SAP check passed', tone: 'success', icon: Icons.shieldCheck },
  WARNING:   { label: 'SAP check: warning', tone: 'warning', icon: Icons.warning },
  BLOCKED:   { label: 'SAP check failed', tone: 'danger', icon: Icons.ban },
};

const CHECK_META = {
  PASS: { cls: 'cPass', icon: Icons.check, label: 'Passed' },
  WARN: { cls: 'cWarn', icon: Icons.warning, label: 'Warning' },
  FAIL: { cls: 'cFail', icon: Icons.close, label: 'Failed' },
};

function recommendation(result, variant) {
  if (result.decision === 'BLOCKED') return variant === 'gate' ? 'Do not let this truck out. SAP checks failed.' : 'Don’t approve — SAP blocked this request.';
  if (result.decision === 'WARNING') {
    return result.unavailable
      ? 'SAP couldn’t be reached. You can continue, but double-check the paperwork.'
      : 'You can continue, but review the warnings below.';
  }
  return variant === 'gate' ? 'OK to let this truck out — SAP checks passed.' : 'OK to approve — SAP checks passed.';
}

function SapValidationPanel({ loading = false, error = null, result = null, variant = 'dispatch' }) {
  const meta = result ? DECISION_META[result.decision] || DECISION_META.WARNING : null;
  return (
    <section className={`${styles.panel} ${meta ? styles[`p_${meta.tone}`] : ''}`} aria-label="SAP check">
      <div className={styles.head}>
        <span className={styles.title}>{Icons.database}SAP check</span>
        {meta && <StatusChip tone={meta.tone} icon={meta.icon}>{meta.label}</StatusChip>}
      </div>

      {loading && (
        <div className={styles.loading}>
          <Skeleton height={14} width="60%" />
          <Skeleton height={12} width="85%" />
        </div>
      )}
      {error && !loading && <p className={styles.error}>{Icons.error}{error}</p>}

      {!loading && !error && result && (
        <>
          <p className={styles.recommendation}>{recommendation(result, variant)}</p>

          <ul className={styles.checks}>
            {result.checks.map((c) => {
              const cm = CHECK_META[c.status] || CHECK_META.WARN;
              return (
                <li key={c.key} className={styles.check}>
                  <span className={`${styles.checkSym} ${styles[cm.cls]}`} aria-label={cm.label}>{cm.icon}</span>
                  <span className={styles.checkLabel}>{c.label}</span>
                  <span className={styles.checkDetail}>{c.detail}</span>
                </li>
              );
            })}
          </ul>

          {result.reasons?.length > 0 && (
            <ul className={styles.reasons}>
              {result.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default SapValidationPanel;
