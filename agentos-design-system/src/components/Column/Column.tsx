import type { ReactNode } from 'react';

export interface ColumnProps {
  title: ReactNode;
  count?: number;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  emptyLabel?: string;
}

/**
 * One board lane. See components/column.md — one instance per `phase` value declared by the
 * active chain, in the chain's own declared order.
 */
export function Column({ title, count, icon, actions, children, emptyLabel = 'No tasks' }: ColumnProps) {
  const isEmpty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <div className="group w-[var(--column-w,348px)] shrink-0 pt-1 px-1 flex">
      <div
        className="flex-1 min-w-0 flex flex-col rounded-t-[var(--semantic-radius-sm)]"
        style={{
          background: 'linear-gradient(to bottom, rgba(9,9,10,0.4) 0%, rgba(9,9,10,0.1) 100%)',
        }}
      >
        <div className="shrink-0 h-[46px] flex items-center justify-between pl-3.5 pr-2">
          <div className="flex items-center gap-2 min-w-0">
            {icon && <span className="inline-flex shrink-0">{icon}</span>}
            <h2 className="m-0 ml-0.5 text-[length:var(--type-caption-strong-font-size)] font-medium text-[var(--semantic-ink-strong)] whitespace-nowrap">
              {title}
            </h2>
            {typeof count === 'number' && (
              <span className="text-[length:var(--type-caption-font-size)] text-[var(--semantic-ink-subtle)]">
                {count}
              </span>
            )}
          </div>
          {actions && (
            <div className="flex gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
              {actions}
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 flex flex-col gap-2 px-2 py-3 overflow-y-auto">
          {isEmpty ? (
            <p className="text-[length:var(--type-caption-font-size)] text-[var(--semantic-ink-disabled)] text-center py-2">
              {emptyLabel}
            </p>
          ) : (
            children
          )}
        </div>
      </div>
    </div>
  );
}
