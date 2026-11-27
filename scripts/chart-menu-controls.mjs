const button=(page,name)=>page.getByRole('button',{name,exact:true});

export const chartStylesMenu=page=>page.getByRole('menu',{name:'Chart styles',exact:true});

export async function selectChartStyle(page,style,trigger='Active chart type'){
  await button(page,trigger).click();
  await chartStylesMenu(page).locator(`[data-style="${style}"]`).click();
}

export async function openIndexConstituents(page,pane='0'){
  const chartData=button(page,`Data controls pane ${pane}`);
  if(await chartData.getAttribute('aria-pressed')!=='true')await chartData.click();
  await button(page,'Index constituents').click();
}

export async function openDataProvenance(page,pane='0'){
  const chartData=button(page,`Data controls pane ${pane}`);
  if(await chartData.getAttribute('aria-pressed')!=='true')await chartData.click();
  const details=page.getByTestId(`pane-${pane}`).locator('.history-controls details');
  if(await details.getAttribute('open')===null)await details.locator('summary').click();
  return page.getByTestId(`chart-provenance-${pane}`);
}

export async function openMarketDiagnostics(page){
  await page.getByLabel('More chart options',{exact:true}).click();
  await page.getByTestId('provider-status').click();
}
