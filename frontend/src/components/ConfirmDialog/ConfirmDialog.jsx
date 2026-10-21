/**
 * ConfirmDialog Component
 *
 * Modal dialog that blocks interaction until the user confirms or cancels.
 * Used for destructive actions such as bay deletion.
 *
 * Props:
 *   isOpen   {boolean}   — controls visibility
 *   title    {string}    — dialog heading
 *   message  {string}    — body text describing the action
 *   onConfirm {function} — called when user confirms
 *   onCancel  {function} — called when user dismisses
 *   isLoading {boolean}  — disables confirm button while async op is in flight
 */

import styles from './ConfirmDialog.module.css';

function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  isLoading = false,
  // Backward-compatible additions (defaults preserve the original delete copy):
  isProcessing = false,
  confirmLabel = 'Yes, Delete',
  loadingLabel = 'Deleting…',
}) {
  if (!isOpen) return null;

  const busy = isLoading || isProcessing;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className={styles.dialog}>
        <div className={styles.iconWrap}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <h2 id="confirm-title" className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button
            id="confirm-cancel-btn"
            className={styles.cancelBtn}
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            id="confirm-delete-btn"
            className={styles.confirmBtn}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
