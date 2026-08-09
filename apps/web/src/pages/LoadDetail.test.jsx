import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoadDetail from './LoadDetail.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { fetchLoadDetail, updateLoadConsignee } from '../lib/loadDetail.js';
import { fetchConsignees } from '../lib/consignees.js';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/loadDetail.js', () => ({
  fetchLoadDetail: vi.fn(),
  addLoadNote: vi.fn(),
  updateLoadConsignee: vi.fn(),
}));

vi.mock('../lib/consignees.js', () => ({
  fetchConsignees: vi.fn(),
  createConsignee: vi.fn(),
}));

vi.mock('../lib/chat.js', () => ({
  fetchLoadMessages: vi.fn().mockResolvedValue([]),
  sendLoadMessage: vi.fn(),
  subscribeToInserts: vi.fn(() => () => {}),
}));

const BASE_DETAIL = {
  load: {
    id: 'load-1',
    load_number: 'IP-8842-A',
    status: 'in_transit',
    customer_company: 'International Paper',
    bol_trailer_number: 'TR-8492A',
    bol_mfo: null,
    bol_po_number: null,
    bol_seal_number: null,
    origin_address: 'Memphis, TN',
    destination_address: 'Chicago, IL',
    pickup_appointment_at: null,
    delivery_appointment_at: null,
    driver: { full_name: 'Marcus Johnson' },
    trailer: { trailer_number: 'TR-8492A' },
    truck: { unit_number: 'TRK-294' },
    consignee: { id: 'c1', name: 'New Balance' },
  },
  stops: [],
  checklists: [],
  discrepancies: [],
  notes: [],
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/loads/load-1']}>
      <Routes>
        <Route path="/loads/:id" element={<LoadDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useAuth.mockReturnValue({
    profile: { role: 'dispatcher', full_name: 'Jane Doe', customer_company: null },
    user: { id: 'user-1' },
  });
  fetchLoadDetail.mockResolvedValue(BASE_DETAIL);
});

describe('LoadDetail', () => {
  it('renders load core details and empty states', async () => {
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Load IP-8842-A' })).toBeInTheDocument();
    expect(screen.getByText('Loads Overview')).toBeInTheDocument();
    expect(screen.getByText('In Transit')).toBeInTheDocument();
    expect(screen.getByText('Marcus Johnson')).toBeInTheDocument();
    expect(screen.getByText('New Balance')).toBeInTheDocument();
    expect(screen.getByText('No checklist submitted yet.')).toBeInTheDocument();
    expect(screen.getByText('No discrepancies reported.')).toBeInTheDocument();
    expect(screen.getByText('Internal Notes (Dispatcher Only)')).toBeInTheDocument();
    expect(screen.getByText('No notes yet.')).toBeInTheDocument();

    expect(screen.getByText('Messages')).toBeInTheDocument();
    expect(await screen.findByText('No messages yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'dispatch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'driver' })).toBeInTheDocument();
  });

  it('lets a dispatcher change the load customer', async () => {
    fetchConsignees.mockResolvedValue([
      { id: 'c1', name: 'New Balance' },
      { id: 'c2', name: 'OSI' },
    ]);
    updateLoadConsignee.mockResolvedValue({ id: 'c2', name: 'OSI' });

    renderPage();

    await screen.findByText('New Balance');
    fireEvent.click(screen.getByRole('button', { name: 'Change' }));

    await screen.findByRole('option', { name: 'OSI' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateLoadConsignee).toHaveBeenCalledWith(
        expect.anything(),
        { loadId: 'load-1', consigneeId: 'c2' }
      )
    );
    expect(await screen.findByText('OSI')).toBeInTheDocument();
  });

  it('shows the customer read-only for a customer-role login, with no Change control', async () => {
    useAuth.mockReturnValue({
      profile: { role: 'customer', full_name: 'IP User', customer_company: 'International Paper' },
      user: { id: 'user-2' },
    });

    renderPage();

    expect(await screen.findByText('New Balance')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByText('Internal Notes (Dispatcher Only)')).not.toBeInTheDocument();
  });
});
