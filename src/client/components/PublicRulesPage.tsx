import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, Check, Link2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
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

    const rootEl = scrollContainerRef.current;
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
        root: rootEl,
        rootMargin: '-24px 0px -65% 0px',
        threshold: 0,
      },
    );

    const sections =
      rootEl?.querySelectorAll<HTMLElement>('[data-category]') ?? [];
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
      if (groupedRules.length === 0) return;
      const mm = gsap.matchMedia();
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('.rule-category-block', {
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

  const totalRules = data?.rules.length ?? 0;

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

      {/* Header */}
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
            Piagam Aturan {data?.communityName || 'tcbot'}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-baseline gap-1.5 rounded-sm border border-border bg-card px-3 py-1.5 font-mono text-xs text-foreground tabular-nums">
            <span className="font-bold">{totalRules}</span>
            <span className="text-[10px] text-muted-foreground uppercase">
              total
            </span>
          </div>
          <div className="flex items-baseline gap-1.5 rounded-sm border border-destructive/30 bg-destructive/10 px-3 py-1.5 font-mono text-xs text-destructive tabular-nums">
            <span className="font-bold">{mandatoryTotal}</span>
            <span className="text-[10px] uppercase">wajib</span>
          </div>
        </div>
      </header>

      {/* Search + Filter controls */}
      <section className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative flex min-h-11 flex-1 items-center gap-2.5 rounded-sm border border-border bg-card px-3.5 focus-within:border-primary">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pasal, kata kunci, kategori, atau #kode..."
            aria-label="Cari aturan"
            className="min-h-11 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>

        <div
          role="tablist"
          aria-label="Filter sifat aturan"
          className="grid grid-cols-3 gap-1 rounded-sm border border-border bg-card p-1 sm:inline-flex"
        >
          {(
            [
              { key: 'all', label: 'Semua', count: totalRules },
              { key: 'mandatory', label: 'Wajib', count: mandatoryTotal },
              {
                key: 'advisory',
                label: 'Anjuran',
                count: totalRules - mandatoryTotal,
              },
            ] as const
          ).map((tab) => {
            const active = ruleFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setRuleFilter(tab.key)}
                className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-sm px-3.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`font-mono text-[11px] tabular-nums ${
                    active ? 'opacity-90' : 'opacity-70'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Main 2-column internal scroll layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-6">
        {/* Desktop category sidebar */}
        <aside className="hidden min-h-0 flex-col overflow-hidden rounded-sm border border-border bg-card lg:flex">
          <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-3">
            <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
              Daftar Kategori
            </p>
          </div>
          {groupedRules.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              Tidak ada kategori cocok.
            </p>
          ) : (
            <nav
              aria-label="Indeks kategori aturan"
              className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-y-auto overscroll-contain"
            >
              {groupedRules.map(([category, items], idx) => {
                const isActive = activeCategory === category;
                const numeral = String(idx + 1).padStart(2, '0');
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => {
                      setActiveCategory(category);
                      scrollToCategory(category);
                    }}
                    className={`flex min-h-11 items-center justify-between gap-2 border-l-2 px-4 py-2.5 text-left text-xs transition-colors ${
                      isActive
                        ? 'border-l-primary bg-muted/50 font-semibold text-foreground'
                        : 'border-l-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-70">
                        {numeral}
                      </span>
                      <span className="truncate">{category}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums">
                      {items.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        {/* Scrollable rules panels */}
        <div
          ref={scrollContainerRef}
          className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        >
          {/* Mobile sticky category selector */}
          {groupedRules.length > 0 && (
            <div className="sticky top-0 z-20 mb-4 bg-background pb-2 lg:hidden">
              <label className="flex items-center gap-3 rounded-sm border border-border bg-card px-3 py-1.5">
                <span className="shrink-0 font-mono text-[11px] text-muted-foreground uppercase">
                  Kategori
                </span>
                <select
                  aria-label="Pilih kategori aturan"
                  value={activeCategory ?? groupedRules[0]?.[0] ?? ''}
                  onChange={(e) => {
                    const cat = e.target.value;
                    setActiveCategory(cat);
                    scrollToCategory(cat);
                  }}
                  className="min-h-10 min-w-0 flex-1 bg-transparent text-xs font-medium text-foreground focus:outline-none"
                >
                  {groupedRules.map(([category, items], idx) => (
                    <option key={category} value={category}>
                      {String(idx + 1).padStart(2, '0')} · {category} (
                      {items.length})
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {loading && !data ? (
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-sm border border-border bg-muted/40"
                />
              ))}
            </div>
          ) : groupedRules.length === 0 ? (
            <div className="rounded-sm border border-dashed border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
              Belum ada aturan yang cocok dengan filter atau pencarian Anda.
            </div>
          ) : (
            <div className="flex flex-col gap-5 pb-4">
              {groupedRules.map(([category, items], catIdx) => {
                const catId = `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                return (
                  <section
                    key={category}
                    id={catId}
                    data-category={category}
                    className="rule-category-block scroll-mt-14 overflow-hidden rounded-sm border border-border bg-card"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-5 py-3">
                      <h2 className="text-sm font-bold tracking-tight text-foreground sm:text-base">
                        <span className="mr-2 font-mono text-xs text-primary tabular-nums">
                          {String(catIdx + 1).padStart(2, '0')}
                        </span>
                        {category}
                      </h2>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {items.length} butir
                      </span>
                    </div>

                    <ol className="divide-y divide-border">
                      {items.map((rule, ruleIdx) => {
                        const isCopied = copiedKey === rule.ruleKey;
                        return (
                          <li
                            key={rule.id}
                            id={rule.ruleKey}
                            className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/20"
                          >
                            <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                              {String(ruleIdx + 1).padStart(2, '0')}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <h3 className="text-sm font-semibold text-foreground sm:text-base">
                                    {rule.title}
                                  </h3>
                                  <span
                                    className={`rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase ${
                                      rule.isMandatory
                                        ? 'border-destructive/30 bg-destructive/10 text-destructive'
                                        : 'border-border bg-muted text-muted-foreground'
                                    }`}
                                  >
                                    {rule.isMandatory ? 'Wajib' : 'Anjuran'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                                    #{rule.ruleKey}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="icon-sm"
                                    onClick={() =>
                                      void handleCopyRuleLink(rule.ruleKey)
                                    }
                                    aria-label={`Salin tautan ${rule.ruleKey}`}
                                    className="min-h-10 min-w-10 rounded-sm"
                                  >
                                    {isCopied ? (
                                      <Check className="size-4 text-primary" />
                                    ) : (
                                      <Link2 className="size-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>

                              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground sm:text-sm">
                                {rule.body}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
