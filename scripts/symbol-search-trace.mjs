// The native fixtures use only public fixture symbols and never record response bodies.
export async function traceSymbolSearch(app, page) {
  await app.evaluate(({ ipcMain }) => {
    const api = ipcMain._invokeHandlers.get('api');
    const events = [];
    const record = (event, fields) => events.push({ at: Date.now(), event, ...fields });
    const discover = new Map();
    globalThis.gmtSearchTrace = { events, holds: new Map() };
    ipcMain.prependListener('cancel', (_event, id) => {
      if (discover.has(id)) record('request-cancel', { id, ...discover.get(id) });
    });
    ipcMain.removeHandler('api');
    ipcMain.handle('api', async (...args) => {
      const url = new URL(args[1], 'http://127.0.0.1');
      const id = args[4];
      if (url.pathname !== '/api/instruments/discover' || typeof id !== 'string') return api(...args);
      const identity = { query: url.searchParams.get('q'), category: url.searchParams.get('category') };
      discover.set(id, identity);
      record('request-start', { id, ...identity });
      const hold = globalThis.gmtSearchTrace.holds.get(identity.query);
      let reply = await api(...args);
      record('request-complete', { id, ...identity, count: reply.results?.length ?? 0,
        matching: reply.results?.filter(row => row.yahoo_symbol === identity.query).length ?? 0,
        warning: Boolean(reply.warning), error: reply.__terminal_error?.code ?? null });
      if (hold) {
        hold.waiting = true;
        await hold.gate;
        if (hold.error) reply = { __terminal_error: { code: 'temporary', message: 'Fixture discovery failed' } };
      }
      record('request-delivered', { id, ...identity, error: reply.__terminal_error?.code ?? null });
      discover.delete(id);
      return reply;
    });
  });
  await page.evaluate(() => {
    const events = [];
    window.gmtSearchTrace = events;
    const record = (event, fields) => events.push({ at: Date.now(), event, ...fields });
    const read = () => {
      const dialog = document.querySelector('.search-modal');
      if (!dialog) return null;
      const results = dialog.querySelector('.search-results');
      return {
        query: dialog.querySelector('input').value,
        category: dialog.querySelector('[data-market-category][aria-pressed=true]')?.dataset.marketCategory,
        loading: results.getAttribute('aria-busy') === 'true',
        error: Boolean(results.querySelector('.error')),
        count: results.querySelectorAll('.result-main').length,
        enabled: [...results.querySelectorAll('.result-main:not(:disabled)')].slice(0, 3).map(node => node.dataset.testid),
      };
    };
    let previous = null;
    const observe = new MutationObserver(() => {
      const value = read();
      if (JSON.stringify(value) === JSON.stringify(previous)) return;
      record(!previous ? 'dialog-open' : !value ? 'dialog-close' : 'dom-state', value);
      previous = value;
    });
    observe.observe(document.body, { subtree: true, childList: true, attributes: true,
      attributeFilter: ['aria-pressed', 'aria-busy', 'disabled'] });
    document.addEventListener('input', event => {
      if (event.target.matches('.search-modal input')) record('query-input', { query: event.target.value });
    }, true);
    const schedule = window.setTimeout.bind(window);
    const clear = window.clearTimeout.bind(window);
    const timers = new Map();
    window.setTimeout = (callback, delay, ...args) => {
      if (delay !== 300 || typeof callback !== 'function' || !String(callback).includes('/api/instruments/discover')) {
        return schedule(callback, delay, ...args);
      }
      const { query, category } = read() ?? {};
      const timer = schedule(() => {
        timers.delete(timer);
        record('debounce-fired', { timer, query, category });
        callback(...args);
      }, delay);
      timers.set(timer, { query, category });
      record('debounce-scheduled', { timer, query, category });
      return timer;
    };
    window.clearTimeout = timer => {
      if (timers.has(timer)) record('debounce-cancelled', { timer, ...timers.get(timer) });
      timers.delete(timer);
      clear(timer);
    };
  });
  return {
    mark: (event, fields = {}) => page.evaluate(([event, fields]) => {
      window.gmtSearchTrace.push({ at: Date.now(), event, ...fields });
    }, [event, fields]),
    main: () => app.evaluate(() => globalThis.gmtSearchTrace.events),
    async timeline() {
      const [renderer, main] = await Promise.all([
        page.evaluate(() => window.gmtSearchTrace),
        app.evaluate(() => globalThis.gmtSearchTrace.events),
      ]);
      return [...renderer, ...main].sort((a, b) => a.at - b.at);
    },
    hold: (query, error = false) => app.evaluate((_, { query, error }) => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      globalThis.gmtSearchTrace.holds.set(query, { gate, release, error, waiting: false });
    }, { query, error }),
    waiting: query => app.evaluate((_, query) => globalThis.gmtSearchTrace.holds.get(query)?.waiting ?? false, query),
    release: query => app.evaluate((_, query) => {
      globalThis.gmtSearchTrace.holds.get(query).release();
      globalThis.gmtSearchTrace.holds.delete(query);
    }, query),
  };
}
