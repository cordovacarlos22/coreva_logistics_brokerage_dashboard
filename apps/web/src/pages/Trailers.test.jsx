import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Trailers from './Trailers.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { fetchTrailers, fetchActiveLoadsByTrailer, createTrailer } from '../lib/trailers.js';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/trailers.js', async () => {
  const actual = await vi.importActual('../lib/trailers.js');
  return {
    ...actual,
    fetchTrailers: vi.fn(),
    fetchActiveLoadsByTrailer: vi.fn(),
    createTrailer: vi.fn(),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({ profile: { role: 'dispatcher', full_name: 'Jane Doe' } });
});

const TRAILERS = [
  { id: '1', trailer_number: 'TR-100', type: "53' Dry Van", status: 'available', last_ping_at: null },
  {
    id: '2',
    trailer_number: 'TR-200',
    type: "53' Dry Van",
    status: 'in_use',
    last_ping_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  { id: '3', trailer_number: 'TR-300', type: "53' Dry Van", status: 'dropped', last_ping_at: null },
];

const ACTIVE_LOADS = new Map([['2', { status: 'in_transit', driverName: 'Marcus Johnson' }]]);

function renderPage() {
  return render(
    <MemoryRouter>
      <Trailers />
    </MemoryRouter>
  );
}

describe('Trailers', () => {
  it('renders KPI tiles and the active trailers table', async () => {
    fetchTrailers.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS);

    const { container } = renderPage();

    expect(await screen.findByText('TR-100')).toBeInTheDocument();
    expect(screen.getByText('TR-200')).toBeInTheDocument();
    expect(screen.getByText('TR-300')).toBeInTheDocument();

    expect(screen.getByText('Marcus Johnson')).toBeInTheDocument();
    expect(screen.getByText('At Yard')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();

    // KPI tiles in LOCATION_KPIS order: At Plant, At Customer, Dropped at Yard, In Transit.
    // TR-200 (in_use, active load in_transit) -> In Transit; TR-300 (dropped) -> Dropped at Yard.
    const kpiValues = Array.from(container.querySelectorAll('.text-3xl.font-bold.text-primary')).map(
      (el) => el.textContent
    );
    expect(kpiValues).toEqual(['0', '0', '1', '1']);
  });

  it('filters the table by search text', async () => {
    fetchTrailers.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS);

    renderPage();

    await screen.findByText('TR-100');
    fireEvent.change(screen.getByPlaceholderText('Search trailer # or driver…'), {
      target: { value: 'marcus' },
    });

    expect(screen.getByText('TR-200')).toBeInTheDocument();
    expect(screen.queryByText('TR-100')).not.toBeInTheDocument();
  });

  it('filters the table by status chip', async () => {
    fetchTrailers.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS);

    renderPage();

    await screen.findByText('TR-100');
    fireEvent.click(screen.getByRole('button', { name: 'Dropped' }));

    expect(screen.getByText('TR-300')).toBeInTheDocument();
    expect(screen.queryByText('TR-100')).not.toBeInTheDocument();
    expect(screen.queryByText('TR-200')).not.toBeInTheDocument();
  });

  it('adds a new trailer through the form', async () => {
    fetchTrailers.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS);
    createTrailer.mockResolvedValue({
      id: '4',
      trailer_number: 'TR-400',
      type: "53' Dry Van",
      status: 'available',
      last_ping_at: null,
    });

    renderPage();

    await screen.findByText('TR-100');
    fireEvent.click(screen.getByRole('button', { name: 'Add Trailer' }));
    fireEvent.change(screen.getByLabelText('Trailer Number'), { target: { value: 'TR-400' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(createTrailer).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ trailerNumber: 'TR-400', status: 'available' })
      )
    );
    expect(await screen.findByText('TR-400')).toBeInTheDocument();
  });

  it('shows a validation error when submitting without a trailer number', async () => {
    fetchTrailers.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS);

    renderPage();

    await screen.findByText('TR-100');
    fireEvent.click(screen.getByRole('button', { name: 'Add Trailer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Required')).toBeInTheDocument();
    expect(createTrailer).not.toHaveBeenCalled();
  });

  it('shows the empty state with no trailers', async () => {
    fetchTrailers.mockResolvedValue([]);
    fetchActiveLoadsByTrailer.mockResolvedValue(new Map());

    renderPage();

    expect(await screen.findByText('No trailers yet.')).toBeInTheDocument();
  });

  it('blocks non-staff roles', () => {
    useAuth.mockReturnValue({ profile: { role: 'customer', customer_company: 'International Paper' } });

    renderPage();

    expect(
      screen.getByText('Trailer Tracker is only available to dispatch and admin staff.')
    ).toBeInTheDocument();
    expect(fetchTrailers).not.toHaveBeenCalled();
  });
});
