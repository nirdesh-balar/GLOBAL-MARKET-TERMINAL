import { useLayoutEffect, useRef, type RefObject } from 'react';
import type { IChartApi, ISeriesApi, ISeriesPrimitive, SeriesType } from 'lightweight-charts';
import type { CandleClockBounds } from '../types';
import { candleDuration, remainingCandleSeconds } from './candleTiming';
import { useChartClock } from './clockStore';

export function CandleCountdown({ id, chart, series, generation, price, bounds }: {
  id: string;
  chart: RefObject<IChartApi | null>;
  series: RefObject<ISeriesApi<SeriesType> | null>;
  generation: number;
  price: number;
  bounds: CandleClockBounds;
}) {
  const label = useRef<HTMLSpanElement>(null);
  const remaining = remainingCandleSeconds(bounds, useChartClock());
  const visible = remaining !== null;
  const priceRef = useRef(price);
  priceRef.current = price;

  useLayoutEffect(() => {
    if (!visible) return;
    const c = chart.current, s = series.current, node = label.current;
    if (!c || !s || !node) return;
    let frame: number | undefined;
    const place = () => {
      frame = undefined;
      if (chart.current !== c || series.current !== s) return;
      const y = s.priceToCoordinate(priceRef.current);
      const axisWidth = c.priceScale('right').width();
      const fits = y !== null && y >= 0 && y + 24 < c.paneSize(0).height && axisWidth >= 40;
      node.style.visibility = fits ? 'visible' : 'hidden';
      if (fits) {
        node.style.top = `${y + 10}px`;
        node.style.width = `${axisWidth}px`;
      }
    };
    // Follow native price-scale and pane geometry updates without repainting the
    // canvas on clock ticks. Defer coordinate reads until native layout is done.
    const primitive: ISeriesPrimitive = { updateAllViews() {
      if (frame === undefined) frame = requestAnimationFrame(place);
    } };
    s.attachPrimitive(primitive);
    if (frame === undefined) frame = requestAnimationFrame(place);
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      if (chart.current === c && series.current === s) s.detachPrimitive(primitive);
    };
  }, [chart, series, generation, visible]);

  if (remaining === null) return null;
  return <span ref={label} className="candle-countdown" data-testid={`candle-countdown-${id}`}
    title="Time remaining in the current candle" aria-label={`Candle closes in ${remaining} seconds`}>
    {candleDuration(remaining)}
  </span>;
}
