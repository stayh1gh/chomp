import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders its label', () => {
    render(<Button>Approve</Button>);
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('calls onClick when clicked', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled when isDisabled is true', () => {
    render(<Button isDisabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Default type</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('renders the approve-ghost appearance full-width', () => {
    render(<Button appearance="approve-ghost">Approve</Button>);
    expect(screen.getByRole('button').className).toContain('w-full');
  });
});
