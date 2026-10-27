/**
 * StatusBadge Component
 *
 * Status chip for any backend status enum (bay, lot, dispatch, gate, camera,
 * alert). Renders icon + plain-language label from the shared vocabulary in
 * ui/status.js, so status never relies on colour alone.
 * Props:
 *   status {string} — e.g. 'AVAILABLE' | 'OCCUPIED' | 'PENDING' | 'CRITICAL'
 *   size   {'sm'}   — optional compact size
 */

import { StatusChip } from '../ui';

function StatusBadge({ status, size }) {
  return <StatusChip status={status} size={size} />;
}

export default StatusBadge;
