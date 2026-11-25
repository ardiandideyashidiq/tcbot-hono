import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Link2,
  Search,
  ShieldAlert,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PublicOverview, PublicRule } from '../hooks/use-public-overview';

gsap.registerPlugin(useGSAP);

interface PublicRulesPageProps {
  data: PublicOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBackOverview: () => void;
}

export function PublicRulesPage({
  data,
  loading,
  error,
  onRetry,
  onBackOverview,
}: PublicRulesPageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [ruleFilter, setRuleFilter] = useState<
    'all' | 'mandatory' | 'advisory'
  >('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rules ?? []).filter((rule) => {
      if (ruleFilter === 'mandatory' && !rule.isMandatory) return false;
      if (ruleFilter === 'advisory' && rule.isMandatory) return false;
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

  useEffect(() => {
    if (groupedRules.length === 0) {
      setActiveCategory(null);
      return;
    }
    setActiveCategory((prev) =>
      prev && groupedRules.some(([cat]) => cat === prev)
        ? prev
        : (groupedRules[0]?.[0] ?? null),
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const topEntry = visible[0];
        if (topEntry) {
          const catName = topEntry.target.getAttribute('data-category');
          if (catName) setActiveCategory(catName);
        }
      },
      {
        rootMargin: '-110px 0px -65% 0px',
        threshold: 0,
      },
    );

    const sections = document.querySelectorAll<HTMLElement>('[data-category]');
    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [groupedRules]);

  const mandatoryTotal = useMemo(
    () => (data?.rules ?? []).filter((r) => r.isMandatory).length,
    [data?.rules],
  );

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.rules-hero-reveal', {
          opacity: 0,
          y: 16,
          duration: 0.42,
          stagger: 0.05,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
      });
      return () => mm.revert();
    },
    { scope: containerRef },
  );

  useGSAP(
    () => {
      if (groupedRules.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.rule-category-block', {
          opacity: 0,
          y: 14,
          duration: 0.35,
          stagger: 0.06,
          ease: 'power2.out',
          clearProps: 'transform,opacity',
        });
        gsap.from('.rule-card-item', {
          opacity: 0,
          y: 8,
          duration: 0.25,
          stagger: 0.02,
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

  const handleCopyRuleLink = async (ruleKey: string) => {
    const url = `${window.location.origin}/rules#${encodeURIComponent(ruleKey)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedKey(ruleKey);
      toast('Tautan aturan disalin', { description: `#${ruleKey}` });
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      toast('Salin tautan secara manual', { description: url });
    }
  };

  const scrollToCategory = (category: string) => {
    const id = `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

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

      {/* Rules Page Hero Banner */}
      <section className="rules-hero-reveal flex flex-col justify-between gap-6 rounded-2xl border border-border/80 bg-card/90 p-6 shadow-xs backdrop-blur-sm sm:p-8 lg:flex-row lg:items-end">
        <div className="flex flex-col gap-3.5">
          <button
            type="button"
            onClick={onBackOverview}
            className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Kembali ke ringkasan
          </button>
          <h1 className="text-2xl font-bold tracking-tight sm:text-4xl">
            Aturan Lengkap {data?.communityName || 'tcbot'}
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Seluruh butir peraturan yang berlaku lintas grup terhubung. Gunakan
            pencarian atau daftar kategori untuk langsung melompat ke pasal yang
            dibutuhkan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-xl border border-border bg-background/80 px-4 py-3">
            <p className="text-xs text-muted-foreground">Total butir</p>
            <p className="text-xl font-bold tabular-nums">
              {data?.rules.length ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 px-4 py-3">
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Aturan wajib
            </p>
            <p className="text-xl font-bold tabular-nums text-rose-600 dark:text-rose-400">
              {mandatoryTotal}
            </p>
          </div>
        </div>
      </section>

      {/* Filter & Search Bar */}
      <section className="rules-hero-reveal flex flex-col gap-3 rounded-2xl border border-border/80 bg-card/90 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pasal, kata kunci, kategori, atau kode aturan..."
            className="h-11 rounded-xl pl-10 sm:h-10"
          />
        </div>

        <Tabs
          value={ruleFilter}
          onValueChange={(val) =>
            setRuleFilter(val as 'all' | 'mandatory' | 'advisory')
          }
        >
          <TabsList className="h-11 w-full sm:h-10 sm:w-auto">
            <TabsTrigger value="all" className="flex-1 px-3.5 sm:flex-none">
              Semua ({data?.rules.length ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="mandatory"
              className="flex-1 px-3.5 sm:flex-none"
            >
              Wajib ({mandatoryTotal})
            </TabsTrigger>
            <TabsTrigger
              value="advisory"
              className="flex-1 px-3.5 sm:flex-none"
            >
              Anjuran ({(data?.rules.length ?? 0) - mandatoryTotal})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </section>

      {/* Mobile floating horizontal category jump pills */}
      {groupedRules.length > 0 && (
        <div className="sticky top-[106px] z-20 -mx-4 flex gap-2 overflow-x-auto border-y border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur-md lg:hidden">
          {groupedRules.map(([category, items]) => {
            const isActive = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => {
                  setActiveCategory(category);
                  scrollToCategory(category);
                }}
                className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                    : 'border-border bg-card text-foreground hover:border-primary/50'
                }`}
              >
                <span>{category}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] tabular-nums ${
                    isActive
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {items.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main 2-column Wide Rules Layout */}
      <div className="grid gap-8 lg:grid-cols-[270px_minmax(0,1fr)]">
        {/* Floating Sticky Desktop Category TOC */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 flex max-h-[calc(100dvh-7.5rem)] flex-col gap-3 overflow-y-auto rounded-2xl border border-border/80 bg-card/90 p-4 shadow-md backdrop-blur-md">
            <div className="flex items-center gap-2 px-2 pb-1 text-xs font-semibold text-muted-foreground">
              <BookOpen className="size-3.5 text-primary" />
              Daftar Kategori
            </div>
            {groupedRules.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">
                Tidak ada kategori cocok.
              </p>
            ) : (
              <nav className="flex flex-col gap-1">
                {groupedRules.map(([category, items]) => {
                  const isActive = activeCategory === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setActiveCategory(category);
                        scrollToCategory(category);
                      }}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition-colors ${
                        isActive
                          ? 'bg-primary/10 font-semibold text-primary'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      }`}
                    >
                      <span className="truncate">{category}</span>
                      <span
                        className={`ml-2 shrink-0 rounded-md px-1.5 py-0.5 text-[11px] tabular-nums ${
                          isActive
                            ? 'bg-primary/15 text-primary'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {items.length}
                      </span>
                    </button>
                  );
                })}
              </nav>
            )}

            <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs leading-relaxed text-muted-foreground">
              <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
                <ShieldAlert className="size-3.5 text-primary" />
                Butuh banding?
              </div>
              Kirim <code className="font-mono">/appeal</code> lewat DM bot
              untuk meninjau ulang sanksi aktif.
            </div>
          </div>
        </aside>

        {/* Full Rules Cards List */}
        <div className="flex flex-col gap-6">
          {loading && !data ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-36 w-full rounded-2xl" />
              <Skeleton className="h-36 w-full rounded-2xl" />
            </div>
          ) : groupedRules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
              Belum ada aturan yang cocok dengan filter atau pencarian Anda.
            </div>
          ) : (
            groupedRules.map(([category, items]) => {
              const catId = `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
              return (
                <section
                  key={category}
                  id={catId}
                  data-category={category}
                  className="rule-category-block scroll-mt-28 overflow-hidden rounded-2xl border border-border/80 bg-card/95 shadow-xs lg:scroll-mt-24"
                >
                  <div className="flex items-center justify-between border-b border-border/70 bg-muted/40 px-5 py-3.5 sm:px-6">
                    <h2 className="text-base font-semibold tracking-tight text-foreground">
                      {category}
                    </h2>
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      {items.length} butir
                    </span>
                  </div>

                  <ul className="divide-y divide-border/60">
                    {items.map((rule) => (
                      <li
                        key={rule.id}
                        id={rule.ruleKey}
                        className="rule-card-item scroll-mt-24 flex flex-col gap-2 px-5 py-5 transition-colors hover:bg-muted/25 sm:px-6"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-base font-semibold text-foreground">
                              {rule.title}
                            </h3>
                            {rule.isMandatory && (
                              <Badge variant="destructive">Wajib</Badge>
                            )}
                          </div>

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 text-xs text-muted-foreground"
                            onClick={() =>
                              void handleCopyRuleLink(rule.ruleKey)
                            }
                          >
                            {copiedKey === rule.ruleKey ? (
                              <>
                                <Check className="size-3.5 text-emerald-500" />
                                Disalin
                              </>
                            ) : (
                              <>
                                <Link2 className="size-3.5" />
                                Salin tautan
                              </>
                            )}
                          </Button>
                        </div>

                        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                          {rule.body}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
