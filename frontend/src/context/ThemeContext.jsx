/**
 * ThemeContext — dark / light appearance.
 *
 * index.html applies the initial theme before first paint (saved choice, else
 * prefers-color-scheme). This context mirrors it into React so the toggle and
 * theme-aware JS (Leaflet tiles and polygon colours) can react to changes.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'wt-theme';
const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {}, setTheme: () => {} });

const readInitial = () => {
  const attr = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'light' : 'dark';
};

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readInitial);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Follow the OS setting until the user picks a theme explicitly.
  useEffect(() => {
    let saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage blocked */ }
    if (saved || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e) => setThemeState(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* storage blocked */ }
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme, setTheme]);

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/** Reads a CSS custom property's current value (for libraries that need literal colours, e.g. Leaflet). */
export const cssVar = (name) =>
  typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(name).trim();
