/**
 * ConfirmDialog Component
 *
 * Modal dialog that blocks interaction until the user confirms or cancels.
 * Used for destructive actions such as deleting a storage spot. The message
 * should say in plain words what will happen; `details` can list consequences.
 *
 * Props:
 *   isOpen   {boolean}   — controls visibility
 *   title    {string}    — dialog heading
 *   message  {string}    — body text describing the action
 *   details  {string[]}  — optional "what happens" bullet list
 *   tone     {'danger'|'warning'} — danger (default) uses a red confirm button
 *   onConfirm {function} — called when user confirms
 *   onCancel  {function} — called when user dismisses
 *   isLoading {boolean}  — disables confirm button while async op is in flight
 */

import { Modal, Button } from '../ui';
import { Icons } from '../ui/icons';
import styles from './ConfirmDialog.module.css';

function ConfirmDialog({
  isOpen,
  title,
  message,
  details,
  tone = 'danger',
  onConfirm,
  onCancel,
  isLoading = false,
  // Backward-compatible additions (defaults preserve the original delete copy):
  isProcessing = false,
  confirmLabel = 'Yes, Delete',
  loadingLabel = 'Deleting…',
}) {
  const busy = isLoading || isProcessing;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      busy={busy}
      size="sm"
      title={title}
      icon={tone === 'danger' ? Icons.trash : Icons.warning}
      tone={tone}
      footer={(
        <>
          <Button id="confirm-cancel-btn" variant="secondary" onClick={onCancel} disabled={busy}>
            Keep it
          </Button>
          <Button
            id="confirm-delete-btn"
            variant={tone === 'danger' ? 'dangerSolid' : 'primary'}
            onClick={onConfirm}
            loading={busy}
          >
            {busy ? loadingLabel : confirmLabel}
          </Button>
        </>
      )}
    >
      <p className={styles.message}>{message}</p>
      {details?.length > 0 && (
        <ul className={styles.details}>
          {details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </Modal>
  );
}

export default ConfirmDialog;
