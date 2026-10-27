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
import { Modal, Button, DetailList, StatusChip, Skeleton, FormAlert, DataTable } from '../ui';
import { Icons } from '../ui/icons';
import { uiStyles } from '../ui/styles';
import styles from '../LotDetailModal/LotDetailModal.module.css';

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

  const lotCount = inventory?.lotCount ?? 0;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={Icons.pin}
      title={`Storage spot ${bay.bayCode}`}
      subtitle={[bay.bayName !== bay.bayCode ? bay.bayName : null, bay.zone].filter(Boolean).join(' · ')}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={uiStyles.sectionTitle}>About this spot</h3>
              <StatusBadge status={bay.status} size="sm" />
            </div>
            <DetailList
              items={[
                { label: 'Spot code', value: <span className={uiStyles.mono}>{bay.bayCode}</span> },
                { label: 'Name', value: bay.bayName },
                { label: 'Yard area', value: bay.zone },
                { label: 'Status', value: <StatusBadge status={bay.status} size="sm" /> },
              ]}
            />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h3 className={uiStyles.sectionTitle}>What’s stored here?</h3>
              {!invLoading && <StatusChip tone={lotCount ? 'orange' : 'teal'} size="sm">{lotCount ? `${lotCount} ${lotCount === 1 ? 'batch' : 'batches'}` : 'Empty'}</StatusChip>}
            </div>
            {invLoading ? <Skeleton height={80} radius={12} /> : lotCount === 0 ? (
              <p className={styles.empty}>Nothing is stored in this spot right now.</p>
            ) : (
              <>
                <p className={styles.empty}>Total quantity: <strong className="wt-num">{inventory.totalQuantity.toLocaleString('en-IN')}</strong> (all batches added together)</p>
                <div className={uiStyles.card}>
                  <DataTable
                    dense
                    caption="Batches in this storage spot"
                    rows={inventory.mappings}
                    defaultSort={{ key: 'mappedAt', dir: 'desc' }}
                    columns={[
                      {
                        key: 'lot', header: 'Batch', primary: true, sortValue: (m) => m.lot?.lotCode,
                        render: (m) => (
                          <>
                            <span className={uiStyles.strong}>{m.lot?.material?.materialName || 'Material'}</span>
                            <span className={uiStyles.sub}><span className={uiStyles.mono}>{m.lot?.lotCode}</span></span>
                          </>
                        ),
                      },
                      { key: 'qty', header: 'Quantity', align: 'right', sortValue: (m) => Number(m.lot?.quantity), render: (m) => <span className="wt-num">{m.lot?.quantity} {m.lot?.unit}</span> },
                      { key: 'mappedAt', header: 'Stored since', sortValue: (m) => new Date(m.mappedAt).getTime(), render: (m) => new Date(m.mappedAt).toLocaleDateString('en-IN') },
                    ]}
                  />
                </div>
              </>
            )}
          </section>

          <details className={styles.system}>
            <summary>System details</summary>
            <DetailList
              items={[
                { label: 'Record ID', value: <span className={uiStyles.mono}>{bay.id}</span> },
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
              <p>No QR label yet. Create one to print and fix at this spot, so staff can scan it when storing material.</p>
              <Button variant="primary" icon={Icons.qr} onClick={handleGenerate} loading={isGenerating}>Create QR label</Button>
            </div>
          ) : (
            <>
              <div className={styles.qrImageWrap}>
                <img src={getQRImageUrl('BAY', bay.id)} alt={`QR label for storage spot ${bay.bayCode}`} className={styles.qrImage} />
              </div>
              <p className={styles.qrMeta}>Version {bay.qrVersion} · created {new Date(bay.qrGeneratedAt).toLocaleDateString('en-IN')}</p>
              <a href={getQRDownloadUrl('BAY', bay.id)} download className={styles.download}>
                {Icons.download}Download to print
              </a>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

export default BayDetailModal;
