import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Login from './Login.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { supabase } from '../lib/supabaseClient.js';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/supabaseClient.js', () => ({
  supabase: { auth: { signInWithPassword: vi.fn() } },
}));

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: null, loading: false });
});

function renderLogin() {
  render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>
  );
}

describe('Login', () => {
  it('shows validation errors instead of submitting when fields are empty', async () => {
    renderLogin();

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('shows a validation error for a malformed email', async () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(supabase.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('signs in with valid credentials', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ error: null });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dispatcher@coreva.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() =>
      expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'dispatcher@coreva.com',
        password: 'secret123',
      })
    );
  });

  it('shows the error message returned by Supabase on failed sign-in', async () => {
    supabase.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } });
    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'dispatcher@coreva.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Invalid login credentials')).toBeInTheDocument();
  });

  it('redirects away from the login page when already signed in', () => {
    useAuth.mockReturnValue({ user: { id: 'u1' }, loading: false });
    renderLogin();

    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });
});
