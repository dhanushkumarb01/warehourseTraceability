/**
 * Sidebar Navigation Component
 *
 * Left-hand navigation, grouped under plain headings (Today / Yard / Security
 * / Admin). Items come from config/navigation and each carries a role group;
 * the sidebar renders only the items the signed-in user may use. Collapsed
 * mode shows icons only, with tooltips. A footer card shows the current user
 * and a sign-out control.
 */

import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { NAV_SECTIONS, ROLE_LABELS } from '../../config/navigation';
import { Tooltip, IconButton } from '../ui';
import { Icons } from '../ui/icons';
import styles from './Sidebar.module.css';

function Sidebar({ collapsed = false, open = false }) {
  const { user, can, logout } = useAuth();
  const navigate = useNavigate();

  const sections = NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((item) => can(item.roles)) }))
    .filter((s) => s.items.length > 0);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const renderItem = (item) => {
    const link = (
      <NavLink
        key={item.id}
        to={item.to}
        id={`nav-${item.id}`}
        aria-label={collapsed ? item.label : undefined}
        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
      >
        <span className={styles.navIcon}>{item.icon}</span>
        <span className={styles.navLabel}>{item.label}</span>
      </NavLink>
    );
    return collapsed
      ? <Tooltip key={item.id} content={item.label} side="right" className={styles.tipBlock}>{link}</Tooltip>
      : link;
  };

  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''} ${open ? styles.open : ''}`}>
      <div className={styles.brand}>
        <div className={styles.brandIcon}>{Icons.box}</div>
        <div className={styles.brandText}>
          <p className={styles.brandName}>SAIL Yard</p>
          <p className={styles.brandVersion}>Warehouse traceability</p>
        </div>
      </div>

      <nav className={styles.nav} aria-label="Main navigation">
        {sections.map((s) => (
          <div key={s.id} className={styles.group}>
            <p className={styles.navGroup}>{s.label}</p>
            {s.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* User card + sign out */}
      <div className={styles.userBox}>
        <span className={styles.avatar} aria-hidden="true">{initials}</span>
        <div className={styles.userMeta}>
          <span className={styles.userName}>{user?.username}</span>
          <span className={styles.userRole}>{ROLE_LABELS[user?.role] || user?.role}</span>
        </div>
        <IconButton
          icon={Icons.logout}
          label="Sign out"
          size="sm"
          onClick={handleLogout}
          tooltipSide={collapsed ? 'right' : 'top'}
          className={styles.logoutBtn}
        />
      </div>
    </aside>
  );
}

export default Sidebar;
