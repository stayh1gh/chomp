import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonAppearance = 'primary' | 'secondary' | 'ghost' | 'approve-ghost';
export type ButtonSize = 'default' | 'sm' | 'icon';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  appearance?: ButtonAppearance;
  size?: ButtonSize;
  isDisabled?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children?: ReactNode;
}

const appearanceClasses: Record<ButtonAppearance, string> = {
  primary:
    'bg-[var(--semantic-bg-brand-default)] text-[var(--semantic-ink-inverse)] font-medium hover:brightness-110',
  secondary:
    'bg-[var(--semantic-bg-secondary-default)] text-[var(--semantic-ink-strong)] hover:bg-[var(--semantic-bg-secondary-default-hovered)]',
  ghost:
    'bg-transparent text-[var(--semantic-ink-subtle)] hover:bg-[var(--semantic-bg-ghost-default-hovered)] hover:text-[var(--semantic-ink-strong)]',
  'approve-ghost':
    'w-full bg-transparent text-[var(--semantic-approve)] rounded-b-[var(--semantic-radius-lg)] rounded-t-none hover:bg-[var(--semantic-bg-approve-ghost-hovered)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  default: 'h-10 px-4 text-[length:var(--type-body-font-size)] rounded-[var(--semantic-radius-md)]',
  sm: 'h-8 px-3 text-[length:var(--type-label-font-size)] rounded-[var(--semantic-radius-md)]',
  icon: 'h-6 w-6 p-0 rounded-full',
};

/**
 * The system's clickable-action primitive. See components/button.md for the full recipe —
 * `approve-ghost` is reserved for the card-footer Approve action only.
 */
export function Button({
  appearance = 'secondary',
  size = 'default',
  isDisabled,
  leadingIcon,
  trailingIcon,
  children,
  className = '',
  type = 'button',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={isDisabled ?? disabled}
      className={[
        'inline-flex items-center justify-center gap-2 shrink-0 whitespace-nowrap border border-transparent',
        'font-[family-name:var(--font-family-default)] font-normal cursor-pointer',
        'transition-[background-color,color] duration-100',
        'focus-visible:outline focus-visible:outline-[var(--border-width-focus)] focus-visible:outline-[var(--semantic-focus-ring)] focus-visible:outline-offset-[var(--focus-offset)]',
        'disabled:pointer-events-none disabled:opacity-50',
        appearanceClasses[appearance],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
}
