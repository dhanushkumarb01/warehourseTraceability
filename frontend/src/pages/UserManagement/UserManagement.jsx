/**
 * UserManagement Page ("Users", ADMIN)
 *
 * List users, create new accounts, edit role/status/identity, and
 * activate/deactivate (with a plain-language confirmation). The backend
 * enforces the same rules (last-admin guard, no self-deactivation) — this UI
 * surfaces those errors via the toast.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ROLES } from '../../config/roles';
import { ROLE_LABELS } from '../../config/navigation';
import { useAuth } from '../../context/AuthContext';
import {
  fetchUsers, registerUser, updateUser, activateUser, deactivateUser,
} from '../../services/authApi';
import StatusBadge from '../../components/StatusBadge/StatusBadge';
import Toast from '../../components/Toast/Toast';
import ConfirmDialog from '../../components/ConfirmDialog/ConfirmDialog';
import {
  PageHeader, StatCard, Card, Button, IconButton, SearchInput, DataTable, LoadingRows, ErrorState, EmptyState,
  Modal, Field, FormAlert, Tag, StatusChip,
} from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { uiStyles } from '../../components/ui/styles';
import styles from './UserManagement.module.css';

const ROLE_OPTIONS = Object.values(ROLES);
const ROLE_HELP = {
  ADMIN: 'Full access, including users and settings',
  SUPERVISOR: 'Runs the yard: approves trucks, chooses storage spots',
  OPERATOR: 'Day-to-day work: receiving, storing, gate scans',
  MANAGER: 'Read-only reports, activity log and SAP',
};
const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

const empty = { username: '', email: '', password: '', role: 'OPERATOR', status: 'ACTIVE' };

function UserManagement() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState({ message: '', type: '' });
  const [search, setSearch] = useState('');

  const [modal, setModal] = useState(null); // { mode:'create'|'edit', data }
  const [form, setForm] = useState(empty);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [showPwd, setShowPwd] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setUsers(await fetchUsers()); }
    catch (err) { setError(err); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(empty); setFormError(null); setShowPwd(false); setModal({ mode: 'create' }); };
  const openEdit = (u) => { setForm({ username: u.username, email: u.email, password: '', role: u.role, status: u.status }); setFormError(null); setModal({ mode: 'edit', data: u }); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setFormError(null);
    try {
      if (modal.mode === 'create') {
        await registerUser(form);
        setToast({ message: `Account for ${form.username} created. They can sign in now.`, type: 'success' });
      } else {
        await updateUser(modal.data.id, { username: form.username, email: form.email, role: form.role, status: form.status });
        setToast({ message: `${form.username}’s account updated.`, type: 'success' });
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
    setStatusBusy(true);
    try {
      if (u.status === 'ACTIVE') await deactivateUser(u.id);
      else await activateUser(u.id);
      setToast({ message: u.status === 'ACTIVE' ? `${u.username} can no longer sign in.` : `${u.username} can sign in again.`, type: 'success' });
      setStatusTarget(null);
      load();
    } catch (err) {
      setToast({ message: err.message || 'Status change failed.', type: 'error' });
    } finally {
      setStatusBusy(false);
    }
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter((u) => `${u.username} ${u.email} ${u.role}`.toLowerCase().includes(q)) : users;
  }, [users, search]);
  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === 'ACTIVE').length,
    admins: users.filter((u) => u.role === 'ADMIN').length,
    never: users.filter((u) => !u.lastLogin).length,
  }), [users]);

  const setF = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const pwdOk = form.password.length >= 8 && /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) && /\d/.test(form.password);

  return (
    <div className={styles.page}>
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: '' })} />

      <PageHeader
        icon={Icons.users}
        title="Users"
        term="User management"
        subtitle="Who can sign in, and what each person is allowed to do."
        actions={(
          <>
            <IconButton icon={Icons.refresh} label="Refresh" variant="outline" onClick={load} disabled={loading} />
            <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Add user</Button>
          </>
        )}
      />

      <section className={styles.kpis} aria-label="User summary">
        <StatCard icon={Icons.users} label="Accounts" value={loading ? null : counts.total} loading={loading} tone="info" hint="All user accounts" />
        <StatCard icon={Icons.checkCircle} label="Can sign in" value={loading ? null : counts.active} loading={loading} tone="success" hint={`${counts.total - counts.active} turned off`} />
        <StatCard icon={Icons.shield} label="Administrators" value={loading ? null : counts.admins} loading={loading} tone="brand" hint="Full access" help="Keep at least two administrators so nobody gets locked out." />
        <StatCard icon={Icons.clock} label="Never signed in" value={loading ? null : counts.never} loading={loading} tone={counts.never > 0 ? 'warning' : 'neutral'} hint="New or unused accounts" />
      </section>

      <Card
        icon={Icons.list}
        title="All users"
        padded={false}
        actions={<SearchInput className={styles.search} value={search} onChange={setSearch} placeholder="Search name, email or role" />}
      >
        {loading ? <LoadingRows rows={5} /> : error ? (
          <ErrorState title="We couldn’t load the users" error={error} onRetry={load} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={search ? Icons.search : Icons.users}
            title={search ? 'Nobody matches your search' : 'No users yet'}
            message={search ? 'Try a username or email address.' : 'Add the first account.'}
            action={search ? <Button onClick={() => setSearch('')}>Clear search</Button> : <Button variant="primary" icon={Icons.plus} onClick={openCreate}>Add user</Button>}
          />
        ) : (
          <DataTable
            caption="Users"
            rows={rows}
            defaultSort={{ key: 'username', dir: 'asc' }}
            columns={[
              {
                key: 'username', header: 'User', primary: true,
                render: (u) => (
                  <span className={styles.userCell}>
                    <span className={styles.avatar} aria-hidden="true">{u.username.slice(0, 2).toUpperCase()}</span>
                    <span className={styles.userText}>
                      <span className={uiStyles.strong}>{u.username}{u.id === me?.id && <Tag tone="brand">You</Tag>}</span>
                      <span className={uiStyles.sub}>{u.email}</span>
                    </span>
                  </span>
                ),
              },
              { key: 'role', header: 'Role', render: (u) => <StatusChip tone={u.role === 'ADMIN' ? 'brand' : 'neutral'} icon={u.role === 'ADMIN' ? Icons.shield : Icons.user} size="sm" title={ROLE_HELP[u.role]}>{ROLE_LABELS[u.role] || u.role}</StatusChip> },
              { key: 'status', header: 'Status', render: (u) => <StatusBadge status={u.status} size="sm" /> },
              { key: 'lastLogin', header: 'Last sign-in', sortValue: (u) => (u.lastLogin ? new Date(u.lastLogin).getTime() : 0), render: (u) => <span className={uiStyles.muted}>{fmt(u.lastLogin)}</span> },
            ]}
            actions={(u) => [
              { label: 'Edit account', icon: Icons.edit, onClick: () => openEdit(u) },
              u.status === 'ACTIVE'
                ? { label: 'Turn off sign-in', icon: Icons.ban, onClick: () => setStatusTarget(u), danger: true, disabled: u.id === me?.id }
                : { label: 'Turn sign-in back on', icon: Icons.checkCircle, onClick: () => toggleStatus(u) },
            ]}
          />
        )}
      </Card>

      <Modal
        isOpen={Boolean(modal)}
        onClose={() => setModal(null)}
        busy={submitting}
        icon={Icons.user}
        title={modal?.mode === 'create' ? 'Add a user' : `Edit ${modal?.data?.username || ''}`}
        subtitle={modal?.mode === 'create' ? 'They can sign in as soon as the account is created.' : undefined}
        as="form"
        onSubmit={submit}
        footer={(
          <>
            <Button onClick={() => setModal(null)} disabled={submitting}>Cancel</Button>
            <Button type="submit" variant="primary" loading={submitting} disabled={!form.username || !form.email || (modal?.mode === 'create' && !pwdOk)}>
              {modal?.mode === 'create' ? 'Create account' : 'Save changes'}
            </Button>
          </>
        )}
      >
        {modal && (
          <div className={uiStyles.formSection}>
            <FormAlert>{formError}</FormAlert>
            <div className={uiStyles.formGrid}>
              <Field label="Username" required hint="Used to sign in">
                {(p) => <input {...p} value={form.username} onChange={setF('username')} autoComplete="off" placeholder="e.g. r.kumar" />}
              </Field>
              <Field label="Email" required>
                {(p) => <input {...p} type="email" value={form.email} onChange={setF('email')} placeholder="name@company.com" />}
              </Field>
              {modal.mode === 'create' && (
                <Field
                  label="Temporary password"
                  required
                  className={uiStyles.span2}
                  hint={form.password && !pwdOk ? undefined : 'At least 8 characters, with a capital letter, a small letter and a number.'}
                  error={form.password && !pwdOk ? 'Needs 8+ characters with a capital letter, a small letter and a number.' : undefined}
                >
                  {(p) => (
                    <div className={styles.pwdWrap}>
                      <input {...p} type={showPwd ? 'text' : 'password'} value={form.password} onChange={setF('password')} autoComplete="new-password" />
                      <button type="button" className={styles.pwdToggle} onClick={() => setShowPwd((v) => !v)} aria-label={showPwd ? 'Hide password' : 'Show password'} aria-pressed={showPwd}>
                        {showPwd ? Icons.eyeOff : Icons.eye}
                      </button>
                    </div>
                  )}
                </Field>
              )}
              <Field label="Role" hint={ROLE_HELP[form.role]}>
                {(p) => (
                  <select {...p} value={form.role} onChange={setF('role')}>
                    {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABELS[r] || r}</option>)}
                  </select>
                )}
              </Field>
              <Field label="Can sign in?">
                {(p) => (
                  <select {...p} value={form.status} onChange={setF('status')}>
                    <option value="ACTIVE">Yes — active</option>
                    <option value="INACTIVE">No — turned off</option>
                  </select>
                )}
              </Field>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(statusTarget)}
        tone="warning"
        title={`Turn off ${statusTarget?.username}’s sign-in?`}
        message={`${statusTarget?.username} won’t be able to sign in until an administrator turns it back on.`}
        details={['Nothing they did is deleted — their history stays in the activity log.', 'You can turn it back on at any time.']}
        confirmLabel="Turn off sign-in"
        loadingLabel="Turning off…"
        isProcessing={statusBusy}
        onConfirm={() => toggleStatus(statusTarget)}
        onCancel={() => { if (!statusBusy) setStatusTarget(null); }}
      />
    </div>
  );
}

export default UserManagement;
