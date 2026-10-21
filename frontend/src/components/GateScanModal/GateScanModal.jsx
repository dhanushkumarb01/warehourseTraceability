/**
 * GateScanModal — scan-driven exit gate validation.
 *
 *   Scan Material QR → identify lot → check approved dispatch → authorise/deny exit
 *
 * Reuses the existing Material QR payload (no second QR system). Camera scanning
 * is not wired yet but the flow is scan-ready: a real scanner simply calls
 * setPayload with the decoded string.
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

  if (!isOpen) return null;

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

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21V5a2 2 0 012-2h6m0 18V3m0 18h10M11 3h6a2 2 0 012 2v16M7 8h.01M7 12h.01" /></svg>
            </div>
            <div>
              <h2 className={styles.title}>Gate Exit Validation</h2>
              <p className={styles.subtitle}>Scan a Material QR to authorise exit.</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close"><svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
        </div>

        <div className={styles.body}>
          {/* Result state */}
          {result ? (
            <div className={`${styles.result} ${result.decision === 'EXITED' ? styles.resultOk : styles.resultDeny}`}>
              <div className={styles.resultIcon}>
                {result.decision === 'EXITED' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                )}
              </div>
              <h3 className={styles.resultTitle}>{result.decision === 'EXITED' ? 'Exit Authorised' : 'Exit Denied'}</h3>
              <p className={styles.resultMsg}>
                {result.decision === 'EXITED'
                  ? `${result.gateValidation?.lot?.lotCode || 'Material'} has left the warehouse.`
                  : result.reason}
              </p>
              <button className={styles.doneBtn} onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              {scanError && <div className={styles.errorBanner}>{scanError}</div>}

              <div className={styles.station}>
                <div className={styles.stationHead}><span className={styles.stepNum}>1</span><span className={styles.stationTitle}>Scan Material QR</span></div>
                <select className={styles.select} value="" onChange={(e) => { const l = lots.find((x) => x.id === e.target.value); if (l) identify(lotPayload(l)); }}>
                  <option value="">Simulate scan — pick a lot…</option>
                  {lots.map((l) => (<option key={l.id} value={l.id}>{l.lotCode}{l.material?.materialName ? ` — ${l.material.materialName}` : ''}</option>))}
                </select>
                <textarea className={styles.payloadInput} rows={2} placeholder="…or paste/scan the Material QR payload" value={payload} onChange={(e) => identify(e.target.value)} />
              </div>

              {resolved && (
                <div className={styles.station}>
                  <div className={styles.stationHead}><span className={styles.stepNum}>2</span><span className={styles.stationTitle}>Validation</span></div>
                  <div className={styles.preview}>
                    <span className={styles.code}>{resolved.lot?.lotCode}</span>
                    <span className={styles.previewMain}>{resolved.lot?.material?.materialName || 'Material'}</span>
                    <StatusBadge status={resolved.lot?.status} />
                  </div>
                  {resolved.eligible ? (
                    <div className={styles.eligible}>
                      Approved dispatch <strong>{resolved.approvedDispatch?.dispatchNumber}</strong>
                      {resolved.approvedDispatch?.bay?.bayCode ? ` · from ${resolved.approvedDispatch.bay.bayCode}` : ''} — ready to exit.
                    </div>
                  ) : (
                    <div className={styles.ineligible}>{resolved.reason}</div>
                  )}

                  {/* SAP exit verdict */}
                  {resolved.eligible && (sap.loading || sap.result || sap.error) && (
                    <SapValidationPanel loading={sap.loading} error={sap.error} result={sap.result} variant="gate" />
                  )}
                </div>
              )}

              {submitError && <div className={styles.errorBanner}>{submitError}</div>}

              <div className={styles.footer}>
                <button className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>Cancel</button>
                <button className={styles.submitBtn} onClick={handleExit} disabled={!resolved || !resolved.eligible || isSubmitting}>
                  {isSubmitting ? 'Validating…' : 'Validate & Authorise Exit'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GateScanModal;
