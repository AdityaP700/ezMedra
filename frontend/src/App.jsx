import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/DashboardLayout';
import Login from './pages/Login';
import StudentDashboard from './pages/StudentDashboard';
import FacultyDashboard from './pages/FacultyDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminQueue from './pages/AdminQueue';
import AdminReports from './pages/AdminReports';
import AdminUsers from './pages/AdminUsers';

function RoleRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  const routes = {
    student: '/student',
    faculty: '/faculty',
    phd_scholar: '/faculty',
    ta: '/faculty',
    admin: '/admin',
  };
  return <Navigate to={routes[user?.role] || '/login'} replace />;
}

function Unauthorized() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-slate-200 mb-4">403</h1>
        <p className="text-lg text-slate-600 mb-6">You don't have permission to access this page.</p>
        <a href="/" className="btn-primary">Go Home</a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#1e293b',
              color: '#f8fafc',
              borderRadius: '12px',
              fontSize: '14px',
              padding: '12px 16px',
            },
            success: { iconTheme: { primary: '#16a34a', secondary: '#f8fafc' } },
            error: { iconTheme: { primary: '#dc2626', secondary: '#f8fafc' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/unauthorized" element={<Unauthorized />} />
          <Route path="/" element={<RoleRedirect />} />

          {/* Student Routes */}
          <Route element={<ProtectedRoute roles={['student']}><DashboardLayout /></ProtectedRoute>}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/apply" element={<StudentDashboard />} />
            <Route path="/student/applications" element={<StudentDashboard />} />
          </Route>

          {/* Faculty Routes */}
          <Route element={<ProtectedRoute roles={['faculty', 'phd_scholar', 'ta']}><DashboardLayout /></ProtectedRoute>}>
            <Route path="/faculty" element={<FacultyDashboard />} />
          </Route>

          {/* Admin Routes */}
          <Route element={<ProtectedRoute roles={['admin']}><DashboardLayout /></ProtectedRoute>}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/queue" element={<AdminQueue />} />
            <Route path="/admin/reports" element={<AdminReports />} />
            <Route path="/admin/users" element={<AdminUsers />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
