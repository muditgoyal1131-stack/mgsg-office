import React, { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import GlobalSearch from './GlobalSearch';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppNotification {
  id: number;
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  createdAt: string;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

interface NavGroup {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
  /** if true, group is only shown when the condition holds */
  show?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

const STORAGE_KEY = 'sidebar_groups';

function loadOpenGroups(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOpenGroups(state: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ─── NotificationBell component ───────────────────────────────────────────────

const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await getNotifications();
      const data = res.data;
      if (Array.isArray(data)) {
        setNotifications(data.slice(0, 10));
        setUnreadCount(data.filter((n: AppNotification) => !n.isRead).length);
      } else {
        setNotifications((data.notifications ?? []).slice(0, 10));
        setUnreadCount(data.unreadCount ?? 0);
      }
    } catch {
      // silently ignore polling errors
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleNotificationClick = async (n: AppNotification) => {
    if (!n.isRead) {
      try {
        await markNotificationRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch { /* ignore */ }
    }
    if (n.link) { setOpen(false); navigate(n.link); }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors focus:outline-none"
        aria-label="Notifications"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-800">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                  {unreadCount} new
                </span>
              )}
            </span>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={handleMarkAllRead} className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors">
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 transition-colors ml-1" aria-label="Close notifications">✕</button>
            </div>
          </div>

          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400 text-sm gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full text-left flex gap-0 border-b border-gray-50 last:border-b-0 hover:bg-gray-50 transition-colors focus:outline-none ${n.link ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <div className={`w-1 shrink-0 rounded-l ${n.isRead ? 'bg-transparent' : 'bg-blue-500'}`} />
                  <div className="px-3 py-3 flex-1 min-w-0">
                    <p className={`text-sm leading-snug truncate ${n.isRead ? 'font-normal text-gray-700' : 'font-semibold text-gray-900'}`}>{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">{n.message}</p>
                    <p className="text-[11px] text-gray-400 mt-1">{relativeTime(n.createdAt)}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── SidebarGroup component ───────────────────────────────────────────────────

interface SidebarGroupProps {
  group: NavGroup;
  isOpen: boolean;
  sidebarOpen: boolean;
  onToggle: () => void;
  currentPath: string;
}

const SidebarGroup: React.FC<SidebarGroupProps> = ({ group, isOpen, sidebarOpen, onToggle, currentPath }) => {
  const hasActive = group.items.some((item) => currentPath.startsWith(item.to));

  return (
    <div className="mb-0.5">
      {/* Group header — clickable to collapse/expand */}
      <button
        onClick={onToggle}
        title={!sidebarOpen ? group.label : undefined}
        className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors select-none
          ${hasActive ? 'text-blue-700 bg-blue-50/60' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'}`}
      >
        <span className="text-sm shrink-0">{group.icon}</span>
        {sidebarOpen && (
          <>
            <span className="flex-1 text-left truncate">{group.label}</span>
            <span className={`text-[10px] transition-transform duration-150 ${isOpen ? 'rotate-90' : ''}`}>▶</span>
          </>
        )}
      </button>

      {/* Group items */}
      {(isOpen || !sidebarOpen) && (
        <div className={sidebarOpen ? 'ml-3 mt-0.5 space-y-0.5' : 'space-y-0.5'}>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={!sidebarOpen ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <span className="text-base shrink-0">{item.icon}</span>
              {sidebarOpen && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Layout ───────────────────────────────────────────────────────────────────

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, logout, isAdmin, isHR, isPartner } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const saved = loadOpenGroups();
    // Default: all groups open
    return saved;
  });

  // Ctrl+K search shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const navGroups: NavGroup[] = [
    {
      key: 'overview',
      label: 'Overview',
      icon: '📊',
      items: [
        { to: '/dashboard',     label: 'Dashboard',     icon: '📊' },
        { to: '/announcements', label: 'Announcements', icon: '📢' },
        { to: '/reports',       label: 'Reports',       icon: '📈' },
      ],
    },
    {
      key: 'work',
      label: 'Work',
      icon: '📋',
      items: [
        { to: '/tasks',      label: 'Tasks',        icon: '📋' },
        { to: '/timesheets', label: 'Timesheet',    icon: '⏱️' },
        { to: '/udin',       label: 'UDIN Tracker', icon: '🔖' },
      ],
    },
    {
      key: 'clients',
      label: 'Clients & Billing',
      icon: '🏢',
      items: [
        { to: '/clients',        label: 'Clients',        icon: '🏢' },
        { to: '/invoices',       label: 'Invoices',       icon: '🧾' },
        { to: '/reimbursements', label: 'Reimbursements', icon: '💸' },
      ],
    },
    {
      key: 'hr',
      label: 'HR',
      icon: '👥',
      items: [
        { to: '/leaves',     label: 'Leave & Calendar', icon: '🏖️' },
        { to: '/attendance', label: 'Attendance',       icon: '📅' },
        { to: '/tickets',    label: 'IT Tickets',       icon: '🎫' },
      ],
    },
    ...(isAdmin || isPartner ? [{
      key: 'bizdev',
      label: 'Business Dev',
      icon: '🎯',
      items: [
        { to: '/leads',   label: 'Leads',   icon: '🎯' },
        { to: '/tenders', label: 'Tenders', icon: '📋' },
      ],
    }] : []),
    ...(isAdmin || isHR ? [{
      key: 'admin',
      label: 'Admin',
      icon: '⚙️',
      items: [
        { to: '/staff-management', label: 'Staff Management', icon: '👤' },
        { to: '/masters',          label: 'Masters',          icon: '🗂️' },
        { to: '/audit',            label: 'Audit Log',        icon: '🔍' },
      ],
    }] : []),
  ];

  // Auto-open the group that contains the active route
  useEffect(() => {
    const saved = loadOpenGroups();
    const updated = { ...saved };
    let changed = false;
    navGroups.forEach((group) => {
      const hasActive = group.items.some((item) => location.pathname.startsWith(item.to));
      if (hasActive && updated[group.key] !== true) {
        updated[group.key] = true;
        changed = true;
      }
    });
    if (changed) {
      setOpenGroups(updated);
      saveOpenGroups(updated);
    }
  }, [location.pathname]); // navGroups is stable per render — intentional

  const toggleGroup = (key: string) => {
    setOpenGroups((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveOpenGroups(next);
      return next;
    });
  };

  // Default all groups to open on first visit
  const isGroupOpen = (key: string) => {
    if (openGroups[key] === undefined) return true; // default open
    return openGroups[key];
  };

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="flex h-screen bg-gray-50">
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-52' : 'w-14'} bg-white border-r border-gray-200 flex flex-col transition-all duration-200 shrink-0`}>
        {/* Logo + collapse toggle */}
        <div className="flex items-center justify-between px-3 py-4 border-b border-gray-100">
          {sidebarOpen && <span className="font-bold text-blue-700 text-lg tracking-tight">MGSG</span>}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            {sidebarOpen ? '◀' : '▶'}
          </button>
        </div>

        {/* Search trigger */}
        <div className="px-2 pt-3">
          <button
            onClick={() => setSearchOpen(true)}
            className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-gray-500 bg-gray-50 hover:bg-gray-100 transition-colors border border-gray-200 ${!sidebarOpen ? 'justify-center' : ''}`}
          >
            <span>🔍</span>
            {sidebarOpen && (
              <span className="flex-1 text-left text-xs">Search… <kbd className="ml-1 text-gray-400">Ctrl+K</kbd></span>
            )}
          </button>
        </div>

        {/* Nav groups */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {navGroups.map((group) => (
            <SidebarGroup
              key={group.key}
              group={group}
              isOpen={isGroupOpen(group.key)}
              sidebarOpen={sidebarOpen}
              onToggle={() => toggleGroup(group.key)}
              currentPath={location.pathname}
            />
          ))}
        </nav>

        {/* Bottom — profile + logout */}
        <div className="px-2 py-3 border-t border-gray-100 space-y-0.5">
          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`
            }
          >
            <span className="text-base">👤</span>
            {sidebarOpen && <span>Profile</span>}
          </NavLink>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="text-base">🚪</span>
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <h1 className="text-base font-semibold text-gray-800">Office Management System</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
            >
              <span>🔍</span>
              <span>Search</span>
              <kbd className="text-xs bg-white text-gray-400 px-1.5 py-0.5 rounded border">Ctrl+K</kbd>
            </button>
            <NotificationBell />
            <span className="text-sm text-gray-500">{user?.staffName || user?.email}</span>
            {isAdmin && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Admin</span>}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
};
