/**
 * ScanMappingModal Component — Dual-QR Mapping Workflow
 *
 * Implements the scan-driven mapping flow described in the Phase 5 spec:
 *
 *     Scan Material QR → identify lot → Scan Bay QR → identify bay
 *                       → confirm → create / relocate mapping
 *
 * Camera scanning is NOT wired yet — the infrastructure is "scan-ready":
 *   - Each station accepts a raw QR payload (the exact JSON a scanner decodes).
 *   - A "simulate scan" picker fills that payload from an existing entity, so
 *     the end-to-end flow is fully exercisable today.
 *   - When a real scanner is added, it simply calls setMaterialPayload /
 *     setBayPayload with the decoded string — no other change required.
 *
 * Identification is delegated to the backend (POST /mappings/scan/resolve) so
 * the same validation that guards the commit also powers the live preview.
 *
 * Props:
 *   isOpen   {boolean}
 *   lots     {Array}   lots available for "simulate scan"
 *   bays     {Array}   bays available for "simulate scan"
 *   onClose  {function}
 *   onDone   {function(result)}  called after a successful commit
 */

import { useEffect, useState } from 'react';
import { resolveScan, commitScan } from '../../services/mappingService';
import styles from './ScanMappingModal.module.css';

// Build the canonical QR payload for an entity (matches backend qrService).
const lotPayload = (l) =>
  l.qrCode || JSON.stringify({ entityType: 'MATERIAL_LOT', lotId: l.id, code: l.lotCode, version: l.qrVersion || 1 });
const bayPayload = (b) =>
  b.qrCode || JSON.stringify({ entityType: 'BAY', bayId: b.id, code: b.bayCode, zone: b.zone, version: b.qrVersion || 1 });

