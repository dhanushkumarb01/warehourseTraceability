/**
 * Login Page — enterprise split-screen experience.
 *
 * Left: branded "control tower" panel with an animated supply-chain / yard
 * visualization and product highlights. Right: the sign-in card.
 *
 * Authentication behaviour is unchanged — it uses the same AuthContext.login
 * and identifier/password fields. "Remember me" only persists the last username
 * locally for convenience (no security/business logic change).
 */

import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './Login.module.css';

const REMEMBER_KEY = 'wt_remember_user';

const FEATURES = [
  { t: 'End-to-end traceability', d: 'Material → lot → bay → dispatch → gate exit, fully auditable.' },
  { t: 'Live yard & inventory', d: 'Real-time occupancy across zones and bays.' },
  { t: 'SAP-validated operations', d: 'Dispatch & gate checks against the system of record.' },
];

function Login() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const remembered = (() => { try { return localStorage.getItem(REMEMBER_KEY) || ''; } catch { return ''; } })();
  const [identifier, setIdentifier] = useState(remembered);
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
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
      setError(err.message || 'Login failed. Please try again.');
      setErrKey((k) => k + 1);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      {/* ── Brand / visualization panel ─────────────────────────────── */}
      <aside className={styles.brandPanel}>
        <div className={styles.brandGlow} />
        <YardScene />

        <div className={styles.brandTop}>
          <div className={styles.brandLogo}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" /></svg>
          </div>
          <div>
            <div className={styles.brandName}>SAIL</div>
            <div className={styles.brandTag}>Warehouse Traceability Platform</div>
          </div>
        </div>

        <div className={styles.brandBody}>
          <h1 className={styles.brandHeadline}>Operational visibility for modern logistics.</h1>
          <p className={styles.brandSub}>
            A control tower for material tracking, dispatch, gate validation and SAP-synchronized
            inventory — from inbound to exit.
          </p>

          <ul className={styles.featureList}>
            {FEATURES.map((f) => (
              <li key={f.t} className={styles.feature}>
                <span className={styles.featureTick}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                </span>
                <span>
                  <span className={styles.featureT}>{f.t}</span>
                  <span className={styles.featureD}>{f.d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className={styles.brandFooter}>
          <span>© {new Date().getFullYear()} SAIL</span>
          <span className={styles.brandStatus}><span className={styles.statusDot} /> All systems operational</span>
        </div>
      </aside>

      {/* ── Sign-in panel ───────────────────────────────────────────── */}
      <main className={styles.formPanel}>
        <div className={styles.card}>
          <div className={styles.mobileBrand}>
            <div className={styles.brandLogoSm}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" /></svg>
            </div>
            <span>SAIL</span>
          </div>

          <h2 className={styles.title}>Welcome back</h2>
          <p className={styles.subtitle}>Sign in to your operations workspace.</p>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            {error && <div key={errKey} className={styles.error} role="alert">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a1 1 0 011 1v4a1 1 0 11-2 0V6a1 1 0 011-1zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" /></svg>
              {error}
            </div>}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-id">Username or Email</label>
              <input id="login-id" className={styles.input} value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoFocus required />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-pw">Password</label>
              <div className={styles.pwdWrap}>
                <input id="login-pw" className={styles.input} type={showPwd ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                <button type="button" className={styles.pwdToggle} onClick={() => setShowPwd((s) => !s)} tabIndex={-1} aria-label={showPwd ? 'Hide password' : 'Show password'}>
                  {showPwd
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88L3 3m6.88 6.88L21 21" /></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                </button>
              </div>
            </div>

            <div className={styles.row}>
              <label className={styles.remember}>
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Remember me</span>
              </label>
            </div>

            <button type="submit" className={styles.submit} disabled={submitting || !identifier || !password}>
              {submitting ? (<><span className={styles.spinner} /> Signing in…</>) : 'Sign In'}
            </button>
          </form>

          <p className={styles.footer}>Access is role-based. Contact your administrator for an account.</p>
        </div>
      </main>
    </div>
  );
}

/** Animated supply-chain / yard visualization (pure SVG + CSS). */
function YardScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <svg viewBox="0 0 520 420" className={styles.sceneSvg} xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="route" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
            <stop offset="50%" stopColor="#60a5fa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* network links */}
        <g stroke="rgba(148,197,255,0.25)" strokeWidth="1.5" fill="none">
          <path d="M70 90 L250 60 L430 120" />
          <path d="M70 90 L160 230 L330 300" />
          <path d="M430 120 L330 300" />
          <path d="M250 60 L160 230" />
        </g>

        {/* nodes */}
        {[[70, 90], [250, 60], [430, 120], [160, 230], [330, 300]].map(([x, y], i) => (
          <g key={i} className={styles.node} style={{ animationDelay: `${i * 0.5}s` }}>
            <circle cx={x} cy={y} r="16" fill="rgba(96,165,250,0.12)" />
            <circle cx={x} cy={y} r="6" fill="#93c5fd" />
          </g>
        ))}

        {/* travelling route highlight */}
        <path d="M70 90 L250 60 L430 120" stroke="url(#route)" strokeWidth="3" fill="none" className={styles.routeDash} />

        {/* moving truck along the route */}
        <g className={styles.truck}>
          <rect x="-18" y="-9" width="26" height="14" rx="2" fill="#e2e8f0" />
          <rect x="8" y="-6" width="11" height="11" rx="2" fill="#93c5fd" />
          <circle cx="-10" cy="7" r="3.2" fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.2" />
          <circle cx="12" cy="7" r="3.2" fill="#0f172a" stroke="#cbd5e1" strokeWidth="1.2" />
        </g>

        {/* yard bays grid */}
        <g transform="translate(60 330)">
          {Array.from({ length: 10 }).map((_, i) => (
            <rect key={i} x={(i % 5) * 36} y={Math.floor(i / 5) * 30} width="28" height="22" rx="3"
              fill={i % 4 === 0 ? 'rgba(94,234,212,0.35)' : 'rgba(148,197,255,0.18)'}
              className={styles.bayCell} style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </g>
      </svg>
    </div>
  );
}

export default Login;
