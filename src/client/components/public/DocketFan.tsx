import {
  ArrowRight,
  BookOpen,
  MessageSquareWarning,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { PublicGroup, PublicRule } from '../../hooks/use-public-overview';
import type { PublicRoute } from '../PublicShell';

interface DocketFanProps {
  rules: PublicRule[];
  groups: PublicGroup[];
  loading: boolean;
  onNavigate: (to: PublicRoute) => void;
}

const CARD_BASE_ROTATIONS = [
  '-rotate-[3deg] z-10',
  'rotate-[1.5deg] z-20',
  '-rotate-[1.5deg] z-30',
];

export function DocketFan({
  rules,
  groups,
  loading,
  onNavigate,
}: DocketFanProps) {
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const topRules = rules.slice(0, 3);
  const topGroups = groups.slice(0, 3);

  const getTabClasses = (index: number) => {
    const isFocused = activeTab === index;
    return `docket-fan-card group relative flex w-[84%] shrink-0 snap-center flex-col justify-between gap-2.5 border border-[var(--rule-line)] bg-card p-3.5 text-left shadow-sm sm:w-[70%] lg:w-full ${
      isFocused
        ? 'z-40 rotate-0 -translate-y-1 border-primary/60 shadow-md'
        : `${CARD_BASE_ROTATIONS[index]} hover:z-40 hover:rotate-0 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md focus-within:z-40 focus-within:rotate-0`
    }`;
  };

  if (loading && rules.length === 0 && groups.length === 0) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:justify-center lg:gap-3 lg:overflow-visible lg:pb-0">
        {[0, 1, 2].map((idx) => (
          <div
            key={idx}
            className={`h-28 w-[82%] shrink-0 animate-pulse border border-[var(--rule-line)] bg-muted/40 p-3.5 lg:w-full ${CARD_BASE_ROTATIONS[idx]}`}
          />
        ))}
      </div>
    );
  }

  return (
    <section
      aria-label="Berkas ringkas arsip"
      className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 py-2 lg:flex-col lg:justify-center lg:gap-3 lg:overflow-visible lg:px-2 lg:py-1"
    >
      {/* Tab 1: Cuplikan 3 aturan */}
      <article
        className={getTabClasses(0)}
        onMouseEnter={() => setActiveTab(0)}
        onMouseLeave={() => setActiveTab(null)}
      >
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--rule-line)] pb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <BookOpen className="size-3.5 text-primary" />
            <span>01 / Cuplikan Aturan</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/rules')}
            className="inline-flex min-h-7 items-center gap-1 font-mono text-[11px] font-medium text-primary hover:underline"
          >
            Semua
            <ArrowRight className="size-3" />
          </button>
        </div>

        {topRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada butir aturan diterbitkan.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {topRules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="truncate font-medium text-[var(--ink)]">
                  {rule.title}
                </span>
                <span
                  className={`shrink-0 font-mono text-[10px] uppercase ${
                    rule.isMandatory
                      ? 'text-rose-700 dark:text-rose-300'
                      : 'text-muted-foreground'
                  }`}
                >
                  {rule.isMandatory ? 'wajib' : 'anjuran'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* Tab 2: 3 grup aktif */}
      <article
        className={getTabClasses(1)}
        onMouseEnter={() => setActiveTab(1)}
        onMouseLeave={() => setActiveTab(null)}
      >
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--rule-line)] pb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <Users className="size-3.5 text-primary" />
            <span>02 / Grup Terhubung</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/groups')}
            className="inline-flex min-h-7 items-center gap-1 font-mono text-[11px] font-medium text-primary hover:underline"
          >
            Direktori
            <ArrowRight className="size-3" />
          </button>
        </div>

        {topGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Belum ada grup aktif terdaftar.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {topGroups.map((group) => (
              <li
                key={group.chatId}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="truncate font-medium text-[var(--ink)]">
                  {group.title}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {group.chatType}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      {/* Tab 3: Ajakan /appeal */}
      <article
        className={getTabClasses(2)}
        onMouseEnter={() => setActiveTab(2)}
        onMouseLeave={() => setActiveTab(null)}
      >
        <div className="flex items-center justify-between gap-2 border-b border-dashed border-[var(--rule-line)] pb-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
            <MessageSquareWarning className="size-3.5 text-rose-600 dark:text-rose-400" />
            <span>03 / Kanal Banding</span>
          </div>
          <span className="stamp px-1.5 py-0.5 font-mono text-[9px] font-semibold text-rose-700 uppercase dark:text-rose-300">
            DM BOT
          </span>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Kirim pesan pribadi ke bot dengan format{' '}
          <code className="bg-[var(--tape-crimson)] px-1 py-0.5 font-mono text-[11px] text-[var(--ink)]">
            /appeal &lt;kode_ban&gt; &lt;alasan&gt;
          </code>{' '}
          untuk peninjauan staf.
        </p>
      </article>
    </section>
  );
}
