import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronsLeft, ChevronsRight, LogOut, Mail, Moon, Plus, Search, Sun, Monitor, KeyRound, Keyboard } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth, useMe } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { NAV } from './nav';
import { Avatar, Kbd } from '../ui/misc';
import { Button } from '../ui/button';
import { DropdownContent, DropdownItem, DropdownLabel, DropdownMenu, DropdownSeparator, DropdownTrigger, Tooltip } from '../ui/overlays';
import { CommandPalette } from './command-palette';
import { TimerWidget } from './timer-widget';
import { NotificationBell } from './notification-bell';
import { useTheme } from '@/hooks/use-theme';
import { ShortcutsDialog, useGlobalShortcuts } from './shortcuts';
import { ChangePasswordDialog } from './change-password';

function readCollapsed() {
  try {
    // Narrow screens start with the compact sidebar unless the user chose otherwise.
    const saved = localStorage.getItem('taskora-sidebar');
    if (!saved) return window.innerWidth < 1100;
    return saved === 'collapsed';
  } catch {
    return false;
  }
}

export function AppShell() {
  const me = useMe();
  const { can, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    try {
      localStorage.setItem('taskora-sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useGlobalShortcuts({ openPalette: () => setPaletteOpen(true), openHelp: () => setShortcutsOpen(true) });

  const counts = useQuery({
    queryKey: ['ticket-counts'],
    queryFn: () => api.get<Record<string, number>>('/tickets/counts'),
    enabled: can('tickets.read'),
    refetchInterval: 60_000,
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={cn('flex shrink-0 flex-col bg-sidebar text-sidebar-fg transition-[width] duration-150', collapsed ? 'w-14' : 'w-60')}>
        <div className="flex h-12 shrink-0 items-center gap-2 px-3.5">
          <img src="/favicon.svg" alt="" className="size-6" />
          {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight text-white">Taskora</span>}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 scrollbar-thin" aria-label="Main">
          {NAV.map((section) => {
            const items = section.items.filter((i) => !i.perm || can(i.perm));
            if (!items.length) return null;
            return (
              <div key={section.label} className="mt-3">
                {!collapsed ? (
                  <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">{section.label}</div>
                ) : (
                  <div className="mx-2 mb-1 h-px bg-white/5" />
                )}
                {items.map((item) => {
                  const Icon = item.icon;
                  const badge = item.badge ? counts.data?.[item.badge] : undefined;
                  const link = (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          'group flex h-7 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors hover:bg-sidebar-active hover:text-white',
                          isActive && 'bg-sidebar-active font-medium text-white',
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0 opacity-80" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {!collapsed && !!badge && (
                        <span
                          className={cn(
                            'ml-auto rounded px-1.5 text-[10px] font-semibold tabular-nums',
                            item.badge === 'breached' ? 'bg-red-500/20 text-red-300' : 'bg-white/10 text-sidebar-fg',
                          )}
                        >
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  );
                  return collapsed ? (
                    <Tooltip key={item.to} content={item.label} side="right">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  );
                })}
              </div>
            );
          })}
        </nav>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-9 shrink-0 cursor-pointer items-center gap-2 border-t border-white/5 px-4 text-xs text-sidebar-muted hover:text-white"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full max-w-md cursor-pointer items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-[13px] text-muted hover:border-border-strong"
          >
            <Search className="size-3.5" />
            <span className="flex-1 text-left">Search tickets, companies, contacts, devices…</span>
            <Kbd>Ctrl K</Kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {can('tickets.write') && (
              <Button variant="primary" size="sm" onClick={() => navigate('/tickets/new', { state: { from: location.pathname } })}>
                <Plus /> New ticket
              </Button>
            )}
            {can('time.write') && <TimerWidget />}
            <NotificationBell />
            <DropdownMenu>
              <DropdownTrigger asChild>
                <button className="ml-1 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2" aria-label="Account menu">
                  <Avatar name={`${me.user.firstName} ${me.user.lastName}`} />
                  <span className="hidden text-left leading-tight md:block">
                    <span className="block text-[12px] font-medium">
                      {me.user.firstName} {me.user.lastName}
                    </span>
                    <span className="block text-[11px] text-muted">{me.user.roleName}</span>
                  </span>
                </button>
              </DropdownTrigger>
              <DropdownContent>
                <DropdownLabel>{me.organization.name}</DropdownLabel>
                <DropdownSeparator />
                <DropdownItem onSelect={() => setTheme('light')}>
                  <Sun /> Light {theme === 'light' && '✓'}
                </DropdownItem>
                <DropdownItem onSelect={() => setTheme('dark')}>
                  <Moon /> Dark {theme === 'dark' && '✓'}
                </DropdownItem>
                <DropdownItem onSelect={() => setTheme('system')}>
                  <Monitor /> System {theme === 'system' && '✓'}
                </DropdownItem>
                <DropdownSeparator />
                <DropdownItem onSelect={() => setShortcutsOpen(true)}>
                  <Keyboard /> Keyboard shortcuts
                </DropdownItem>
                {me.emailEnabled && (
                  <DropdownItem
                    onSelect={async () => {
                      await api.patch('/auth/preferences', { emailNotifications: me.preferences.emailNotifications === false });
                      await refresh();
                    }}
                  >
                    <Mail /> E-mail notifications: {me.preferences.emailNotifications === false ? 'off' : 'on'}
                  </DropdownItem>
                )}
                <DropdownItem onSelect={() => setPwOpen(true)}>
                  <KeyRound /> Change password
                </DropdownItem>
                <DropdownItem
                  onSelect={async () => {
                    await logout();
                    navigate('/login');
                  }}
                >
                  <LogOut /> Sign out
                </DropdownItem>
              </DropdownContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </div>
  );
}
