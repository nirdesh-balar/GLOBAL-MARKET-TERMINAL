import { useLayoutEffect, useRef } from 'react';

export type ChartRestoreSample = { charts: number; elapsedMs: number };

export function useChartRestoreTiming(count: number, active: boolean) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef<ChartRestoreSample | null>(null);
  useLayoutEffect(() => {
    const node = container.current;
    if (!active || !count || !node) return;
    const start = performance.now();
    let paint = 0;
    const stop = () => {
      observer.disconnect();
      clearTimeout(deadline);
      cancelAnimationFrame(paint);
    };
    const ready = () => {
      const charts = [...node.querySelectorAll<HTMLElement>('.chart-canvas')];
      return charts.length === count && charts.every(chart => Number(chart.dataset.renderedBars) > 0
        && !chart.closest('.chart-pane')?.querySelector('.chart-overlay'));
    };
    const check = () => {
      if (paint || !ready()) return;
      paint = requestAnimationFrame(() => {
        paint = 0;
        if (!ready()) return;
        latest.current = { charts: count, elapsedMs: performance.now() - start };
        stop();
      });
    };
    const observer = new MutationObserver(check);
    const deadline = setTimeout(stop, 30_000);
    observer.observe(node, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-rendered-bars'] });
    check();
    return stop;
  }, [count, active]);
  return { container, latest };
}
