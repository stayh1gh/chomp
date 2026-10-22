import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

const options = [
  { label: 'Opus', value: 'opus' },
  { label: 'Sonnet', value: 'sonnet' },
];

describe('Select', () => {
  it('renders every option', () => {
    render(<Select options={options} aria-label="Model" defaultValue="opus" />);
    expect(screen.getByRole('option', { name: 'Opus' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sonnet' })).toBeInTheDocument();
  });

  it('calls onChange when a new option is picked', () => {
    const onChange = vi.fn();
    render(<Select options={options} aria-label="Model" defaultValue="opus" onChange={onChange} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'sonnet' } });
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('is disabled when isDisabled is true', () => {
    render(<Select options={options} aria-label="Model" isDisabled />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
