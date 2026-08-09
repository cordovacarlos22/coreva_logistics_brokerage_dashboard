import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeamChat from './TeamChat.jsx';
import { useAuth } from '../contexts/AuthContext.jsx';
import { fetchTeamMessages } from '../lib/chat.js';

vi.mock('../contexts/AuthContext.jsx', () => ({ useAuth: vi.fn() }));

vi.mock('../lib/chat.js', () => ({
  fetchTeamMessages: vi.fn(),
  sendTeamMessage: vi.fn(),
  subscribeToInserts: vi.fn(() => () => {}),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TeamChat', () => {
  it('renders team messages for staff', async () => {
    useAuth.mockReturnValue({ user: { id: 'u1' }, profile: { role: 'dispatcher' } });
    fetchTeamMessages.mockResolvedValue([
      { id: '1', body: 'Morning team', created_at: new Date().toISOString(), author: { full_name: 'Jane Doe' } },
    ]);

    render(
      <MemoryRouter>
        <TeamChat />
      </MemoryRouter>
    );

    expect(await screen.findByText('Morning team')).toBeInTheDocument();
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
  });

  it('blocks non-staff roles from seeing the chat', () => {
    useAuth.mockReturnValue({ user: { id: 'u2' }, profile: { role: 'customer', customer_company: 'International Paper' } });

    render(
      <MemoryRouter>
        <TeamChat />
      </MemoryRouter>
    );

    expect(screen.getByText('Team Chat is only available to dispatch and admin staff.')).toBeInTheDocument();
    expect(fetchTeamMessages).not.toHaveBeenCalled();
  });
});
