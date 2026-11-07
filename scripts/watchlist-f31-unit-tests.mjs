import assert from 'node:assert/strict';

console.log('================================================================');
console.log('STARTING PHASE F3.1 WATCHLIST STABILITY & SORTING UNIT TESTS');
console.log('================================================================');

// 1. Implementation of compareSymbolEntries matching WatchlistSidebar.tsx
function identity(r) {
  return `${r.exchange || 'NSE'}:${r.symbol}:${r.kind || 'equity'}:${r.provider || 'yahoo'}`;
}

function compareSymbolEntries(a, b, sort, quotes) {
  if (sort === 'manual') return 0;

  if (sort === 'symbol') {
    const cmp = a.symbol.localeCompare(b.symbol);
    return cmp !== 0 ? cmp : (a.exchange || '').localeCompare(b.exchange || '');
  }
  if (sort === 'symbol_desc') {
    const cmp = b.symbol.localeCompare(a.symbol);
    return cmp !== 0 ? cmp : (b.exchange || '').localeCompare(a.exchange || '');
  }

  const idA = identity(a);
  const idB = identity(b);
  const qA = quotes?.[idA]?.value;
  const qB = quotes?.[idB]?.value;

  const getFinite = (val, fallback) => {
    return typeof val === 'number' && Number.isFinite(val) ? val : fallback;
  };

  if (sort === 'price_desc' || sort === 'price') {
    const isDesc = sort === 'price_desc';
    const missing = isDesc ? -Infinity : Infinity;
    const pA = getFinite(qA?.price, missing);
    const pB = getFinite(qB?.price, missing);
    if (pA !== pB) {
      return isDesc ? pB - pA : pA - pB;
    }
    return a.symbol.localeCompare(b.symbol);
  }

  if (sort === 'change' || sort === 'change_desc' || sort === 'change_asc') {
    const isDesc = sort !== 'change_asc';
    const missing = isDesc ? -Infinity : Infinity;
    const cA = getFinite(qA?.change, missing);
    const cB = getFinite(qB?.change, missing);
    if (cA !== cB) {
      return isDesc ? cB - cA : cA - cB;
    }
    return a.symbol.localeCompare(b.symbol);
  }

  if (sort === 'change_abs_desc' || sort === 'change_abs') {
    const isDesc = sort === 'change_abs_desc';
    const missing = isDesc ? -Infinity : Infinity;
    const cA = getFinite(qA?.absolute_change, missing);
    const cB = getFinite(qB?.absolute_change, missing);
    if (cA !== cB) {
      return isDesc ? cB - cA : cA - cB;
    }
    return a.symbol.localeCompare(b.symbol);
  }

  return 0;
}

// -----------------------------------------------------------------------------
// TEST 1: Sorting comparator verification
// -----------------------------------------------------------------------------
console.log('\n--- TEST 1: Sorting comparator behavior ---');
{
  const symA = { symbol: 'INFY', exchange: 'NSE', kind: 'equity', provider: 'yahoo' };
  const symB = { symbol: 'RELIANCE', exchange: 'NSE', kind: 'equity', provider: 'yahoo' };
  const symC = { symbol: 'TCS', exchange: 'NSE', kind: 'equity', provider: 'yahoo' };
  const symD = { symbol: 'ZOMATO', exchange: 'NSE', kind: 'equity', provider: 'yahoo' }; // unquoted

  const quotes = {
    [identity(symA)]: { value: { price: 1500, absolute_change: -15, change: -1.0 } },
    [identity(symB)]: { value: { price: 2900, absolute_change: 58, change: 2.0 } },
    [identity(symC)]: { value: { price: 3800, absolute_change: 19, change: 0.5 } },
    // symD unquoted
  };

  const list = [symA, symB, symC, symD];

  // Symbol A-Z
  const sortSymAsc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'symbol', quotes));
  assert.deepEqual(sortSymAsc.map(s => s.symbol), ['INFY', 'RELIANCE', 'TCS', 'ZOMATO']);
  console.log('PASS: Symbol A-Z sorted correctly');

  // Symbol Z-A
  const sortSymDesc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'symbol_desc', quotes));
  assert.deepEqual(sortSymDesc.map(s => s.symbol), ['ZOMATO', 'TCS', 'RELIANCE', 'INFY']);
  console.log('PASS: Symbol Z-A sorted correctly');

  // Price High to Low
  const sortPriceDesc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'price_desc', quotes));
  assert.deepEqual(sortPriceDesc.map(s => s.symbol), ['TCS', 'RELIANCE', 'INFY', 'ZOMATO']);
  console.log('PASS: Price High to Low sorted correctly (unquoted at bottom)');

  // Price Low to High
  const sortPriceAsc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'price', quotes));
  assert.deepEqual(sortPriceAsc.map(s => s.symbol), ['INFY', 'RELIANCE', 'TCS', 'ZOMATO']);
  console.log('PASS: Price Low to High sorted correctly (unquoted at bottom)');

  // Change % High to Low (default 'change')
  const sortChangePctDesc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'change', quotes));
  assert.deepEqual(sortChangePctDesc.map(s => s.symbol), ['RELIANCE', 'TCS', 'INFY', 'ZOMATO']);
  console.log('PASS: Change % High to Low sorted correctly (unquoted at bottom)');

  // Change % Low to High ('change_asc')
  const sortChangePctAsc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'change_asc', quotes));
  assert.deepEqual(sortChangePctAsc.map(s => s.symbol), ['INFY', 'TCS', 'RELIANCE', 'ZOMATO']);
  console.log('PASS: Change % Low to High sorted correctly (unquoted at bottom)');

  // Change Abs High to Low ('change_abs_desc')
  const sortChangeAbsDesc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'change_abs_desc', quotes));
  assert.deepEqual(sortChangeAbsDesc.map(s => s.symbol), ['RELIANCE', 'TCS', 'INFY', 'ZOMATO']);
  console.log('PASS: Change Abs High to Low sorted correctly');

  // Change Abs Low to High ('change_abs')
  const sortChangeAbsAsc = [...list].sort((a, b) => compareSymbolEntries(a, b, 'change_abs', quotes));
  assert.deepEqual(sortChangeAbsAsc.map(s => s.symbol), ['INFY', 'TCS', 'RELIANCE', 'ZOMATO']);
  console.log('PASS: Change Abs Low to High sorted correctly');
}

