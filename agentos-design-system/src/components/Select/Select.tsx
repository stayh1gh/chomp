import type { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'disabled'> {
  options: SelectOption[];
  isDisabled?: boolean;
  'aria-label'?: string;
}

const chevron =
  "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2398999c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")";

/**
 * A native <select> restyled with a custom chevron. Single size only — see components/select.md.
 * MUST be paired with a visible label (via htmlFor/id) or an aria-label.
 */
export function Select({ options, isDisabled, className = '', style, ...rest }: SelectProps) {
  return (
    <select
      disabled={isDisabled}
      className={[
        'h-8 min-w-[148px] pl-2.5 pr-[30px] appearance-none cursor-pointer',
        'bg-[var(--semantic-bg-input)] border border-[var(--semantic-border-strong)] rounded-[var(--semantic-radius-md)]',
        'text-[length:var(--type-label-font-size)] text-[var(--semantic-ink-strong)] font-[family-name:var(--font-family-default)]',
        'hover:not-disabled:border-[var(--semantic-border-hover)]',
        'focus-visible:outline focus-visible:outline-[var(--border-width-focus)] focus-visible:outline-[var(--semantic-focus-ring)] focus-visible:outline-offset-[var(--focus-offset)]',
        'disabled:opacity-[0.55] disabled:cursor-default',
        className,
      ].join(' ')}
      style={{
        backgroundImage: chevron,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
        backgroundSize: '14px',
        ...style,
      }}
      {...rest}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
