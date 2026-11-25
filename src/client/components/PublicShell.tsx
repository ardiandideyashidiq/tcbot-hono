import {
  BookOpen,
  LayoutDashboard,
  Moon,
  RefreshCw,
  Sun,
  Users,
} from 'lucide-react';
import { type MouseEvent, type ReactNode, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { useViewportFit } from '../hooks/use-viewport-fit';
import { PublicFooter } from './PublicFooter';

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
  const stageRef = useRef<HTMLDivElement | null>(null);
  useViewportFit(stageRef, currentRoute);

  return (
    <div className="relative grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-10">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="min-h-14 justify-self-start truncate text-left text-sm font-bold tracking-[0.14em] text-foreground uppercase transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {communityName}
          </button>

          <nav
            aria-label="Navigasi publik"
            className="hidden items-stretch justify-self-center gap-1 md:flex"
          >
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = currentRoute === link.route;
              return (
                <button
                  key={link.route}
                  type="button"
                  onClick={() => onNavigate(link.route)}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex min-h-14 items-center gap-2 border-b-2 px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  <span>{link.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center justify-self-end gap-2 py-1.5">
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 rounded-sm"
              aria-label="Muat ulang data"
              onClick={onRefresh}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="min-h-11 min-w-11 rounded-sm"
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
          </div>
        </div>

        {/* Mobile navigation bar */}
        <nav
          aria-label="Navigasi publik mobile"
          className="grid grid-cols-3 border-t border-border bg-card md:hidden"
        >
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = currentRoute === link.route;
            return (
              <button
                key={link.route}
                type="button"
                onClick={() => onNavigate(link.route)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center justify-center gap-2 border-b-2 px-2 text-xs font-medium transition-colors ${
                  active
                    ? 'border-primary bg-muted/50 text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{link.label}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        <div
          ref={stageRef}
          data-density="normal"
          className="mx-auto flex h-full min-h-0 w-full max-w-[1440px] flex-col overflow-hidden px-4 py-4 sm:px-6 sm:py-6 lg:px-10 lg:py-8"
        >
          {children}
        </div>
      </main>

      <PublicFooter communityName={communityName} onNavigate={onNavigate} />
    </div>
  );
}
