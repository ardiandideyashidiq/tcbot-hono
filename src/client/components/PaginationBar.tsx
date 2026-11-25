import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface PaginationBarProps {
  pagination: PaginationMeta;
  disabled?: boolean;
  onPageChange: (nextPage: number) => void;
}

export function PaginationBar({
  pagination,
  disabled = false,
  onPageChange,
}: PaginationBarProps) {
  const { page, totalPages, total } = pagination;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border px-5 py-3.5 text-sm">
      <p className="text-xs text-muted-foreground">
        Halaman <span className="font-medium text-foreground">{page}</span> dari{' '}
        <span className="font-medium text-foreground">{totalPages}</span> ·{' '}
        <span className="font-mono">{total}</span> total data
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="gap-1.5 px-3"
        >
          <ChevronLeft className="size-4" />
          <span>Sebelumnya</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="gap-1.5 px-3"
        >
          <span>Berikutnya</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
