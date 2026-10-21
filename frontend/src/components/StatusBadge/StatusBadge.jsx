/**
 * StatusBadge Component
 *
 * Visual badge for BayStatus enum values.
 * Props:
 *   status {string} — 'AVAILABLE' | 'OCCUPIED' | 'INACTIVE'
 */

import styles from './StatusBadge.module.css';

const STATUS_MAP = {
  AVAILABLE:  { label: 'Available',  className: 'available' },
  OCCUPIED:   { label: 'Occupied',   className: 'occupied'  },
  INACTIVE:   { label: 'Inactive',   className: 'inactive'  },
  ACTIVE:     { label: 'Active',     className: 'active'    },
  MAPPED:     { label: 'Mapped',     className: 'mapped'    },
  DISPATCHED: { label: 'Dispatched', className: 'dispatched'},
  // Dispatch lifecycle
  PENDING:    { label: 'Pending',    className: 'pending'   },
  APPROVED:   { label: 'Approved',   className: 'approved'  },
  REJECTED:   { label: 'Rejected',   className: 'rejected'  },
  COMPLETED:  { label: 'Completed',  className: 'completed' },
  CANCELLED:  { label: 'Cancelled',  className: 'cancelled' },
  // Gate validation lifecycle
  VALIDATED:  { label: 'Validated',  className: 'validated' },
  DENIED:     { label: 'Denied',     className: 'denied'    },
  EXITED:     { label: 'Exited',     className: 'exited'    },
  // Surveillance — camera status + health
  MAINTENANCE:{ label: 'Maintenance',className: 'maintenance' },
  ONLINE:     { label: 'Online',     className: 'online'    },
  OFFLINE:    { label: 'Offline',    className: 'offline'   },
  UNKNOWN:    { label: 'Unknown',    className: 'unknown'   },
  // Surveillance — alert lifecycle
  NEW:          { label: 'New',          className: 'alertNew'     },
  ACKNOWLEDGED: { label: 'Acknowledged', className: 'acknowledged' },
  RESOLVED:     { label: 'Resolved',     className: 'resolved'     },
  DISMISSED:    { label: 'Dismissed',    className: 'dismissed'    },
  // Surveillance — alert severity
  LOW:        { label: 'Low',        className: 'sevLow'    },
  MEDIUM:     { label: 'Medium',     className: 'sevMedium' },
  HIGH:       { label: 'High',       className: 'sevHigh'   },
  CRITICAL:   { label: 'Critical',   className: 'sevCritical' },
};

function StatusBadge({ status }) {
  const config = STATUS_MAP[status] || { label: status, className: 'inactive' };
  return (
    <span className={`${styles.badge} ${styles[config.className]}`}>
      <span className={styles.dot} />
      {config.label}
    </span>
  );
}

export default StatusBadge;
