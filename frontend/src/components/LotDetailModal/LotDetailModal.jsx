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
import styles from './LotDetailModal.module.css';

const Field = ({ label, value }) => (
  <div className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value ?? '—'}</span>
  </div>
);

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
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="lot-detail-title">
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
              </svg>
            </div>
            <div>
              <h2 id="lot-detail-title" className={styles.title}>Lot Details</h2>
              <p className={styles.subtitle}>{lot.lotCode}</p>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close details">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Status Banner */}
        <div className={styles.statusBanner}>
          <StatusBadge status={lot.status} />
        </div>

        {/* Content */}
        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Lot Information</h3>
            <div className={styles.grid}>
              <Field label="Lot Code" value={lot.lotCode} />
              <Field label="Quantity" value={`${lot.quantity} ${lot.unit}`} />
              <Field label="Received Date" value={receivedDate} />
              <Field label="Status" value={<StatusBadge status={lot.status} />} />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.qrHeader}>
              <h3 className={styles.sectionTitle}>Current Location</h3>
              {!locLoading && (
                location?.isMapped
                  ? <span className={styles.qrGeneratedBadge}>Mapped</span>
                  : <span className={styles.locUnmapped}>Unmapped</span>
              )}
            </div>
            {locLoading ? (
              <p className={styles.locEmpty}>Loading location…</p>
            ) : location?.isMapped ? (
              <div className={styles.grid}>
                <Field label="Current Bay" value={location.bay?.bayCode} />
                <Field label="Bay Name" value={location.bay?.bayName} />
                <Field label="Current Zone" value={location.zone} />
                <Field
                  label="Mapped Since"
                  value={location.mappedAt ? new Date(location.mappedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                />
              </div>
            ) : (
              <p className={styles.locEmpty}>This lot is not currently stored in any bay.</p>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Movement History</h3>
            <div className={styles.timelineWrap}>
              {locLoading ? (
                <p className={styles.locEmpty}>Loading history…</p>
              ) : (
                <MovementTimeline history={history} compact />
              )}
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.qrHeader}>
              <h3 className={styles.sectionTitle}>Digital Identity (QR)</h3>
              {hasQR && (
                <span className={styles.qrGeneratedBadge}>Generated</span>
              )}
            </div>
            
            <div className={styles.qrContainer}>
              {qrError && <div className={styles.qrError}>{qrError}</div>}
              
              {!hasQR ? (
                <div className={styles.qrEmptyState}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/>
                  </svg>
                  <p>No QR Code generated yet</p>
                  <button 
                    className={styles.generateBtn} 
                    onClick={handleGenerate}
                    disabled={isGenerating}
                  >
                    {isGenerating ? 'Generating...' : 'Generate QR'}
                  </button>
                </div>
              ) : (
                <div className={styles.qrPreviewContainer}>
                  <div className={styles.qrImageWrap}>
                    <img 
                      src={getQRImageUrl('MATERIAL_LOT', lot.id)} 
                      alt={`QR Code for ${lot.lotCode}`} 
                      className={styles.qrImage} 
                    />
                  </div>
                  <div className={styles.qrActions}>
                    <Field label="QR Version" value={`v${lot.qrVersion}`} />
                    <Field label="Generated On" value={new Date(lot.qrGeneratedAt).toLocaleDateString('en-IN')} />
                    <a 
                      href={getQRDownloadUrl('MATERIAL_LOT', lot.id)}
                      download
                      className={styles.downloadBtn}
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                      Download PNG
                    </a>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>System Information</h3>
            <div className={styles.grid}>
              <Field label="Record ID" value={lot.id} />
              <Field label="Created At" value={createdAt} />
              <Field label="Updated At" value={updatedAt} />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.closeFooterBtn} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default LotDetailModal;
