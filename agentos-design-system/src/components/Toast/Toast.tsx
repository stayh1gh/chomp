import type { ReactNode } from 'react';

export type ToastVariant = 'default' | 'error';

export interface ToastProps {
  variant?: ToastVariant;
  isVisible: boolean;
  children: ReactNode;
}

/**
 * A bottom-left transient confirmation/error message. See components/toast.md — never used
 * for anything requiring a user response.
 */
export function Toast({ variant = 'default', isVisible, children }: ToastProps) {
  return (
    <div
      role="status"
      aria-live={variant === 'error' ? 'assertive' : 'polite'}
      className={[
        'fixed bottom-6 left-6 z-[60] px-3.5 py-2.5 rounded-[var(--semantic-radius-lg)]',
        'text-[length:var(--type-label-font-size)] transition-opacity duration-200',
        'bg-[var(--semantic-surface-card)] text-[var(--semantic-ink-strong)] border',
        variant === 'error'
          ? 'border-[var(--semantic-toast-danger-border)] text-[var(--semantic-toast-danger-ink)]'
          : 'border-[var(--semantic-border-strong)]',
        isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none',
      ].join(' ')}
    >
      {children}
    </div>
  );
}
