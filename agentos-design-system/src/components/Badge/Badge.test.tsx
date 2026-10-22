import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders its label', () => {
    render(<Badge variant="running">Running</Badge>);
    expect(screen.getByText('Running')).toBeInTheDocument();
  });

  it.each(['running', 'approval', 'user', 'done', 'outline', 'gate', 'warn', 'model'] as const)(
    'renders the %s variant without throwing',
    (variant) => {
      render(<Badge variant={variant}>{variant}</Badge>);
      expect(screen.getByText(variant)).toBeInTheDocument();
    },
  );
});
