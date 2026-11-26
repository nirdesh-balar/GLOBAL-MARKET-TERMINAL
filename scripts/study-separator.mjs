import { expect } from './isolated-electron.mjs';

export async function dragStudySeparator(page, canvas, studyId, pixels, onStep) {
  const point = () => canvas.evaluate((element, id) => {
    const row = JSON.parse(element.dataset.studyPanes || '[]').find(study => study.id === id);
    const pane = element.__chart.panes()[row.index].getHTMLElement();
    const chart = element.getBoundingClientRect();
    return { x: chart.left + Math.max(85, chart.width * 0.46), y: pane.getBoundingClientRect().top - 1 };
  }, studyId);
  const target = await point();
  await canvas.evaluate((element, y) => {
    const scroll = element.closest('.chart-scroll');
    const view = scroll.getBoundingClientRect();
    if (y < view.top + 45 || y > view.bottom - 75) scroll.scrollTop += y - view.top - view.height / 2;
  }, target.y);
  const { x, y } = await point();
  await expect.poll(() => page.evaluate(({ x, y }) => {
    const target = document.elementFromPoint(x, y);
    return target && getComputedStyle(target).cursor;
  }, { x, y })).toBe('row-resize');
  await page.mouse.move(x, y);
  await page.mouse.down();
  try {
    if (onStep) {
      for (const fraction of [0.33, 0.67, 1]) {
        await page.mouse.move(x, y + pixels * fraction, { steps: 4 });
        await onStep(fraction);
      }
    } else {
      await page.mouse.move(x, y + pixels, { steps: 10 });
    }
  } finally {
    await page.mouse.up();
  }
}
