import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMaterialById } from '../../services/materialService';
import { deleteLot } from '../../services/lotService';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import LotFormModal from '../../components/LotFormModal/LotFormModal';
import LotDetailModal from '../../components/LotDetailModal/LotDetailModal';
import styles from './MaterialDetail.module.css';

function MaterialDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [material, setMaterial] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Toast
  const [toast, setToast] = useState({ message: '', type: '' });
  
  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [selectedLot, setSelectedLot] = useState(null);
  
  const [detailOpen, setDetailOpen] = useState(false);
  const [lotToView, setLotToView] = useState(null);

  // Delete confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lotToDelete, setLotToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: '' });

  const loadMaterial = async () => {
    try {
      setLoading(true);
      const res = await getMaterialById(id);
      setMaterial(res.data);
    } catch (err) {
      showToast(err.message || 'Failed to load material details.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleCreateLot = () => {
    setFormMode('create');
    setSelectedLot(null);
    setFormOpen(true);
  };

  const handleEditLot = (lot) => {
    setFormMode('edit');
    setSelectedLot(lot);
    setFormOpen(true);
  };

  const handleDeleteLot = (lot) => {
    setLotToDelete(lot);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!lotToDelete) return;
    setDeleting(true);
    try {
      await deleteLot(lotToDelete.id);
      showToast(`Lot "${lotToDelete.lotCode}" deleted.`, 'success');
      setConfirmOpen(false);
      setLotToDelete(null);
      loadMaterial();
    } catch (err) {
      showToast(err.message || 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSaved = () => {
    setFormOpen(false);
    showToast(`Lot successfully saved.`, 'success');
    loadMaterial();
  };

  const handleViewLot = (lot) => {
    setLotToView(lot);
    setDetailOpen(true);
  };

  const handleLotUpdated = (updatedLot) => {
    // If we're updating from the LotDetailModal (like generating QR), 
    // update it in our local state to avoid full reload, or just reload.
    // Full reload is safer.
    setLotToView(updatedLot);
    loadMaterial();
  };

  if (loading) {
    return <div className={styles.page}>Loading material details...</div>;
  }

  if (!material) {
    return <div className={styles.page}>Material not found.</div>;
  }

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <button className={styles.backBtn} onClick={() => navigate('/materials')} title="Back to Materials">
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <div>
            <h1 className={styles.pageTitle}>{material.materialName}</h1>
            <p className={styles.pageBreadcrumb}>Materials &rsaquo; {material.materialCode}</p>
          </div>
        </div>
        <button className={styles.primaryBtn} onClick={handleCreateLot}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Create Lot
        </button>
      </div>

      <div className={styles.infoCard}>
        <div className={styles.infoGrid}>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Material Code</span>
            <span className={styles.infoValue}>{material.materialCode}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Type</span>
            <span className={styles.infoValue}>{material.materialType}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Manufacturer</span>
            <span className={styles.infoValue}>{material.manufacturer || '—'}</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.infoLabel}>Supplier</span>
            <span className={styles.infoValue}>{material.supplier || '—'}</span>
          </div>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.cardHeader}>
          <h3>Material Lots</h3>
        </div>

        <div className={styles.tableWrapper}>
          {material.lots.length === 0 ? (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
              </svg>
              <p>No lots have been created for this material.</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Lot Code</th>
                  <th>Quantity</th>
                  <th>Received Date</th>
                  <th>Status</th>
                  <th>QR</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {material.lots.map(lot => (
                  <tr key={lot.id}>
                    <td><span className={styles.code}>{lot.lotCode}</span></td>
                    <td>{lot.quantity} {lot.unit}</td>
                    <td>{new Date(lot.receivedDate).toLocaleDateString('en-IN')}</td>
                    <td><StatusBadge status={lot.status} /></td>
                    <td>
                      {lot.qrStatus === 'GENERATED' ? (
                        <span className={styles.qrIconAvailable} title="QR Code Available">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                            <rect x="3" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="3" width="7" height="7" rx="1"/>
                            <rect x="14" y="14" width="7" height="7" rx="1"/>
                            <rect x="3" y="14" width="7" height="7" rx="1"/>
                          </svg>
                        </span>
                      ) : (
                        <span className={styles.qrIconMissing} title="QR Code Missing">—</span>
                      )}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button className={`${styles.actionBtn} ${styles.viewBtn}`} onClick={() => handleViewLot(lot)} title="View QR & Details">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => handleEditLot(lot)} title="Edit">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteLot(lot)} title="Delete">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <LotFormModal
        isOpen={formOpen}
        mode={formMode}
        materialId={material.id}
        initialData={selectedLot}
        onClose={() => setFormOpen(false)}
        onSaved={handleFormSaved}
      />

      <LotDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        lot={lotToView}
        onLotUpdated={handleLotUpdated}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Lot"
        message={`Are you sure you want to delete lot "${lotToDelete?.lotCode}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmStyle="danger"
        isProcessing={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default MaterialDetail;
