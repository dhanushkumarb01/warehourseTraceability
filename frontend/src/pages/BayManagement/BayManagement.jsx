/**
 * BayManagement Page
 *
 * The primary page for managing warehouse bays.
 * Orchestrates all Bay CRUD operations: list, create, view, edit, delete.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  fetchAllBays,
  createBay,
  updateBay,
  deleteBay,
} from '../../services/bayService';
import BayForm         from '../../components/BayForm/BayForm';
import BayDetailModal  from '../../components/BayDetailModal/BayDetailModal';
import ConfirmDialog   from '../../components/ConfirmDialog/ConfirmDialog';
import StatusBadge     from '../../components/StatusBadge/StatusBadge';
import Toast           from '../../components/Toast/Toast';
import styles          from './BayManagement.module.css';

const formatCoord = (val) =>
  val !== null && val !== undefined ? Number(val).toFixed(4) : '—';

function BayManagement() {
  const [bays,       setBays]       = useState([]);
  const [isLoading,  setIsLoading]  = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [formOpen,       setFormOpen]       = useState(false);
  const [formMode,       setFormMode]       = useState('create');
  const [selectedBay,    setSelectedBay]    = useState(null);
  const [detailOpen,     setDetailOpen]     = useState(false);
  const [confirmOpen,    setConfirmOpen]    = useState(false);
  const [bayToDelete,    setBayToDelete]    = useState(null);

  const [submitting,  setSubmitting]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);

  const [toast, setToast] = useState({ message: '', type: 'info' });
  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = useCallback(() => setToast({ message: '', type: 'info' }), []);

  const loadBays = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const data = await fetchAllBays();
      setBays(data);
    } catch (err) {
      setFetchError(err.message || 'Failed to load bays.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadBays(); }, [loadBays]);

  const handleOpenCreate = () => {
    setSelectedBay(null);
    setFormMode('create');
    setFormOpen(true);
  };

  const handleOpenEdit = (bay) => {
    setSelectedBay(bay);
    setFormMode('edit');
    setFormOpen(true);
  };

  const handleOpenDetail = (bay) => {
    setSelectedBay(bay);
    setDetailOpen(true);
  };

  const handleOpenDelete = (bay) => {
    setBayToDelete(bay);
    setConfirmOpen(true);
  };

  const handleFormSubmit = async (payload) => {
    setSubmitting(true);
    try {
      if (formMode === 'edit') {
        await updateBay(selectedBay.id, payload);
        showToast('Bay updated successfully.', 'success');
      } else {
        await createBay(payload);
        showToast('Bay created successfully.', 'success');
      }
      setFormOpen(false);
      loadBays();
    } catch (err) {
      const apiErrors = err.response?.data?.errors;
      if (apiErrors?.length) {
        showToast(apiErrors.map((e) => e.message).join(' '), 'error');
      } else {
        showToast(err.message || 'Operation failed.', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!bayToDelete) return;
    setDeleting(true);
    try {
      await deleteBay(bayToDelete.id);
      showToast(`Bay "${bayToDelete.bayCode}" deleted.`, 'success');
      setConfirmOpen(false);
      setBayToDelete(null);
      loadBays();
    } catch (err) {
      showToast(err.message || 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleBayUpdated = (updatedBay) => {
    setSelectedBay(updatedBay);
    setBays((prev) => prev.map((b) => (b.id === updatedBay.id ? updatedBay : b)));
  };

  return (
    <div className={styles.page}>
      <Toast
        message={toast.message}
        type={toast.type}
        onClose={clearToast}
      />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V12h6v9" />
            </svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Bay Master Management</h1>
            <p className={styles.pageBreadcrumb}>
              Warehouse Traceability &rsaquo; Phase 2 &rsaquo; Bay Management
            </p>
          </div>
        </div>
        <button
          id="create-bay-btn"
          className={styles.primaryBtn}
          onClick={handleOpenCreate}
        >
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Add Bay
        </button>
      </div>

      {!isLoading && !fetchError && (
        <div className={styles.statsStrip}>
          <StatCard label="Total Bays" value={bays.length} color="#2563eb" bg="#eff6ff" />
          <StatCard label="Available" value={bays.filter((b) => b.status === 'AVAILABLE').length} color="#16a34a" bg="#f0fdf4" />
          <StatCard label="Occupied" value={bays.filter((b) => b.status === 'OCCUPIED').length} color="#ca8a04" bg="#fefce8" />
          <StatCard label="Inactive" value={bays.filter((b) => b.status === 'INACTIVE').length} color="#64748b" bg="#f8fafc" />
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>All Bays</h2>
          <span className={styles.count}>{bays.length} records</span>
        </div>

        {isLoading && (
          <div className={styles.loadingState}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className={styles.skeleton} />
            ))}
          </div>
        )}

        {!isLoading && fetchError && (
          <div className={styles.errorState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p>{fetchError}</p>
            <button className={styles.retryBtn} onClick={loadBays}>Retry</button>
          </div>
        )}

        {!isLoading && !fetchError && bays.length === 0 && (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="8" y="16" width="48" height="32" rx="3" />
              <path strokeLinecap="round" d="M8 24h48M20 24v24M44 24v24" />
            </svg>
            <p className={styles.emptyTitle}>No bays registered yet</p>
            <p className={styles.emptySubtitle}>
              Start by adding your first warehouse bay.
            </p>
            <button className={styles.primaryBtn} onClick={handleOpenCreate}>
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add First Bay
            </button>
          </div>
        )}

        {!isLoading && !fetchError && bays.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Bay Code</th>
                  <th>Bay Name</th>
                  <th>Zone</th>
                  <th>Latitude</th>
                  <th>Longitude</th>
                  <th>Status</th>
                  <th>QR</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bays.map((bay) => (
                  <tr key={bay.id}>
                    <td>
                      <span className={styles.code}>{bay.bayCode}</span>
                    </td>
                    <td className={styles.nameCell}>{bay.bayName}</td>
                    <td>{bay.zone}</td>
                    <td className={styles.coordCell}>{formatCoord(bay.latitude)}</td>
                    <td className={styles.coordCell}>{formatCoord(bay.longitude)}</td>
                    <td><StatusBadge status={bay.status} /></td>
                    <td>
                      {bay.qrStatus === 'GENERATED' ? (
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
                        <button
                          id={`view-bay-${bay.id}`}
                          className={`${styles.actionBtn} ${styles.viewBtn}`}
                          onClick={() => handleOpenDetail(bay)}
                          title="View Details"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          id={`edit-bay-${bay.id}`}
                          className={`${styles.actionBtn} ${styles.editBtn}`}
                          onClick={() => handleOpenEdit(bay)}
                          title="Edit Bay"
                        >
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button
                          id={`delete-bay-${bay.id}`}
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleOpenDelete(bay)}
                          title="Delete Bay"
                        >
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
          </div>
        )}
      </div>

      <BayForm
        isOpen={formOpen}
        onClose={() => { if (!submitting) setFormOpen(false); }}
        onSubmit={handleFormSubmit}
        initialData={selectedBay}
        isLoading={submitting}
        mode={formMode}
      />

      <BayDetailModal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        bay={selectedBay}
        onBayUpdated={handleBayUpdated}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Bay"
        message={`Are you sure you want to permanently delete "${bayToDelete?.bayCode} – ${bayToDelete?.bayName}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => { if (!deleting) { setConfirmOpen(false); setBayToDelete(null); } }}
        isLoading={deleting}
      />
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div className={styles.statCard} style={{ '--stat-color': color, '--stat-bg': bg }}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

export default BayManagement;
