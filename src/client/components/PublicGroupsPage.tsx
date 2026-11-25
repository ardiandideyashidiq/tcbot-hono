import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, MessageSquareWarning } from 'lucide-react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { PublicOverview } from '../hooks/use-public-overview';
import { TicketStub } from './public/TicketStub';

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
          y: 10,
          duration: 0.3,
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
      className="flex h-full min-h-0 flex-col gap-3 sm:gap-4"
    >
      {error && (
        <div className="flex shrink-0 items-center justify-between gap-3 border border-destructive/40 bg-[var(--tape-crimson)] px-3 py-1.5 text-xs text-destructive">
          <span className="truncate">{error}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 px-2.5 text-xs"
            onClick={onRetry}
          >
            Coba lagi
          </Button>
        </div>
      )}

      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--rule-line)] pb-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBackOverview}
            aria-label="Kembali ke ringkasan"
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 border border-[var(--rule-line)] bg-card/70 px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-[var(--ink)] sm:min-h-8"
          >
            <ArrowLeft className="size-3.5" />
            <span className="hidden sm:inline">Ringkasan</span>
          </button>
          <h1 className="truncate font-display text-2xl leading-none tracking-tight text-[var(--ink)] sm:text-3xl">
            Grup Terhubung {data?.communityName || 'tcbot'}
          </h1>
        </div>

        <div className="stamp flex items-baseline gap-1.5 px-2.5 py-0.5 font-mono text-xs text-[var(--ink)]">
          <span className="font-bold tabular-nums">
            {data?.stats.connectedGroups ?? 0}
          </span>
          <span className="text-[10px] text-muted-foreground uppercase">
            grup aktif
          </span>
        </div>
      </header>

      {/* Internal scrolling TicketStub collage */}
      <div className="docket-scroll min-h-0 flex-1 overflow-y-auto px-1 py-1">
        {loading && !data ? (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="ticket-edge mb-4 h-28 break-inside-avoid animate-pulse border border-[var(--rule-line)] bg-muted/40"
              />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="border border-dashed border-[var(--rule-line)] px-6 py-12 text-center text-sm text-muted-foreground">
            Belum ada grup aktif yang terdaftar dalam federasi.
          </div>
        ) : (
          <section
            aria-label="Daftar grup terhubung"
            className="columns-1 gap-4 sm:columns-2 xl:columns-3"
          >
            {groups.map((group, idx) => (
              <TicketStub key={group.chatId} group={group} index={idx} />
            ))}
          </section>
        )}
      </div>

      {/* Bottom tilted appeal tape */}
      <section aria-label="Panduan pengajuan banding" className="shrink-0 pt-1">
        <div className="flex origin-left -rotate-[0.6deg] flex-wrap items-center justify-between gap-2 border border-[var(--rule-line)] bg-[var(--tape-crimson)] px-3.5 py-2 text-xs text-[var(--ink)]">
          <div className="flex items-center gap-2 font-medium">
            <MessageSquareWarning className="size-4 shrink-0 text-rose-700 dark:text-rose-300" />
            <span>Ajukan banding via DM bot:</span>
          </div>
          <code className="bg-[var(--paper)]/85 px-2 py-0.5 font-mono text-[11px] text-[var(--ink)]">
            /appeal &lt;kode_ban&gt; &lt;alasan ≥10 karakter&gt;
          </code>
        </div>
      </section>
    </div>
  );
}
