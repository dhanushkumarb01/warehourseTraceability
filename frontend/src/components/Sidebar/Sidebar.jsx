/**
 * Sidebar Navigation Component
 *
 * Left-hand navigation. Items are data-driven and each carries an optional
 * `roles` group; the sidebar renders only the items the signed-in user may use,
 * so role-based navigation is automatic. A footer shows the current user and a
 * logout control.
 */

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { GROUPS } from '../../config/roles';
import styles from './Sidebar.module.css';

const NAV_ITEMS = [
  {
    id: 'yard-map', to: '/yard-map', label: 'Digital Yard Map', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>),
  },
  {
    id: 'bay-management', to: '/bays', label: 'Bay Management', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V12h6v9" /></svg>),
  },
  {
    id: 'materials', to: '/materials', label: 'Materials', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" /></svg>),
  },
  {
    id: 'mappings', to: '/mappings', label: 'Material Mapping', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M9 17H5V5h8v6m0 6h6v-6h-6m0-6l6 6" /></svg>),
  },
  {
    id: 'dispatch', to: '/dispatch', label: 'Dispatch', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6m0 0V9.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0015.5 6H13" /></svg>),
  },
  {
    id: 'gate', to: '/gate', label: 'Gate Validation', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 21V5a2 2 0 012-2h6m0 18V3m0 18h10M11 3h6a2 2 0 012 2v16M7 8h.01M7 12h.01" /></svg>),
  },
  {
    id: 'trucks', to: '/trucks', label: 'Truck Operations', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17a2 2 0 11-4 0 2 2 0 014 0zm10 0a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H3m10 11h6m0 0V9.5a1 1 0 00-.293-.707l-2.5-2.5A1 1 0 0015.5 6H13" /></svg>),
  },
  {
    id: 'rfid', to: '/rfid', label: 'RFID Infrastructure', roles: GROUPS.ANY,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>),
  },
  // ── Surveillance (Phase 11) ──────────────────────────────────────────────
  {
    id: 'cameras', to: '/surveillance/cameras', label: 'Camera Management', roles: GROUPS.ANY, group: 'Surveillance',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>),
  },
  {
    id: 'live-monitoring', to: '/surveillance/live', label: 'Live Monitoring', roles: GROUPS.ANY, group: 'Surveillance',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 6a2 2 0 00-2 2v8a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2M9 10l5 3-5 3v-6z" /></svg>),
  },
  {
    id: 'surveillance-alerts', to: '/surveillance/alerts', label: 'Alerts', roles: GROUPS.ANY, group: 'Surveillance',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>),
  },
  {
    id: 'face-registry', to: '/surveillance/faces', label: 'Face Registry', roles: GROUPS.ANY, group: 'Surveillance',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 14a4 4 0 100-8 4 4 0 000 8z" /><path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2" /></svg>),
  },
  {
    id: 'surveillance-analytics', label: 'Analytics', roles: GROUPS.ANY, group: 'Surveillance', soon: true,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>),
  },
  {
    id: 'rule-config', label: 'Rule Configuration', roles: GROUPS.ANY, group: 'Surveillance', soon: true,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>),
  },
  {
    id: 'ai-models', label: 'AI Models', roles: GROUPS.ANY, group: 'Surveillance', soon: true,
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 7h10v10H7V7zm3 3h4v4h-4v-4z" /></svg>),
  },
  {
    id: 'users', to: '/users', label: 'User Management', roles: GROUPS.USER_ADMIN, group: 'Administration',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6 0a3 3 0 10-2.83-4" /></svg>),
  },
  {
    id: 'audit', to: '/audit', label: 'Audit Logs', roles: GROUPS.AUDIT_VIEW, group: 'Administration',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>),
  },
  {
    id: 'sap', to: '/sap-integration', label: 'SAP Integration', roles: GROUPS.AUDIT_VIEW, group: 'Administration',
    icon: (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3V7M4 7c0-2 1.5-3 4-3h8c2.5 0 4 1 4 3M4 7c0 2 1.5 3 4 3h8c2.5 0 4-1 4-3M9 13h6" /></svg>),
  },
];

function Sidebar({ collapsed = false, open = false }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  const visible = NAV_ITEMS.filter((item) => can(item.roles));
  const yardItems = visible.filter((i) => i.group !== 'Administration' && i.group !== 'Surveillance');
  const surveillanceItems = visible.filter((i) => i.group === 'Surveillance');
  const adminItems = visible.filter((i) => i.group === 'Administration');

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const renderItem = (item) => {
    if (item.soon) {
      return (
        <span
          key={item.id}
          id={`nav-${item.id}`}
          title={`${item.label} — coming soon`}
          className={`${styles.navItem} ${styles.navItemSoon}`}
          aria-disabled="true"
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navLabel}>{item.label}</span>
          <span className={styles.soonBadge}>Soon</span>
        </span>
      );
    }
    return (
      <NavLink
        key={item.id}
        to={item.to}
        id={`nav-${item.id}`}
        title={item.label}
        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
      >
        <span className={styles.navIcon}>{item.icon}</span>
        <span className={styles.navLabel}>{item.label}</span>
      </NavLink>
    );
  };

  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${open ? styles.open : ''}`}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" /></svg>
        </div>
        <div>
          <p className={styles.brandName}>SAIL</p>
          <p className={styles.brandVersion}>Warehouse Traceability</p>
        </div>
      </div>

      <div className={styles.divider} />

      <nav className={styles.nav} aria-label="Main navigation">
        <p className={styles.navGroup}>Operations</p>
        {yardItems.map(renderItem)}
        {surveillanceItems.length > 0 && (
          <>
            <p className={styles.navGroup}>Surveillance</p>
            {surveillanceItems.map(renderItem)}
          </>
        )}
        {adminItems.length > 0 && (
          <>
            <p className={styles.navGroup}>Administration</p>
            {adminItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className={styles.spacer} />

      {/* User + logout */}
      <div className={styles.userBox}>
        <div className={styles.userInfo}>
          <span className={styles.avatar}>{initials}</span>
          <div className={styles.userMeta}>
            <span className={styles.userName}>{user?.username}</span>
            <span className={styles.userRole}>{user?.role}</span>
          </div>
        </div>
        <button className={styles.logoutBtn} onClick={handleLogout} title="Log out">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.293 2.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L12.586 11H7a1 1 0 110-2h5.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
          Log out
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
