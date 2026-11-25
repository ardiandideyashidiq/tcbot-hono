import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, MessageSquareWarning } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { PublicOverview } from '../hooks/use-public-overview';

gsap.registerPlugin(useGSAP);

interface PublicGroupsPageProps {
  data: PublicOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBackOverview: () => void;
}

export function PublicGroupsPage({
  data,
  loading,
  error,
  onRetry,
  onBackOverview,
}: PublicGroupsPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.group-card-reveal', {
          opacity: 0,
          y: 8,
          duration: 0.26,
          stagger: 0.04,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [data?.groups.length] },
  );

  const groups = data?.groups ?? [];

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col gap-4 sm:gap-5"
    >
      {error && (
        <div className="flex shrink-0 items-center justify-between gap-3 rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          <span className="truncate">{error}</span>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 rounded-sm"
            onClick={onRetry}
          >
            Coba lagi
          </Button>
        </div>
      )}

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            onClick={onBackOverview}
            aria-label="Kembali ke ringkasan"
            className="min-h-11 shrink-0 gap-2 rounded-sm px-4"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">Ringkasan</span>
          </Button>
          <h1 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Grup Terhubung {data?.communityName || 'tcbot'}
          </h1>
        </div>

        <div className="flex items-baseline gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground tabular-nums">
          <span className="font-bold">{data?.stats.connectedGroups ?? 0}</span>
          <span className="text-[10px] text-muted-foreground uppercase">
            grup aktif
          </span>
        </div>
      </header>

      {/* Scrollable Swiss grid of connected groups */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
        {loading && !data ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-sm border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
            Belum ada grup aktif yang terdaftar dalam federasi.
          </div>
        ) : (
          <section
            aria-label="Daftar grup terhubung"
            className="grid grid-cols-1 gap-4 pb-2 sm:grid-cols-2 xl:grid-cols-3"
          >
            {groups.map((group, idx) => (
              <article
                key={group.chatId}
                className="group-card-reveal flex flex-col justify-between gap-4 rounded-sm border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-medium text-primary tabular-nums">
                    #{String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="rounded-sm border border-border bg-muted px-2 py-0.5 font-mono text-[10px] font-medium text-muted-foreground uppercase">
                    {group.chatType}
                  </span>
                </div>

                <h2 className="line-clamp-2 text-base font-semibold text-foreground">
                  {group.title}
                </h2>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-3 font-mono text-xs text-muted-foreground tabular-nums">
                  <span>ID {group.chatId}</span>
                  <span>
                    {new Date(group.addedAt).toLocaleDateString('id-ID', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {/* Bottom flat appeal guide */}
      <section aria-label="Panduan pengajuan banding" className="shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border bg-card px-4 py-3 text-xs text-foreground">
          <div className="flex items-center gap-2 font-medium">
            <MessageSquareWarning className="size-4 shrink-0 text-primary" />
            <span>Ajukan banding via DM bot:</span>
          </div>
          <code className="rounded-sm border border-border bg-muted px-2.5 py-1 font-mono text-xs text-foreground">
            /appeal &lt;kode_ban&gt; &lt;alasan ≥10 karakter&gt;
          </code>
        </div>
      </section>
    </div>
  );
}