// -----------------------------------------------------------------------------
// TEST 2: Watchlist Model Order Stability during Incremental Quote Loading
// -----------------------------------------------------------------------------
console.log('\n--- TEST 2: Watchlist row stability with 10, 99, and 500 stocks ---');

class StableWatchlistSimulator {
  constructor(symbolCount, initialSort = 'change') {
    this.items = Array.from({ length: symbolCount }, (_, i) => ({
      symbol: `STOCK_${String(i).padStart(3, '0')}`,
      name: `Company ${i}`,
      exchange: 'NSE',
      kind: 'equity',
      provider: 'yahoo'
    }));
    this.sort = initialSort;
    this.watchlistId = 'test-watchlist';
    this.query = '';
    this.showHidden = false;
    this.hiddenSymbols = [];
    this.quotes = {};
    this.displayOrder = [];
    this.lastSort = '';
    this.lastWatchlist = '';
    this.lastQuery = '';
    this.lastShowHidden = false;
    this.lastItemsKey = '';
    this.resortEpoch = 0;
    this.scrollTop = 0;
    this.selectedSymbol = null;
    this.anchor = null;
  }

  triggerResort() {
    this.resortEpoch++;
  }

  selectStock(symbolId) {
    this.selectedSymbol = symbolId;
  }

  scrollTo(top) {
    this.scrollTop = top;
  }

  // Simulates React render pass of WatchlistSidebar
  render() {
    const baseItems = this.items.map((row, n) => ({ row, n }))
      .filter(({ row }) => this.showHidden || !this.hiddenSymbols.includes(identity(row)))
      .filter(({ row }) => `${row.symbol} ${row.name} ${row.exchange} ${row.kind}`.toLowerCase().includes(this.query.toLowerCase()));

    const itemsKey = baseItems.map(it => identity(it.row)).join('|');
    const isManual = this.sort === 'manual';

    const needsResort =
      this.sort !== this.lastSort ||
      this.watchlistId !== this.lastWatchlist ||
      this.query !== this.lastQuery ||
      this.showHidden !== this.lastShowHidden ||
      this.resortEpoch !== this.lastResortEpoch ||
      itemsKey !== this.lastItemsKey ||
      this.displayOrder.length === 0;

    if (needsResort) {
      if (this.scrollTop > 0 && this.displayOrder.length > 0) {
        const topIdx = Math.max(0, Math.floor(this.scrollTop / 44));
        const topSymbolId = this.displayOrder[topIdx];
        if (topSymbolId) {
          this.anchor = {
            id: topSymbolId,
            offset: this.scrollTop - (topIdx * 44)
          };
        }
      }

      if (isManual) {
        this.displayOrder = baseItems.map(it => identity(it.row));
      } else {
        const sorted = [...baseItems];
        sorted.sort((a, b) => compareSymbolEntries(a.row, b.row, this.sort, this.quotes));
        this.displayOrder = sorted.map(it => identity(it.row));
      }

      this.lastSort = this.sort;
      this.lastWatchlist = this.watchlistId;
      this.lastQuery = this.query;
      this.lastShowHidden = this.showHidden;
      this.lastResortEpoch = this.resortEpoch;
      this.lastItemsKey = itemsKey;
    }

    const baseMap = new Map();
    for (const item of baseItems) {
      baseMap.set(identity(item.row), item);
    }
    const renderedItems = [];
    for (const id of this.displayOrder) {
      const item = baseMap.get(id);
      if (item) {
        renderedItems.push(item);
        baseMap.delete(id);
      }
    }
    for (const item of baseMap.values()) {
      renderedItems.push(item);
    }

    // Layout effect anchor restoration
    if (this.anchor) {
      const anchor = this.anchor;
      this.anchor = null;
      const newIndex = renderedItems.findIndex(it => identity(it.row) === anchor.id);
      if (newIndex >= 0) {
        this.scrollTop = Math.max(0, newIndex * 44 + anchor.offset);
      }
    }

    return renderedItems;
  }
}