function ScanMappingModal({ isOpen, lots = [], bays = [], onClose, onDone }) {
  const [materialPayload, setMaterialPayload] = useState('');
  const [bayQrPayload, setBayQrPayload] = useState('');

  const [resolvedLot, setResolvedLot] = useState(null);
  const [lotActiveMapping, setLotActiveMapping] = useState(null);
  const [resolvedBay, setResolvedBay] = useState(null);

  const [scanError, setScanError] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setMaterialPayload('');
    setBayQrPayload('');
    setResolvedLot(null);
    setLotActiveMapping(null);
    setResolvedBay(null);
    setScanError(null);
    setSubmitError(null);
    setIsSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const identifyMaterial = async (payload) => {
    setMaterialPayload(payload);
    setResolvedLot(null);
    setLotActiveMapping(null);
    setScanError(null);
    if (!payload.trim()) return;
    try {
      const res = await resolveScan({ materialQr: payload });
      setResolvedLot(res.lot);
      setLotActiveMapping(res.activeMapping);
    } catch (err) {
      setScanError(err.message || 'Could not identify the material QR.');
    }
  };

  const identifyBay = async (payload) => {
    setBayQrPayload(payload);
    setResolvedBay(null);
    setScanError(null);
    if (!payload.trim()) return;
    try {
      const res = await resolveScan({ bayQr: payload });
      setResolvedBay(res.bay);
    } catch (err) {
      setScanError(err.message || 'Could not identify the bay QR.');
    }
  };

  const willMove = Boolean(lotActiveMapping);
  const sameBay = willMove && resolvedBay && lotActiveMapping.bayId === resolvedBay.id;
  const canCommit = resolvedLot && resolvedBay && !sameBay && !isSubmitting;

  const handleCommit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await commitScan({ materialQr: materialPayload, bayQr: bayQrPayload });
      onDone?.(result);
    } catch (err) {
      setSubmitError(err.message || 'Mapping failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="scan-modal-title">
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <path strokeLinecap="round" d="M14 14h3m4 0v.01M17 21h4M14 17v4" />
              </svg>
            </div>
            <div>
              <h2 id="scan-modal-title" className={styles.title}>Scan to Map</h2>
              <p className={styles.subtitle}>Scan a Material QR, then a Bay QR, to place or relocate the lot.</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className={styles.body}>
          {scanError && <div className={styles.errorBanner}>{scanError}</div>}

          {/* Station 1 — Material */}
          <div className={styles.station}>
            <div className={styles.stationHead}>
              <span className={styles.stepNum}>1</span>
              <span className={styles.stationTitle}>Scan Material QR</span>
              {resolvedLot && <span className={styles.okPill}>Identified</span>}
            </div>
            <select
              className={styles.select}
              value=""
              onChange={(e) => {
                const l = lots.find((x) => x.id === e.target.value);
                if (l) identifyMaterial(lotPayload(l));
              }}
            >
              <option value="">Simulate scan — pick a lot…</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotCode}{l.material?.materialName ? ` — ${l.material.materialName}` : ''}
                </option>
              ))}
            </select>
            <textarea
              className={styles.payloadInput}
              placeholder="…or paste/scan the Material QR payload"
              value={materialPayload}
              onChange={(e) => identifyMaterial(e.target.value)}
              rows={2}
            />
            {resolvedLot && (
              <div className={styles.preview}>
                <span className={styles.code}>{resolvedLot.lotCode}</span>
                <span className={styles.previewMain}>{resolvedLot.material?.materialName || 'Material'}</span>
                <span className={styles.previewSub}>{resolvedLot.quantity} {resolvedLot.unit}</span>
                {willMove && (
                  <span className={styles.movePill}>Currently in {lotActiveMapping.bay?.bayCode}</span>
                )}
              </div>
            )}
          </div>

          <div className={styles.connector} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-4-4m4 4l4-4" />
            </svg>
          </div>

          {/* Station 2 — Bay */}
          <div className={styles.station}>
            <div className={styles.stationHead}>
              <span className={styles.stepNum}>2</span>
              <span className={styles.stationTitle}>Scan Bay QR</span>
              {resolvedBay && <span className={styles.okPill}>Identified</span>}
            </div>
            <select
              className={styles.select}
              value=""
              onChange={(e) => {
                const b = bays.find((x) => x.id === e.target.value);
                if (b) identifyBay(bayPayload(b));
              }}
            >
              <option value="">Simulate scan — pick a bay…</option>
              {bays.map((b) => (
                <option key={b.id} value={b.id} disabled={b.status === 'INACTIVE'}>
                  {b.bayCode} — {b.bayName} · {b.zone}{b.status === 'INACTIVE' ? ' (inactive)' : ''}
                </option>
              ))}
            </select>
            <textarea
              className={styles.payloadInput}
              placeholder="…or paste/scan the Bay QR payload"
              value={bayQrPayload}
              onChange={(e) => identifyBay(e.target.value)}
              rows={2}
            />
            {resolvedBay && (
              <div className={styles.preview}>
                <span className={styles.code}>{resolvedBay.bayCode}</span>
                <span className={styles.previewMain}>{resolvedBay.bayName}</span>
                <span className={styles.previewSub}>{resolvedBay.zone}</span>
              </div>
            )}
          </div>

          {/* Outcome summary */}
          {resolvedLot && resolvedBay && (
            <div className={`${styles.outcome} ${sameBay ? styles.outcomeWarn : ''}`}>
              {sameBay
                ? `${resolvedLot.lotCode} is already in ${resolvedBay.bayCode}.`
                : willMove
                  ? `Will MOVE ${resolvedLot.lotCode} from ${lotActiveMapping.bay?.bayCode} → ${resolvedBay.bayCode}.`
                  : `Will MAP ${resolvedLot.lotCode} → ${resolvedBay.bayCode}.`}
            </div>
          )}

          {submitError && <div className={styles.errorBanner}>{submitError}</div>}

          <div className={styles.footer}>
            <button className={styles.cancelBtn} onClick={onClose} disabled={isSubmitting}>Cancel</button>
            <button className={styles.submitBtn} onClick={handleCommit} disabled={!canCommit}>
              {isSubmitting ? 'Saving…' : willMove ? 'Confirm Move' : 'Confirm Mapping'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScanMappingModal;
