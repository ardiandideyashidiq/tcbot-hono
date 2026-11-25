interface SpineProps {
  code?: string;
  label?: string;
}

const TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function Spine({
  code = 'TCB / DOCKET 01',
  label = 'ARSIP PUBLIK',
}: SpineProps) {
  return (
    <>
      {/* Desktop vertical spine */}
      <aside
        aria-hidden="true"
        className="hidden h-full shrink-0 flex-col items-center justify-between border-r border-[var(--rule-line)] pr-3 lg:flex"
      >
        <span className="spine-text font-mono text-[10px] font-medium tracking-[0.22em] text-muted-foreground uppercase">
          {code}
        </span>

        <div
          data-decorative="2"
          className="my-2 flex flex-1 flex-col items-end justify-center gap-2"
        >
          {TICKS.map((tick) => (
            <span
              key={tick}
              className={`block h-px bg-[var(--rule-line)] ${
                tick % 4 === 0 ? 'w-3.5' : 'w-2'
              }`}
            />
          ))}
        </div>

        <span
          data-decorative="1"
          className="spine-text font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase"
        >
          {label}
        </span>
      </aside>

      {/* Mobile horizontal spine strip */}
      <div
        aria-hidden="true"
        className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--rule-line)] pb-1.5 lg:hidden"
      >
        <span className="font-mono text-[10px] font-medium tracking-[0.2em] text-muted-foreground uppercase">
          {code}
        </span>
        <div
          data-decorative="2"
          className="flex flex-1 items-center justify-center gap-2 overflow-hidden"
        >
          {TICKS.slice(0, 8).map((tick) => (
            <span
              key={tick}
              className={`block w-px bg-[var(--rule-line)] ${
                tick % 2 === 0 ? 'h-2.5' : 'h-1.5'
              }`}
            />
          ))}
        </div>
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </span>
      </div>
    </>
  );
}
