import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import LoadsOverview from './LoadsOverview.jsx';

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    profile: { role: 'dispatcher', full_name: 'Jane Doe', customer_company: null },
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/loads.js', async () => {
  const actual = await vi.importActual('../lib/loads.js');
  return {
    ...actual,
    fetchLoads: vi.fn().mockResolvedValue([
      {
        id: '1',
        load_number: 'IP-8842-A',
        status: 'in_transit',
        origin_address: 'Memphis, TN',
        destination_address: 'Chicago, IL',
        updated_at: new Date().toISOString(),
        driver: { full_name: 'Marcus Johnson' },
        trailer: { trailer_number: 'TR-8492A' },
        consignee: { id: 'c1', name: 'New Balance' },
      },
      {
        id: '2',
        load_number: 'IP-8843-B',
        status: 'picked_up',
        origin_address: 'Atlanta, GA',
        destination_address: 'Dallas, TX',
        updated_at: new Date().toISOString(),
        driver: { full_name: 'Priya Patel' },
        trailer: { trailer_number: 'TR-1102B' },
        consignee: null,
      },
    ]),
  };
});

describe('LoadsOverview', () => {
  it('renders loads fetched from Supabase', async () => {
    render(
      <MemoryRouter>
        <LoadsOverview />
      </MemoryRouter>
    );

    expect(await screen.findByText('IP-8842-A')).toBeInTheDocument();
    expect(screen.getByText('Marcus Johnson')).toBeInTheDocument();
    expect(screen.getByText('In Transit')).toBeInTheDocument();
    expect(screen.getByText('New Balance')).toBeInTheDocument();
  });

  it('filters the table by search text and shows a no-match message', async () => {
    render(
      <MemoryRouter>
        <LoadsOverview />
      </MemoryRouter>
    );

    await screen.findByText('IP-8842-A');
    const searchInput = screen.getByPlaceholderText('Search by load #, origin, destination, or customer…');

    fireEvent.change(searchInput, { target: { value: 'dallas' } });
    expect(screen.queryByText('IP-8842-A')).not.toBeInTheDocument();
    expect(screen.getByText('IP-8843-B')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'nonexistent' } });
    expect(screen.getByText('No matching loads.')).toBeInTheDocument();
  });

  it('filters the table by customer name', async () => {
    render(
      <MemoryRouter>
        <LoadsOverview />
      </MemoryRouter>
    );

    await screen.findByText('IP-8842-A');
    fireEvent.change(screen.getByPlaceholderText('Search by load #, origin, destination, or customer…'), {
      target: { value: 'new balance' },
    });

    expect(screen.getByText('IP-8842-A')).toBeInTheDocument();
    expect(screen.queryByText('IP-8843-B')).not.toBeInTheDocument();
  });
});
