import { type RefObject, useEffect, useRef } from 'react';

export type ViewportDensity = 'normal' | 'tight' | 'tightest';

export function useViewportFit(
  stageRef: RefObject<HTMLElement | null>,
  routeKey: string,
) {
  const lastSizeRef = useRef<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stage = stageRef.current;
    if (!stage) return;

    stage.setAttribute('data-route', routeKey);
    stage.setAttribute('data-density', 'normal');
    let timerId: number | null = null;

    const evaluate = () => {
      const el = stageRef.current;
      if (!el) return;

      const prev = lastSizeRef.current;
      const curWidth = el.clientWidth;
      const curHeight = el.clientHeight;

      if (curWidth > prev.width + 24 || curHeight > prev.height + 24) {
        el.setAttribute('data-density', 'normal');
      }
      lastSizeRef.current = { width: curWidth, height: curHeight };

      const current = (el.getAttribute('data-density') ??
        'normal') as ViewportDensity;
      const overflows =
        el.scrollHeight > el.clientHeight + 2 ||
        el.scrollWidth > el.clientWidth + 2;

      if (!overflows) return;

      if (current === 'normal') {
        el.setAttribute('data-density', 'tight');
        requestAnimationFrame(() => {
          const updated = stageRef.current;
          if (!updated) return;
          if (
            updated.scrollHeight > updated.clientHeight + 2 ||
            updated.scrollWidth > updated.clientWidth + 2
          ) {
            updated.setAttribute('data-density', 'tightest');
          }
        });
      } else if (current === 'tight') {
        el.setAttribute('data-density', 'tightest');
      }
    };

    const scheduleEvaluate = () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      timerId = window.setTimeout(evaluate, 120);
    };

    evaluate();

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleEvaluate);
      observer.observe(stage);
    }

    window.addEventListener('resize', scheduleEvaluate);

    return () => {
      if (timerId !== null) {
        window.clearTimeout(timerId);
      }
      observer?.disconnect();
      window.removeEventListener('resize', scheduleEvaluate);
    };
  }, [stageRef, routeKey]);
}
