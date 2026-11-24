export async function chooseWatchlist(page, id) {
  const trigger = page.getByTestId('watchlist-dropdown');
  if (await trigger.evaluate(element => element instanceof HTMLSelectElement)) {
    await trigger.selectOption(id);
    return;
  }
  await trigger.click();
  await page.getByTestId('watchlist-choice-' + id).click();
}

export async function openWatchlistOptions(page) {
  const trigger = page.getByRole('button', { name: 'Watchlist options', exact: true });
  if (await trigger.count() && await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
}

export async function clickWatchlistAction(page, name) {
  await openWatchlistOptions(page);
  await page.getByLabel(name, { exact: true }).click();
}

export async function filterWatchlist(page) {
  const filter = page.getByLabel('Search current watchlist', { exact: true });
  if (!await filter.isVisible()) {
    await openWatchlistOptions(page);
    await page.getByRole('button', { name: 'Filter this watchlist', exact: true }).click();
  }
  return filter;
}
