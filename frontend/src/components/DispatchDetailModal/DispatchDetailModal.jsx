/**
 * DispatchDetailModal — full dispatch details + approval workflow.
 *
 * Actions adapt to status:
 *   PENDING  → Approve (with optional approved quantity) / Reject / Cancel
 *   APPROVED → Cancel (before exit)
 *   others   → read-only
 *
 * Props:
 *   isOpen     {boolean}
 *   dispatch   {object|null}
 *   busy       {string|null}   one of 'approve'|'reject'|'cancel' while in flight
 *   error      {string|null}
 *   onClose    {function}
 *   onApprove  {function({ approvedQuantity, remarks })}
 *   onReject   {function({ remarks })}
 *   onCancel   {function({ remarks })}
 */

import { useEffect, useState } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import SapValidationPanel from '../SapValidationPanel/SapValidationPanel';
import { previewDispatchValidation } from '../../services/sapService';
import styles from './DispatchDetailModal.module.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const Field = ({ label, value }) => (
  <div className={styles.field}><span className={styles.fLabel}>{label}</span><span className={styles.fValue}>{value ?? '—'}</span></div>
);

function DispatchDetailModal({ isOpen, dispatch, busy = null, error = null, canApprove = true, canCancel = true, onClose, onApprove, onReject, onCancel }) {
  const [mode, setMode] = useState(null); // 'approve' | 'reject' | 'cancel'
  const [approvedQuantity, setApprovedQuantity] = useState('');
  const [remarks, setRemarks] = useState('');

  // SAP validation preview (shown for pending dispatches to approvers).
  const [sap, setSap] = useState({ loading: false, result: null, error: null });

  useEffect(() => {
    if (!isOpen) return;
    setMode(null); setRemarks('');
    setApprovedQuantity(dispatch ? String(dispatch.requestedQuantity ?? '') : '');
  }, [isOpen, dispatch]);

  useEffect(() => {
    const pending = dispatch?.dispatchStatus === 'PENDING';
    if (!isOpen || !dispatch || !pending || !canApprove) { setSap({ loading: false, result: null, error: null }); return; }
    let cancelled = false;
    setSap({ loading: true, result: null, error: null });
    previewDispatchValidation(dispatch.id)
      .then((result) => { if (!cancelled) setSap({ loading: false, result, error: null }); })
      .catch((err) => { if (!cancelled) setSap({ loading: false, result: null, error: err.message || 'SAP validation unavailable.' }); });
    return () => { cancelled = true; };
  }, [isOpen, dispatch, canApprove]);

  if (!isOpen || !dispatch) return null;

  const isPending = dispatch.dispatchStatus === 'PENDING';
  const isApproved = dispatch.dispatchStatus === 'APPROVED';
  const lot = dispatch.lot;

  const confirm = () => {
    const trimmed = remarks.trim() || null;
    if (mode === 'approve') onApprove({ approvedQuantity: approvedQuantity === '' ? undefined : parseFloat(approvedQuantity), remarks: trimmed });
    else if (mode === 'reject') onReject({ remarks: trimmed });
    else if (mode === 'cancel') onCancel({ remarks: trimmed });
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6m0 0V9.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0015.5 6H13" /></svg>
            </div>
            <div>
              <h2 className={styles.title}>{dispatch.dispatchNumber}</h2>
              <p className={styles.subtitle}>Dispatch request details</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
        </div>

        <div className={styles.statusBanner}><StatusBadge status={dispatch.dispatchStatus} /></div>

        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Material</h3>
            <div className={styles.grid}>
              <Field label="Lot Code" value={lot?.lotCode} />
              <Field label="Material" value={lot?.material?.materialName} />
              <Field label="Origin Bay" value={dispatch.bay?.bayCode} />
              <Field label="Zone" value={dispatch.bay?.zone} />
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Quantities & People</h3>
            <div className={styles.grid}>
              <Field label="Requested Qty" value={`${dispatch.requestedQuantity} ${lot?.unit || ''}`} />
              <Field label="Approved Qty" value={dispatch.approvedQuantity != null ? `${dispatch.approvedQuantity} ${lot?.unit || ''}` : '—'} />
              <Field label="Requested By" value={dispatch.requester?.username} />
              <Field label="Approved By" value={dispatch.approver?.username} />
              <Field label="Vehicle" value={dispatch.vehicleNumber} />
              <Field label="Remarks" value={dispatch.remarks} />
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Timeline</h3>
            <div className={styles.grid}>
              <Field label="Requested" value={fmt(dispatch.createdAt)} />
              <Field label="Approved/Reviewed" value={fmt(dispatch.approvedAt)} />
              <Field label="Completed" value={fmt(dispatch.completedAt)} />
            </div>
          </section>

          {/* SAP validation (pending dispatches, for approvers) */}
          {isPending && canApprove && (sap.loading || sap.result || sap.error) && (
            <SapValidationPanel loading={sap.loading} error={sap.error} result={sap.result} variant="dispatch" />
          )}

          {error && <div className={styles.errorBanner}>{error}</div>}

          {/* Action mode forms */}
          {mode && (
            <section className={styles.actionForm}>
              {mode === 'approve' && (
                <div className={styles.field}>
                  <label className={styles.fLabel}>Approved Quantity</label>
                  <input className={styles.input} type="number" min="0" step="any" value={approvedQuantity} onChange={(e) => setApprovedQuantity(e.target.value)} />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.fLabel}>Remarks {mode !== 'approve' && <span className={styles.req}>*</span>}</label>
                <textarea className={styles.textarea} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500}
                  placeholder={mode === 'reject' ? 'Reason for rejection' : mode === 'cancel' ? 'Reason for cancellation' : 'Optional note'} />
              </div>
              <div className={styles.actionFormBtns}>
                <button className={styles.cancelBtn} onClick={() => setMode(null)} disabled={Boolean(busy)}>Back</button>
                <button
                  className={mode === 'approve' ? styles.approveBtn : mode === 'reject' ? styles.rejectBtn : styles.cancelActionBtn}
                  onClick={confirm}
                  disabled={Boolean(busy) || (mode !== 'approve' && remarks.trim() === '')}
                >
                  {busy ? 'Working…' : mode === 'approve' ? 'Confirm Approval' : mode === 'reject' ? 'Confirm Rejection' : 'Confirm Cancellation'}
                </button>
              </div>
            </section>
          )}
        </div>

        {!mode && (
          <div className={styles.footer}>
            {isPending && (
              <>
                {canApprove && <button className={styles.rejectBtn} onClick={() => setMode('reject')}>Reject</button>}
                {canCancel && <button className={styles.cancelActionBtn} onClick={() => setMode('cancel')}>Cancel</button>}
                {canApprove && <button className={styles.approveBtn} onClick={() => setMode('approve')}>Approve</button>}
                {!canApprove && !canCancel && <button className={styles.cancelBtn} onClick={onClose}>Close</button>}
              </>
            )}
            {isApproved && (
              <>
                <span className={styles.readyHint}>Ready for gate validation</span>
                {canCancel
                  ? <button className={styles.cancelActionBtn} onClick={() => setMode('cancel')}>Cancel Dispatch</button>
                  : <button className={styles.cancelBtn} onClick={onClose}>Close</button>}
              </>
            )}
            {!isPending && !isApproved && (
              <button className={styles.cancelBtn} onClick={onClose}>Close</button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default DispatchDetailModal;
