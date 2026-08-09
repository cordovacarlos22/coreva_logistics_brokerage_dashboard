import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SystemStatus from './SystemStatus.jsx';

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ status: 'degraded', supabase: 'not_configured' }),
      })
    )
  );
});

describe('SystemStatus', () => {
  it('renders the system status page', async () => {
    render(<SystemStatus />);
    expect(screen.getByText('Coreva Logistics Brokerage')).toBeInTheDocument();
    expect(await screen.findByText('Backend API')).toBeInTheDocument();
  });
});
