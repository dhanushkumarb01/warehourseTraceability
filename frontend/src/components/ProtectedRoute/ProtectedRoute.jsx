/**
 * ProtectedRoute — gates routes behind authentication and (optionally) roles.
 *
 *   <ProtectedRoute><Dashboard/></ProtectedRoute>
 *   <ProtectedRoute roles={GROUPS.USER_ADMIN}><Users/></ProtectedRoute>
 *
 * - While the session is restoring, shows a lightweight loader.
 * - Unauthenticated → redirect to /login (preserving intended path).
 * - Authenticated but lacking the role → a clear "no access" screen rather than
 *   a confusing redirect.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import styles from './ProtectedRoute.module.css';

function ProtectedRoute({ children, roles = null }) {
  const { isAuthenticated, loading, can } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className={styles.loaderWrap}>
        <div className={styles.spinner} />
        <p>Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !can(roles)) {
    return (
      <div className={styles.denied}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <h2>Access restricted</h2>
        <p>You don’t have permission to view this page. Contact an administrator if you believe this is a mistake.</p>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;
