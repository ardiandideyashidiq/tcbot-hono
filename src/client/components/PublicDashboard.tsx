import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowRight, BookOpen, Users } from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import type { PublicOverview } from '../hooks/use-public-overview';
import type { PublicRoute } from './PublicShell';
import { DocketFan } from './public/DocketFan';
import { RedactionTape } from './public/RedactionTape';
import { RuleRibbon } from './public/RuleRibbon';
import { Spine } from './public/Spine';

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
        gsap.from('.docket-reveal', {
          opacity: 0,
          y: 12,
          duration: 0.38,
          stagger: 0.05,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef, dependencies: [Boolean(data)] },
  );

  const communityName = data?.communityName || 'tcbot';

  const metrics = [
    { label: 'Grup', value: data?.stats.connectedGroups ?? 0 },
    { label: 'Aturan', value: data?.stats.publishedRules ?? 0 },
    { label: 'Banding', value: data?.stats.resolvedAppeals ?? 0 },
    {
      label: 'Sanksi',
      value: data?.stats.activeModerations ?? 0,
      tone: 'crimson' as const,
    },
  ];

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 flex-col justify-between gap-3"
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

      {/* 12-column two-zone single-viewport stage */}
      <section className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center lg:gap-8">
        {/* Left zone (7/12): Spine + Editorial Docket */}
        <div className="flex min-h-0 flex-col gap-3 lg:col-span-7 lg:h-full lg:flex-row lg:items-stretch lg:gap-5">
          <Spine code="TCB / DOCKET 01" label="ARSIP PUBLIK" />

          <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 sm:gap-4">
            <p className="docket-reveal font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              FEDERASI MODERASI · TRANSPARANSI TERBUKA
            </p>

            {loading && !data ? (
              <div className="flex flex-col gap-2">
                <div className="h-9 w-4/5 animate-pulse bg-muted/50" />
                <div className="h-9 w-3/5 animate-pulse bg-muted/50" />
              </div>
            ) : (
              <h1 className="docket-reveal font-display text-[clamp(1.65rem,4.4dvh,3.5rem)] leading-[1.04] tracking-tight text-[var(--ink)]">
                Aturan jelas, moderasi <span className="tape">adil</span>, dan
                arsip terbuka untuk {communityName}.
              </h1>
            )}

            <p
              data-decorative="1"
              className="docket-reveal line-clamp-3 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm"
            >
              Pantau grup terhubung dalam federasi, telusuri seluruh butir tata
              tertib komunitas, dan ikuti prosedur banding secara transparan
              tanpa mengekspos data pribadi anggota.
            </p>

            <div className="docket-reveal flex flex-wrap items-center gap-2.5">
              <Button
                className="min-h-11 gap-2 rounded-none px-4 sm:min-h-10"
                onClick={() => onNavigate('/rules')}
              >
                <BookOpen className="size-4" />
                Buka halaman aturan
                <ArrowRight className="size-4" />
              </Button>
              <Button
                variant="outline"
                className="min-h-11 gap-2 rounded-none border-[var(--rule-line)] bg-card/80 px-4 sm:min-h-10"
                onClick={() => onNavigate('/groups')}
              >
                <Users className="size-4" />
                Lihat grup terhubung
              </Button>
            </div>

            <div className="docket-reveal pt-1">
              <RedactionTape metrics={metrics} loading={loading && !data} />
            </div>

            <div className="docket-reveal pt-1">
              <RuleRibbon
                mandatory={ruleCounts.mandatory}
                advisory={ruleCounts.advisory}
              />
            </div>
          </div>
        </div>

        {/* Right zone (5/12): DocketFan */}
        <div className="flex min-h-0 flex-col justify-center lg:col-span-5 lg:h-full">
          <DocketFan
            rules={data?.rules ?? []}
            groups={data?.groups ?? []}
            loading={loading}
            onNavigate={onNavigate}
          />
        </div>
      </section>
    </div>
  );
}
