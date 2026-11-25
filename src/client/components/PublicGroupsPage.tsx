import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, MessageSquareWarning, Users } from 'lucide-react';
import { useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
          y: 14,
          duration: 0.35,
          stagger: 0.04,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [data?.groups.length] },
  );

  return (
    <div ref={containerRef} className="flex flex-col gap-8">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      )}

      <section className="flex flex-col justify-between gap-5 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xs sm:flex-row sm:items-end sm:p-8">
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={onBackOverview}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke ringkasan
          </button>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Grup Terhubung & Panduan Banding
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Daftar grup Telegram yang aktif menerapkan moderasi federasi dan
            aturan komunitas {data?.communityName || 'tcbot'}.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-background/80 px-5 py-3">
          <p className="text-xs text-muted-foreground">Grup aktif</p>
          <p className="text-2xl font-bold tabular-nums">
            {data?.stats.connectedGroups ?? 0}
          </p>
        </div>
      </section>

      {loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : (data?.groups.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-dashed border-border px-6 py-14 text-center text-sm text-muted-foreground">
          Belum ada grup aktif yang terdaftar dalam federasi.
        </div>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data?.groups.map((group) => (
            <div
              key={group.chatId}
              className="group-card-reveal flex flex-col justify-between gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-base font-semibold text-foreground">
                      {group.title}
                    </h2>
                    <p className="font-mono text-xs text-muted-foreground">
                      {group.chatType}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                >
                  Aktif
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Terhubung sejak{' '}
                {new Date(group.addedAt).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-6">
        <div className="flex items-center gap-2 text-base font-semibold text-foreground">
          <MessageSquareWarning className="size-5 text-primary" />
          Cara Mengajukan Banding
        </div>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Jika Anda menerima sanksi ban federasi dan ingin mengajukan peninjauan
          ulang, kirim pesan pribadi (DM) ke bot dengan format{' '}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
            /appeal &lt;kode_ban&gt; &lt;alasan minimal 10 karakter&gt;
          </code>
          . Banding akan dikirim langsung ke antrean moderator untuk ditinjau.
        </p>
      </section>
    </div>
  );
}
