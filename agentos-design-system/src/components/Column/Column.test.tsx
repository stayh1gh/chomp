import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Column } from './Column';

describe('Column', () => {
  it('renders the title and count', () => {
    render(<Column title="Plan" count={3} />);
    expect(screen.getByText('Plan')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the empty-state message when there are no cards', () => {
    render(<Column title="Done" />);
    expect(screen.getByText('No tasks')).toBeInTheDocument();
  });

  it('renders children instead of the empty state when cards are present', () => {
    render(
      <Column title="Development">
        <div>card one</div>
      </Column>,
    );
    expect(screen.getByText('card one')).toBeInTheDocument();
    expect(screen.queryByText('No tasks')).not.toBeInTheDocument();
  });
});
