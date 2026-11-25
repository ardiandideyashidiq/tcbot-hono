import type { PublicGroup } from '../../hooks/use-public-overview';

interface TicketStubProps {
  group: PublicGroup;
  index: number;
}

export function TicketStub({ group, index }: TicketStubProps) {
  const rotation =
    index % 3 === 0
      ? '-rotate-[1deg]'
      : index % 3 === 1
        ? 'rotate-[1deg]'
        : '-rotate-[0.5deg]';

  const formattedDate = new Date(group.addedAt).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <article
      className={`group-card-reveal ticket-edge mb-4 break-inside-avoid border border-[var(--rule-line)] bg-card p-4 shadow-xs transition-transform ${rotation} hover:rotate-0`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-dashed border-[var(--rule-line)] pb-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
            STUB #{String(index + 1).padStart(2, '0')}
          </p>
          <h2 className="mt-0.5 truncate text-base font-semibold text-[var(--ink)]">
            {group.title}
          </h2>
        </div>

        <span className="stamp shrink-0 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider text-primary uppercase">
          {formattedDate}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
        <span className="uppercase">{group.chatType}</span>
        <span className="tabular-nums">ID {group.chatId}</span>
      </div>
    </article>
  );
}
