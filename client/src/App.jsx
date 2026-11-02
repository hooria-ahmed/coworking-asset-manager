// Owner: integrator. Pages are listed in routes.jsx, not here.
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './components/theme-provider';
import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import { ROUTES } from './routes';

function Home() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'Admin' ? '/admin' : '/dashboard'} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/" element={<Home />} />
                {ROUTES.map((r) => (
                  <Route key={r.path} path={r.path} element={<ProtectedRoute roles={r.roles}>{r.element}</ProtectedRoute>} />
                ))}
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
        <Toaster position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  );
}
