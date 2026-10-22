import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant =
  | 'running'
  | 'approval'
  | 'user'
  | 'done'
  | 'outline'
  | 'gate'
  | 'warn'
  | 'model';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  variant: BadgeVariant;
  children: ReactNode;
}

const variantClasses: Record<BadgeVariant, string> = {
  running: 'h-6 bg-[var(--semantic-bg-badge-running)] text-[var(--semantic-ink-badge-running)] font-medium',
  approval: 'h-6 bg-[var(--semantic-bg-badge-approval)] text-[var(--semantic-ink-badge-approval)] font-medium',
  user: 'h-6 bg-[var(--semantic-bg-badge-user)] text-[var(--semantic-ink-badge-user)] font-medium',
  done: 'h-6 bg-[var(--semantic-bg-badge-done)] text-[var(--semantic-ink-badge-done)] font-medium',
  outline:
    'h-6 bg-[var(--semantic-bg-badge-outline)] text-[var(--semantic-ink-badge-outline)] border border-[var(--semantic-border-badge-outline)] font-normal',
  gate: 'h-5 bg-[var(--semantic-bg-badge-gate)] text-[var(--semantic-ink-badge-gate)] font-normal',
  warn: 'h-5 bg-[var(--semantic-bg-badge-warn)] text-[var(--semantic-ink-badge-warn)] font-normal',
  model: 'h-5 bg-[var(--semantic-bg-badge-model)] text-[var(--semantic-ink-badge-model)] font-normal',
};

/**
 * A non-interactive status pill. See components/badge.md — running/approval/user/done are
 * mutually exclusive per card; gate/warn/model are additive metadata.
 */
export function Badge({ variant, children, className = '', ...rest }: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center justify-center gap-1 w-fit shrink-0 overflow-hidden whitespace-nowrap',
        'max-w-56 px-2 rounded-[var(--semantic-radius-pill)] text-[length:var(--type-caption-strong-font-size)] leading-[length:var(--type-caption-strong-line-height)]',
        variantClasses[variant],
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </span>
  );
}
