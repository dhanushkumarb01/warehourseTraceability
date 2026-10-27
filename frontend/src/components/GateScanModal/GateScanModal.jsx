/**
 * GateScanModal — scan-driven exit gate check.
 *
 *   Scan batch QR → identify batch → check approved request + SAP → allow / stop
 *
 * Reuses the existing Material QR payload (no second QR system). Camera scanning
 * is not wired yet but the flow is scan-ready: a real scanner simply calls
 * identify with the decoded string.
 *
 * Props:
 *   isOpen  {boolean}
 *   lots    {Array}    lots for the "simulate scan" picker
 *   onClose {function}
 *   onDone  {function(result)}  called after a commit (EXITED or DENIED)
 */

import { useEffect, useState } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import SapValidationPanel from '../SapValidationPanel/SapValidationPanel';
import { resolveScan, processExit } from '../../services/gateValidationService';
import { previewGateValidation } from '../../services/sapService';
import { Modal, Button, Field, FormAlert, Stepper } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from './GateScanModal.module.css';

const lotPayload = (l) =>
  l.qrCode || JSON.stringify({ entityType: 'MATERIAL_LOT', lotId: l.id, code: l.lotCode, version: l.qrVersion || 1 });

function GateScanModal({ isOpen, lots = [], onClose, onDone }) {
  const [payload, setPayload] = useState('');
  const [resolved, setResolved] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [sap, setSap] = useState({ loading: false, result: null, error: null });

  useEffect(() => {
    if (!isOpen) return;
    setPayload(''); setResolved(null); setScanError(null); setSubmitError(null); setIsSubmitting(false); setResult(null);
    setSap({ loading: false, result: null, error: null });
  }, [isOpen]);

  const identify = async (raw) => {
    setPayload(raw); setResolved(null); setScanError(null); setResult(null);
    setSap({ loading: false, result: null, error: null });
    if (!raw.trim()) return;
    try {
      const res = await resolveScan({ materialQr: raw });
      setResolved(res);
      // Pull the SAP validation verdict for the gate operator.
      if (res.approvedDispatch) {
        setSap({ loading: true, result: null, error: null });
        try {
          const r = await previewGateValidation(res.approvedDispatch.id);
          setSap({ loading: false, result: r, error: null });
        } catch (e) {
          setSap({ loading: false, result: null, error: e.message || 'SAP validation unavailable.' });
        }
      }
    } catch (err) {
      setScanError(err.message || 'Could not identify the scanned QR.');
    }
  };

  const handleExit = async () => {
    setIsSubmitting(true); setSubmitError(null);
    try {
      const res = await processExit({ materialQr: payload });
      setResult(res);
      onDone?.(res);
    } catch (err) {
      setSubmitError(err.message || 'Gate validation failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const step = result ? 2 : resolved ? 1 : 0;
  const exited = result?.decision === 'EXITED';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      busy={isSubmitting}
      size="md"
      icon={Icons.gate}
      title="Check a truck at the exit"
      subtitle="Scan the QR label on the batch the truck is carrying."
      footer={result ? (
        <Button variant="primary" onClick={onClose}>Done</Button>
      ) : (
        <>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" icon={Icons.check} onClick={handleExit} loading={isSubmitting} disabled={!resolved || !resolved.eligible}>
            Let the truck out
          </Button>
        </>
      )}
    >
      <div className={styles.stepper}>
        <Stepper steps={[{ label: 'Scan', hint: 'Batch QR label' }, { label: 'Check', hint: 'Request + SAP' }, { label: 'Decide', hint: 'Out or stop' }]} current={step} />
      </div>

      {result ? (
        <div className={`${styles.result} ${exited ? styles.resultOk : styles.resultDeny}`} role="status">
          <span className={styles.resultIcon}>{exited ? Icons.check : Icons.close}</span>
          <h3 className={styles.resultTitle}>{exited ? 'Allowed out' : 'Stopped at the gate'}</h3>
          <p className={styles.resultMsg}>
            {exited
              ? `${result.gateValidation?.lot?.lotCode || 'The batch'} has left the yard. It’s now marked as sent out.`
              : result.reason}
          </p>
        </div>
      ) : (
        <div className={uiStyles.formSection}>
          <FormAlert>{scanError}</FormAlert>

          <Field label="Scan or pick a batch" hint="No scanner? Pick the batch from the list to simulate a scan.">
            {(p) => (
              <select {...p} value="" onChange={(e) => { const l = lots.find((x) => x.id === e.target.value); if (l) identify(lotPayload(l)); }}>
                <option value="">Pick a batch…</option>
                {lots.map((l) => (<option key={l.id} value={l.id}>{l.lotCode}{l.material?.materialName ? ` — ${l.material.materialName}` : ''}</option>))}
              </select>
            )}
          </Field>
          <Field label="QR label contents" optional hint="A handheld scanner types this in automatically.">
            {(p) => <textarea {...p} rows={2} placeholder="Scan or paste the QR label here" value={payload} onChange={(e) => identify(e.target.value)} className={`${p.className} ${styles.payload}`} />}
          </Field>

          {resolved && (
            <div className={styles.check}>
              <div className={styles.preview}>
                <span className={styles.previewIcon}>{Icons.box}</span>
                <span className={styles.previewText}>
                  <span className={uiStyles.strong}>{resolved.lot?.material?.materialName || 'Material'}</span>
                  <span className={uiStyles.sub}>Batch <span className={uiStyles.mono}>{resolved.lot?.lotCode}</span></span>
                </span>
                <StatusBadge status={resolved.lot?.status} size="sm" />
              </div>
              {resolved.eligible ? (
                <div className={styles.eligible}>
                  {Icons.checkCircle}
                  <span>
                    Approved request <strong>{resolved.approvedDispatch?.dispatchNumber}</strong>
                    {resolved.approvedDispatch?.bay?.bayCode ? ` from spot ${resolved.approvedDispatch.bay.bayCode}` : ''}. This truck may leave.
                  </span>
                </div>
              ) : (
                <div className={styles.ineligible}>{Icons.xCircle}<span>{resolved.reason}</span></div>
              )}

              {resolved.eligible && (sap.loading || sap.result || sap.error) && (
                <SapValidationPanel loading={sap.loading} error={sap.error} result={sap.result} variant="gate" />
              )}
            </div>
          )}

          <FormAlert>{submitError}</FormAlert>
        </div>
      )}
    </Modal>
  );
}

export default GateScanModal;
