import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ArrowLeft, Check, Link2, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { PublicOverview, PublicRule } from '../hooks/use-public-overview';
import { SectionTab } from './public/SectionTab';

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
          y: 10,
          duration: 0.3,
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

      {/* Compact single-row header */}
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
            Piagam Aturan {data?.communityName || 'tcbot'}
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <div className="stamp flex items-baseline gap-1.5 px-2.5 py-0.5 font-mono text-xs text-[var(--ink)]">
            <span className="font-bold tabular-nums">{totalRules}</span>
            <span className="text-[10px] text-muted-foreground uppercase">
              total
            </span>
          </div>
          <div className="stamp flex items-baseline gap-1.5 px-2.5 py-0.5 font-mono text-xs text-rose-700 dark:text-rose-300">
            <span className="font-bold tabular-nums">{mandatoryTotal}</span>
            <span className="text-[10px] uppercase">wajib</span>
          </div>
        </div>
      </header>

      {/* Index-card filter baseline + paper tabs */}
      <section className="flex shrink-0 flex-col gap-2.5 border-b border-[var(--rule-line)] pb-2 sm:flex-row sm:items-end sm:justify-between">
        <label className="relative flex flex-1 items-center gap-2 border-b border-[var(--rule-line)] pb-1 focus-within:border-[var(--ink)]">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pasal, kata kunci, kategori, atau #kode..."
            aria-label="Cari aturan"
            className="min-h-9 w-full bg-transparent text-sm text-[var(--ink)] placeholder:text-muted-foreground focus:outline-none"
          />
        </label>

        <div
          role="tablist"
          aria-label="Filter sifat aturan"
          className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:items-end"
        >
          <SectionTab
            active={ruleFilter === 'all'}
            onClick={() => setRuleFilter('all')}
            badge={totalRules}
          >
            Semua
          </SectionTab>
          <SectionTab
            active={ruleFilter === 'mandatory'}
            onClick={() => setRuleFilter('mandatory')}
            badge={mandatoryTotal}
          >
            Wajib
          </SectionTab>
          <SectionTab
            active={ruleFilter === 'advisory'}
            onClick={() => setRuleFilter('advisory')}
            badge={totalRules - mandatoryTotal}
          >
            Anjuran
          </SectionTab>
        </div>
      </section>

      {/* Main 2-column internal scroll layout */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-8">
        {/* Desktop spine index TOC */}
        <aside className="hidden min-h-0 flex-col border-r border-[var(--rule-line)] pr-4 lg:flex">
          <p className="mb-2 shrink-0 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Daftar Kategori
          </p>
          {groupedRules.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Tidak ada kategori cocok.
            </p>
          ) : (
            <nav
              aria-label="Indeks kategori aturan"
              className="docket-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1"
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
                    className={`flex min-h-9 items-center justify-between gap-2 px-2 py-1.5 text-left text-xs transition-colors ${
                      isActive
                        ? 'tape font-semibold text-[var(--ink)]'
                        : 'text-muted-foreground hover:text-[var(--ink)]'
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-[10px] tabular-nums opacity-75">
                        {numeral}
                      </span>
                      <span className="truncate">{category}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums">
                      {items.length}
                    </span>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        {/* Scrollable rules ledger */}
        <div
          ref={scrollContainerRef}
          className="docket-scroll ledger-rule relative min-h-0 flex-1 overflow-y-auto pr-1"
        >
          {/* Mobile sticky category selector (zero horizontal scroll) */}
          {groupedRules.length > 0 && (
            <div className="sticky top-0 z-20 mb-3 border-b border-[var(--rule-line)] bg-[var(--paper)]/95 py-2 lg:hidden">
              <label className="flex items-center justify-between gap-2 font-mono text-[11px]">
                <span className="shrink-0 text-muted-foreground uppercase">
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
                  className="min-h-10 min-w-0 flex-1 border border-[var(--rule-line)] bg-card px-2.5 py-1 text-xs font-medium text-[var(--ink)] focus:border-[var(--ink)] focus:outline-none"
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
            <div className="flex flex-col gap-4 py-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse border-b border-[var(--rule-line)] bg-muted/30"
                />
              ))}
            </div>
          ) : groupedRules.length === 0 ? (
            <div className="border border-dashed border-[var(--rule-line)] px-6 py-12 text-center text-sm text-muted-foreground">
              Belum ada aturan yang cocok dengan filter atau pencarian Anda.
            </div>
          ) : (
            <div className="flex flex-col gap-6 pb-4">
              {groupedRules.map(([category, items], catIdx) => {
                const catId = `cat-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                const isOffsetShelf = catIdx % 2 === 1;
                return (
                  <section
                    key={category}
                    id={catId}
                    data-category={category}
                    className={`rule-category-block scroll-mt-12 ${
                      isOffsetShelf
                        ? 'lg:ml-10 lg:border-l lg:border-dashed lg:border-[var(--rule-line)] lg:pl-5'
                        : ''
                    }`}
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h2 className="tape font-display text-xl tracking-tight text-[var(--ink)] sm:text-2xl">
                        {String(catIdx + 1).padStart(2, '0')}. {category}
                      </h2>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                        {items.length} butir
                      </span>
                    </div>

                    <ol className="divide-y divide-[var(--rule-line)] border-t border-[var(--rule-line)]">
                      {items.map((rule, ruleIdx) => {
                        const isCopied = copiedKey === rule.ruleKey;
                        return (
                          <li
                            key={rule.id}
                            id={rule.ruleKey}
                            className="group relative flex gap-3 py-3 transition-colors hover:bg-muted/20 sm:gap-5"
                          >
                            {/* Hanging marginalia numeral */}
                            <span className="w-6 shrink-0 pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                              {String(ruleIdx + 1).padStart(2, '0')}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div className="flex flex-wrap items-baseline gap-2">
                                  <h3 className="text-sm font-semibold text-[var(--ink)] sm:text-base">
                                    {rule.title}
                                  </h3>
                                  <span
                                    className={`font-mono text-[10px] uppercase ${
                                      rule.isMandatory
                                        ? 'text-rose-700 dark:text-rose-300'
                                        : 'text-muted-foreground'
                                    }`}
                                  >
                                    [{rule.isMandatory ? 'wajib' : 'anjuran'}]
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    #{rule.ruleKey}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleCopyRuleLink(rule.ruleKey)
                                    }
                                    aria-label={`Salin tautan ${rule.ruleKey}`}
                                    className="inline-flex min-h-8 min-w-8 items-center justify-center border border-[var(--rule-line)] bg-card px-1.5 text-muted-foreground opacity-100 transition-opacity hover:text-[var(--ink)] sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                  >
                                    {isCopied ? (
                                      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                                    ) : (
                                      <Link2 className="size-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>

                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">
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
