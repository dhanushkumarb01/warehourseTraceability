/**
 * Login Page — split-screen sign-in.
 *
 * Left: brand panel with an animated yard illustration and what the product
 * does, in plain words. Right: the sign-in card.
 *
 * Authentication behaviour is unchanged — it uses the same AuthContext.login
 * and identifier/password fields. "Remember me" only persists the last username
 * locally for convenience (no security/business logic change).
 */

import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Button, Field, IconButton } from '../../components/ui';
import { Icons } from '../../components/ui/icons';
import { friendlyError } from '../../utils/apiErrors';
import styles from './Login.module.css';

const REMEMBER_KEY = 'wt_remember_user';

const FEATURES = [
  { icon: Icons.map, t: 'See the whole yard at a glance', d: 'Which storage spots are free, full or closed — live.' },
  { icon: Icons.route, t: 'Follow every batch', d: 'From arrival to storage spot to the truck that takes it out.' },
  { icon: Icons.shieldCheck, t: 'Checked against SAP', d: 'Outgoing trucks and gate exits are verified automatically.' },
];

/** Login errors in plain words: wrong credentials vs. everything else. */
const loginError = (err) => {
  const status = err?.response?.status;
  if (status === 400 || status === 401) return 'That username or password isn’t right. Check them and try again.';
  if (status === 403) return 'This account is turned off. Ask your administrator to turn it back on.';
  if (status === 429) return 'Too many attempts. Wait a minute, then try again.';
  return friendlyError(err);
};

function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const remembered = (() => { try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; } })();
  const [identifier, setIdentifier] = useState(remembered);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [remember, setRemember] = useState(Boolean(remembered));
  const [error, setError] = useState(null);
  const [errKey, setErrKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || '/';
  if (!loading && isAuthenticated) return <Navigate to={from} replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(identifier.trim(), password);
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, identifier.trim());
        else localStorage.removeItem(REMEMBER_KEY);
      } catch { /* ignore */ }
      navigate(from, { replace: true });
    } catch (err) {
      setError(loginError(err));
      setErrKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const onPwdKey = (e) => setCapsOn(Boolean(e.getModifierState?.('CapsLock')));

  return (
    <div className={styles.page}>
      {/* ── Brand / visualization panel ─────────────────────────────── */}
      <aside className={styles.brandPanel}>
        <div className={styles.brandTop}>
          <div className={styles.brandLogo}>{Icons.box}</div>
          <div>
            <div className={styles.brandName}>SAIL Yard</div>
            <div className={styles.brandTag}>Warehouse traceability</div>
          </div>
        </div>

        <YardScene />

        <div className={styles.brandBody}>
          <h1 className={styles.brandHeadline}>Know where every batch is, from the gate in to the gate out.</h1>
          <ul className={styles.featureList}>
            {FEATURES.map((f) => (
              <li key={f.t} className={styles.feature}>
                <span className={styles.featureIcon}>{f.icon}</span>
                <span>
                  <span className={styles.featureT}>{f.t}</span>
                  <span className={styles.featureD}>{f.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.brandFooter}>© {new Date().getFullYear()} SAIL</div>
      </aside>

      {/* ── Sign-in panel ───────────────────────────────────────────── */}
      <main className={styles.formPanel}>
        <div className={styles.themeToggle}>
          <IconButton
            icon={theme === 'dark' ? Icons.sun : Icons.moon}
            label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
            variant="outline"
            tooltipSide="left"
          />
        </div>

        <div className={styles.card}>
          <div className={styles.mobileBrand}>
            <div className={styles.brandLogoSm}>{Icons.box}</div>
            <span>SAIL Yard</span>
          </div>

          <h2 className={styles.title}>Welcome back</h2>
          <p className={styles.subtitle}>Sign in to see today’s yard.</p>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {error && (
              <div key={errKey} className={styles.error} role="alert">
                {Icons.error}
                <span>{error}</span>
              </div>
            )}

            <Field label="Username or email">
              {(p) => (
                <input
                  {...p}
                  id="login-id"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                  placeholder="e.g. r.kumar"
                />
              )}
            </Field>

            <Field label="Password">
              {(p) => (
                <div className={styles.pwdWrap}>
                  <input
                    {...p}
                    id="login-pw"
                    className={`${p.className} ${styles.pwdInput}`}
                    type={showPwd ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={onPwdKey}
                    onKeyDown={onPwdKey}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className={styles.pwdToggle}
                    onClick={() => setShowPwd((s) => !s)}
                    aria-label={showPwd ? 'Hide password' : 'Show password'}
                    aria-pressed={showPwd}
                  >
                    {showPwd ? Icons.eyeOff : Icons.eye}
                    <span>{showPwd ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
              )}
            </Field>
            {capsOn && <p className={styles.caps} role="status">{Icons.warning}Caps Lock is on</p>}

            <label className={styles.remember}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Remember my username on this device</span>
            </label>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              loading={submitting}
              disabled={!identifier || !password}
              iconRight={!submitting && Icons.arrowRight}
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className={styles.footer}>
            {Icons.lock}
            <span>Don’t have an account, or forgot your password? Ask your administrator.</span>
          </p>
        </div>
      </main>
    </div>
  );
}

/** Animated yard illustration (pure SVG + CSS, colours from tokens). */
function YardScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <svg viewBox="0 0 520 300" className={styles.sceneSvg} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="login-route" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" className={styles.routeStopA} />
            <stop offset="50%" className={styles.routeStopB} />
            <stop offset="100%" className={styles.routeStopC} />
          </linearGradient>
        </defs>

        {/* network links */}
        <g className={styles.links}>
          <path d="M60 70 L250 40 L460 90" />
          <path d="M60 70 L150 180 L340 220" />
          <path d="M460 90 L340 220" />
          <path d="M250 40 L150 180" />
        </g>

        {/* nodes */}
        {[[60, 70], [250, 40], [460, 90], [150, 180], [340, 220]].map(([x, y], i) => (
          <g key={i} className={styles.node} style={{ animationDelay: `${i * 0.5}s` }}>
            <circle cx={x} cy={y} r="16" className={styles.nodeHalo} />
            <circle cx={x} cy={y} r="6" className={styles.nodeCore} />
          </g>
        ))}

        {/* travelling route highlight */}
        <path d="M60 70 L250 40 L460 90" stroke="url(#login-route)" strokeWidth="3" fill="none" className={styles.routeDash} />

        {/* moving truck along the route */}
        <g className={styles.truck}>
          <rect x="-18" y="-9" width="26" height="14" rx="2" className={styles.truckBody} />
          <rect x="8" y="-6" width="11" height="11" rx="2" className={styles.truckCab} />
          <circle cx="-10" cy="7" r="3.2" className={styles.truckWheel} />
          <circle cx="12" cy="7" r="3.2" className={styles.truckWheel} />
        </g>

        {/* storage spots grid: free / in use / full */}
        <g transform="translate(300 240)">
          {Array.from({ length: 12 }).map((_, i) => (
            <rect
              key={i}
              x={(i % 6) * 32}
              y={Math.floor(i / 6) * 26}
              width="26" height="20" rx="4"
              className={`${styles.bayCell} ${i % 5 === 0 ? styles.bayFull : i % 3 === 0 ? styles.bayFree : styles.bayPartial}`}
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default Login;
