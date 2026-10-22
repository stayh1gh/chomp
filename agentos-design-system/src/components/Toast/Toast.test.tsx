import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toast } from './Toast';

describe('Toast', () => {
  it('renders its message', () => {
    render(<Toast isVisible>Saved</Toast>);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('is polite for the default variant', () => {
    render(<Toast isVisible>Saved</Toast>);
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('is assertive for the error variant', () => {
    render(
      <Toast isVisible variant="error">
        Failed to save
      </Toast>,
    );
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'assertive');
  });
});
