import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders title, meta, and description', () => {
    render(<Card title="Meter — low step" meta="run-42" description="A short description." />);
    expect(screen.getByText('Meter — low step')).toBeInTheDocument();
    expect(screen.getByText('run-42')).toBeInTheDocument();
    expect(screen.getByText('A short description.')).toBeInTheDocument();
  });

  it('is not interactive when no onClick is given', () => {
    render(<Card title="Static card" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('becomes a keyboard-operable button when onClick is given', () => {
    const onClick = vi.fn();
    render(<Card title="Clickable card" onClick={onClick} />);
    const card = screen.getByRole('button');
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('renders a footer with a divider only when footer is provided', () => {
    const { container, rerender } = render(<Card title="No footer" />);
    expect(container.querySelector('.border-t')).not.toBeInTheDocument();
    rerender(<Card title="With footer" footer={<span>Approve</span>} />);
    expect(screen.getByText('Approve')).toBeInTheDocument();
  });
});
