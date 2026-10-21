/**
 * App — Root Component
 *
 * Wraps the application in the AuthProvider and splits routing into:
 *   - /login         — standalone, no app shell
 *   - everything else — rendered inside the authenticated AppShell
 *                       (sidebar + main), guarded by ProtectedRoute.
 *
 * Role-restricted pages (User Management, Audit Logs) are additionally wrapped
 * in a ProtectedRoute with an allowed-roles list. The backend remains the
 * security boundary; this is the UX layer.
 */

import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import { GROUPS } from './config/roles';

import Sidebar            from './components/Sidebar/Sidebar';
import TopHeader          from './components/TopHeader/TopHeader';
import Login              from './pages/Login/Login';
import BayManagement      from './pages/BayManagement/BayManagement';
import DigitalYardMap     from './pages/DigitalYardMap/DigitalYardMap';
import MaterialManagement from './pages/MaterialManagement/MaterialManagement';
import MaterialDetail     from './pages/MaterialDetail/MaterialDetail';
import MaterialMapping    from './pages/MaterialMapping/MaterialMapping';
import Dispatch           from './pages/Dispatch/Dispatch';
import GateValidation     from './pages/GateValidation/GateValidation';
import UserManagement     from './pages/UserManagement/UserManagement';
import AuditLogs          from './pages/AuditLogs/AuditLogs';
import SAPIntegration     from './pages/SAPIntegration/SAPIntegration';
import TruckDashboard     from './pages/TruckDashboard/TruckDashboard';
import TruckJourney       from './pages/TruckJourney/TruckJourney';
import RFIDMonitoring     from './pages/RFIDMonitoring/RFIDMonitoring';
import CameraManagement   from './pages/CameraManagement/CameraManagement';
import CameraDetail       from './pages/CameraDetail/CameraDetail';
import LiveMonitoring     from './pages/LiveMonitoring/LiveMonitoring';
import SurveillanceAlerts from './pages/SurveillanceAlerts/SurveillanceAlerts';
import FaceRegistry       from './pages/FaceRegistry/FaceRegistry';
import styles             from './App.module.css';

/** Authenticated application shell: sidebar + top header + routed main content. */
function AppShell() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleNav = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
      setMobileOpen((o) => !o);
    } else {
      setCollapsed((c) => !c);
    }
  };

  return (
    <div className={`${styles.shell} ${collapsed ? styles.collapsed : ''} ${mobileOpen ? styles.mobileOpen : ''}`}>
      <Sidebar collapsed={collapsed} open={mobileOpen} />
      {mobileOpen && <div className={styles.backdrop} onClick={() => setMobileOpen(false)} />}
      <TopHeader collapsed={collapsed} onToggle={toggleNav} />
      <main className={styles.main}>
        <div key={location.pathname} className={`${styles.content} wt-page-enter`}>
          <Routes>
          <Route path="/" element={<Navigate to="/yard-map" replace />} />

          {/* Yard / inventory */}
          <Route path="/yard-map" element={<DigitalYardMap />} />
          <Route path="/bays" element={<BayManagement />} />
          <Route path="/materials" element={<MaterialManagement />} />
          <Route path="/materials/:id" element={<MaterialDetail />} />
          <Route path="/mappings" element={<MaterialMapping />} />

          {/* Dispatch + gate */}
          <Route path="/dispatch" element={<Dispatch />} />
          <Route path="/gate" element={<GateValidation />} />

          {/* Truck traceability + RFID */}
          <Route path="/trucks" element={<TruckDashboard />} />
          <Route path="/trucks/journey/:visitId" element={<TruckJourney />} />
          <Route path="/rfid" element={<RFIDMonitoring />} />

          {/* Surveillance */}
          <Route path="/surveillance/cameras" element={<CameraManagement />} />
          <Route path="/surveillance/cameras/:id" element={<CameraDetail />} />
          <Route path="/surveillance/live" element={<LiveMonitoring />} />
          <Route path="/surveillance/alerts" element={<SurveillanceAlerts />} />
          <Route path="/surveillance/faces" element={<FaceRegistry />} />

          {/* Administration (role-gated) */}
          <Route path="/users" element={<ProtectedRoute roles={GROUPS.USER_ADMIN}><UserManagement /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute roles={GROUPS.AUDIT_VIEW}><AuditLogs /></ProtectedRoute>} />
          <Route path="/sap-integration" element={<ProtectedRoute roles={GROUPS.AUDIT_VIEW}><SAPIntegration /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/yard-map" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  // Root router + auth provider.
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
