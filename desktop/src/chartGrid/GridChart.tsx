import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, LineSeries, type IChartApi, type ISeriesApi, type Time, type UTCTimestamp } from 'lightweight-charts';
import { DARK_THEME, LIGHT_THEME, getCandleColors } from '../charts/appearance';
import { ema, sma } from '../charts/math';
import { price } from '../services/api';
import type { HistoryResult, Timeframe } from '../types';

const DISPLAY_BARS = 320;
const OVERLAY_LENGTH = 20;

export function gridSeries(data: HistoryResult, showSma: boolean, showEma: boolean) {
  const rows = data.candles;
  const start = Math.max(0, rows.length - DISPLAY_BARS);
  const close = showSma || showEma ? rows.map(row => row.close) : [];
  const line = (values: (number | null)[]) => values.slice(start).flatMap((value, i) => (
    value === null ? [] : [{ time: rows[start + i].time as UTCTimestamp, value }]
  ));
  return {
    candles: rows.slice(start).map(({ time, open, high, low, close }) => (
      { time: time as UTCTimestamp, open, high, low, close }
    )),
    sma: showSma ? line(sma(close, OVERLAY_LENGTH)) : [],
    ema: showEma ? line(ema(close, OVERLAY_LENGTH)) : [],
  };
}

const calendarFrames: Timeframe[] = ['1d', '1w', '1M', '1Y'];
export function gridDateFormatter(interval: Timeframe, timezone?: string) {
  const calendar = calendarFrames.includes(interval);
  const options: Intl.DateTimeFormatOptions = {
    timeZone: calendar ? 'UTC' : timezone || 'UTC',
    month: 'short',
    day: '2-digit',
    ...(calendar ? { year: 'numeric' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  };
  try { return new Intl.DateTimeFormat('en-IN', options); }
  catch { return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }); }
}

type Series = { candle: ISeriesApi<'Candlestick'>; sma: ISeriesApi<'Line'>; ema: ISeriesApi<'Line'> };

export function GridChart({ data, theme, showSma, showEma }: {
  data: HistoryResult; theme: 'dark' | 'light'; showSma: boolean; showEma: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<Series | null>(null);
  const [rendered, setRendered] = useState(0);
  const content = useMemo(() => gridSeries(data, showSma, showEma), [data, showSma, showEma]);
  const date = useMemo(() => gridDateFormatter(data.interval, data.timezone), [data.interval, data.timezone]);

  useLayoutEffect(() => {
    const instance = createChart(container.current!, {
      autoSize: true,
      layout: { attributionLogo: true, fontSize: 10 },
      handleScroll: { mouseWheel: false, vertTouchDrag: false },
      handleScale: { mouseWheel: false },
      rightPriceScale: { minimumWidth: 50, scaleMargins: { top: 0.12, bottom: 0.1 } },
      timeScale: { rightOffset: 2, barSpacing: 6 },
    });
    chart.current = instance;
    const movingAverage = (color: string) => instance.addSeries(LineSeries, {
      color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false,
    });
    series.current = {
      candle: instance.addSeries(CandlestickSeries, { lastValueVisible: false, priceLineVisible: false }),
      sma: movingAverage('#6c98f0'),
      ema: movingAverage('#d09949'),
    };
    return () => {
      instance.remove();
      chart.current = null;
      series.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const palette = theme === 'light' ? LIGHT_THEME : DARK_THEME;
    chart.current?.applyOptions({
      layout: { background: { type: ColorType.Solid, color: palette.background }, textColor: palette.textColor },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.borderColor },
      timeScale: { borderColor: palette.borderColor, timeVisible: !calendarFrames.includes(data.interval) },
      localization: {
        timeFormatter: (time: Time) => typeof time === 'number' ? date.format(time * 1000) : '',
        priceFormatter: (value: number) => price(value, data.precision ?? 2),
      },
    });
    const precision = data.precision ?? 2;
    series.current?.candle.applyOptions({
      ...getCandleColors(undefined, theme),
      priceFormat: { type: 'price', precision, minMove: 10 ** -precision },
    });
  }, [theme, date, data.interval, data.precision]);

  useLayoutEffect(() => {
    series.current?.candle.setData(content.candles);
    series.current?.sma.setData(content.sma);
    series.current?.ema.setData(content.ema);
    const count = content.candles.length;
    chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 72), to: count + 1 });
    setRendered(count);
  }, [content]);

  useEffect(() => {
    // The chart owns its ResizeObserver. An initial range applied while the
    // container was zero-width is applied again after the first layout frame.
    const frame = requestAnimationFrame(() => {
      const count = content.candles.length;
      chart.current?.timeScale().setVisibleLogicalRange({ from: Math.max(0, count - 72), to: count + 1 });
    });
    return () => cancelAnimationFrame(frame);
  }, [content.candles]);

  return <div ref={container} className="grid-card-canvas" data-testid="grid-chart" data-rendered-bars={rendered} />;
}
