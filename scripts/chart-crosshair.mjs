import { expect } from './isolated-electron.mjs';

export async function candlePointerTarget(canvas, time) {
  let target;
  await expect.poll(async () => {
    target = await canvas.evaluate((host, time) => {
      const chart = host.__chart;
      const plot = chart?.panes()[0]?.getHTMLElement()?.cells[1];
      if (!plot) return null;
      const scale = chart.timeScale();
      const size = chart.paneSize(0);
      const rect = plot.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      const widgetRect = chart.chartElement().getBoundingClientRect();
      // Auto-size observes layout asynchronously. Sample only after the widget,
      // native plot and time scale all agree with the current DOM geometry.
      if (Math.abs(widgetRect.width - hostRect.width) > 1 ||
          Math.abs(widgetRect.height - hostRect.height) > 1 ||
          Math.abs(size.width - rect.width) > 1 ||
          Math.abs(size.height - rect.height) > 1 ||
          scale.width() !== size.width) return null;

      const localX = scale.timeToCoordinate(time);
      if (localX === null || localX < 0 || localX >= size.width ||
          scale.coordinateToTime(localX) !== time) return null;
      const x = rect.left + localX;
      for (const fraction of [.55, .73, .38]) {
        const y = rect.top + rect.height * fraction;
        const hit = document.elementFromPoint(x, y);
        if (hit?.tagName === 'CANVAS' && plot.contains(hit)) {
          return { x, y, time, plotWidth: size.width, plotHeight: size.height,
            viewport: [innerWidth, innerHeight, devicePixelRatio] };
        }
      }
      return null;
    }, time);
    return target !== null;
  }, { message: `Candle ${time} must map to a hittable price canvas after layout settles` }).toBe(true);
  return target;
}

export async function moveCrosshairToCandle(page, canvas, time) {
  const target = await candlePointerTarget(canvas, time);
  await page.mouse.move(target.x, target.y);
  await expect(canvas).toHaveAttribute('data-crosshair-time', String(time));
  return target;
}
