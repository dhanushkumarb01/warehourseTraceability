/**
 * LotDetailModal Component
 *
 * Read-only modal showing complete details for a selected lot,
 * including QR Management (Generate, Preview, Download).
 */

import { useState, useEffect } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import MovementTimeline from '../MovementTimeline/MovementTimeline';
import { generateQR, getQRImageUrl, getQRDownloadUrl } from '../../services/qrService';
import { fetchMaterialLocation, fetchMappingHistory } from '../../services/mappingService';
import { Modal, Button, DetailList, StatusChip, Skeleton, FormAlert } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from './LotDetailModal.module.css';

function LotDetailModal({ isOpen, onClose, lot, onLotUpdated }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [location, setLocation] = useState(null);
  const [history, setHistory] = useState([]);
  const [locLoading, setLocLoading] = useState(false);

  // Load current location + full movement history when the modal opens.
  useEffect(() => {
    if (!isOpen || !lot) { setLocation(null); setHistory([]); return; }
    let cancelled = false;
    setLocLoading(true);
    Promise.all([fetchMaterialLocation(lot.id), fetchMappingHistory(lot.id)])
      .then(([loc, hist]) => { if (!cancelled) { setLocation(loc); setHistory(hist); } })
      .catch(() => { if (!cancelled) { setLocation(null); setHistory([]); } })
      .finally(() => { if (!cancelled) setLocLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, lot]);

  if (!isOpen || !lot) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setQrError(null);
    try {
      const updatedLot = await generateQR('MATERIAL_LOT', lot.id);
      if (onLotUpdated) onLotUpdated(updatedLot);
    } catch (err) {
      setQrError(err.message || 'Failed to generate QR Code.');
    } finally {
      setIsGenerating(false);
    }
  };

  const createdAt = new Date(lot.createdAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const updatedAt = new Date(lot.updatedAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const receivedDate = new Date(lot.receivedDate).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  const hasQR = lot.qrStatus === 'GENERATED';

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={Icons.box}
      title={lot.material?.materialName ? `${lot.material.materialName}` : `Batch ${lot.lotCode}`}
      subtitle={<>Batch <span className={uiStyles.mono}>{lot.lotCode}</span> · {lot.quantity} {lot.unit}</>}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={uiStyles.sectionTitle}>About this batch</h3>
              <StatusBadge status={lot.status} size="sm" />
            </div>
            <DetailList
              items={[
                { label: 'Batch code', value: <span className={uiStyles.mono}>{lot.lotCode}</span> },
                { label: 'Quantity', value: `${lot.quantity} ${lot.unit}` },
                { label: 'Received', value: receivedDate },
                { label: 'Status', value: <StatusBadge status={lot.status} size="sm" /> },
              ]}
            />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={uiStyles.sectionTitle}>Where is it now?</h3>
              {!locLoading && (location?.isMapped
                ? <StatusChip tone="success" icon={Icons.pin} size="sm">Stored</StatusChip>
                : <StatusChip tone="neutral" size="sm">Not in a storage spot</StatusChip>)}
            </div>
            {locLoading ? <Skeleton height={60} radius={12} /> : location?.isMapped ? (
              <DetailList
                items={[
                  { label: 'Storage spot', value: <span className={uiStyles.mono}>{location.bay?.bayCode}</span> },
                  { label: 'Spot name', value: location.bay?.bayName },
                  { label: 'Yard area', value: location.zone },
                  { label: 'Stored since', value: location.mappedAt ? new Date(location.mappedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—' },
                ]}
              />
            ) : (
              <p className={styles.empty}>This batch isn’t in any storage spot right now.</p>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={uiStyles.sectionTitle}>Where has it been?</h3>
            {locLoading ? <Skeleton height={80} radius={12} /> : <MovementTimeline history={history} compact />}
          </section>

          <details className={styles.system}>
            <summary>System details</summary>
            <DetailList
              items={[
                { label: 'Record ID', value: <span className={uiStyles.mono}>{lot.id}</span> },
                { label: 'Created', value: createdAt },
                { label: 'Last changed', value: updatedAt },
              ]}
            />
          </details>
        </div>

        <aside className={styles.qr}>
          <h3 className={uiStyles.sectionTitle}>QR label</h3>
          <FormAlert>{qrError}</FormAlert>
          {!hasQR ? (
            <div className={styles.qrEmpty}>
              <span className={styles.qrEmptyIcon}>{Icons.qr}</span>
              <p>No QR label yet. Create one to print and stick on the batch, so staff can scan it.</p>
              <Button variant="primary" icon={Icons.qr} onClick={handleGenerate} loading={isGenerating}>Create QR label</Button>
            </div>
          ) : (
            <>
              <div className={styles.qrImageWrap}>
                <img src={getQRImageUrl('MATERIAL_LOT', lot.id)} alt={`QR label for batch ${lot.lotCode}`} className={styles.qrImage} />
              </div>
              <p className={styles.qrMeta}>Version {lot.qrVersion} · created {new Date(lot.qrGeneratedAt).toLocaleDateString('en-IN')}</p>
              <a href={getQRDownloadUrl('MATERIAL_LOT', lot.id)} download className={styles.download}>
                {Icons.download}Download to print
              </a>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

export default LotDetailModal;
