import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import { AuthProvider } from './contexts/AuthContext.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Login from './pages/Login.jsx';
import LoadsOverview from './pages/LoadsOverview.jsx';
import LoadDetail from './pages/LoadDetail.jsx';
import TeamChat from './pages/TeamChat.jsx';
import DriverMessages from './pages/DriverMessages.jsx';
import MapView from './pages/MapView.jsx';
import Trailers from './pages/Trailers.jsx';
import Analytics from './pages/Analytics.jsx';
import SystemStatus from './pages/SystemStatus.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <LoadsOverview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/loads/:id"
            element={
              <ProtectedRoute>
                <LoadDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team-chat"
            element={
              <ProtectedRoute>
                <TeamChat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver-messages"
            element={
              <ProtectedRoute>
                <DriverMessages />
              </ProtectedRoute>
            }
          />
          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <MapView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/trailers"
            element={
              <ProtectedRoute>
                <Trailers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedRoute>
                <Analytics />
              </ProtectedRoute>
            }
          />
          <Route path="/status" element={<SystemStatus />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
