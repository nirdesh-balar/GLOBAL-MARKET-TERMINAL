import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let second = Math.floor(Date.now() / 1000);
let timer: ReturnType<typeof setTimeout> | undefined;
let stopLifecycle: (() => void) | undefined;
let suspended = false;

function tick() {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  const now = Date.now();
  const updated = Math.floor(now / 1000);
  if (second !== updated) {
    second = updated;
    for (const listener of listeners) listener();
  }
  if (listeners.size && !suspended && !document.hidden) timer = setTimeout(tick, 1000 - now % 1000);
}

export function subscribeClock(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    document.addEventListener('visibilitychange', tick);
    stopLifecycle = window.terminal?.onLifecycle(state => {
      suspended = state === 'suspend';
      tick();
    });
    tick();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    document.removeEventListener('visibilitychange', tick);
    stopLifecycle?.();
    stopLifecycle = undefined;
    suspended = false;
  };
}

const snapshot = () => second;
export const useChartClock = () => useSyncExternalStore(subscribeClock, snapshot);

export function clockFormatter(zone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'shortOffset',
  });
}

export function clockText(formatter: Intl.DateTimeFormat, seconds: number) {
  return formatter.format(seconds * 1000).replace(/GMT(?:[+−-]0(?=\s|$))?/, 'UTC');
}
