import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dialog } from './Dialog';

describe('Dialog', () => {
  it('renders nothing when closed', () => {
    render(
      <Dialog isOpen={false} onClose={vi.fn()} title="New Task">
        content
      </Dialog>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the title and content when open', () => {
    render(
      <Dialog isOpen onClose={vi.fn()} title="New Task">
        content
      </Dialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('New Task')).toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <Dialog isOpen onClose={onClose} title="New Task">
        content
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(
      <Dialog isOpen onClose={onClose} title="New Task">
        content
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
