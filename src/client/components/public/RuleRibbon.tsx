interface RuleRibbonProps {
  mandatory: number;
  advisory: number;
}

export function RuleRibbon({ mandatory, advisory }: RuleRibbonProps) {
  const total = mandatory + advisory;
  const mandatoryPct = total > 0 ? Math.round((mandatory / total) * 100) : 50;
  const advisoryPct = total > 0 ? 100 - mandatoryPct : 50;

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="img"
        aria-label={`Komposisi aturan: ${mandatory} wajib, ${advisory} anjuran`}
        className="flex h-2.5 w-full overflow-hidden border border-[var(--rule-line)] bg-muted/40"
      >
        <div
          style={{ width: `${mandatoryPct}%` }}
          className="h-full bg-rose-600/85 transition-[width] duration-300 dark:bg-rose-400/85"
        />
        <div
          style={{ width: `${advisoryPct}%` }}
          className="h-full bg-blue-600/75 transition-[width] duration-300 dark:bg-blue-400/75"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2 bg-rose-600/85 dark:bg-rose-400/85"
            />
            <span className="tabular-nums">
              {mandatory} wajib ({mandatoryPct}%)
            </span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2 bg-blue-600/75 dark:bg-blue-400/75"
            />
            <span className="tabular-nums">
              {advisory} anjuran ({advisoryPct}%)
            </span>
          </span>
        </div>
        <span className="tabular-nums">Total {total} pasal</span>
      </div>
    </div>
  );
}
