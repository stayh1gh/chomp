import type { ReactNode } from 'react';

export interface SidebarNavItem {
  key: string;
  label: string;
  icon?: ReactNode;
  href?: string;
  isActive?: boolean;
}

export interface SidebarNavProps {
  logo?: ReactNode;
  items: SidebarNavItem[];
  footerNote?: ReactNode;
}

/**
 * The fixed 220px left rail. See components/sidebar-nav.md — one instance per page render;
 * items with no href render as inert (no working route yet), never as dead links.
 */
export function SidebarNav({ logo, items, footerNote }: SidebarNavProps) {
  return (
    <nav
      className="flex flex-col shrink-0 pt-[26px] px-3 overflow-hidden"
      style={{ width: 'var(--sidebar-w, 220px)' }}
    >
      {logo && (
        <div className="mb-8">
          <div className="relative w-8 h-8 rounded-[var(--semantic-radius-lg)] bg-[var(--semantic-accent-tile)] overflow-hidden">
            {logo}
          </div>
        </div>
      )}
      <ul className="list-none m-0 p-0 flex flex-col gap-1">
        {items.map((item) => {
          const isInert = !item.href;
          const Tag = isInert ? 'span' : 'a';
          return (
            <li key={item.key}>
              <Tag
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
                className={[
                  'flex items-center gap-2 h-10 pl-2 pr-[9px] rounded-[var(--semantic-radius-lg)] no-underline whitespace-nowrap',
                  'text-[length:var(--type-nav-item-font-size)] font-normal',
                  item.isActive ? 'text-[var(--semantic-ink-strong)]' : 'text-[var(--semantic-ink-nav)]',
                  isInert
                    ? 'cursor-default'
                    : 'hover:bg-[var(--semantic-sidebar-item-hovered-bg)] hover:text-[var(--semantic-sidebar-item-hovered-ink)]',
                ].join(' ')}
              >
                {item.icon && <span className="inline-flex items-center w-5 shrink-0">{item.icon}</span>}
                <span className="overflow-hidden text-ellipsis">{item.label}</span>
              </Tag>
            </li>
          );
        })}
      </ul>
      {footerNote && (
        <div className="mt-auto py-2.5">
          <p
            className="m-0 mb-2 text-[length:var(--type-nano-font-size)] leading-[length:var(--type-nano-line-height)]"
            style={{ color: 'var(--semantic-sidebar-note-ink)' }}
          >
            {footerNote}
          </p>
        </div>
      )}
    </nav>
  );
}
