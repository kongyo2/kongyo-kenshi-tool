import cx from 'clsx';
import type { ReactNode } from 'react';

export type ViewId =
  | 'inspector'
  | 'mods'
  | 'overview'
  | 'translate';

export interface SidebarItem {
  badge?: string;
  disabled?: boolean;
  icon: ReactNode;
  id: ViewId;
  label: string;
}

interface SidebarProps {
  activeId: ViewId;
  items: readonly SidebarItem[];
  onSelect: (id: ViewId) => void;
}

export const Sidebar = ({ activeId, items, onSelect }: SidebarProps) => (
  <aside className="sidebar">
    <div className="sidebar-brand">
      <div className="sidebar-brand-mark">K</div>
      <div className="sidebar-brand-text">
        <span className="sidebar-brand-title">Kenshiツール</span>
        <span className="sidebar-brand-subtitle">多機能mod支援</span>
      </div>
    </div>
    <nav className="sidebar-nav">
      {items.map((item) => (
        <button
          aria-current={activeId === item.id ? 'page' : undefined}
          className={cx('sidebar-nav-item', {
            'is-active': activeId === item.id,
            'is-disabled': item.disabled,
          })}
          disabled={item.disabled}
          key={item.id}
          onClick={() => {
            onSelect(item.id);
          }}
          type="button"
        >
          <span className="sidebar-nav-icon">{item.icon}</span>
          <span className="sidebar-nav-label">{item.label}</span>
          {item.badge ? (
            <span className="sidebar-nav-badge">{item.badge}</span>
          ) : null}
        </button>
      ))}
    </nav>
    <div className="sidebar-footer">
      <span className="sidebar-footer-title">OpenConstructionSet準拠</span>
      <span className="sidebar-footer-text">
        ItemType 128種対応 / fileType 16 &amp; 17
      </span>
    </div>
  </aside>
);
