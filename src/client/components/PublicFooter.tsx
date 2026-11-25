import type { PublicRoute } from './PublicShell';

interface PublicFooterProps {
  communityName: string;
  onNavigate: (to: PublicRoute | '/admin') => void;
}

export function PublicFooter({ communityName, onNavigate }: PublicFooterProps) {
  return (
    <footer className="public-scope shrink-0 border-t border-[var(--rule-line)] bg-[var(--paper)]/95 text-[var(--ink)]">
      <div className="mx-auto flex min-h-11 w-full max-w-[1480px] items-center justify-between gap-3 px-4 pb-[env(safe-area-inset-bottom)] text-xs sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
          <span>© 2026</span>
          <span aria-hidden="true">·</span>
          <span className="truncate font-medium text-[var(--ink)]">
            {communityName}
          </span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0 font-mono text-[11px] uppercase tracking-wider">
            Docket v1
          </span>
        </div>

        <nav
          aria-label="Tautan cepat footer"
          className="hidden items-center gap-4 md:flex"
        >
          <button
            type="button"
            onClick={() => onNavigate('/rules')}
            className="min-h-0 text-xs font-medium text-muted-foreground transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Aturan
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/groups')}
            className="min-h-0 text-xs font-medium text-muted-foreground transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Grup
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/admin')}
            className="min-h-0 text-xs font-medium text-muted-foreground transition-colors hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Masuk admin
          </button>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
          <span
            aria-hidden="true"
            className="inline-block size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400"
          />
          <span>cache 15s</span>
        </div>
      </div>
    </footer>
  );
}
