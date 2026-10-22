import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SidebarNav } from './SidebarNav';

const items = [
  { key: 'tasks', label: 'Tasks', href: '/', isActive: true },
  { key: 'skills', label: 'Skills' },
];

describe('SidebarNav', () => {
  it('renders every item label', () => {
    render(<SidebarNav items={items} />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Skills')).toBeInTheDocument();
  });

  it('renders a real link for items with an href', () => {
    render(<SidebarNav items={items} />);
    expect(screen.getByRole('link', { name: 'Tasks' })).toHaveAttribute('aria-current', 'page');
  });

  it('renders items with no href as inert, not a dead link', () => {
    render(<SidebarNav items={items} />);
    expect(screen.queryByRole('link', { name: 'Skills' })).not.toBeInTheDocument();
    expect(screen.getByText('Skills').closest('span')).toBeInTheDocument();
  });
});
