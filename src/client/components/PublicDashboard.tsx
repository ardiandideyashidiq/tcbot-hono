import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Sparkles,
  Users,
} from 'lucide-react';
import { useMemo, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { PublicOverview } from '../hooks/use-public-overview';
import { CategoryBarChart, RulesBreakdownChart } from './CommunityCharts';
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
  darkMode,
  onRetry,
  onNavigate,
}: PublicDashboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const chartStats = useMemo(() => {
    const allRules = data?.rules ?? [];
    let mandatory = 0;
    let advisory = 0;
    const catMap = new Map<string, number>();

    for (const r of allRules) {
      if (r.isMandatory) mandatory += 1;
      else advisory += 1;
      catMap.set(r.categoryTitle, (catMap.get(r.categoryTitle) ?? 0) + 1);
    }

    return {
      mandatory,
      advisory,
      categories: [...catMap.entries()].map(([name, count]) => ({
        name,
        count,
      })),
    };
  }, [data?.rules]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.hero-reveal', {
          opacity: 0,
          y: 16,
          duration: 0.45,
          stagger: 0.06,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });

        gsap.from('.bento-stat-card', {
          opacity: 0,
          scale: 0.96,
          y: 12,
          duration: 0.4,
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
  const featuredRules = (data?.rules ?? []).slice(0, 6);
  const featuredGroups = (data?.groups ?? []).slice(0, 6);

  return (
    <div ref={containerRef} className="flex flex-col gap-8 sm:gap-10">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Coba lagi
          </Button>
        </div>
      )}

      {/* Asymmetric Hero Bento */}
      <section className="grid gap-5 lg:grid-cols-12 lg:items-stretch">
        <div className="hero-reveal flex flex-col justify-between gap-6 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xs backdrop-blur-sm sm:p-8 lg:col-span-7">
          <div className="flex flex-col gap-4">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="size-3.5" />
              Tata Kelola Komunitas Terbuka
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl sm:leading-[1.15]">
              Aturan jelas, moderasi adil, dan statistik terbuka untuk{' '}
              <span className="text-primary">{communityName}</span>.
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Pantau grup yang terhubung dalam federasi, telusuri seluruh butir
              peraturan komunitas, dan pahami alur peninjauan banding secara
              transparan tanpa mengekspos data pribadi anggota.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              className="min-h-11 gap-2 rounded-xl px-5 sm:min-h-10"
              onClick={() => onNavigate('/rules')}
            >
              <BookOpen className="size-4" />
              Buka halaman aturan
              <ArrowRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              className="min-h-11 gap-2 rounded-xl px-5 sm:min-h-10"
              onClick={() => onNavigate('/groups')}
            >
              <Users className="size-4" />
              Lihat grup terhubung
            </Button>
          </div>
        </div>

        {/* 2x2 Bento KPI Grid */}
        <div className="grid grid-cols-2 gap-3.5 sm:gap-4 lg:col-span-5">
          {[
            {
              label: 'Grup terhubung',
              value: data?.stats.connectedGroups ?? 0,
              hint: 'Grup aktif federasi',
              icon: Users,
              tone: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
            },
            {
              label: 'Aturan aktif',
              value: data?.stats.publishedRules ?? 0,
              hint: 'Butir tata tertib',
              icon: BookOpen,
              tone: 'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
            },
            {
              label: 'Banding selesai',
              value: data?.stats.resolvedAppeals ?? 0,
              hint: 'Telah ditinjau staf',
              icon: CheckCircle2,
              tone: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
            },
            {
              label: 'Sanksi aktif',
              value: data?.stats.activeModerations ?? 0,
              hint: 'Sedang berjalan',
              icon: Activity,
              tone: 'text-rose-600 dark:text-rose-400 bg-rose-500/10',
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bento-stat-card flex flex-col justify-between gap-3 rounded-2xl border border-border/80 bg-card/90 p-4 shadow-xs transition-colors hover:border-primary/40 sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {stat.label}
                  </span>
                  <div
                    className={`flex size-8 items-center justify-center rounded-lg ${stat.tone}`}
                  >
                    <Icon className="size-4" />
                  </div>
                </div>
                <div>
                  {loading && !data ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <span className="text-2xl font-bold tracking-tight tabular-nums sm:text-3xl">
                      {stat.value.toLocaleString('id-ID')}
                    </span>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {stat.hint}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Chart.js Visual Analytics Row */}
      <section
        aria-label="Analitik aturan komunitas"
        className="hero-reveal grid gap-5 md:grid-cols-2"
      >
        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs sm:p-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Komposisi Sifat Aturan
            </h2>
            <p className="text-xs text-muted-foreground">
              Perbandingan butir aturan wajib dipatuhi dan anjuran komunitas.
            </p>
          </div>
          <RulesBreakdownChart
            mandatoryCount={chartStats.mandatory}
            advisoryCount={chartStats.advisory}
            darkMode={darkMode}
          />
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs sm:p-6">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Distribusi Aturan per Kategori
            </h2>
            <p className="text-xs text-muted-foreground">
              Kategori dengan jumlah butir tata tertib terbanyak.
            </p>
          </div>
          <CategoryBarChart
            categories={chartStats.categories}
            darkMode={darkMode}
          />
        </div>
      </section>

      {/* Featured Previews Linking to Dedicated Pages */}
      <section className="hero-reveal grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs sm:p-6 lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Cuplikan Aturan Komunitas
              </h2>
              <p className="text-xs text-muted-foreground">
                Menampilkan {featuredRules.length} dari{' '}
                {data?.rules.length ?? 0} butir aturan
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onNavigate('/rules')}
            >
              Semua aturan
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          {loading && !data ? (
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : featuredRules.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada aturan yang diterbitkan.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {featuredRules.map((rule) => (
                <li key={rule.id} className="flex flex-col gap-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {rule.title}
                    </span>
                    <Badge
                      variant={rule.isMandatory ? 'destructive' : 'secondary'}
                    >
                      {rule.isMandatory ? 'Wajib' : 'Anjuran'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {rule.categoryTitle}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {rule.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card/90 p-5 shadow-xs sm:p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">
                Grup Aktif
              </h2>
              <p className="text-xs text-muted-foreground">
                Grup terhubung dalam federasi
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onNavigate('/groups')}
            >
              Semua grup
              <ArrowRight className="size-3.5" />
            </Button>
          </div>

          {loading && !data ? (
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : featuredGroups.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Belum ada grup aktif.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {featuredGroups.map((group) => (
                <li
                  key={group.chatId}
                  className="flex items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {group.title}
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {group.chatType}
                    </p>
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  >
                    Aktif
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
