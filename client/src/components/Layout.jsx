// App shell around every logged-in page: a floating top bar with pill navigation (no sidebar),
// round icon buttons and the user menu. On phones the pills move into a slide-out sheet.
// The menu is built from routes.jsx (label, icon, group). Owner: integrator.
import { useState } from 'react';
import { Link, NavLink, Outlet, matchPath, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Boxes, ChevronDown, LayoutDashboard, LogOut, Menu, Moon, Palette, Sparkles, Sun, BarChart3, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from './theme-provider';
import { ROUTES } from '../routes';
import NotificationBell from '../modules/notifications/NotificationBell';
import { cn } from '@/lib/utils';
import {
  Avatar, AvatarFallback, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, Sheet, SheetContent, SheetTitle, Tooltip, TooltipContent, TooltipTrigger,
} from './ui';

// Order of the pills, and the icon a drop-down pill shows.
const GROUPS = [
  { name: 'Dashboard', icon: LayoutDashboard },
  { name: 'Assets', icon: Boxes },
  { name: 'Operations', icon: ArrowLeftRight },
  { name: 'Activity', icon: ClipboardList },
  { name: 'Reports', icon: BarChart3 },
  { name: 'AI', icon: Sparkles },
];
// With this many screens or fewer, every screen gets its own pill; above it, groups become drop-downs.
const FLAT_LIMIT = 6;

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export function BrandMark({ className }) {
  return (
    <span className={cn('bg-orb relative block size-9 shrink-0 rounded-full shadow-[0_0_24px_-2px] shadow-primary/70', className)} aria-hidden="true">
      <span className="bg-highlight absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-background" />
    </span>
  );
}

function Brand({ onClick }) {
  return (
    <Link to="/" onClick={onClick} className="flex items-center gap-3">
      <BrandMark />
      <span className="leading-tight">
        <span className="font-display block text-[1.05rem] font-semibold tracking-tight whitespace-nowrap">Asset Manager</span>
        <span className="text-muted-foreground hidden text-[0.7rem] whitespace-nowrap sm:block">AI · Co-Working Space</span>
      </span>
    </Link>
  );
}

function useMenu(user) {
  const menu = ROUTES.filter((r) => r.label && r.roles.includes(user.role));
  // Known groups first, in GROUPS order; any other group name used in routes.jsx goes at the end.
  const extra = [...new Set(menu.map((r) => r.group || 'Assets'))].filter((n) => !GROUPS.some((g) => g.name === n)).map((name) => ({ name }));
  const groups = [...GROUPS, ...extra].map((g) => ({ ...g, items: menu.filter((r) => (r.group || 'Assets') === g.name) })).filter((g) => g.items.length);
  return { menu: groups.flatMap((g) => g.items), groups };
}

const pill = (active) =>
  cn(
    'inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
    active
      ? 'bg-foreground text-background border-transparent font-medium shadow-[0_0_20px_-6px] shadow-foreground/40'
      : 'bg-secondary/80 text-muted-foreground border-border hover:text-foreground hover:bg-secondary'
  );

function PillNav({ user }) {
  const { pathname } = useLocation();
  const { menu, groups } = useMenu(user);
  const isActive = (r) => Boolean(matchPath({ path: r.path, end: true }, pathname));

  if (menu.length <= FLAT_LIMIT) {
    return (
      <nav className="flex items-center gap-1.5" aria-label="Main">
        {menu.map((r) => (
          <NavLink key={r.path} to={r.path} end className={({ isActive: a }) => pill(a)}>{r.label}</NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className="flex items-center gap-1.5" aria-label="Main">
      {groups.map((g) => {
        if (g.items.length === 1) {
          const r = g.items[0];
          return <NavLink key={r.path} to={r.path} end className={({ isActive: a }) => pill(a)}>{r.label}</NavLink>;
        }
        const current = g.items.find(isActive);
        return (
          <DropdownMenu key={g.name}>
            <DropdownMenuTrigger className={cn(pill(Boolean(current)), 'cursor-pointer data-[state=open]:border-foreground/25')}>
              {current ? current.label : g.name}
              <ChevronDown className="size-3.5 opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" sideOffset={8} className="w-60">
              <DropdownMenuLabel className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.16em] uppercase">{g.name}</DropdownMenuLabel>
              {g.items.map(({ path, label, icon: Icon }) => (
                <DropdownMenuItem key={path} asChild className={cn(isActive({ path }) && 'bg-secondary')}>
                  <Link to={path}>
                    {Icon && <Icon />}
                    <span className="flex-1">{label}</span>
                    {isActive({ path }) && <span className="bg-highlight size-1.5 rounded-full" />}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}

function MobileNav({ user, onNavigate }) {
  const { groups } = useMenu(user);
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <Brand onClick={onNavigate} />
      {groups.map((g) => (
        <div key={g.name} className="space-y-1.5">
          <p className="text-muted-foreground px-1 text-[0.68rem] font-medium tracking-[0.16em] uppercase">{g.name}</p>
          {g.items.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end
              onClick={onNavigate}
              className={({ isActive }) =>
                cn('flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors', isActive ? 'bg-foreground text-background font-medium' : 'bg-secondary/60 hover:bg-secondary')
              }
            >
              {Icon && <Icon className="size-4" />}
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </div>
  );
}

function UserMenu({ user, onLogout }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label="Account menu">
          <Avatar className="ring-border size-10 ring-1">
            <AvatarFallback className="bg-orb text-sm font-semibold text-white">{initials(user.name)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="text-muted-foreground truncate text-xs">{user.email} · {user.role}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/ui-template"><Palette /> UI template</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onLogout}>
          <LogOut /> Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ThemeToggle({ className }) {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="secondary" size="icon" className={cn('border-border border', className)} onClick={toggleTheme} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
          {dark ? <Sun /> : <Moon />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{dark ? 'Light mode' : 'Dark mode'}</TooltipContent>
    </Tooltip>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-svh">
      <header className="bg-background/40 sticky top-0 z-30 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center gap-4 px-4 md:px-8">
          <Brand />
          <div className="hidden flex-1 justify-center xl:flex">
            <PillNav user={user} />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 xl:ml-0">
            <ThemeToggle />
            <NotificationBell />
            <UserMenu user={user} onLogout={() => { logout(); navigate('/login'); }} />
            <Button variant="secondary" size="icon" className="border-border border xl:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <Menu />
            </Button>
          </div>
        </div>
      </header>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-80 border-l p-0">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <MobileNav user={user} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <main className="px-4 pt-4 pb-16 md:px-8 md:pt-6">
        <Outlet />
      </main>
    </div>
  );
}
