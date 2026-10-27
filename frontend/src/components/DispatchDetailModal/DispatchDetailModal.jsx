/**
 * DispatchDetailModal — outgoing-truck request details + approval workflow.
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
import { Modal, Button, Field, FormAlert, DetailList, Timeline } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from './DispatchDetailModal.module.css';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

const MODE_COPY = {
  approve: { title: 'Approve this request', button: 'Approve request', hint: 'You can approve less than was asked for.' },
  reject: { title: 'Reject this request', button: 'Reject request', hint: 'The batch stays in storage. Tell the requester why.' },
  cancel: { title: 'Cancel this request', button: 'Cancel request', hint: 'The truck won’t be allowed out for this request.' },
};

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
  const unit = lot?.unit || '';

  const confirm = () => {
    const trimmed = remarks.trim() || null;
    if (mode === 'approve') onApprove({ approvedQuantity: approvedQuantity === '' ? undefined : parseFloat(approvedQuantity), remarks: trimmed });
    else if (mode === 'reject') onReject({ remarks: trimmed });
    else if (mode === 'cancel') onCancel({ remarks: trimmed });
  };

  const stopped = ['REJECTED', 'CANCELLED'].includes(dispatch.dispatchStatus);
  const steps = [
    { key: 'req', title: 'Requested', state: 'done', time: fmt(dispatch.createdAt), meta: dispatch.requester?.username && `by ${dispatch.requester.username}` },
    {
      key: 'rev',
      title: stopped ? (dispatch.dispatchStatus === 'REJECTED' ? 'Rejected' : 'Cancelled') : 'Approved',
      state: stopped ? 'error' : dispatch.approvedAt ? 'done' : 'current',
      time: fmt(dispatch.approvedAt) || (stopped ? undefined : 'Waiting for a supervisor'),
      meta: dispatch.approver?.username && `by ${dispatch.approver.username}`,
    },
    !stopped && {
      key: 'exit', title: 'Left through the exit gate',
      state: dispatch.completedAt ? 'done' : isApproved ? 'current' : 'upcoming',
      time: fmt(dispatch.completedAt) || (isApproved ? 'Ready to be scanned at the gate' : undefined),
    },
  ].filter(Boolean);

  const footer = mode ? (
    <>
      <Button onClick={() => setMode(null)} disabled={Boolean(busy)} icon={Icons.arrowLeft}>Back</Button>
      <Button
        variant={mode === 'approve' ? 'primary' : 'dangerSolid'}
        onClick={confirm}
        loading={Boolean(busy)}
        disabled={mode !== 'approve' && remarks.trim() === ''}
      >
        {MODE_COPY[mode].button}
      </Button>
    </>
  ) : isPending ? (
    <>
      {canCancel && <Button variant="ghost" onClick={() => setMode('cancel')}>Cancel request</Button>}
      {canApprove && <Button variant="danger" icon={Icons.xCircle} onClick={() => setMode('reject')}>Reject</Button>}
      {canApprove && <Button variant="primary" icon={Icons.check} onClick={() => setMode('approve')}>Approve</Button>}
      {!canApprove && !canCancel && <Button onClick={onClose}>Close</Button>}
    </>
  ) : isApproved ? (
    <>
      {canCancel && <Button variant="danger" onClick={() => setMode('cancel')}>Cancel request</Button>}
      <Button variant="primary" onClick={onClose}>Done</Button>
    </>
  ) : <Button variant="primary" onClick={onClose}>Close</Button>;

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={Boolean(busy)}
      size="lg"
      icon={Icons.truckOut}
      title={mode ? MODE_COPY[mode].title : `${lot?.material?.materialName || 'Outgoing request'}`}
      subtitle={<>Request <span className={uiStyles.mono}>{dispatch.dispatchNumber}</span> · batch <span className={uiStyles.mono}>{lot?.lotCode}</span></>}
      footer={footer}
      footerNote={!mode && isApproved ? 'Ready for the exit gate' : undefined}
    >
      {mode ? (
        <div className={uiStyles.formSection}>
          <FormAlert>{error}</FormAlert>
          <p className={uiStyles.muted}>{MODE_COPY[mode].hint}</p>
          {mode === 'approve' && (
            <Field label="Amount to approve" hint={`Requested: ${dispatch.requestedQuantity} ${unit}`}>
              {(p) => <input {...p} type="number" min="0" step="any" value={approvedQuantity} onChange={(e) => setApprovedQuantity(e.target.value)} />}
            </Field>
          )}
          <Field label={mode === 'approve' ? 'Note' : 'Reason'} required={mode !== 'approve'} optional={mode === 'approve'}>
            {(p) => (
              <textarea {...p} rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={500}
                placeholder={mode === 'reject' ? 'e.g. Batch reserved for another order' : mode === 'cancel' ? 'e.g. Customer cancelled the order' : 'Optional note for the record'} />
            )}
          </Field>
        </div>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <div className={styles.statusRow}><StatusBadge status={dispatch.dispatchStatus} /></div>
            <DetailList
              items={[
                { label: 'Material', value: lot?.material?.materialName },
                { label: 'Batch', value: <span className={uiStyles.mono}>{lot?.lotCode}</span> },
                { label: 'From spot', value: <span className={uiStyles.mono}>{dispatch.bay?.bayCode}</span> },
                { label: 'Yard area', value: dispatch.bay?.zone },
                { label: 'Asked for', value: `${dispatch.requestedQuantity} ${unit}` },
                { label: 'Approved', value: dispatch.approvedQuantity != null ? `${dispatch.approvedQuantity} ${unit}` : '—' },
                { label: 'Truck number', value: dispatch.vehicleNumber || '—' },
                { label: 'Note', value: dispatch.remarks || '—' },
              ]}
            />
            {isPending && canApprove && (sap.loading || sap.result || sap.error) && (
              <SapValidationPanel loading={sap.loading} error={sap.error} result={sap.result} variant="dispatch" />
            )}
            <FormAlert>{error}</FormAlert>
          </div>
          <div className={styles.side}>
            <p className={uiStyles.sectionTitle}>Progress</p>
            <Timeline items={steps} />
          </div>
        </div>
      )}
    </Modal>
  );
}

export default DispatchDetailModal;
