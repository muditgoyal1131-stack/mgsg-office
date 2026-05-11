import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { InstallPrompt, UpdateBanner } from './components/PWAPrompts';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Timesheet from './pages/Timesheet';
import Clients from './pages/Clients';
import Profile from './pages/Profile';
import Reports from './pages/Reports';
import UDINTracker from './pages/UDINTracker';
import AuditLog from './pages/AuditLog';
import Masters from './pages/Masters';
import Reimbursements from './pages/Reimbursements';
import Tickets from './pages/Tickets';
import Leave from './pages/Leave';
import Attendance from './pages/Attendance';
import Invoices from './pages/Invoices';
import Leads from './pages/Leads';
import Tenders from './pages/Tenders';
import Announcements from './pages/Announcements';
import StaffManagement from './pages/StaffManagement';

const PrivateRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }
  return user ? <Layout>{children}</Layout> : <Navigate to="/login" replace />;
};

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin, isHR, loading } = useAuth();
  if (loading) return null;
  return (isAdmin || isHR) ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const PartnerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin, isPartner, loading } = useAuth();
  if (loading) return null;
  return (isAdmin || isPartner) ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

// Invoices: Admin + HR + Partner
const InvoiceRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAdmin, isHR, isPartner, loading } = useAuth();
  if (loading) return null;
  return (isAdmin || isHR || isPartner) ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/tasks" element={<PrivateRoute><Tasks /></PrivateRoute>} />
      <Route path="/timesheets" element={<PrivateRoute><Timesheet /></PrivateRoute>} />
      <Route path="/clients" element={<PrivateRoute><Clients /></PrivateRoute>} />
      <Route path="/reports" element={<PrivateRoute><Reports /></PrivateRoute>} />
      <Route path="/udin" element={<PrivateRoute><UDINTracker /></PrivateRoute>} />
      <Route path="/reimbursements" element={<PrivateRoute><Reimbursements /></PrivateRoute>} />
      <Route path="/tickets" element={<PrivateRoute><Tickets /></PrivateRoute>} />
      <Route path="/leaves" element={<PrivateRoute><Leave /></PrivateRoute>} />
      {/* Merged pages — old standalone routes redirect to merged parent */}
      <Route path="/leave-calendar" element={<Navigate to="/leaves" replace />} />
      <Route path="/holidays" element={<Navigate to="/attendance" replace />} />
      <Route path="/staff-documents" element={<Navigate to="/staff-management" replace />} />
      <Route path="/staff-kpis" element={<Navigate to="/staff-management" replace />} />
      <Route path="/wip-report" element={<Navigate to="/reports" replace />} />

      <Route path="/attendance" element={<PrivateRoute><Attendance /></PrivateRoute>} />
      <Route path="/invoices" element={<PrivateRoute><InvoiceRoute><Invoices /></InvoiceRoute></PrivateRoute>} />
      <Route path="/leads" element={<PrivateRoute><PartnerRoute><Leads /></PartnerRoute></PrivateRoute>} />
      <Route path="/tenders" element={<PrivateRoute><PartnerRoute><Tenders /></PartnerRoute></PrivateRoute>} />
      <Route path="/announcements" element={<PrivateRoute><Announcements /></PrivateRoute>} />
      <Route path="/staff-management" element={<PrivateRoute><AdminRoute><StaffManagement /></AdminRoute></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
      <Route path="/admin" element={<Navigate to="/staff-management" replace />} />
      <Route path="/audit" element={<PrivateRoute><AdminRoute><AuditLog /></AdminRoute></PrivateRoute>} />
      <Route path="/masters" element={<PrivateRoute><AdminRoute><Masters /></AdminRoute></PrivateRoute>} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
      <InstallPrompt />
      <UpdateBanner />
    </AuthProvider>
  </BrowserRouter>
);

export default App;
