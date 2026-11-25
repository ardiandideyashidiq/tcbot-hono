import { type RefObject, useEffect, useState } from 'react';

const DESKTOP_HEADER_PX = 48;
const DESKTOP_ROW_PX = 74;
const MOBILE_CARD_PX = 168;
const MIN_ROWS = 4;
const MAX_ROWS = 20;

function computeRowLimit(width: number, height: number): number {
  if (height <= 0) return 8;
  const isStacked = width > 0 && width < 560;
  const available = isStacked
    ? height
    : Math.max(0, height - DESKTOP_HEADER_PX);
  const rowHeight = isStacked ? MOBILE_CARD_PX : DESKTOP_ROW_PX;
  const count = Math.floor(available / rowHeight);
  return Math.max(MIN_ROWS, Math.min(MAX_ROWS, count));
}

export function useDynamicPageSize(
  containerRef: RefObject<HTMLElement | null>,
  fallback = 8,
): number {
  const [limit, setLimit] = useState(fallback);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    let timer: number | undefined;

    const updateFromRect = (width: number, height: number) => {
      const next = computeRowLimit(width, height);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setLimit((prev) => (prev === next ? prev : next));
      }, 150);
    };

    const rect = el.getBoundingClientRect();
    setLimit(computeRowLimit(rect.width, rect.height));

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateFromRect(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(el);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [containerRef]);

  return limit;
}
