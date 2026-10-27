/**
 * Shared UI primitives.
 *
 * Small, dependency-free building blocks so forms, modals, tables, KPI cards
 * and page chrome look and behave the same on every screen. Styling lives in
 * ui.module.css and only consumes the design tokens from index.css.
 */

import { Children, cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState } from 'react';
import styles from './ui.module.css';
import { Icons } from './icons';
import { statusMeta } from './status';
import { useCountUp, useDialogFocus, useDismiss, useNow, formatRelative } from './hooks';
import { friendlyError } from '../../utils/apiErrors';

const cx = (...parts) => parts.filter(Boolean).join(' ');
const TONE_ICON = { success: Icons.checkCircle, warning: Icons.warning, danger: Icons.error, info: Icons.info };

// ─── Button ───────────────────────────────────────────────────────────────────
/** Variants: primary · secondary · ghost · danger (outline) · dangerSolid · success. */
export function Button({
  variant = 'secondary', size, block = false, loading = false, icon = null, iconRight = null,
  type = 'button', className, children, disabled, ...rest
}) {
  return (
    <button
      type={type}
      className={cx(styles.btn, styles[variant], size === 'sm' && styles.sm, size === 'lg' && styles.lg, block && styles.block, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : icon}
      {children}
      {iconRight}
    </button>
  );
}

/** Square icon button; `label` is required and becomes the aria-label + tooltip. */
export function IconButton({ icon, label, variant = 'ghost', size, tooltip = true, badge, className, tooltipSide = 'bottom', ...rest }) {
  const btn = (
    <button
      type="button"
      aria-label={label}
      className={cx(styles.iconButton, styles[`icon_${variant}`], size === 'sm' && styles.iconButtonSm, className)}
      {...rest}
    >
      {icon}
      {badge ? <span className={styles.iconBadge} aria-hidden="true">{badge > 99 ? '99+' : badge}</span> : null}
    </button>
  );
  return tooltip ? <Tooltip content={label} side={tooltipSide}>{btn}</Tooltip> : btn;
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
/** Hover/focus tooltip. Wraps one focusable child and wires aria-describedby. */
export function Tooltip({ content, side = 'top', children, className }) {
  const id = useId();
  if (!content) return children;
  const child = Children.only(children);
  const trigger = isValidElement(child) ? cloneElement(child, { 'aria-describedby': id }) : child;
  return (
    <span className={cx(styles.tipWrap, className)}>
      {trigger}
      <span role="tooltip" id={id} className={cx(styles.tip, styles[`tip_${side}`])}>{content}</span>
    </span>
  );
}

/** Small "?" that explains a term or metric. */
export function HelpTip({ children, label = 'What does this mean?', side = 'top' }) {
  return (
    <Tooltip content={children} side={side}>
      <button type="button" className={styles.helpTip} aria-label={label}>{Icons.help}</button>
    </Tooltip>
  );
}

// ─── Form field ───────────────────────────────────────────────────────────────
/**
 * Label + control + hint/error, with ids wired for accessibility. The child
 * receives `id`, `aria-invalid` and `aria-describedby` via the render prop.
 */
export function Field({ label, required = false, optional = false, hint, help, error, className, children }) {
  const id = useId();
  const msgId = `${id}-msg`;
  const control = children({
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error || hint ? msgId : undefined,
    className: cx(styles.input, error && styles.inputInvalid),
  });
  return (
    <div className={cx(styles.field, className)}>
      {label && (
        <div className={styles.labelRow}>
          <label htmlFor={id} className={styles.label}>
            {label}
            {required && <span className={styles.required} aria-hidden="true">*</span>}
            {optional && <span className={styles.optional}>Optional</span>}
          </label>
          {help && <HelpTip>{help}</HelpTip>}
        </div>
      )}
      {control}
      {error
        ? <span id={msgId} className={styles.error} role="alert">{Icons.error}{error}</span>
        : hint && <span id={msgId} className={styles.hint}>{hint}</span>}
    </div>
  );
}
export { Field as FormField };

export function FormAlert({ children }) {
  if (!children) return null;
  return <div className={styles.formAlert} role="alert">{Icons.error}<span>{children}</span></div>;
}

/** Search box with icon and clear button. */
export function SearchInput({ value, onChange, placeholder = 'Search…', ariaLabel, className, ...rest }) {
  return (
    <div className={cx(styles.search, className)}>
      {Icons.search}
      <input
        type="search"
        className={styles.searchInput}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        {...rest}
      />
      {value && (
        <button type="button" className={styles.searchClear} onClick={() => onChange('')} aria-label="Clear search">
          {Icons.close}
        </button>
      )}
    </div>
  );
}

// ─── Modal / Drawer ───────────────────────────────────────────────────────────
/**
 * Accessible dialog: Escape closes (unless busy), focus moves into the dialog,
 * Tab is trapped inside, and focus returns to the opener on close.
 */
export function Modal({
  isOpen, onClose, title, subtitle, icon, tone, size = 'md', busy = false,
  footer, footerNote, children, as: As = 'div', onSubmit, header, className, bodyClassName,
}) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useDialogFocus(dialogRef, isOpen, () => { if (!busy) onClose?.(); });

  if (!isOpen) return null;

  const bodyAndFooter = (
    <>
      <div className={cx(styles.modalBody, bodyClassName)}>{children}</div>
      {footer && (
        <div className={styles.modalFooter}>
          {footerNote && <span className={styles.footerNote}>{footerNote}</span>}
          {footer}
        </div>
      )}
    </>
  );

  return (
    <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div
        ref={dialogRef}
        className={cx(styles.modal, styles[`modal_${size}`], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.modalHeader}>
          {icon && <div className={cx(styles.modalIcon, tone && styles[`modalIcon_${tone}`])}>{icon}</div>}
          <div className={styles.modalTitles}>
            <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
          <IconButton icon={Icons.close} label="Close" onClick={onClose} disabled={busy} tooltip={false} variant="outline" size="sm" />
        </div>
        {header}
        {As === 'form'
          ? <form onSubmit={onSubmit} noValidate className={styles.modalForm}>{bodyAndFooter}</form>
          : bodyAndFooter}
      </div>
    </div>
  );
}

/** Side panel dialog (slides from the right; bottom sheet on phones). */
export function Drawer({ isOpen, onClose, title, subtitle, icon, footer, children, width = 440 }) {
  const ref = useRef(null);
  const titleId = useId();
  useDialogFocus(ref, isOpen, onClose);
  if (!isOpen) return null;
  return (
    <div className={styles.drawerOverlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <aside ref={ref} className={styles.drawer} style={{ '--drawer-w': `${width}px` }} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className={styles.modalHeader}>
          {icon && <div className={styles.modalIcon}>{icon}</div>}
          <div className={styles.modalTitles}>
            <h2 id={titleId} className={styles.modalTitle}>{title}</h2>
            {subtitle && <p className={styles.modalSubtitle}>{subtitle}</p>}
          </div>
          <IconButton icon={Icons.close} label="Close" onClick={onClose} tooltip={false} variant="outline" size="sm" />
        </div>
        <div className={styles.modalBody}>{children}</div>
        {footer && <div className={styles.modalFooter}>{footer}</div>}
      </aside>
    </div>
  );
}

// ─── Menu ─────────────────────────────────────────────────────────────────────
/** Quick-action menu. items: [{ label, icon, onClick, danger, disabled, hidden }]. */
export function Menu({ items, label = 'More actions', icon = Icons.more, align = 'end', trigger }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);
  useDismiss(ref, open, () => setOpen(false));
  useEffect(() => { if (open) listRef.current?.querySelector('button')?.focus(); }, [open]);
  const visible = items.filter((i) => i && !i.hidden);
  if (visible.length === 0) return null;

  const onKeyDown = (e) => {
    const els = Array.from(listRef.current?.querySelectorAll('button:not([disabled])') || []);
    const idx = els.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(idx + 1) % els.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); els[(idx - 1 + els.length) % els.length]?.focus(); }
  };

  return (
    <div className={styles.menuWrap} ref={ref}>
      {trigger
        ? trigger({ open, toggle: () => setOpen((o) => !o) })
        : (
          <button
            type="button"
            className={cx(styles.iconButton, styles.icon_ghost, styles.iconButtonSm)}
            aria-label={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          >
            {icon}
          </button>
        )}
      {open && (
        <div
          ref={listRef}
          className={cx(styles.menu, align === 'start' && styles.menuStart)}
          role="menu"
          onKeyDown={onKeyDown}
          onClick={(e) => e.stopPropagation()}
        >
          {visible.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={cx(styles.menuItem, item.danger && styles.menuItemDanger)}
              onClick={() => { setOpen(false); item.onClick?.(); }}
            >
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page header ──────────────────────────────────────────────────────────────
/** Title row. `term` shows the original/technical name beside the plain one. */
export function PageHeader({ icon, title, subtitle, term, help, actions, meta }) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderMain}>
        {icon && <div className={styles.pageIcon}>{icon}</div>}
        <div className={styles.pageTitles}>
          <div className={styles.pageTitleRow}>
            <h1 className={styles.pageTitle}>{title}</h1>
            {term && <span className={styles.pageTerm} title="Technical name">{term}</span>}
            {help && <HelpTip>{help}</HelpTip>}
          </div>
          {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
        </div>
      </div>
      {(actions || meta) && (
        <div className={styles.pageActions}>
          {meta}
          {actions}
        </div>
      )}
    </header>
  );
}

/** "Live · updated 12s ago" indicator with optional refresh. */
export function LiveIndicator({ updatedAt, live = true, onRefresh, refreshing = false }) {
  const now = useNow(5000);
  return (
    <div className={styles.live} aria-live="polite">
      <span className={cx(styles.liveDot, !live && styles.liveDotOff)} aria-hidden="true" />
      <span className={styles.liveText}>
        {live ? 'Live' : 'Paused'}
        {updatedAt && <span className={styles.liveTime}> · updated {formatRelative(updatedAt, now)}</span>}
      </span>
      {onRefresh && (
        <IconButton
          icon={<span className={refreshing ? styles.spinning : undefined}>{Icons.refresh}</span>}
          label="Refresh now"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
        />
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
/** Surface panel. `title` should read as the question the card answers. */
export function Card({
  title, subtitle, help, icon, actions, footer, children, className, bodyClassName,
  padded = true, glass = false, as: As = 'section', ...rest
}) {
  const hasHeader = title || actions;
  return (
    <As className={cx(styles.card, glass && styles.cardGlass, className)} {...rest}>
      {hasHeader && (
        <div className={styles.cardHeader}>
          <div className={styles.cardHeading}>
            {icon && <span className={styles.cardIcon}>{icon}</span>}
            <div className={styles.cardTitles}>
              {title && (
                <h2 className={styles.cardTitle}>
                  {title}
                  {help && <HelpTip>{help}</HelpTip>}
                </h2>
              )}
              {subtitle && <p className={styles.cardMeta}>{subtitle}</p>}
            </div>
          </div>
          {actions && <div className={styles.cardActions}>{actions}</div>}
        </div>
      )}
      <div className={cx(padded && styles.cardBody, bodyClassName)}>{children}</div>
      {footer && <div className={styles.cardFooter}>{footer}</div>}
    </As>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────
/**
 * KPI card: big number + unit, plain label, one-line meaning, and a status chip
 * (icon + word) so the number is never read by colour alone.
 *
 * tone: neutral | brand | success | warning | danger | info | teal | orange
 * status: short word for the chip ("Good", "Busy", "Act now"); omit to hide.
 */
export function StatCard({
  icon, label, value, unit, hint, tone = 'neutral', status, statusIcon, trend, help,
  loading = false, onClick, progress, className,
}) {
  const shown = useCountUp(loading ? 0 : value);
  const As = onClick ? 'button' : 'div';
  return (
    <As
      type={onClick ? 'button' : undefined}
      className={cx(styles.stat, styles[`stat_${tone}`], onClick && styles.statClickable, className)}
      onClick={onClick}
    >
      <div className={styles.statTop}>
        <span className={styles.statLabel}>
          {icon && <span className={styles.statIcon}>{icon}</span>}
          {label}
          {help && <HelpTip>{help}</HelpTip>}
        </span>
        {status && !loading && (
          <StatusChip tone={tone === 'brand' || tone === 'neutral' ? 'neutral' : tone} icon={statusIcon} size="sm">{status}</StatusChip>
        )}
      </div>
      {loading ? (
        <>
          <span className={cx('wt-skeleton', styles.statSkelValue)} />
          <span className={cx('wt-skeleton', styles.statSkelHint)} />
        </>
      ) : (
        <>
          <div className={styles.statValueRow}>
            <span className={cx(styles.statValue, 'wt-num')}>{value === null || value === undefined ? '—' : shown}</span>
            {unit && value !== null && value !== undefined && <span className={styles.statUnit}>{unit}</span>}
          </div>
          {progress !== undefined && <ProgressBar value={progress} tone={tone} size="sm" label={`${label} progress`} />}
          {(hint || trend) && (
            <p className={styles.statHint}>
              {trend && (
                <span className={cx(styles.statTrend, styles[`trend_${trend.tone || 'neutral'}`])}>
                  {trend.direction === 'down' ? Icons.trendDown : Icons.trendUp}{trend.text}
                </span>
              )}
              {hint}
            </p>
          )}
        </>
      )}
    </As>
  );
}

// ─── Progress ─────────────────────────────────────────────────────────────────
export function ProgressBar({ value = 0, max = 100, tone = 'brand', size, label, showValue = false, className }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className={cx(styles.progressRow, className)}>
      <div
        className={cx(styles.progress, size === 'sm' && styles.progressSm)}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span className={cx(styles.progressFill, styles[`fill_${tone}`])} style={{ width: `${pct}%` }} />
      </div>
      {showValue && <span className={cx(styles.progressValue, 'wt-num')}>{Math.round(pct)}%</span>}
    </div>
  );
}

/** Ring gauge. Children render in the centre (defaults to the percentage). */
export function ProgressRing({ value = 0, size = 120, stroke = 12, tone = 'brand', label, children }) {
  const pct = Math.max(0, Math.min(100, value));
  const shown = useCountUp(Math.round(pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={styles.ring} style={{ width: size, height: size }} role="img" aria-label={label || `${Math.round(pct)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className={styles.ringTrack} strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          className={cx(styles.ringFill, styles[`ring_${tone}`])}
          strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className={styles.ringCenter}>{children ?? <span className={cx(styles.ringValue, 'wt-num')}>{shown}%</span>}</div>
    </div>
  );
}

// ─── Skeletons & states ───────────────────────────────────────────────────────
export function Skeleton({ width = '100%', height = 14, radius, className }) {
  return <span className={cx('wt-skeleton', styles.skel, className)} style={{ width, height, borderRadius: radius }} aria-hidden="true" />;
}

export function LoadingRows({ rows = 4 }) {
  return (
    <div className={styles.skeletonList} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.skeletonRow}>
          <Skeleton width={36} height={36} radius={10} />
          <div className={styles.skeletonLines}>
            <Skeleton width={`${55 - (i % 3) * 10}%`} height={12} />
            <Skeleton width={`${30 + (i % 2) * 12}%`} height={10} />
          </div>
          <Skeleton width={72} height={22} radius={999} />
        </div>
      ))}
    </div>
  );
}

export function StatePanel({ kind = 'empty', icon, title, message, action }) {
  return (
    <div className={cx(styles.state, kind === 'error' && styles.stateError)} role={kind === 'error' ? 'alert' : undefined}>
      <div className={styles.stateIcon}>{icon || (kind === 'error' ? Icons.error : Icons.box)}</div>
      {title && <p className={styles.stateTitle}>{title}</p>}
      {message && <p className={styles.stateMessage}>{message}</p>}
      {action && <div className={styles.stateAction}>{action}</div>}
    </div>
  );
}
export { StatePanel as EmptyState };

/** Error state with a plain explanation and Retry. `error` may be an Error or message. */
export function ErrorState({ title = 'This didn’t load', error, onRetry, compact = false }) {
  return (
    <StatePanel
      kind="error"
      title={title}
      message={friendlyError(error)}
      action={onRetry && <Button variant="secondary" size={compact ? 'sm' : undefined} icon={Icons.refresh} onClick={onRetry}>Try again</Button>}
    />
  );
}

// ─── Banner ───────────────────────────────────────────────────────────────────
export function Banner({ tone = 'info', title, children, className, action }) {
  return (
    <div className={cx(styles.banner, styles[`banner_${tone}`], className)} role={tone === 'danger' ? 'alert' : 'note'}>
      {TONE_ICON[tone] || Icons.info}
      <div className={styles.bannerBody}>
        {title && <span className={styles.bannerTitle}>{title} </span>}
        {children}
      </div>
      {action && <div className={styles.bannerAction}>{action}</div>}
    </div>
  );
}

// ─── Segmented control / Tabs ─────────────────────────────────────────────────
export function SegmentedControl({ options, value, onChange, ariaLabel, size, block = false }) {
  return (
    <div className={cx(styles.segmented, size === 'sm' && styles.segmentedSm, block && styles.segmentedBlock)} role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.title}
            className={cx(styles.segment, active && styles.segmentActive)}
            onClick={() => onChange(opt.value)}
          >
            {opt.icon}
            {opt.label}
            {opt.count !== undefined && <span className={cx(styles.segmentCount, 'wt-num')}>{opt.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Pill tabs. tabs: [{ value, label, icon, count, hint }]. Arrow keys move between tabs. */
export function Tabs({ tabs, value, onChange, ariaLabel }) {
  const onKeyDown = (e) => {
    const idx = tabs.findIndex((t) => t.value === value);
    if (e.key === 'ArrowRight') onChange(tabs[(idx + 1) % tabs.length].value);
    if (e.key === 'ArrowLeft') onChange(tabs[(idx - 1 + tabs.length) % tabs.length].value);
  };
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown}>
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            title={t.hint}
            className={cx(styles.tab, active && styles.tabActive)}
            onClick={() => onChange(t.value)}
          >
            {t.icon}{t.label}
            {t.count !== undefined && t.count !== null && <span className={cx(styles.tabCount, 'wt-num')}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Chips ────────────────────────────────────────────────────────────────────
/**
 * Status chip: icon + text + tone. tone: neutral | brand | success | warning |
 * danger | info | teal | orange. Pass `status` (a backend enum) to use the
 * shared vocabulary in status.js.
 */
export function StatusChip({ tone, icon, status, size, children, title }) {
  const meta = status ? statusMeta(status) : null;
  const t = tone || meta?.tone || 'neutral';
  const ic = icon === null ? null : (icon || (meta && Icons[meta.icon]) || TONE_ICON[t] || Icons.dot);
  return (
    <span className={cx(styles.tag, styles[`tag_${t}`], size === 'sm' && styles.tagSm)} title={title || meta?.hint}>
      {ic}{children ?? meta?.label}
    </span>
  );
}

/** Plain tag (no default icon). Kept for existing call sites. */
export function Tag({ tone = 'neutral', icon, children, title }) {
  return <span className={cx(styles.tag, styles[`tag_${tone}`])} title={title}>{icon}{children}</span>;
}

/** RAIL / ROAD badge; unrecorded shows a neutral placeholder. */
export function ArrivalTag({ mode }) {
  if (mode === 'RAIL') return <Tag tone="rail" icon={Icons.train}>Rail</Tag>;
  if (mode === 'ROAD') return <Tag tone="road" icon={Icons.truck}>Road</Tag>;
  return <Tag tone="neutral" icon={Icons.help}>Not recorded</Tag>;
}

// ─── Stepper / Timeline ───────────────────────────────────────────────────────
/** Horizontal step indicator. steps: [{ label, hint }], current: index. */
export function Stepper({ steps, current = 0 }) {
  return (
    <ol className={styles.stepper}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'upcoming';
        return (
          <li key={s.label} className={cx(styles.step, styles[`step_${state}`])} aria-current={state === 'current' ? 'step' : undefined}>
            <span className={styles.stepDot}>{state === 'done' ? Icons.check : i + 1}</span>
            <span className={styles.stepText}>
              <span className={styles.stepLabel}>{s.label}</span>
              {s.hint && <span className={styles.stepHint}>{s.hint}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Vertical timeline. items: [{ key, title, time, description, state, icon, meta }]
 * state: done | current | upcoming | error — shown with icon + label, not colour alone.
 */
export function Timeline({ items }) {
  const LABEL = { done: 'Done', current: 'Now', upcoming: 'Next', error: 'Problem' };
  return (
    <ol className={styles.timeline}>
      {items.map((it, i) => {
        const state = it.state || 'done';
        return (
          <li key={it.key ?? i} className={cx(styles.tlItem, styles[`tl_${state}`])}>
            <span className={styles.tlMarker} aria-hidden="true">
              {it.icon || (state === 'done' ? Icons.check : state === 'error' ? Icons.close : state === 'current' ? Icons.dot : Icons.circle)}
            </span>
            <div className={styles.tlBody}>
              <div className={styles.tlHead}>
                <span className={styles.tlTitle}>{it.title}</span>
                <span className={cx(styles.tlState, styles[`tlState_${state}`])}>{LABEL[state]}</span>
              </div>
              {(it.time || it.meta) && <div className={styles.tlTime}>{it.time}{it.meta && <> · {it.meta}</>}</div>}
              {it.description && <div className={styles.tlDesc}>{it.description}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Data table ───────────────────────────────────────────────────────────────
/**
 * Sortable table that becomes stacked cards under 768px.
 *
 * columns: [{ key, header, render(row), sortValue(row) | sortable:false, align,
 *             width, primary (card title on mobile), hideOnMobile, help }]
 * rowTone(row) → 'danger' | 'warning' | 'success' | undefined  (left accent)
 * actions(row) → Menu items for a quick-action menu, or a node.
 */
export function DataTable({
  columns, rows, rowKey = 'id', defaultSort, onRowClick, rowTone, actions,
  empty, caption, dense = false, className,
}) {
  const [sort, setSort] = useState(defaultSort || null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = col.sortValue || ((r) => r[col.key]);
    const dir = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((a, b) => {
      const va = get(a); const vb = get(b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === '') return 1;
      if (vb === null || vb === undefined || vb === '') return -1;
      return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), undefined, { numeric: true })) * dir;
    });
  }, [rows, sort, columns]);

  const toggleSort = (key) => setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const keyOf = (row) => (typeof rowKey === 'function' ? rowKey(row) : row[rowKey]);

  if (rows.length === 0 && empty) return empty;

  return (
    <div className={cx(styles.tableWrap, className)}>
      <table className={cx(styles.table, styles.dataTable, dense && styles.tableDense)}>
        {caption && <caption className="wt-sr-only">{caption}</caption>}
        <thead>
          <tr>
            {columns.map((c) => {
              const sortable = c.sortable !== false;
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  style={{ width: c.width, textAlign: c.align }}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button type="button" className={cx(styles.sortBtn, active && styles.sortActive)} onClick={() => toggleSort(c.key)}>
                      {c.header}
                      <span className={styles.sortIcon}>{active ? (sort.dir === 'asc' ? Icons.arrowUp : Icons.arrowDown) : Icons.sort}</span>
                    </button>
                  ) : c.header}
                  {c.help && <HelpTip>{c.help}</HelpTip>}
                </th>
              );
            })}
            {actions && <th style={{ width: 56 }}><span className="wt-sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const tone = rowTone?.(row);
            const acts = actions?.(row);
            return (
              <tr
                key={keyOf(row)}
                className={cx(onRowClick && styles.rowClickable, tone && styles[`row_${tone}`])}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row); } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    data-label={typeof c.header === 'string' ? c.header : undefined}
                    className={cx(c.primary && styles.cellPrimary, c.hideOnMobile && styles.cellHideMobile)}
                    style={{ textAlign: c.align }}
                  >
                    {c.render ? c.render(row) : (row[c.key] ?? '—')}
                  </td>
                ))}
                {actions && (
                  <td className={styles.cellActions} onClick={(e) => e.stopPropagation()}>
                    {Array.isArray(acts) ? <Menu items={acts} /> : acts}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Insight panel ────────────────────────────────────────────────────────────
/**
 * "Needs attention" list. items: [{ id, tone, icon, title, detail, action: { label, onClick } }]
 * Renders an all-clear state when empty.
 */
export function InsightList({ items, loading, emptyTitle = 'All clear', emptyMessage = 'Nothing needs your attention right now.' }) {
  if (loading) {
    return (
      <div className={styles.insightList}>
        {[0, 1, 2].map((i) => <Skeleton key={i} height={84} radius={14} />)}
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className={styles.insightClear}>
        <span className={styles.insightClearIcon}>{Icons.checkCircle}</span>
        <div>
          <p className={styles.insightTitle}>{emptyTitle}</p>
          <p className={styles.insightDetail}>{emptyMessage}</p>
        </div>
      </div>
    );
  }
  return (
    <ul className={styles.insightList}>
      {items.map((it) => (
        <li key={it.id} className={cx(styles.insight, styles[`insight_${it.tone || 'info'}`])}>
          <span className={styles.insightIcon}>{it.icon || TONE_ICON[it.tone] || Icons.info}</span>
          <div className={styles.insightText}>
            <p className={styles.insightTitle}>{it.title}</p>
            {it.detail && <p className={styles.insightDetail}>{it.detail}</p>}
            {it.action && (
              <button type="button" className={styles.insightAction} onClick={it.action.onClick}>
                {it.action.label}{Icons.arrowRight}
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Misc ─────────────────────────────────────────────────────────────────────
/** Label/value pair list for detail panels. items: [{ label, value, help }] */
export function DetailList({ items, columns = 2 }) {
  return (
    <dl className={styles.detailList} style={{ '--cols': columns }}>
      {items.filter(Boolean).map((it) => (
        <div key={it.label} className={styles.detailItem}>
          <dt className={styles.detailLabel}>{it.label}{it.help && <HelpTip>{it.help}</HelpTip>}</dt>
          <dd className={styles.detailValue}>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Small count badge, e.g. "3 filters". */
export function CountBadge({ count, children }) {
  return (
    <span className={styles.countBadge}>
      <span className={cx(styles.countBadgeNum, 'wt-num')}>{count}</span>{children}
    </span>
  );
}
