/**
 * Presentation hooks shared by the UI primitives and pages.
 */

import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animates a number from its previous value to `target` (ease-out). Non-numbers pass through. */
export function useCountUp(target, duration = 600) {
  const isNum = typeof target === 'number' && Number.isFinite(target);
  const [display, setDisplay] = useState(isNum ? target : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (!isNum) return undefined;
    if (prefersReducedMotion()) { setDisplay(target); fromRef.current = target; return undefined; }
    const from = fromRef.current;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - p) ** 3;
      setDisplay(from + (target - from) * eased);
      if (p < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, isNum]);

  if (!isNum) return target;
  return Number.isInteger(target) ? Math.round(display) : Math.round(display * 10) / 10;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog behaviour: moves focus inside on open, traps Tab within the node,
 * Escape calls onEscape, and focus returns to the opener on close.
 */
export function useDialogFocus(ref, active, onEscape) {
  const escRef = useRef(onEscape);
  useEffect(() => { escRef.current = onEscape; });

  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;
    const node = ref.current;
    const first = node?.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      || node?.querySelector(FOCUSABLE);
    (first || node)?.focus();

    const onKey = (e) => {
      if (e.key === 'Escape') { escRef.current?.(); return; }
      if (e.key !== 'Tab' || !node) return;
      const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [active, ref]);
}

/** Re-renders every `intervalMs` so relative times ("12s ago") stay fresh. */
export function useNow(intervalMs = 10000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** "just now", "45s ago", "12 min ago", "3 h ago", or a date. */
export function formatRelative(date, now = Date.now()) {
  if (!date) return '—';
  const t = new Date(date).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Closes a popover on outside click / Escape. */
export function useDismiss(ref, open, onClose) {
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) closeRef.current(); };
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, ref]);
}
