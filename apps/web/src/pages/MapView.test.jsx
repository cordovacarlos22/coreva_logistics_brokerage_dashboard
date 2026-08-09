import { forwardRef, useImperativeHandle } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import MapView from './MapView.jsx';
import { fetchTrailerLocations, fetchActiveLoadsByTrailer } from '../lib/trailers.js';
import { fetchTruckLocations, fetchActiveLoadsByTruck } from '../lib/trucks.js';

const flyTo = vi.fn();

// maplibre-gl needs a real WebGL context, which jsdom doesn't provide --
// mock the Map wrapper itself rather than fight jsdom's canvas limitations.
// The mock stays a forwardRef component so MapView's ref.flyTo(...) calls
// resolve against a real function instead of silently no-op-ing.
vi.mock('../components/Map.jsx', () => ({
  Map: forwardRef(function MockMap({ markers }, ref) {
    useImperativeHandle(ref, () => ({ flyTo }));
    return <div data-testid="mock-map">{markers.length} marker(s)</div>;
  }),
  MARKER_COLORS: {
    available: '#16a34a',
    in_use: '#2563eb',
    dropped: '#dc2626',
    maintenance: '#64748b',
  },
}));

vi.mock('../contexts/AuthContext.jsx', () => ({
  useAuth: () => ({
    profile: { role: 'dispatcher', full_name: 'Jane Doe', customer_company: null },
    signOut: vi.fn(),
  }),
}));

vi.mock('../lib/trailers.js', async () => {
  const actual = await vi.importActual('../lib/trailers.js');
  return {
    ...actual,
    fetchTrailerLocations: vi.fn(),
    fetchActiveLoadsByTrailer: vi.fn(),
  };
});

vi.mock('../lib/trucks.js', () => ({
  fetchTruckLocations: vi.fn(),
  fetchActiveLoadsByTruck: vi.fn(),
}));

const TRAILERS = [
  {
    id: '1',
    trailer_number: 'TR-8492A',
    status: 'in_use',
    current_lat: 35.15,
    current_lng: -90.05,
    last_ping_at: new Date(Date.now() - 5 * 60000).toISOString(),
  },
  {
    id: '2',
    trailer_number: 'TR-1102B',
    status: 'available',
    current_lat: 33.75,
    current_lng: -84.39,
    last_ping_at: null,
  },
];

const ACTIVE_LOADS_BY_TRAILER = new Map([['1', { status: 'in_transit', driverName: 'Marcus Johnson' }]]);

beforeEach(() => {
  vi.clearAllMocks();
  // Default to no trucks so trailer-focused tests aren't affected; the
  // combined-list test below overrides these with real truck fixtures.
  fetchTruckLocations.mockResolvedValue([]);
  fetchActiveLoadsByTruck.mockResolvedValue(new Map());
});

