import {
  BookOpen,
  LayoutDashboard,
  Lock,
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
    <div className="public-scope relative grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-[var(--paper)] text-[var(--ink)]">
      {/* Subtle paper grain overlay + single horizon hairline */}
      <div aria-hidden="true" className="paper-grain fixed inset-0 z-0" />

      <header className="relative z-30 shrink-0 border-b border-[var(--rule-line)] bg-[var(--paper)]/95">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between gap-2 px-4 py-2 sm:px-6 md:grid md:grid-cols-[1fr_auto_1fr] lg:px-10">
          <button
            type="button"
            onClick={() => onNavigate('/')}
            className="min-h-0 justify-self-start truncate text-left text-base font-bold tracking-tight text-[var(--ink)] transition-opacity hover:opacity-80"
          >
            {communityName}
          </button>

          <nav
            aria-label="Navigasi publik"
            className="hidden items-center gap-1 justify-self-center border border-[var(--rule-line)] bg-background/60 p-0.5 md:flex"
          >
            {NAV_LINKS.map((link) => {
              const Icon = link.icon;
              const active = currentRoute === link.route;
              return (
                <button
                  key={link.route}
                  type="button"
                  onClick={() => onNavigate(link.route)}
                  className={`inline-flex min-h-8 items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors ${
                    active
                      ? 'bg-[var(--ink)] text-[var(--paper)]'
                      : 'text-muted-foreground hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon className="size-3.5" />
                  {link.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1 justify-self-end sm:gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
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
              className="min-h-11 min-w-11 sm:min-h-8 sm:min-w-8"
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
              className="min-h-11 gap-1.5 px-3 sm:min-h-8"
              onClick={() => onNavigate('/admin')}
            >
              <Lock className="size-3.5" />
              <span>Masuk admin</span>
            </Button>
          </div>
        </div>

        {/* Mobile compact sub-navigation bar */}
        <nav
          aria-label="Navigasi publik mobile"
          className="flex items-center gap-1 overflow-x-auto border-t border-[var(--rule-line)] px-4 py-1.5 md:hidden"
        >
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const active = currentRoute === link.route;
            return (
              <button
                key={link.route}
                type="button"
                onClick={() => onNavigate(link.route)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 border px-3 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                    : 'border-[var(--rule-line)] bg-background/50 text-muted-foreground hover:text-[var(--ink)]'
                }`}
              >
                <Icon className="size-3.5" />
                {link.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 min-h-0 flex-1 overflow-hidden">
        <div
          ref={stageRef}
          data-density="normal"
          className="public-scope relative mx-auto flex h-full min-h-0 w-full max-w-[1480px] flex-col overflow-hidden px-4 py-3 sm:px-6 sm:py-4 lg:px-10 lg:py-5"
        >
          {children}
        </div>
      </main>

      <PublicFooter communityName={communityName} onNavigate={onNavigate} />
    </div>
  );
}