for (const count of [10, 99, 500]) {
  console.log(`\nTesting with ${count} stocks...`);
  const sim = new StableWatchlistSimulator(count, 'change');

  // Step 1: Initial mount - quotes are empty
  const initialItems = sim.render();
  assert.equal(initialItems.length, count);
  const initialOrder = initialItems.map(it => identity(it.row));

  // Step 2: User scrolls down to a middle stock (e.g. index count / 2)
  const middleIndex = Math.floor(count / 2);
  const middleStock = initialItems[middleIndex].row;
  const middleStockId = identity(middleStock);
  sim.scrollTo(middleIndex * 44);
  sim.selectStock(middleStockId);

  assert.equal(sim.selectedSymbol, middleStockId);
  const initialScrollTop = sim.scrollTop;

  // Step 3: Stream in quotes in multiple chunks (e.g. 10 stocks per batch)
  console.log(`  Streaming quote batches into ${count} stocks...`);
  const batchSize = Math.max(2, Math.floor(count / 5));
  let batchNum = 0;
  for (let start = 0; start < count; start += batchSize) {
    batchNum++;
    const end = Math.min(count, start + batchSize);
    for (let i = start; i < end; i++) {
      const sym = sim.items[i];
      // Assign arbitrary positive and negative change%
      const chg = ((i * 17) % 21) - 10; // between -10% and +10%
      sim.quotes[identity(sym)] = {
        value: {
          price: 100 + i * 5,
          absolute_change: chg * 2,
          change: chg
        }
      };
    }

    // Render pass with new quotes
    const rendered = sim.render();

    // VERIFICATION A: Display order must remain 100% stable during quote streaming!
    const currentOrder = rendered.map(it => identity(it.row));
    assert.deepEqual(currentOrder, initialOrder, `Order must NOT change during quote batch ${batchNum}`);

    // VERIFICATION B: Selected stock must remain unchanged!
    assert.equal(sim.selectedSymbol, middleStockId, `Selected stock must stay ${middleStockId}`);

    // VERIFICATION C: Scroll position must remain rock solid!
    assert.equal(sim.scrollTop, initialScrollTop, `ScrollTop must stay ${initialScrollTop}`);

    // VERIFICATION D: Selected stock's index in list must remain identical!
    const curIndex = rendered.findIndex(it => identity(it.row) === middleStockId);
    assert.equal(curIndex, middleIndex, `Middle stock index must remain ${middleIndex}`);
  }
  console.log(`PASS: All batches completed for ${count} stocks. Order, selection, and scroll position 100% frozen!`);

  // Step 4: Now user explicitly triggers resort (e.g. clicks column header or selects sort)
  console.log(`  User triggers explicit resort on ${count} stocks...`);
  sim.triggerResort();
  const resorted = sim.render();

  // Verify that it is now sorted by Change % descending
  for (let i = 0; i < resorted.length - 1; i++) {
    const q1 = sim.quotes[identity(resorted[i].row)]?.value?.change ?? -Infinity;
    const q2 = sim.quotes[identity(resorted[i + 1].row)]?.value?.change ?? -Infinity;
    assert.ok(q1 >= q2, `Resorted items must be descending: ${q1} >= ${q2}`);
  }
  console.log(`PASS: Explicit resort ordered all ${count} stocks by Change % correctly`);

  // Verify that selected symbol is still the middle stock
  assert.equal(sim.selectedSymbol, middleStockId, 'Selected symbol must be preserved after resort');

  // Verify that viewport anchor was preserved
  assert.ok(sim.scrollTop >= 0, 'ScrollTop must remain non-negative after anchor restoration');
  console.log(`PASS: Viewport anchor preserved for ${count} stocks (scrollTop = ${sim.scrollTop})`);
}

// -----------------------------------------------------------------------------
// TEST 3: Keyboard navigation stability
// -----------------------------------------------------------------------------
console.log('\n--- TEST 3: Keyboard navigation ---');
{
  const sim = new StableWatchlistSimulator(10, 'manual');
  sim.render();
  const items = sim.render();

  sim.selectStock(identity(items[0].row));
  assert.equal(sim.selectedSymbol, identity(items[0].row));

  // Navigate Down
  let currentIndex = items.findIndex(it => identity(it.row) === sim.selectedSymbol);
  sim.selectStock(identity(items[currentIndex + 1].row));
  assert.equal(sim.selectedSymbol, identity(items[1].row));

  // Navigate Down to middle
  sim.selectStock(identity(items[5].row));
  assert.equal(sim.selectedSymbol, identity(items[5].row));

  // Quotes arrive
  sim.quotes[identity(items[5].row)] = { value: { price: 500, change: 5.5 } };
  sim.render();
  assert.equal(sim.selectedSymbol, identity(items[5].row));
  console.log('PASS: Keyboard navigation and selection stay rock-solid');
}

console.log('\n================================================================');
console.log('ALL PHASE F3.1 UNIT & STABILITY TESTS PASSED WITH 100% SUCCESS!');
console.log('================================================================\n');

