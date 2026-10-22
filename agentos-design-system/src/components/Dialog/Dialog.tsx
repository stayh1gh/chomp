import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export type DialogSize = 'sm' | 'default' | 'full';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  size?: DialogSize;
  footer?: ReactNode;
  children?: ReactNode;
}

const sizeClasses: Record<DialogSize, string> = {
  sm: 'max-w-[440px] max-h-[85vh]',
  default: 'max-w-[560px] max-h-[85vh]',
  full: 'w-full h-full max-w-none max-h-none rounded-none border-0 p-0',
};

/**
 * Modal overlay (sm/default sizes) plus a full-page variant with no backdrop tint, used for
 * the run detail view. See components/dialog.md.
 */
export function Dialog({ isOpen, onClose, title, description, size = 'default', footer, children }: DialogProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    contentRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isFull = size === 'full';

  return createPortal(
    <div
      className={[
        'fixed inset-0 z-50 flex items-center justify-center p-6',
        isFull ? 'bg-transparent items-stretch justify-start p-0 left-[var(--sidebar-w,220px)]' : 'bg-black/50',
      ].join(' ')}
      onMouseDown={(e) => {
        if (!isFull && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        className={[
          'w-full overflow-y-auto bg-[var(--semantic-surface)] border border-[var(--semantic-border)]',
          'rounded-[var(--semantic-radius-lg)] p-6 shadow-[0_16px_48px_rgba(0,0,0,0.5)]',
          'flex flex-col',
          sizeClasses[size],
        ].join(' ')}
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="dialog-title"
            className={
              isFull
                ? 'm-0 text-[length:var(--type-display-font-size)] font-semibold leading-[length:var(--type-display-line-height)] text-[var(--semantic-ink)]'
                : 'm-0 text-[length:var(--type-heading-sm-font-size)] font-semibold text-[var(--semantic-ink)]'
            }
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="-m-1 p-1 rounded-[var(--semantic-radius-md)] bg-transparent border-none text-[var(--semantic-icon-default)] cursor-pointer hover:text-[var(--semantic-ink-strong)] hover:bg-[var(--semantic-bg-ghost-default-hovered)]"
          >
            ✕
          </button>
        </div>
        {description && (
          <p className="mt-1.5 mb-3.5 text-[length:var(--type-caption-font-size)] text-[var(--semantic-ink-muted)]">
            {description}
          </p>
        )}
        <div className="flex-1 min-h-0">{children}</div>
        {footer && <div className="flex justify-end gap-2 mt-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
