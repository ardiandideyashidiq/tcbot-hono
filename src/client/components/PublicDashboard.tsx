import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowRight, BookOpen, Users } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { PublicOverview } from '../hooks/use-public-overview';
import type { PublicRoute } from './PublicShell';

gsap.registerPlugin(useGSAP);

interface PublicDashboardProps {
  data: PublicOverview | null;
  loading: boolean;
  error: string | null;
  darkMode: boolean;
  onRetry: () => void;
  onNavigate: (to: PublicRoute) => void;
}

export function PublicDashboard({
  data,
  loading,
  error,
  onRetry,
  onNavigate,
}: PublicDashboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const ruleCounts = useMemo(() => {
    const allRules = data?.rules ?? [];
    let mandatory = 0;
    let advisory = 0;
    for (const rule of allRules) {
      if (rule.isMandatory) mandatory += 1;
      else advisory += 1;
    }
    return { mandatory, advisory };
  }, [data?.rules]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.swiss-reveal', {
          opacity: 0,
          y: 8,
          duration: 0.28,
          stagger: 0.04,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef },
  );

  const communityName = data?.communityName || 'tcbot';
  const latestRules = (data?.rules ?? []).slice(0, 8);

  const metrics = [
    { label: 'Grup', value: data?.stats.connectedGroups ?? 0, tone: 'default' },
    {
      label: 'Aturan',
      value: data?.stats.publishedRules ?? 0,
      tone: 'default',
    },
    {
      label: 'Banding',
      value: data?.stats.resolvedAppeals ?? 0,
      tone: 'primary',
    },
    {
      label: 'Sanksi',
      value: data?.stats.activeModerations ?? 0,
      tone: 'destructive',
    },
  ] as const;

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain lg:overflow-hidden"
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

      {/* 4-column Swiss metric strip */}
      <section
        aria-label="Ringkasan statistik federasi"
        className="swiss-reveal grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-sm border border-border bg-border sm:grid-cols-4"
      >
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex flex-col justify-between gap-1.5 bg-card px-4 py-3.5 sm:px-5 sm:py-4"
          >
            <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              {metric.label}
            </span>
            {loading && !data ? (
              <div className="h-8 w-16 animate-pulse rounded-sm bg-muted" />
            ) : (
              <span
                className={`text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${
                  metric.tone === 'destructive'
                    ? 'text-destructive'
                    : metric.tone === 'primary'
                      ? 'text-primary'
                      : 'text-foreground'
                }`}
              >
                {metric.value}
              </span>
            )}
          </div>
        ))}
      </section>

      {/* 2-column symmetric Swiss grid */}
      <section className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
        {/* Left column: Hero statement & CTAs */}
        <div className="swiss-reveal flex min-h-0 flex-col justify-between gap-6 rounded-sm border border-border bg-card p-6 sm:p-8 lg:col-span-6">
          <div className="flex flex-col gap-4">
            <p className="font-mono text-xs font-medium tracking-[0.16em] text-primary uppercase">
              Federasi Moderasi · Transparansi Terbuka
            </p>

            {loading && !data ? (
              <div className="flex flex-col gap-2.5">
                <div className="h-9 w-4/5 animate-pulse rounded-sm bg-muted" />
                <div className="h-9 w-3/5 animate-pulse rounded-sm bg-muted" />
              </div>
            ) : (
              <h1 className="text-2xl leading-[1.14] font-bold tracking-tight text-foreground sm:text-4xl">
                Aturan jelas, moderasi adil, dan arsip terbuka untuk{' '}
                <span className="text-primary">{communityName}</span>.
              </h1>
            )}

            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Pantau grup terhubung dalam federasi, telusuri seluruh butir tata
              tertib komunitas, dan ikuti prosedur banding secara transparan
              tanpa mengekspos data pribadi anggota.
            </p>
          </div>

          <div className="flex flex-col gap-4 border-t border-border pt-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="min-h-11 gap-2 rounded-sm px-5"
                onClick={() => onNavigate('/rules')}
              >
                <BookOpen className="size-4 shrink-0" />
                <span>Halaman Aturan</span>
                <ArrowRight className="size-4 shrink-0" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="min-h-11 gap-2 rounded-sm px-5"
                onClick={() => onNavigate('/groups')}
              >
                <Users className="size-4 shrink-0" />
                <span>Grup Terhubung</span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-muted-foreground tabular-nums">
              <span>Wajib: {ruleCounts.mandatory}</span>
              <span aria-hidden="true">·</span>
              <span>Anjuran: {ruleCounts.advisory}</span>
            </div>
          </div>
        </div>

        {/* Right column: Latest rules list */}
        <div className="swiss-reveal flex min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-card lg:col-span-6">
          <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-5 py-3.5">
            <h2 className="text-xs font-semibold tracking-[0.14em] text-foreground uppercase">
              Aturan Terbaru
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="min-h-10 gap-1.5 rounded-sm px-3 text-xs"
              onClick={() => onNavigate('/rules')}
            >
              <span>Lihat semua</span>
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && !data ? (
              <div className="divide-y divide-border">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex flex-col gap-2 px-5 py-3.5">
                    <div className="h-4 w-1/3 animate-pulse rounded-sm bg-muted" />
                    <div className="h-4 w-3/4 animate-pulse rounded-sm bg-muted" />
                  </div>
                ))}
              </div>
            ) : latestRules.length === 0 ? (
              <div className="flex h-full min-h-40 items-center justify-center px-6 py-10 text-center text-sm text-muted-foreground">
                Belum ada aturan yang dipublikasikan.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {latestRules.map((rule) => (
                  <li key={rule.id}>
                    <button
                      type="button"
                      onClick={() => onNavigate('/rules')}
                      className="flex w-full items-start justify-between gap-4 px-5 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground tabular-nums">
                          <span>#{rule.ruleKey}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{rule.categoryTitle}</span>
                        </div>
                        <p className="mt-0.5 truncate text-sm font-medium text-foreground">
                          {rule.title}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${
                          rule.isMandatory
                            ? 'border-destructive/30 bg-destructive/10 text-destructive'
                            : 'border-border bg-muted text-muted-foreground'
                        }`}
                      >
                        {rule.isMandatory ? 'Wajib' : 'Anjuran'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
