/**
 * BayDetailModal Component
 *
 * Read-only modal showing complete details for a selected bay,
 * including QR Management (Generate, Preview, Download).
 *
 * Props:
 *   isOpen       {boolean}  — controls visibility
 *   onClose      {function} — called when modal is dismissed
 *   bay          {object}   — bay data object
 *   onBayUpdated {function} — called when bay is modified (e.g. QR generated)
 */

import { useState, useEffect } from 'react';
import StatusBadge from '../StatusBadge/StatusBadge';
import { generateQR, getQRImageUrl, getQRDownloadUrl } from '../../services/qrService';
import { fetchBayInventory } from '../../services/mappingService';
import styles from './BayDetailModal.module.css';

const Field = ({ label, value }) => (
  <div className={styles.field}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value ?? '—'}</span>
  </div>
);

function BayDetailModal({ isOpen, onClose, bay, onBayUpdated }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrError, setQrError] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [invLoading, setInvLoading] = useState(false);

  // Load this bay's live inventory whenever the modal is opened for a bay.
  useEffect(() => {
    if (!isOpen || !bay) { setInventory(null); return; }
    let cancelled = false;
    setInvLoading(true);
    fetchBayInventory(bay.id)
      .then((data) => { if (!cancelled) setInventory(data); })
      .catch(() => { if (!cancelled) setInventory(null); })
      .finally(() => { if (!cancelled) setInvLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, bay]);

  if (!isOpen || !bay) return null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    setQrError(null);
    try {
      const updatedBay = await generateQR('BAY', bay.id);
      if (onBayUpdated) onBayUpdated(updatedBay);
    } catch (err) {
      setQrError(err.message || 'Failed to generate QR Code.');
    } finally {
      setIsGenerating(false);
    }
  };

  const createdAt = new Date(bay.createdAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const updatedAt = new Date(bay.updatedAt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const hasQR = bay.qrStatus === 'GENERATED';

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="bay-detail-title">
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path strokeLinecap="round" d="M9 9h6M9 13h6M9 17h4" />
              </svg>
            </div>
            <div>
              <h2 id="bay-detail-title" className={styles.title}>Bay Details</h2>
              <p className={styles.subtitle}>{bay.bayCode}</p>
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
          <StatusBadge status={bay.status} />
        </div>

        {/* Content */}
        <div className={styles.body}>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Bay Information</h3>
            <div className={styles.grid}>
              <Field label="Bay Code" value={bay.bayCode} />
              <Field label="Bay Name" value={bay.bayName} />
              <Field label="Zone" value={bay.zone} />
              <Field label="Status" value={<StatusBadge status={bay.status} />} />
            </div>
          </section>

          <section className={styles.section}>
            <div className={styles.qrHeader}>
              <h3 className={styles.sectionTitle}>Materials Stored</h3>
              <span className={styles.invCountBadge}>
                {invLoading ? '…' : `${inventory?.lotCount ?? 0} lots`}
              </span>
            </div>
            <div className={styles.invWrap}>
              {invLoading ? (
                <p className={styles.invEmpty}>Loading inventory…</p>
              ) : !inventory || inventory.lotCount === 0 ? (
                <p className={styles.invEmpty}>No materials are currently stored in this bay.</p>
              ) : (
                <>
                  <div className={styles.invSummary}>
                    <Field label="Inventory Count" value={inventory.lotCount} />
                    <Field label="Total Quantity" value={inventory.totalQuantity.toLocaleString('en-IN')} />
                  </div>
                  <div className={styles.invTableWrap}>
                    <table className={styles.invTable}>
                      <thead>
                        <tr><th>Lot Code</th><th>Material</th><th>Qty</th><th>Received</th><th>Mapped</th></tr>
                      </thead>
                      <tbody>
                        {inventory.mappings.map((m) => (
                          <tr key={m.id}>
                            <td><span className={styles.invCode}>{m.lot?.lotCode}</span></td>
                            <td>{m.lot?.material?.materialName || '—'}</td>
                            <td>{m.lot?.quantity} {m.lot?.unit}</td>
                            <td>{m.lot?.receivedDate ? new Date(m.lot.receivedDate).toLocaleDateString('en-IN') : '—'}</td>
                            <td>{new Date(m.mappedAt).toLocaleDateString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
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
                      src={getQRImageUrl('BAY', bay.id)} 
                      alt={`QR Code for ${bay.bayCode}`} 
                      className={styles.qrImage} 
                    />
                  </div>
                  <div className={styles.qrActions}>
                    <Field label="QR Version" value={`v${bay.qrVersion}`} />
                    <Field label="Generated On" value={new Date(bay.qrGeneratedAt).toLocaleDateString('en-IN')} />
                    <a 
                      href={getQRDownloadUrl('BAY', bay.id)}
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
              <Field label="Record ID" value={bay.id} />
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

export default BayDetailModal;

