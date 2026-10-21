/**
 * TopHeader — global application header.
 *
 * Presentation/UX only. Provides the enterprise top bar: sidebar toggle, a
 * contextual page title, a global search placeholder, live SAP + system health
 * indicators, a notifications placeholder, and the user identity menu (with
 * sign-out). No business logic — it reuses the existing auth context.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import { fetchStatus } from '../../services/sapService';
import styles from './TopHeader.module.css';

const TITLES = [
  ['/yard-map', 'Yard Overview'],
  ['/bays', 'Bay Management'],
  ['/materials', 'Materials'],
  ['/mappings', 'Material Mapping'],
  ['/dispatch', 'Dispatch Control'],
  ['/gate', 'Exit Gate Validation'],
  ['/users', 'User Management'],
  ['/audit', 'Audit & Compliance'],
  ['/sap-integration', 'SAP Integration'],
];

const pageTitle = (path) => {
  const hit = TITLES.find(([p]) => path === p || path.startsWith(p + '/'));
  return hit ? hit[1] : 'Control Center';
};

function TopHeader({ collapsed, onToggle }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [sap, setSap] = useState(null);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const canSeeSap = can(GROUPS.AUDIT_VIEW);

  // Live SAP indicator for authorized roles (read-only, fail-quiet).
  useEffect(() => {
    if (!canSeeSap) return;
    let cancelled = false;
    const load = () => fetchStatus().then((s) => { if (!cancelled) setSap(s); }).catch(() => { if (!cancelled) setSap({ connected: false }); });
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [canSeeSap]);

  // Close popovers on outside click.
  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <button className={styles.iconBtn} onClick={onToggle} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} title="Toggle navigation">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <div className={styles.titleWrap}>
          <span className={styles.eyebrow}>Operations</span>
          <h2 className={styles.title}>{pageTitle(location.pathname)}</h2>
        </div>
      </div>

      <div className={styles.search}>
        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
        <input className={styles.searchInput} placeholder="Search materials, lots, dispatches, bays…" aria-label="Global search" />
        <span className={styles.kbd}>⌘K</span>
      </div>

      <div className={styles.right}>
        {/* System health */}
        <div className={`${styles.statusChip} ${styles.healthy}`} title="System operational">
          <span className={styles.dot} />
          <span className={styles.chipText}>Operational</span>
        </div>

        {/* SAP status */}
        {canSeeSap && (
          <button
            className={`${styles.statusChip} ${sap ? (sap.connected ? styles.sapOk : styles.sapDown) : styles.sapUnknown}`}
            onClick={() => navigate('/sap-integration')}
            title="SAP integration status"
          >
            <span className={styles.dot} />
            <span className={styles.chipText}>SAP {sap ? (sap.connected ? 'Online' : 'Down') : '…'}</span>
          </button>
        )}

        {/* Notifications */}
        <div className={styles.popWrap} ref={notifRef}>
          <button className={styles.iconBtn} onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
            <span className={styles.notifDot} />
          </button>
          {notifOpen && (
            <div className={styles.pop}>
              <div className={styles.popHead}>Notifications</div>
              <div className={styles.popEmpty}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                <span>You're all caught up.</span>
              </div>
            </div>
          )}
        </div>

        <div className={styles.divider} />

        {/* User menu */}
        <div className={styles.popWrap} ref={menuRef}>
          <button className={styles.userBtn} onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.userMeta}>
              <span className={styles.userName}>{user?.username}</span>
              <span className={styles.userRole}>{user?.role}</span>
            </span>
            <svg className={styles.caret} viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" /></svg>
          </button>
          {menuOpen && (
            <div className={styles.pop} role="menu">
              <div className={styles.menuId}>
                <span className={styles.avatarLg}>{initials}</span>
                <div>
                  <div className={styles.menuName}>{user?.username}</div>
                  <div className={styles.menuEmail}>{user?.email}</div>
                  <span className={styles.roleBadge}>{user?.role}</span>
                </div>
              </div>
              <button className={styles.menuItem} onClick={handleLogout} role="menuitem">
                <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 2.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L15.586 11H7a1 1 0 110-2h8.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopHeader;