describe('MapView', () => {
  it('renders a marker per located unit and lists them in the Active Units panel', async () => {
    fetchTrailerLocations.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS_BY_TRAILER);

    const { container } = render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    expect(await screen.findByText('2 marker(s)')).toBeInTheDocument();
    expect(screen.getByText('· 2')).toBeInTheDocument();
    expect(screen.getByText('Trailer TR-8492A')).toBeInTheDocument();
    expect(screen.getByText('Trailer TR-1102B')).toBeInTheDocument();
    expect(screen.getByText(/Marcus Johnson/)).toBeInTheDocument();
    expect(screen.getByText(/5m ago/)).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();

    const dots = container.querySelectorAll('span[aria-hidden="true"]');
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveStyle({ backgroundColor: 'rgb(37, 99, 235)' }); // in_use
    expect(dots[1]).toHaveStyle({ backgroundColor: 'rgb(22, 163, 74)' }); // available
  });

  it('merges trucks into the same Active Units list as trailers', async () => {
    fetchTrailerLocations.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS_BY_TRAILER);
    fetchTruckLocations.mockResolvedValue([
      {
        id: 't1',
        unit_number: 'TRK-294',
        current_lat: 35.15,
        current_lng: -90.05,
        last_ping_at: new Date(Date.now() - 3 * 60000).toISOString(),
      },
      {
        id: 't2',
        unit_number: 'TRK-118',
        current_lat: 32.08,
        current_lng: -81.09,
        last_ping_at: null,
      },
    ]);
    fetchActiveLoadsByTruck.mockResolvedValue(new Map([['t1', 'Marcus Johnson']]));

    const { container } = render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    expect(await screen.findByText('4 marker(s)')).toBeInTheDocument();
    expect(screen.getByText('· 4')).toBeInTheDocument();
    expect(screen.getByText('Truck TRK-294')).toBeInTheDocument();
    expect(screen.getByText('Truck TRK-118')).toBeInTheDocument();

    // TRK-294 has an active load (in_use, blue) same as TR-8492A; TRK-118 has
    // none (available, green) same as TR-1102B.
    const dots = container.querySelectorAll('span[aria-hidden="true"]');
    const colors = Array.from(dots).map((dot) => dot.style.backgroundColor);
    expect(colors.filter((c) => c === 'rgb(37, 99, 235)')).toHaveLength(2); // in_use: 1 trailer + 1 truck
    expect(colors.filter((c) => c === 'rgb(22, 163, 74)')).toHaveLength(2); // available: 1 trailer + 1 truck
  });

  it('filters the list by search text, matching trailer or truck number', async () => {
    fetchTrailerLocations.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS_BY_TRAILER);
    fetchTruckLocations.mockResolvedValue([
      { id: 't1', unit_number: 'TRK-294', current_lat: 35.15, current_lng: -90.05, last_ping_at: null },
    ]);

    render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    await screen.findByText('Trailer TR-8492A');
    const searchInput = screen.getByPlaceholderText('Search trailer #, truck #, or driver…');

    fireEvent.change(searchInput, { target: { value: '1102' } });
    expect(screen.queryByText('Trailer TR-8492A')).not.toBeInTheDocument();
    expect(screen.getByText('Trailer TR-1102B')).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'TRK-294' } });
    expect(screen.getByText('Truck TRK-294')).toBeInTheDocument();
    expect(screen.queryByText('Trailer TR-1102B')).not.toBeInTheDocument();
  });

  it('filters the list by driver name', async () => {
    fetchTrailerLocations.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS_BY_TRAILER);

    render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    await screen.findByText('Trailer TR-8492A');
    fireEvent.change(screen.getByPlaceholderText('Search trailer #, truck #, or driver…'), {
      target: { value: 'marcus' },
    });

    expect(screen.getByText('Trailer TR-8492A')).toBeInTheDocument();
    expect(screen.queryByText('Trailer TR-1102B')).not.toBeInTheDocument();
  });

  it('filters the list by status chip', async () => {
    fetchTrailerLocations.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS_BY_TRAILER);

    render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    await screen.findByText('Trailer TR-8492A');
    fireEvent.click(screen.getByRole('button', { name: 'Available' }));

    expect(screen.queryByText('Trailer TR-8492A')).not.toBeInTheDocument();
    expect(screen.getByText('Trailer TR-1102B')).toBeInTheDocument();
  });

  it('flies the map to a unit when its list item is clicked', async () => {
    fetchTrailerLocations.mockResolvedValue(TRAILERS);
    fetchActiveLoadsByTrailer.mockResolvedValue(ACTIVE_LOADS_BY_TRAILER);

    render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Trailer TR-8492A'));

    expect(flyTo).toHaveBeenCalledWith([-90.05, 35.15]);
  });

  it('shows the empty state when no units are located', async () => {
    fetchTrailerLocations.mockResolvedValue([]);
    fetchActiveLoadsByTrailer.mockResolvedValue(new Map());

    render(
      <MemoryRouter>
        <MapView />
      </MemoryRouter>
    );

    expect(await screen.findByText('No located units yet.')).toBeInTheDocument();
  });
});
