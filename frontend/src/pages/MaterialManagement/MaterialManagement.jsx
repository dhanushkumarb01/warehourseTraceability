import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMaterials, deleteMaterial } from '../../services/materialService';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import MaterialFormModal from '../../components/MaterialFormModal/MaterialFormModal';
import styles from './MaterialManagement.module.css';

function MaterialManagement() {
  const navigate = useNavigate();
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Toast
  const [toast, setToast] = useState({ message: '', type: '' });
  
  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  
  // Delete confirm
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [materialToDelete, setMaterialToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const showToast = (message, type = 'info') => setToast({ message, type });
  const clearToast = () => setToast({ message: '', type: '' });

  const loadMaterials = async () => {
    try {
      setLoading(true);
      const res = await getMaterials();
      setMaterials(res.data);
    } catch (err) {
      showToast(err.message || 'Failed to load materials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMaterials();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateClick = () => {
    setFormMode('create');
    setSelectedMaterial(null);
    setFormOpen(true);
  };

  const handleEditClick = (mat) => {
    setFormMode('edit');
    setSelectedMaterial(mat);
    setFormOpen(true);
  };

  const handleDeleteClick = (mat) => {
    setMaterialToDelete(mat);
    setConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!materialToDelete) return;
    setDeleting(true);
    try {
      await deleteMaterial(materialToDelete.id);
      showToast(`Material "${materialToDelete.materialCode}" deleted.`, 'success');
      setConfirmOpen(false);
      setMaterialToDelete(null);
      loadMaterials();
    } catch (err) {
      showToast(err.message || 'Delete failed.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSaved = () => {
    setFormOpen(false);
    showToast(`Material successfully saved.`, 'success');
    loadMaterials();
  };

  const filteredMaterials = materials.filter(m => 
    m.materialCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.materialName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMaterials = materials.length;
  const activeMaterials = materials.filter(m => m.status === 'ACTIVE').length;
  const totalLots = materials.reduce((sum, m) => sum + (m._count?.lots || 0), 0);

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={clearToast} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
            </svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>Material Master</h1>
            <p className={styles.pageBreadcrumb}>Warehouse Traceability &rsaquo; Phase 4 &rsaquo; Materials</p>
          </div>
        </div>
        <button className={styles.primaryBtn} onClick={handleCreateClick}>
          <svg viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Create Material
        </button>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Materials</span>
          <span className={styles.statValue}>{totalMaterials}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Active Materials</span>
          <span className={styles.statValue}>{activeMaterials}</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statLabel}>Total Lots Tracked</span>
          <span className={styles.statValue}>{totalLots}</span>
        </div>
      </div>

      <div className={styles.contentCard}>
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <svg viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input 
              type="text" 
              placeholder="Search materials..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.loadingState}>Loading materials...</div>
          ) : filteredMaterials.length === 0 ? (
            <div className={styles.emptyState}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
              </svg>
              <p>No materials found.</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Material Code</th>
                  <th>Name & Type</th>
                  <th>Supplier</th>
                  <th>Lots</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMaterials.map(mat => (
                  <tr key={mat.id}>
                    <td><span className={styles.code}>{mat.materialCode}</span></td>
                    <td>
                      <div className={styles.nameCell}>{mat.materialName}</div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{mat.materialType}</div>
                    </td>
                    <td>{mat.supplier || '—'}</td>
                    <td>{mat._count?.lots || 0}</td>
                    <td><StatusBadge status={mat.status} /></td>
                    <td>
                      <div className={styles.actions}>
                        <button className={`${styles.actionBtn} ${styles.viewBtn}`} onClick={() => navigate(`/materials/${mat.id}`)} title="View Detail & Lots">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => handleEditClick(mat)} title="Edit">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                        </button>
                        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={() => handleDeleteClick(mat)} title="Delete">
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

      <MaterialFormModal
        isOpen={formOpen}
        mode={formMode}
        initialData={selectedMaterial}
        onClose={() => setFormOpen(false)}
        onSaved={handleFormSaved}
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        title="Delete Material"
        message={`Are you sure you want to delete material "${materialToDelete?.materialCode}"? This cannot be undone.`}
        confirmLabel="Delete"
        confirmStyle="danger"
        isProcessing={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default MaterialManagement;
