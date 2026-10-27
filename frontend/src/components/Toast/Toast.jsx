/**
 * Toast Notification Component
 *
 * Lightweight, self-dismissing notification.
 * Props:
 *   message  {string}           — text to display
 *   type     {'success'|'error'|'info'} — controls colour scheme and icon
 *   onClose  {function}         — called when the toast is dismissed
 */

import { useEffect } from 'react';
import { Icons } from '../ui/icons';
import styles from './Toast.module.css';

const ICONS = { success: Icons.checkCircle, error: Icons.error, info: Icons.info, warning: Icons.warning };
const TITLES = { success: 'Done', error: 'That didn’t work', info: 'Heads up', warning: 'Check this' };

const AUTO_DISMISS_MS = 4500;

function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onClose, type === 'error' ? AUTO_DISMISS_MS * 1.6 : AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [message, onClose, type]);

  if (!message) return null;

  return (
    <div className={`${styles.toast} ${styles[type] || styles.info}`} role={type === 'error' ? 'alert' : 'status'} aria-live={type === 'error' ? 'assertive' : 'polite'}>
      <span className={styles.icon}>{ICONS[type] || ICONS.info}</span>
      <div className={styles.body}>
        <span className={styles.title}>{TITLES[type] || TITLES.info}</span>
        <span className={styles.message}>{message}</span>
      </div>
      <button className={styles.close} onClick={onClose} aria-label="Dismiss notification">
        {Icons.close}
      </button>
      <span className={styles.timer} aria-hidden="true" />
    </div>
  );
}

export default Toast;
