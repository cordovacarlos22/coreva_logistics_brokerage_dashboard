import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoadDetail from './LoadDetail.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import {
  fetchLoadDetail,
  updateLoadConsignee,
  markBolVerified,
  fetchLoadSecuredPhotoUrl,
  overrideLoadSecuredCompliance,
} from '../lib/loadDetail.js';
import { fetchConsignees } from '../lib/consignees.js';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/loadDetail.js', async () => {
  // latestLoadSecuredPhoto is a pure function over fixture data -- keep the
  // real implementation rather than mocking it in every test. Only the
  // functions that do actual network/storage I/O are mocked.
  const actual = await vi.importActual('../lib/loadDetail.js');
  return {
    ...actual,
    fetchLoadDetail: vi.fn(),
    addLoadNote: vi.fn(),
    updateLoadConsignee: vi.fn(),
    updateBolFields: vi.fn(),
    markBolVerified: vi.fn(),
    fetchLoadSecuredPhotoUrl: vi.fn(),
    overrideLoadSecuredCompliance: vi.fn(),
  };
});

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
    bol_verification_status: 'pending',
    bol_verified_at: null,
    weight_lbs: null,
    commodity: null,
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

  it('lets a dispatcher mark a pending BOL as verified', async () => {
    markBolVerified.mockResolvedValue({
      bol_trailer_number: 'TR-8492A',
      bol_verification_status: 'dispatch_verified',
      bol_verified_at: '2026-08-13T00:00:00Z',
    });

    renderPage();

    expect(await screen.findByText('Pending Verification')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark Verified' }));

    await waitFor(() =>
      expect(markBolVerified).toHaveBeenCalledWith(expect.anything(), {
        loadId: 'load-1',
        verifiedBy: 'user-1',
        patch: {},
      })
    );
    expect(await screen.findByText('Dispatch Verified')).toBeInTheDocument();
  });

  it('shows a failed load security check and lets dispatch override it', async () => {
    fetchLoadDetail.mockResolvedValue({
      ...BASE_DETAIL,
      checklists: [
        {
          id: 'checklist-1',
          status: 'in_progress',
          driver: { full_name: 'Marcus Johnson' },
          signed_at: null,
          sealed_at: null,
          seal_number: null,
          checklist_photos: [
            {
              id: 'photo-1',
              type: 'load_secured',
              storage_path: 'checklist-1/load-secured-1.jpg',
              compliance_status: 'fail',
              compliance_reason: 'No straps or wrap are visible over the load.',
              uploaded_at: '2026-08-16T00:00:00Z',
            },
          ],
        },
      ],
    });
    fetchLoadSecuredPhotoUrl.mockResolvedValue('https://example.com/signed-url.jpg');
    overrideLoadSecuredCompliance.mockResolvedValue({
      id: 'photo-1',
      type: 'load_secured',
      storage_path: 'checklist-1/load-secured-1.jpg',
      compliance_status: 'overridden',
      compliance_reason: 'No straps or wrap are visible over the load.',
      uploaded_at: '2026-08-16T00:00:00Z',
    });

    renderPage();

    expect(await screen.findByText('Fail')).toBeInTheDocument();
    expect(screen.getByText('No straps or wrap are visible over the load.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Override — Mark Compliant' }));

    await waitFor(() => expect(overrideLoadSecuredCompliance).toHaveBeenCalledWith('photo-1'));
    expect(await screen.findByText('Overridden (Dispatch)')).toBeInTheDocument();
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
