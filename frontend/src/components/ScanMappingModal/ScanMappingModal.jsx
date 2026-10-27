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
import { Modal, Field, Button, FormAlert, Stepper, StatusChip } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
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

  const step = resolvedLot && resolvedBay ? 2 : resolvedLot ? 1 : 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={isSubmitting}
      icon={Icons.scan}
      title="Scan to store"
      subtitle="Scan the batch’s QR label, then the storage spot’s QR label."
      footer={(
        <>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button variant="primary" icon={Icons.check} onClick={handleCommit} loading={isSubmitting} disabled={!canCommit}>
            {willMove ? 'Move batch here' : 'Store batch here'}
          </Button>
        </>
      )}
    >
      <div className={styles.stepper}>
        <Stepper steps={[{ label: 'Batch', hint: 'Scan its label' }, { label: 'Storage spot', hint: 'Scan the spot label' }, { label: 'Confirm' }]} current={step} />
      </div>

      <div className={uiStyles.formSection}>
        <FormAlert>{scanError}</FormAlert>

        <section className={`${styles.station} ${resolvedLot ? styles.stationDone : ''}`}>
          <div className={styles.stationHead}>
            <span className={styles.stepNum}>{resolvedLot ? Icons.check : 1}</span>
            <span className={styles.stationTitle}>Scan the batch</span>
            {resolvedLot && <StatusChip tone="success" size="sm">Found</StatusChip>}
          </div>
          <Field label="No scanner? Pick the batch">
            {(p) => (
              <select {...p} value="" onChange={(e) => { const l = lots.find((x) => x.id === e.target.value); if (l) identifyMaterial(lotPayload(l)); }}>
                <option value="">Pick a batch…</option>
                {lots.map((l) => (
                  <option key={l.id} value={l.id}>{l.lotCode}{l.material?.materialName ? ` — ${l.material.materialName}` : ''}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Batch QR label contents" optional>
            {(p) => <textarea {...p} className={`${p.className} ${styles.payload}`} placeholder="Scan or paste the batch’s QR label" value={materialPayload} onChange={(e) => identifyMaterial(e.target.value)} rows={2} />}
          </Field>
          {resolvedLot && (
            <div className={styles.preview}>
              <span className={styles.previewIcon}>{Icons.box}</span>
              <span className={styles.previewText}>
                <span className={uiStyles.strong}>{resolvedLot.material?.materialName || 'Material'}</span>
                <span className={uiStyles.sub}><span className={uiStyles.mono}>{resolvedLot.lotCode}</span> · {resolvedLot.quantity} {resolvedLot.unit}</span>
              </span>
              {willMove && <StatusChip tone="info" icon={Icons.pin} size="sm">Now in {lotActiveMapping.bay?.bayCode}</StatusChip>}
            </div>
          )}
        </section>

        <section className={`${styles.station} ${resolvedBay ? styles.stationDone : ''}`}>
          <div className={styles.stationHead}>
            <span className={styles.stepNum}>{resolvedBay ? Icons.check : 2}</span>
            <span className={styles.stationTitle}>Scan the storage spot</span>
            {resolvedBay && <StatusChip tone="success" size="sm">Found</StatusChip>}
          </div>
          <Field label="No scanner? Pick the spot">
            {(p) => (
              <select {...p} value="" onChange={(e) => { const b = bays.find((x) => x.id === e.target.value); if (b) identifyBay(bayPayload(b)); }}>
                <option value="">Pick a storage spot…</option>
                {bays.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.status === 'INACTIVE'}>
                    {b.bayCode} — {b.bayName} · {b.zone}{b.status === 'INACTIVE' ? ' (out of use)' : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Spot QR label contents" optional>
            {(p) => <textarea {...p} className={`${p.className} ${styles.payload}`} placeholder="Scan or paste the storage spot’s QR label" value={bayQrPayload} onChange={(e) => identifyBay(e.target.value)} rows={2} />}
          </Field>
          {resolvedBay && (
            <div className={styles.preview}>
              <span className={styles.previewIcon}>{Icons.pin}</span>
              <span className={styles.previewText}>
                <span className={uiStyles.strong}>{resolvedBay.bayCode}</span>
                <span className={uiStyles.sub}>{resolvedBay.bayName} · {resolvedBay.zone}</span>
              </span>
            </div>
          )}
        </section>

        {resolvedLot && resolvedBay && (
          <div className={`${styles.outcome} ${sameBay ? styles.outcomeWarn : ''}`} role="status">
            {sameBay ? Icons.warning : Icons.info}
            <span>
              {sameBay
                ? `${resolvedLot.lotCode} is already in ${resolvedBay.bayCode}. Pick a different spot to move it.`
                : willMove
                  ? `This will move ${resolvedLot.lotCode} from ${lotActiveMapping.bay?.bayCode} to ${resolvedBay.bayCode}.`
                  : `This will store ${resolvedLot.lotCode} in ${resolvedBay.bayCode}.`}
            </span>
          </div>
        )}

        <FormAlert>{submitError}</FormAlert>
      </div>
    </Modal>
  );
}

export default ScanMappingModal;
