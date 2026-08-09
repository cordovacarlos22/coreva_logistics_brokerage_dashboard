import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ChatPanel from './ChatPanel.jsx';

describe('ChatPanel', () => {
  it('renders the empty state when there are no messages', () => {
    render(<ChatPanel messages={[]} onSend={vi.fn()} emptyLabel="Nothing here yet." />);
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument();
  });

  it('renders messages with author and body', () => {
    render(
      <ChatPanel
        messages={[
          { id: '1', body: 'Hey team', created_at: new Date().toISOString(), authorName: 'Jane Doe' },
        ]}
        onSend={vi.fn()}
      />
    );
    expect(screen.getByText(/Jane Doe/)).toBeInTheDocument();
    expect(screen.getByText('Hey team')).toBeInTheDocument();
  });

  it('calls onSend with the trimmed body and clears the input', async () => {
    const onSend = vi.fn().mockResolvedValue(undefined);
    render(<ChatPanel messages={[]} onSend={onSend} />);

    const textarea = screen.getByPlaceholderText('Type a message…');
    fireEvent.change(textarea, { target: { value: '  hello there  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(onSend).toHaveBeenCalledWith('hello there'));
    await waitFor(() => expect(textarea.value).toBe(''));
  });

  it('hides the compose form when readOnly', () => {
    render(<ChatPanel messages={[]} onSend={vi.fn()} readOnly />);
    expect(screen.queryByPlaceholderText('Type a message…')).not.toBeInTheDocument();
  });
});
