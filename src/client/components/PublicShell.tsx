import {
  BookOpen,
  LayoutDashboard,
  Lock,
  Moon,
  RefreshCw,
  Sun,
  Users,
} from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

export type PublicRoute = '/' | '/rules' | '/groups';

interface PublicShellProps {
  currentRoute: PublicRoute;
  communityName: string;
  darkMode: boolean;
  loading: boolean;
  onRefresh: () => void;
  onToggleTheme: (event: MouseEvent<HTMLButtonElement>) => void;
  onNavigate: (to: PublicRoute | '/admin') => void;
  children: ReactNode;
}

const NAV_LINKS: Array<{
  route: PublicRoute;
  label: string;
  icon: typeof LayoutDashboard;
}> = [
  { route: '/', label: 'Ringkasan', icon: LayoutDashboard },
  { route: '/rules', label: 'Aturan', icon: BookOpen },
  { route: '/groups', label: 'Grup', icon: Users },
];

export function PublicShell({
  currentRoute,
  communityName,
  darkMode,
  loading,
  onRefresh,
  onToggleTheme,
  onNavigate,
  children,
}: PublicShellProps) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-background text-foreground">
      {/* Ambient radial aurora backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(37,99,235,0.16),transparent)] dark:bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(59,130,246,0.22),transparent)]"
      />

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-3 px-4 py-3 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-10">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="justify-self-start text-left text-base font-bold tracking-tight text-foreground transition-opacity hover:opacity-80"
          >
            {communityName}
          </button>

          <nav
            aria-label="Navigasi publik"
            className="hidden items-center gap-1 justify-self-center rounded-xl border border-border/70 bg-muted/40 p-1 md:flex"
          >
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = currentRoute === link.route;
              return (
                <button
                  key={link.route}
                  type="button"
                  onClick={() => onNavigate(link.route)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-background text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {link.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 justify-self-end sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
              aria-label="Muat ulang data"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
              aria-label={
                darkMode ? 'Aktifkan mode terang' : 'Aktifkan mode gelap'
              }
              onClick={onToggleTheme}
            >
              {darkMode ? (
                <Sun className="size-4" />
              ) : (
                <Moon className="size-4" />
              )}
            </Button>
            <Button
              size="sm"
              className="min-h-11 gap-1.5 px-3.5 sm:min-h-9"
              onClick={() => onNavigate('/admin')}
            >
              <Lock className="size-3.5" />
              <span>Masuk admin</span>
            </Button>
          </div>
        </div>

        {/* Mobile sub-navigation bar */}
        <nav
          aria-label="Navigasi publik mobile"
          className="flex items-center gap-1 overflow-x-auto border-t border-border/60 px-4 py-2 md:hidden"
        >
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = currentRoute === link.route;
            return (
              <button
                key={link.route}
                type="button"
                onClick={() => onNavigate(link.route)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'bg-muted/50 text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-3.5" />
                {link.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-[1480px] flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
        {children}
      </main>
    </div>
  );
}
