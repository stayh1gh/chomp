import type { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  tags?: ReactNode;
  footer?: ReactNode;
  onClick?: () => void;
}

/**
 * The board's primary content unit. See components/card.md — the description well
 * (surface-inset) is reserved for the clamped 4-line description only.
 */
export function Card({ title, meta, description, tags, footer, onClick, className = '', ...rest }: CardProps) {
  const isInteractive = Boolean(onClick);

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={[
        'flex flex-col bg-[var(--semantic-surface-card)] rounded-[var(--semantic-radius-lg)]',
        'shadow-[0_0_0_0_rgba(255,255,255,0.05),0_0.5px_1px_0_rgba(0,0,0,0.3)]',
        'hover:shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0.5px_1px_0_rgba(0,0,0,0.3)]',
        isInteractive ? 'cursor-pointer focus-visible:outline focus-visible:outline-[var(--border-width-focus)] focus-visible:outline-[var(--semantic-focus-ring)] focus-visible:outline-offset-[var(--focus-offset)]' : '',
        footer ? 'pt-3 gap-3' : 'py-3',
        className,
      ].join(' ')}
      {...rest}
    >
      <div className="flex flex-col gap-2 px-2">
        {meta && (
          <p className="m-0 px-[3px] text-[length:var(--type-caption-font-size)] text-[var(--semantic-ink-muted)]">
            {meta}
          </p>
        )}
        <p className="m-0 text-[length:var(--type-title-font-size)] font-medium leading-[length:var(--type-title-line-height)] text-[var(--semantic-ink)]">
          {title}
        </p>
        {description && (
          <div className="bg-[var(--semantic-surface-inset)] rounded-[var(--semantic-radius-lg)] p-2">
            <p className="m-0 text-[length:var(--type-caption-font-size)] leading-[length:var(--type-caption-line-height)] text-[var(--semantic-ink-body)] line-clamp-4">
              {description}
            </p>
          </div>
        )}
        {tags && <div className="flex flex-wrap gap-2">{tags}</div>}
      </div>
      {footer && (
        <div className="flex items-center border-t border-[var(--semantic-divider)]">{footer}</div>
      )}
    </div>
  );
}
