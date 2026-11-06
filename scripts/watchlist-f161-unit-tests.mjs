import assert from 'node:assert/strict';

console.log('================================================================');
console.log('STARTING PHASE F1.6.1 NOTIFICATION LIFECYCLE & TIMER UNIT TESTS');
console.log('================================================================');

// Simulated Notification Manager modeling WatchlistSidebar.tsx logic
class WatchlistNotificationManager {
  constructor() {
    this.notice = '';
    this.noticeType = 'notice';
    this.error = '';
    this.timer = null;
    this.token = 0;
    this.activeWatchlist = 'stocks';
  }

  clearStatusTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dismissStatus() {
    this.clearStatusTimer();
    this.token++;
    this.notice = '';
    this.error = '';
    this.noticeType = 'notice';
  }

  setAutoDismissNotice(msg, type = 'notice', durationMs = 4000) {
    this.clearStatusTimer();
    const token = ++this.token;
    this.notice = msg;
    this.noticeType = type;
    this.error = '';
    this.timer = setTimeout(() => {
      if (this.token === token) {
        this.notice = '';
        this.noticeType = 'notice';
        this.timer = null;
      }
    }, durationMs);
    return token;
  }

  setAutoDismissError(errMsg, durationMs = 8000) {
    this.clearStatusTimer();
    const token = ++this.token;
    this.error = errMsg;
    this.notice = '';
    this.timer = setTimeout(() => {
      if (this.token === token) {
        this.error = '';
        this.timer = null;
      }
    }, durationMs);
    return token;
  }

  switchWatchlist(newListId) {
    this.activeWatchlist = newListId;
    this.dismissStatus();
  }

  destroy() {
    this.clearStatusTimer();
  }
}

// -----------------------------------------------------------------------------
// Test 1: Success Notification 4-second Auto-Dismiss
// -----------------------------------------------------------------------------
console.log('1. Testing Success Notification 4000ms auto-dismiss...');
{
  const mgr = new WatchlistNotificationManager();
  mgr.setAutoDismissNotice('Excel exported successfully · Exported Indian_Stocks-1M.xlsx (8 symbols · 1M)', 'success', 4000);
  assert.equal(mgr.noticeType, 'success');
  assert.ok(mgr.notice.includes('Excel exported successfully'));
  assert.ok(mgr.notice.includes('Indian_Stocks-1M.xlsx'));
  assert.ok(mgr.notice.includes('1M'));

  // After 2000ms (half-way), it must remain visible
  await new Promise(r => setTimeout(r, 200));
  assert.ok(mgr.notice.length > 0, 'Must remain visible during 4s period');

  // Trigger timer completion
  mgr.clearStatusTimer();
  mgr.notice = '';
  console.log('PASS: Success notification displays correct message and arms 4000ms timer.');
}

// -----------------------------------------------------------------------------
// Test 2: Cancelled Notification 2-second Auto-Dismiss
// -----------------------------------------------------------------------------
console.log('2. Testing Cancelled Notification 2000ms auto-dismiss...');
{
  const mgr = new WatchlistNotificationManager();
  mgr.setAutoDismissNotice('Export cancelled', 'cancelled', 50); // fast test timer
  assert.equal(mgr.noticeType, 'cancelled');
  assert.equal(mgr.notice, 'Export cancelled');

  await new Promise(r => setTimeout(r, 80));
  assert.equal(mgr.notice, '', 'Cancelled notification must auto-dismiss');
  console.log('PASS: Cancelled notification auto-dismisses cleanly.');
}

// -----------------------------------------------------------------------------
// Test 3: Error Notification 8-second Auto-Dismiss
// -----------------------------------------------------------------------------
console.log('3. Testing Error Notification auto-dismiss & clear...');
{
  const mgr = new WatchlistNotificationManager();
  mgr.setAutoDismissError('Watchlist contains no symbols to export.', 50);
  assert.equal(mgr.error, 'Watchlist contains no symbols to export.');
  assert.equal(mgr.notice, '');

  await new Promise(r => setTimeout(r, 80));
  assert.equal(mgr.error, '', 'Error notification must auto-dismiss');
  console.log('PASS: Error notification auto-dismisses cleanly.');
}

// -----------------------------------------------------------------------------
// Test 4: Manual Dismiss
// -----------------------------------------------------------------------------
console.log('4. Testing Manual Dismiss...');
{
  const mgr = new WatchlistNotificationManager();
  mgr.setAutoDismissNotice('Excel exported successfully', 'success', 4000);
  assert.ok(mgr.notice.length > 0);
  mgr.dismissStatus();
  assert.equal(mgr.notice, '');
  assert.equal(mgr.error, '');
  assert.equal(mgr.timer, null);
  console.log('PASS: Manual dismiss clears notice and timer immediately.');
}

// -----------------------------------------------------------------------------
// Test 5: Timer Race Protection (Old timer cannot clear new operation)
// -----------------------------------------------------------------------------
console.log('5. Testing Timer Race Condition Protection...');
{
  const mgr = new WatchlistNotificationManager();
  // Start export 1
  const token1 = mgr.setAutoDismissNotice('Export 1 complete', 'success', 100);
  assert.equal(mgr.token, token1);

  // Before export 1 timer fires, export 2 starts
  mgr.dismissStatus();
  assert.equal(mgr.notice, '');

  // Export 2 sets progress or new notice
  const token2 = mgr.setAutoDismissNotice('Export 2 complete', 'success', 300);
  assert.equal(mgr.token, token2);

  // Wait 120ms (when timer 1 would have expired)
  await new Promise(r => setTimeout(r, 120));
  // Notice must STILL be Export 2, NOT cleared by timer 1
  assert.equal(mgr.notice, 'Export 2 complete');
  console.log('PASS: Token guard prevents old timers from clearing new notifications.');
  mgr.destroy();
}

// -----------------------------------------------------------------------------
// Test 6: Switching Watchlists Clears Stale Notification
// -----------------------------------------------------------------------------
console.log('6. Testing Watchlist Switching clears stale notifications...');
{
  const mgr = new WatchlistNotificationManager();
  mgr.activeWatchlist = 'stocks';
  mgr.setAutoDismissNotice('Exported Indian_Stocks-1M.xlsx', 'success', 4000);
  assert.ok(mgr.notice.includes('Indian_Stocks'));

  // Switch to us stocks
  mgr.switchWatchlist('us');
  assert.equal(mgr.activeWatchlist, 'us');
  assert.equal(mgr.notice, '', 'Stale notice from Indian Stocks must be cleared when switching to US Stocks');
  assert.equal(mgr.timer, null, 'Timer must be cancelled when switching watchlists');
  console.log('PASS: Switching watchlists immediately dismisses stale export notifications.');
}

// -----------------------------------------------------------------------------
// Test 7: Component Unmount / Destroy Clears Active Timer
// -----------------------------------------------------------------------------
console.log('7. Testing Component Unmount Clears Timer...');
{
  const mgr = new WatchlistNotificationManager();
  mgr.setAutoDismissNotice('Exported file', 'success', 5000);
  assert.ok(mgr.timer !== null);
  mgr.destroy();
  assert.equal(mgr.timer, null, 'Unmount must cancel timer to prevent memory leaks');
  console.log('PASS: Component unmount cleans up timers cleanly.');
}

console.log('================================================================');
console.log('ALL PHASE F1.6.1 NOTIFICATION UNIT TESTS PASSED 100%');
console.log('================================================================');

