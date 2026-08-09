import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Analytics from './Analytics.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { fetchLoads } from '../lib/loads.js';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/loads.js', () => ({
  fetchLoads: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// Relative to "now" so this suite isn't coupled to the date it happens to run on.
function daysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

const SAMPLE_LOADS = [
  {
    status: 'in_transit',
    customer_company: 'International Paper',
    created_at: daysAgo(3),
    updated_at: daysAgo(3),
    delivery_appointment_at: null,
  },
  {
    status: 'delivered',
    customer_company: 'International Paper',
    created_at: daysAgo(7),
    updated_at: daysAgo(5),
    delivery_appointment_at: daysAgo(5),
  },
  {
    status: 'dropped',
    customer_company: 'International Paper',
    created_at: daysAgo(6),
    updated_at: daysAgo(6),
    delivery_appointment_at: null,
  },
];

describe('Analytics', () => {
  it('renders the full bento grid from real loads data', async () => {
    useAuth.mockReturnValue({ profile: { role: 'dispatcher' } });
    fetchLoads.mockResolvedValue(SAMPLE_LOADS);

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Loads by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Load volume by customer')).toBeInTheDocument();
    expect(screen.getByLabelText('Weekly dispatched and delivered load volume')).toBeInTheDocument();
    expect(screen.getByLabelText('On-time delivery rate: 100%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Status legend: 3 loads, one each of in_transit/delivered/dropped -> 33% apiece.
    expect(screen.getByText('In Transit')).toBeInTheDocument();
    expect(screen.getByText('Dropped')).toBeInTheDocument();
    expect(screen.getAllByText('1 (33%)')).toHaveLength(3);

    // "Delivered" appears in both the status legend and the weekly chart legend.
    expect(screen.getAllByText('Delivered')).toHaveLength(2);
    expect(screen.getByText('Dispatched')).toBeInTheDocument();
  });

  it('shows a no-data message for the gauge when nothing has been delivered on an appointment', async () => {
    useAuth.mockReturnValue({ profile: { role: 'dispatcher' } });
    fetchLoads.mockResolvedValue([
      {
        status: 'in_transit',
        customer_company: 'International Paper',
        created_at: daysAgo(1),
        updated_at: daysAgo(1),
        delivery_appointment_at: null,
      },
    ]);

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    expect(await screen.findByLabelText('Loads by status')).toBeInTheDocument();
    expect(screen.getByText('No delivered loads with an appointment yet.')).toBeInTheDocument();
  });

  it('narrows all four cards when the time range changes, down to an empty-range message', async () => {
    useAuth.mockReturnValue({ profile: { role: 'dispatcher' } });
    fetchLoads.mockResolvedValue(SAMPLE_LOADS);

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    await screen.findByLabelText('Loads by status');

    // SAMPLE_LOADS are all 3-7 days old -- "Today" (last 24h) should exclude every one of them.
    fireEvent.change(screen.getByRole('combobox', { name: 'Time range' }), { target: { value: 'day' } });

    expect(screen.getByText('No loads in this time range.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loads by status')).not.toBeInTheDocument();
  });

  it('shows the empty state with no loads', async () => {
    useAuth.mockReturnValue({ profile: { role: 'admin' } });
    fetchLoads.mockResolvedValue([]);

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    expect(await screen.findByText('No loads yet.')).toBeInTheDocument();
  });

  it('gives customers a scoped view without the Volume by Customer card', async () => {
    useAuth.mockReturnValue({ profile: { role: 'customer', customer_company: 'International Paper' } });
    fetchLoads.mockResolvedValue(SAMPLE_LOADS);

    render(
      <MemoryRouter>
        <Analytics />
      </MemoryRouter>
    );

    // fetchLoads is RLS-scoped server-side; the page no longer gates by role at all.
    expect(await screen.findByLabelText('Loads by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Weekly dispatched and delivered load volume')).toBeInTheDocument();
    expect(screen.getByLabelText('On-time delivery rate: 100%')).toBeInTheDocument();
    expect(screen.queryByText('Volume by Customer')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Load volume by customer')).not.toBeInTheDocument();
  });
});
