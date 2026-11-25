import type { PublicRoute } from './PublicShell';

interface PublicFooterProps {
  communityName: string;
  onNavigate: (to: PublicRoute | '/admin') => void;
}

export function PublicFooter({ communityName, onNavigate }: PublicFooterProps) {
  return (
    <footer className="shrink-0 border-t border-border bg-background text-foreground">
      <div className="mx-auto flex min-h-11 w-full max-w-[1440px] items-center justify-between gap-4 px-4 pb-[env(safe-area-inset-bottom)] text-xs sm:px-6 lg:px-10">
        <div className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
          <span className="tabular-nums">© 2026</span>
          <span aria-hidden="true">·</span>
          <span className="truncate font-semibold tracking-wide text-foreground uppercase">
            {communityName}
          </span>
        </div>

        <nav
          aria-label="Tautan cepat footer"
          className="hidden items-center gap-5 md:flex"
        >
          <button
            type="button"
            onClick={() => onNavigate('/rules')}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Aturan
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/groups')}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Grup
          </button>
          <button
            type="button"
            onClick={() => onNavigate('/admin')}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Masuk Admin
          </button>
        </nav>

        <div className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
          <span
            aria-hidden="true"
            className="inline-block size-1.5 rounded-full bg-primary"
          />
          <span>cache 15s</span>
        </div>
      </div>
    </footer>
  );
}
