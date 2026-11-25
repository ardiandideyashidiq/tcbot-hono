interface RedactionMetric {
  label: string;
  value: number;
  tone?: 'default' | 'crimson';
}

interface RedactionTapeProps {
  metrics: RedactionMetric[];
  loading?: boolean;
}

export function RedactionTape({ metrics, loading }: RedactionTapeProps) {
  return (
    <div className="relative py-1">
      <div className="inline-flex w-full max-w-full origin-left -rotate-[2.5deg] flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-[var(--rule-line)] bg-[var(--tape-blue)] px-3.5 py-2 text-[var(--ink)] shadow-xs sm:flex-nowrap sm:px-4 sm:py-2.5">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="flex min-w-[4.5rem] items-baseline gap-1.5 font-mono"
          >
            <span
              className={`text-base font-semibold tabular-nums sm:text-lg ${
                metric.tone === 'crimson'
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-[var(--ink)]'
              }`}
            >
              {loading ? '--' : metric.value.toLocaleString('id-ID')}
            </span>
            <span className="text-[10px] tracking-wider text-muted-foreground uppercase">
              {metric.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
