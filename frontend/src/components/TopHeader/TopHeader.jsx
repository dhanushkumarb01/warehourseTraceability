/**
 * TopHeader — global application header.
 *
 * Presentation/UX only: sidebar toggle, breadcrumb + page title, a page-jump
 * search (⌘K / Ctrl+K), SAP status for authorised roles, a notification bell
 * fed by the existing security-alert summary, the theme toggle and the user
 * menu (with sign-out). No business logic — it reuses the auth context and
 * existing read-only services.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { GROUPS } from '../../config/roles';
import { NAV_SECTIONS, ROLE_LABELS, resolveRoute } from '../../config/navigation';
import { fetchStatus } from '../../services/sapService';
import { fetchAlertSummary } from '../../services/surveillanceService';
import { IconButton, Tooltip } from '../ui';
import { Icons } from '../ui/icons';
import { useDismiss } from '../ui/hooks';
import styles from './TopHeader.module.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');

function PageSearch({ items, onNavigate, mobileOpen, onMobileClose }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  useDismiss(wrapRef, open, () => setOpen(false));

  // ⌘K / Ctrl+K focuses the search from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { if (mobileOpen) inputRef.current?.focus(); }, [mobileOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.term} ${i.keywords} ${i.section}`.toLowerCase().includes(q));
  }, [items, query]);

  const go = (item) => {
    onNavigate(item.to);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    onMobileClose?.();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]); }
    if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); onMobileClose?.(); }
  };

  return (
    <div className={`${styles.search} ${mobileOpen ? styles.searchMobileOpen : ''}`} ref={wrapRef}>
      {Icons.search}
      <input
        ref={inputRef}
        className={styles.searchInput}
        placeholder="Jump to a page…"
        aria-label="Jump to a page"
        role="combobox"
        aria-expanded={open}
        aria-controls="page-search-list"
        aria-autocomplete="list"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <kbd className={styles.kbd}>{isMac ? '⌘' : 'Ctrl'} K</kbd>
      {open && (
        <ul id="page-search-list" className={styles.searchPop} role="listbox">
          {results.length === 0 && <li className={styles.searchEmpty}>No page matches “{query}”.</li>}
          {results.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                className={`${styles.searchItem} ${i === active ? styles.searchItemActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
              >
                <span className={styles.searchItemIcon}>{item.icon}</span>
                <span className={styles.searchItemText}>
                  <span className={styles.searchItemLabel}>{item.label}</span>
                  <span className={styles.searchItemMeta}>{item.section} · {item.term}</span>
                </span>
                {Icons.arrowRight}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TopHeader({ collapsed, onToggle }) {
  const { user, can, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sap, setSap] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  useDismiss(menuRef, menuOpen, () => setMenuOpen(false));
  useDismiss(notifRef, notifOpen, () => setNotifOpen(false));

  const canSeeSap = can(GROUPS.AUDIT_VIEW);
  const canSeeAlerts = can(GROUPS.SURVEILLANCE_VIEW);

  const route = resolveRoute(location.pathname);
  const title = route.detail || route.item?.label || 'Control center';

  const searchItems = useMemo(
    () => NAV_SECTIONS.flatMap((s) => s.items.filter((i) => can(i.roles)).map((i) => ({ ...i, section: s.label }))),
    [can],
  );

  // Live SAP indicator for authorized roles (read-only, fail-quiet).
  useEffect(() => {
    if (!canSeeSap) return undefined;
    let cancelled = false;
    const load = () => fetchStatus().then((s) => { if (!cancelled) setSap(s); }).catch(() => { if (!cancelled) setSap({ connected: false }); });
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [canSeeSap]);

  // Security-alert count for the bell (read-only, fail-quiet).
  useEffect(() => {
    if (!canSeeAlerts) return undefined;
    let cancelled = false;
    const load = () => fetchAlertSummary().then((s) => { if (!cancelled) setAlerts(s); }).catch(() => { if (!cancelled) setAlerts(null); });
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [canSeeAlerts]);

  const handleLogout = async () => { await logout(); navigate('/login', { replace: true }); };
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();
  const openAlerts = alerts?.active || 0;
  const critical = alerts?.severity?.CRITICAL || 0;

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <IconButton
          icon={Icons.sidebar}
          label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          onClick={onToggle}
          className={styles.desktopOnly}
        />
        <IconButton icon={Icons.menu} label="Open navigation" onClick={onToggle} className={styles.mobileOnly} tooltip={false} />
        <div className={styles.titleWrap}>
          <nav className={styles.crumbs} aria-label="Breadcrumb">
            <span>{route.section || 'Home'}</span>
            {route.detail && route.item && (
              <>
                {Icons.chevronRight}
                <Link to={route.item.to} className={styles.crumbLink}>{route.item.label}</Link>
              </>
            )}
          </nav>
          <h2 className={styles.title}>
            {route.detail && route.item && (
              <Tooltip content={`Back to ${route.item.label}`} side="bottom">
                <Link to={route.item.to} className={styles.backBtn} aria-label={`Back to ${route.item.label}`}>{Icons.arrowLeft}</Link>
              </Tooltip>
            )}
            {title}
          </h2>
        </div>
      </div>

      <PageSearch items={searchItems} onNavigate={navigate} mobileOpen={searchOpen} onMobileClose={() => setSearchOpen(false)} />

      <div className={styles.right}>
        <IconButton icon={Icons.search} label="Jump to a page" onClick={() => setSearchOpen((o) => !o)} className={styles.mobileOnly} />

        {canSeeSap && (
          <Tooltip content={sap ? (sap.connected ? 'SAP is connected and syncing' : 'SAP is not reachable — data may be out of date') : 'Checking SAP connection…'} side="bottom">
            <button
              className={`${styles.statusChip} ${sap ? (sap.connected ? styles.sapOk : styles.sapDown) : styles.sapUnknown}`}
              onClick={() => navigate('/sap-integration')}
            >
              <span className={styles.dot} />
              <span className={styles.chipText}>SAP {sap ? (sap.connected ? 'connected' : 'offline') : '…'}</span>
            </button>
          </Tooltip>
        )}

        {/* Notifications */}
        {canSeeAlerts && (
          <div className={styles.popWrap} ref={notifRef}>
            <IconButton
              icon={Icons.bell}
              label={openAlerts ? `Notifications: ${openAlerts} open alerts` : 'Notifications'}
              badge={openAlerts}
              onClick={() => setNotifOpen((o) => !o)}
              aria-expanded={notifOpen}
              tooltip={!notifOpen}
            />
            {notifOpen && (
              <div className={styles.pop}>
                <div className={styles.popHead}>
                  <span>Notifications</span>
                  {openAlerts > 0 && <span className={styles.popCount}>{openAlerts} open</span>}
                </div>
                {openAlerts === 0 ? (
                  <div className={styles.popEmpty}>
                    <span className={styles.popEmptyIcon}>{Icons.checkCircle}</span>
                    <span>You’re all caught up. No open security alerts.</span>
                  </div>
                ) : (
                  <div className={styles.popList}>
                    {critical > 0 && (
                      <button className={`${styles.popItem} ${styles.popItemDanger}`} onClick={() => { setNotifOpen(false); navigate('/surveillance/alerts'); }}>
                        <span className={styles.popItemIcon}>{Icons.error}</span>
                        <span><strong>{critical} critical {critical === 1 ? 'alert' : 'alerts'}</strong><br />Needs someone to check right away.</span>
                      </button>
                    )}
                    <button className={styles.popItem} onClick={() => { setNotifOpen(false); navigate('/surveillance/alerts'); }}>
                      <span className={styles.popItemIcon}>{Icons.bell}</span>
                      <span><strong>{openAlerts} open security {openAlerts === 1 ? 'alert' : 'alerts'}</strong><br />{alerts?.today || 0} raised today.</span>
                    </button>
                  </div>
                )}
                <Link to="/surveillance/alerts" className={styles.popFoot} onClick={() => setNotifOpen(false)}>
                  View all alerts {Icons.arrowRight}
                </Link>
              </div>
            )}
          </div>
        )}

        <IconButton
          icon={theme === 'dark' ? Icons.sun : Icons.moon}
          label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        />

        <div className={styles.divider} />

        {/* User menu */}
        <div className={styles.popWrap} ref={menuRef}>
          <button className={styles.userBtn} onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Account menu">
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.userMeta}>
              <span className={styles.userName}>{user?.username}</span>
              <span className={styles.userRole}>{ROLE_LABELS[user?.role] || user?.role}</span>
            </span>
            <span className={styles.caret}>{Icons.chevronDown}</span>
          </button>
          {menuOpen && (
            <div className={styles.pop} role="menu">
              <div className={styles.menuId}>
                <span className={styles.avatarLg}>{initials}</span>
                <div className={styles.menuIdText}>
                  <div className={styles.menuName}>{user?.username}</div>
                  <div className={styles.menuEmail}>{user?.email}</div>
                  <span className={styles.roleBadge}>{ROLE_LABELS[user?.role] || user?.role}</span>
                </div>
              </div>
              <button className={styles.menuItem} onClick={toggleTheme} role="menuitem">
                {theme === 'dark' ? Icons.sun : Icons.moon}
                {theme === 'dark' ? 'Light theme' : 'Dark theme'}
              </button>
              <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={handleLogout} role="menuitem">
                {Icons.logout}
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
