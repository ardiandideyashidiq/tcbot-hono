import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Lock,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../lib/api';
import { CategoryBarChart, RulesBreakdownChart } from './CommunityCharts';

gsap.registerPlugin(useGSAP);

interface PublicRule {
  id: number;
  ruleKey: string;
  categoryTitle: string;
  title: string;
  body: string;
  isMandatory: boolean;
}

interface PublicGroup {
  chatId: number;
  title: string;
  chatType: string;
  addedAt: string;
}

interface PublicOverview {
  configured: boolean;
  communityName: string;
  stats: {
    connectedGroups: number;
    publishedRules: number;
    resolvedAppeals: number;
    activeModerations: number;
  };
  rules: PublicRule[];
  groups: PublicGroup[];
}

interface PublicDashboardProps {
  darkMode: boolean;
  onToggleTheme: (event: MouseEvent<HTMLButtonElement>) => void;
  onNavigateAdmin: () => void;
}

export function PublicDashboard({
  darkMode,
  onToggleTheme,
  onNavigateAdmin,
}: PublicDashboardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [data, setData] = useState<PublicOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [ruleFilter, setRuleFilter] = useState<'all' | 'mandatory'>('all');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.api.public.overview.$get();
      if (!res.ok) {
        throw new Error('Gagal memuat data komunitas');
      }
      const payload = (await res.json()) as PublicOverview;
      setData(payload);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Terjadi kesalahan saat memuat.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rules ?? []).filter((rule) => {
      if (ruleFilter === 'mandatory' && !rule.isMandatory) {
        return false;
      }
      if (!q) return true;
      return (
        rule.title.toLowerCase().includes(q) ||
        rule.body.toLowerCase().includes(q) ||
        rule.categoryTitle.toLowerCase().includes(q) ||
        rule.ruleKey.toLowerCase().includes(q)
      );
    });
  }, [data?.rules, ruleFilter, search]);

  const groupedRules = useMemo(() => {
    const groups = new Map<string, PublicRule[]>();
    for (const rule of filteredRules) {
      const existing = groups.get(rule.categoryTitle) ?? [];
      existing.push(rule);
      groups.set(rule.categoryTitle, existing);
    }
    return [...groups.entries()];
  }, [filteredRules]);

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

  useGSAP(
    () => {
      if (filteredRules.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.rule-item-card', {
          opacity: 0,
          y: 10,
          duration: 0.28,
          stagger: 0.025,
          ease: 'power1.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    {
      scope: containerRef,
      dependencies: [ruleFilter, search, data?.rules.length],
    },
  );

  const communityName = data?.communityName || 'tcbot';

  return (
    <div
      ref={containerRef}
      className="relative min-h-dvh overflow-x-hidden bg-background text-foreground"
    >
      {/* Ambient radial aurora backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(37,99,235,0.16),transparent)] dark:bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(59,130,246,0.22),transparent)]"
      />

      <header className="sticky top-0 z-30 border-b border-border/80 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="size-4" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold tracking-tight">
                  {communityName}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">
                Portal Transparansi & Tata Tertib
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
              aria-label="Muat ulang ringkasan"
              onClick={() => void loadOverview()}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? 'animate-spin' : ''}`}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="min-h-11 min-w-11 sm:min-h-9 sm:min-w-9"
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
              className="min-h-11 gap-1.5 px-3.5 sm:min-h-9"
              onClick={onNavigateAdmin}
            >
              <Lock className="size-3.5" />
              <span>Masuk admin</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:gap-10 sm:px-8 sm:py-10">
        {error && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadOverview()}
            >
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
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                Pantau grup yang terhubung dalam federasi, telusuri seluruh
                butir peraturan komunitas, dan pahami alur peninjauan banding
                secara transparan tanpa mengekspos data pribadi anggota.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#aturan-komunitas"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:min-h-9"
              >
                <BookOpen className="size-4" />
                Telusuri aturan
              </a>
              <a
                href="#grup-terhubung"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:min-h-9"
              >
                <Users className="size-4" />
                Lihat grup aktif
              </a>
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

        {/* Rules Charter + Connected Groups */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section
            id="aturan-komunitas"
            aria-label="Aturan komunitas"
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="size-4" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">
                    Aturan Komunitas
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Menampilkan {filteredRules.length} butir aturan
                  </p>
                </div>
              </div>

              <Tabs
                value={ruleFilter}
                onValueChange={(val) =>
                  setRuleFilter(val as 'all' | 'mandatory')
                }
              >
                <TabsList className="h-10 sm:h-9">
                  <TabsTrigger value="all" className="px-3">
                    Semua
                  </TabsTrigger>
                  <TabsTrigger value="mandatory" className="px-3">
                    Wajib saja
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul, isi, atau kategori aturan..."
                className="h-11 rounded-xl pl-10 sm:h-10"
              />
            </div>

            {loading && !data ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
            ) : groupedRules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center text-sm text-muted-foreground">
                Belum ada aturan yang cocok dengan pencarian Anda.
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {groupedRules.map(([category, items]) => (
                  <div
                    key={category}
                    className="overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-xs"
                  >
                    <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-5 py-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {category}
                      </h3>
                      <Badge variant="outline" className="tabular-nums">
                        {items.length} butir
                      </Badge>
                    </div>
                    <ul className="divide-y divide-border/60">
                      {items.map((rule) => (
                        <li
                          key={rule.id}
                          className="rule-item-card flex flex-col gap-1.5 px-5 py-4 transition-colors hover:bg-muted/30"
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-foreground">
                              {rule.title}
                            </span>
                            <Badge
                              variant={
                                rule.isMandatory ? 'destructive' : 'secondary'
                              }
                            >
                              {rule.isMandatory ? 'Wajib' : 'Anjuran'}
                            </Badge>
                            <span className="font-mono text-xs text-muted-foreground">
                              {rule.ruleKey}
                            </span>
                          </div>
                          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                            {rule.body}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside id="grup-terhubung" className="flex flex-col gap-6">
            <section className="flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Users className="size-4" />
                </div>
                <h2 className="text-lg font-semibold tracking-tight">
                  Grup Terhubung
                </h2>
              </div>

              {loading && !data ? (
                <div className="flex flex-col gap-2.5">
                  <Skeleton className="h-14 w-full rounded-xl" />
                  <Skeleton className="h-14 w-full rounded-xl" />
                </div>
              ) : (data?.groups.length ?? 0) === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                  Belum ada grup aktif yang terdaftar.
                </p>
              ) : (
                <ul className="divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/80 bg-card/90 shadow-xs">
                  {data?.groups.map((group) => (
                    <li
                      key={group.chatId}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-muted/30"
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
            </section>

            <section className="flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-5">
              <h2 className="text-sm font-semibold text-foreground">
                Mengajukan banding lewat Telegram
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Kirim perintah{' '}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                  /rules
                </code>{' '}
                di chat pribadi bot untuk melihat aturan, atau{' '}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
                  /appeal &lt;kode_ban&gt; &lt;alasan&gt;
                </code>{' '}
                untuk mengajukan peninjauan ulang sanksi.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
