/**
 * UserManagement Page (ADMIN)
 *
 * List users, create new accounts, edit role/status/identity, and
 * activate/deactivate. The backend enforces the same rules (last-admin guard,
 * no self-deactivation) — this UI surfaces those errors via the toast.
 */

import { useCallback, useEffect, useState } from 'react';
import { ROLES } from '../../config/roles';
import { useAuth } from '../../context/AuthContext';
import {
  fetchUsers, registerUser, updateUser, activateUser, deactivateUser,
} from '../../services/authApi';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import styles from './UserManagement.module.css';

const ROLE_OPTIONS = Object.values(ROLES);
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const empty = { username: '', email: '', password: '', role: 'OPERATOR', status: 'ACTIVE' };

function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });

  const [modal, setModal] = useState(null); // { mode:'create'|'edit', data }
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await fetchUsers()); }
    catch (err) { setError(err.message || 'Failed to load users.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(empty); setFormError(null); setModal({ mode: 'create' }); };
  const openEdit = (u) => { setForm({ username: u.username, email: u.email, password: '', role: u.role, status: u.status }); setFormError(null); setModal({ mode: 'edit', data: u }); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setFormError(null);
    try {
      if (modal.mode === 'create') {
        await registerUser(form);
        setToast({ message: `User "${form.username}" created.`, type: 'success' });
      } else {
        await updateUser(modal.data.id, { username: form.username, email: form.email, role: form.role, status: form.status });
        setToast({ message: `User "${form.username}" updated.`, type: 'success' });
      }
      setModal(null);
      load();
    } catch (err) {
      setFormError(err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (u) => {
    try {
      if (u.status === 'ACTIVE') await deactivateUser(u.id);
      else await activateUser(u.id);
      setToast({ message: `User "${u.username}" ${u.status === 'ACTIVE' ? 'deactivated' : 'activated'}.`, type: 'success' });
      load();
    } catch (err) {
      setToast({ message: err.message || 'Status change failed.', type: 'error' });
    }
  };

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <div className={styles.pageHeader}>
        <div className={styles.pageHeaderLeft}>
          <div className={styles.pageIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.83-4" /></svg>
          </div>
          <div>
            <h1 className={styles.pageTitle}>User Management</h1>
            <p className={styles.pageBreadcrumb}>Create and manage accounts &amp; roles</p>
          </div>
        </div>
        <button className={styles.primaryBtn} onClick={openCreate}>
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
          New User
        </button>
      </div>

      <div className={styles.card}>
        {loading ? (
          <div className={styles.loadingState}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
        ) : error ? (
          <div className={styles.emptyRow}>{error}</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Last Login</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className={styles.nameCell}>{u.username}{u.id === me?.id && <span className={styles.youTag}>you</span>}</td>
                    <td className={styles.muted}>{u.email}</td>
                    <td><span className={styles.roleChip}>{u.role}</span></td>
                    <td><StatusBadge status={u.status} /></td>
                    <td className={styles.muted}>{fmt(u.lastLogin)}</td>
                    <td>
                      <div className={styles.actions}>
                        <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => openEdit(u)} title="Edit">Edit</button>
                        <button
                          className={`${styles.actionBtn} ${u.status === 'ACTIVE' ? styles.deactivateBtn : styles.activateBtn}`}
                          onClick={() => toggleStatus(u)}
                          disabled={u.id === me?.id}
                          title={u.id === me?.id ? 'You cannot change your own status' : ''}
                        >
                          {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
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

      {modal && (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={() => setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{modal.mode === 'create' ? 'New User' : `Edit ${modal.data.username}`}</h3>
            <form className={styles.form} onSubmit={submit}>
              {formError && <div className={styles.formError}>{formError}</div>}
              <div className={styles.field}>
                <label className={styles.label}>Username</label>
                <input className={styles.input} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Email</label>
                <input className={styles.input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </div>
              {modal.mode === 'create' && (
                <div className={styles.field}>
                  <label className={styles.label}>Password</label>
                  <input className={styles.input} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                  <span className={styles.hint}>Min 8 chars, with upper, lower &amp; number.</span>
                </div>
              )}
              <div className={styles.row}>
                <div className={styles.field}>
                  <label className={styles.label}>Role</label>
                  <select className={styles.input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>Status</label>
                  <select className={styles.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)} disabled={submitting}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={submitting}>{submitting ? 'Saving…' : modal.mode === 'create' ? 'Create User' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default UserManagement;
