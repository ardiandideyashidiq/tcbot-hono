import {
  BookOpen,
  Lock,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '../lib/api';

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

  const communityName = data?.communityName || 'tcbot';

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div>
              <span className="text-sm font-semibold tracking-tight">
                {communityName}
              </span>
              <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                Portal komunitas
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
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
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onNavigateAdmin}
            >
              <Lock className="size-3.5" />
              Masuk admin
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-8 sm:px-8 sm:py-10">
        <section className="flex flex-col gap-3">
          <h1 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Aturan, grup terhubung, dan ringkasan moderasi {communityName}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Halaman publik ini menampilkan tata tertib komunitas yang berlaku,
            daftar grup yang terhubung ke sistem moderasi, serta metrik
            transparansi tanpa mengekspos data pribadi anggota.
          </p>
        </section>

        {error && (
          <div className="flex items-center justify-between gap-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
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

        <section
          aria-label="Statistik komunitas"
          className="grid grid-cols-2 divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-x sm:divide-y-0"
        >
          {[
            {
              label: 'Grup terhubung',
              value: data?.stats.connectedGroups ?? 0,
              hint: 'Grup aktif dalam federasi',
            },
            {
              label: 'Aturan aktif',
              value: data?.stats.publishedRules ?? 0,
              hint: 'Butir tata tertib berlaku',
            },
            {
              label: 'Banding diproses',
              value: data?.stats.resolvedAppeals ?? 0,
              hint: 'Keputusan selesai ditinjau',
            },
            {
              label: 'Tindakan aktif',
              value: data?.stats.activeModerations ?? 0,
              hint: 'Sanksi yang sedang berjalan',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col gap-1 px-4 py-5 sm:px-6"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </span>
              {loading && !data ? (
                <Skeleton className="mt-1 h-8 w-16" />
              ) : (
                <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
                  {stat.value.toLocaleString('id-ID')}
                </span>
              )}
              <span className="text-xs text-muted-foreground">{stat.hint}</span>
            </div>
          ))}
        </section>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <section
            aria-label="Aturan komunitas"
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">
                  Aturan komunitas
                </h2>
              </div>

              <Tabs
                value={ruleFilter}
                onValueChange={(val) =>
                  setRuleFilter(val as 'all' | 'mandatory')
                }
              >
                <TabsList>
                  <TabsTrigger value="all">Semua</TabsTrigger>
                  <TabsTrigger value="mandatory">Wajib saja</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari judul, isi, atau kategori aturan..."
                className="pl-9"
              />
            </div>

            {loading && !data ? (
              <div className="flex flex-col gap-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : groupedRules.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                Belum ada aturan yang cocok dengan pencarian Anda.
              </div>
            ) : (
              <div className="flex flex-col gap-7">
                {groupedRules.map(([category, items]) => (
                  <div key={category} className="flex flex-col gap-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {category}
                      </h3>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {items.length} butir
                      </span>
                    </div>
                    <ul className="flex flex-col divide-y divide-border/70">
                      {items.map((rule) => (
                        <li
                          key={rule.id}
                          className="flex flex-col gap-1.5 py-3.5 first:pt-1 last:pb-1"
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

          <aside className="flex flex-col gap-8">
            <section className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">
                  Grup terhubung
                </h2>
              </div>

              {loading && !data ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (data?.groups.length ?? 0) === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
                  Belum ada grup aktif yang terdaftar.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                  {data?.groups.map((group) => (
                    <li
                      key={group.chatId}
                      className="flex items-center justify-between gap-3 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {group.title}
                        </p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {group.chatType}
                        </p>
                      </div>
                      <Badge variant="secondary">Aktif</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">
                Mengajukan banding atau memeriksa aturan
              </h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Kirim perintah <span className="font-mono">/rules</span> di chat
                pribadi bot untuk membaca panduan lengkap, atau gunakan{' '}
                <span className="font-mono">/appeal</span> bila Anda ingin
                mengajukan peninjauan ulang sanksi.
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
