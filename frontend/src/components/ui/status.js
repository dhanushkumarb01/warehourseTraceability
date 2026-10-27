/**
 * Status vocabulary: every backend status enum → plain label, tone and icon.
 * Colour is never the only signal — chips always render icon + text.
 *
 * `label` is what an operator reads; `hint` explains it in a tooltip.
 */

export const STATUS = {
  // Storage spots (bays)
  AVAILABLE:  { label: 'Free',        tone: 'teal',    icon: 'circle',      hint: 'Empty and ready to take material' },
  OCCUPIED:   { label: 'In use',      tone: 'orange',  icon: 'circleFull',  hint: 'Material is stored here' },
  INACTIVE:   { label: 'Out of use',  tone: 'neutral', icon: 'ban',         hint: 'Closed — cannot take material' },
  ACTIVE:     { label: 'Active',      tone: 'info',    icon: 'checkCircle' },
  // Batches (lots)
  MAPPED:     { label: 'Stored',      tone: 'brand',   icon: 'pin',         hint: 'Placed in a storage spot' },
  DISPATCHED: { label: 'Sent out',    tone: 'neutral', icon: 'truckOut',    hint: 'Left the yard on a truck' },
  // Outgoing trucks (dispatch)
  PENDING:    { label: 'Waiting for approval', tone: 'warning', icon: 'hourglass' },
  APPROVED:   { label: 'Approved',    tone: 'success', icon: 'checkCircle' },
  REJECTED:   { label: 'Rejected',    tone: 'danger',  icon: 'xCircle' },
  COMPLETED:  { label: 'Completed',   tone: 'success', icon: 'check' },
  CANCELLED:  { label: 'Cancelled',   tone: 'neutral', icon: 'ban' },
  // Exit gate
  VALIDATED:  { label: 'Cleared',     tone: 'success', icon: 'shieldCheck', hint: 'Checked at the gate and allowed out' },
  DENIED:     { label: 'Stopped',     tone: 'danger',  icon: 'xCircle',     hint: 'Not allowed out at the gate' },
  EXITED:     { label: 'Left the yard', tone: 'neutral', icon: 'truckOut' },
  // Cameras / readers
  MAINTENANCE:{ label: 'Maintenance', tone: 'warning', icon: 'cog' },
  ONLINE:     { label: 'Online',      tone: 'success', icon: 'dot' },
  OFFLINE:    { label: 'Offline',     tone: 'danger',  icon: 'wifiOff' },
  UNKNOWN:    { label: 'Unknown',     tone: 'neutral', icon: 'help' },
  // Alerts lifecycle
  NEW:          { label: 'New',          tone: 'danger',  icon: 'bell' },
  ACKNOWLEDGED: { label: 'Seen',         tone: 'warning', icon: 'eye',   hint: 'Acknowledged — someone is looking at it' },
  RESOLVED:     { label: 'Resolved',     tone: 'success', icon: 'checkCircle' },
  DISMISSED:    { label: 'Dismissed',    tone: 'neutral', icon: 'ban' },
  // Truck risk
  NORMAL:     { label: 'On time',     tone: 'success', icon: 'check',  hint: 'Moving through the yard as expected' },
  DELAYED:    { label: 'Delayed',     tone: 'warning', icon: 'clock',  hint: 'Has been at one step longer than usual' },
  FLAGGED:    { label: 'Flagged',     tone: 'danger',  icon: 'warning', hint: 'Broke the expected route — check before it leaves' },
  PARKED:     { label: 'Parked',      tone: 'neutral', icon: 'pin' },
  // Alert severity
  LOW:        { label: 'Low',         tone: 'info',    icon: 'info' },
  MEDIUM:     { label: 'Medium',      tone: 'warning', icon: 'warning' },
  HIGH:       { label: 'High',        tone: 'orange',  icon: 'warning' },
  CRITICAL:   { label: 'Critical',    tone: 'danger',  icon: 'error' },
};

export const statusMeta = (status) =>
  STATUS[status] || { label: status ? String(status).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '—', tone: 'neutral', icon: 'dot' };

/** Plain-language names for domain terms; `original` is shown as a subtitle/tooltip for power users. */
export const TERMS = {
  lot:      { label: 'Batch of material', short: 'Batch', plural: 'Batches', original: 'Lot' },
  bay:      { label: 'Storage spot', short: 'Spot', plural: 'Storage spots', original: 'Bay' },
  zone:     { label: 'Yard area', short: 'Area', plural: 'Yard areas', original: 'Zone' },
  dispatch: { label: 'Outgoing truck', short: 'Outgoing', plural: 'Outgoing trucks', original: 'Dispatch' },
  gate:     { label: 'Exit gate check', short: 'Gate check', plural: 'Gate checks', original: 'Gate validation' },
  material: { label: 'Material', short: 'Material', plural: 'Materials', original: 'Material' },
  dock:     { label: 'Loading dock', short: 'Dock', plural: 'Loading docks', original: 'Loading dock' },
};
