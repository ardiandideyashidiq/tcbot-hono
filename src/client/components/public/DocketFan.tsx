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

const MOBILE_TABS = [
  { id: 0, label: '01 Aturan' },
  { id: 1, label: '02 Grup' },
  { id: 2, label: '03 Banding' },
] as const;

export function DocketFan({
  rules,
  groups,
  loading,
  onNavigate,
}: DocketFanProps) {
  const [activeTab, setActiveTab] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<0 | 1 | 2>(0);
  const topRules = rules.slice(0, 3);
  const topGroups = groups.slice(0, 3);

  const getTabClasses = (index: number) => {
    const isFocused = activeTab === index;
    return `docket-fan-card group relative flex w-full flex-col justify-between gap-2.5 border border-[var(--rule-line)] bg-card p-3.5 text-left shadow-sm ${
      isFocused
        ? 'z-40 rotate-0 -translate-y-1 border-primary/60 shadow-md'
        : `${CARD_BASE_ROTATIONS[index]} hover:z-40 hover:rotate-0 hover:-translate-y-1 hover:border-primary/50 hover:shadow-md focus-within:z-40 focus-within:rotate-0`
    }`;
  };

  const renderRulesCard = () => (
    <>
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
    </>
  );

  const renderGroupsCard = () => (
    <>
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
    </>
  );

  const renderAppealCard = () => (
    <>
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
    </>
  );

  if (loading && rules.length === 0 && groups.length === 0) {
    return (
      <>
        <div className="h-32 w-full animate-pulse border border-[var(--rule-line)] bg-muted/40 lg:hidden" />
        <div className="hidden flex-col justify-center gap-3 lg:flex">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className={`h-28 w-full animate-pulse border border-[var(--rule-line)] bg-muted/40 p-3.5 ${CARD_BASE_ROTATIONS[idx]}`}
            />
          ))}
        </div>
      </>
    );
  }

  return (
    <section aria-label="Berkas ringkas arsip">
      {/* Mobile: 3-column tab switcher + single active card (zero horizontal scroll) */}
      <div className="flex flex-col gap-2 lg:hidden">
        <div
          role="tablist"
          aria-label="Pilih berkas ringkas"
          className="grid grid-cols-3 gap-1"
        >
          {MOBILE_TABS.map((tab) => {
            const isSelected = mobileTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setMobileTab(tab.id)}
                className={`min-h-10 border px-2 py-1.5 font-mono text-[11px] font-medium transition-colors ${
                  isSelected
                    ? 'border-[var(--ink)] bg-[var(--tape-blue)] font-semibold text-[var(--ink)]'
                    : 'border-[var(--rule-line)] bg-card/70 text-muted-foreground hover:text-[var(--ink)]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <article className="flex flex-col justify-between gap-2.5 border border-[var(--rule-line)] bg-card p-3.5 text-left shadow-sm">
          {mobileTab === 0
            ? renderRulesCard()
            : mobileTab === 1
              ? renderGroupsCard()
              : renderAppealCard()}
        </article>
      </div>

      {/* Desktop: stacked tilted docket fan */}
      <div className="hidden flex-col justify-center gap-3 px-2 py-1 lg:flex">
        <article
          className={getTabClasses(0)}
          onMouseEnter={() => setActiveTab(0)}
          onMouseLeave={() => setActiveTab(null)}
        >
          {renderRulesCard()}
        </article>

        <article
          className={getTabClasses(1)}
          onMouseEnter={() => setActiveTab(1)}
          onMouseLeave={() => setActiveTab(null)}
        >
          {renderGroupsCard()}
        </article>

        <article
          className={getTabClasses(2)}
          onMouseEnter={() => setActiveTab(2)}
          onMouseLeave={() => setActiveTab(null)}
        >
          {renderAppealCard()}
        </article>
      </div>
    </section>
  );
}
