import type { ReactNode } from 'react';

interface SectionTabProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  badge?: string | number;
}

export function SectionTab({
  active,
  onClick,
  children,
  badge,
}: SectionTabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-10 shrink-0 items-center gap-2 border border-b-0 px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-[var(--ink)] bg-[var(--tape-blue)] font-semibold text-[var(--ink)]'
          : 'border-[var(--rule-line)] bg-card/70 text-muted-foreground hover:text-[var(--ink)]'
      }`}
    >
      <span>{children}</span>
      {badge !== undefined && (
        <span className="font-mono text-[10px] tabular-nums opacity-80">
          {badge}
        </span>
      )}
    </button>
  );
}
