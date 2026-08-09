import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import ProtectedRoute from './ProtectedRoute.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

function renderProtected() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <div>Secret Dashboard</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe('ProtectedRoute', () => {
  it('redirects to /login when there is no session', () => {
    useAuth.mockReturnValue({ user: null, profile: null, profileError: null, loading: false });
    renderProtected();

    expect(screen.getByText('Login Page')).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('blocks the driver role and points to the mobile app instead of the dashboard', () => {
    useAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: { role: 'driver', full_name: 'Test Driver' },
      profileError: null,
      loading: false,
      signOut: vi.fn(),
    });
    renderProtected();

    expect(screen.getByText('Driver access is mobile-only')).toBeInTheDocument();
    expect(screen.queryByText('Secret Dashboard')).not.toBeInTheDocument();
  });

  it('renders the protected content for staff', () => {
    useAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: { role: 'dispatcher', full_name: 'Jane Doe' },
      profileError: null,
      loading: false,
      signOut: vi.fn(),
    });
    renderProtected();

    expect(screen.getByText('Secret Dashboard')).toBeInTheDocument();
  });
});
