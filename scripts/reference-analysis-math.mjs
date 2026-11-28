import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {outputFiles}=await build({stdin:{contents:`
  export * from './desktop/src/charts/chartStyles';

  export * from './desktop/src/charts/dividends';
  export * from './desktop/src/studies/recipes';
`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {chartStyleGroups,styleRows,lineBreakPoints,chartDividends,recipeValues,validRecipe,defaultRecipe}=await import(
  'data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const bar=(time,close,open=close)=>({time,open,high:Math.max(open,close)+2,low:Math.min(open,close)-2,close,volume:7});
const early=[bar(1,14,10),bar(2,22,18)];
assert.deepEqual(styleRows(early,'heikin-ashi').map(({time,open,high,low,close})=>[time,open,high,low,close]),[[1,12,16,8,12],[2,12,24,12,20]]);
assert.equal(early[1].open,18);
assert.equal(styleRows(early,'candles'),early);
const breaks=lineBreakPoints([10,11,12,13,12,10,9,12,14].map((v,i)=>bar(i+1,v)));
assert.deepEqual(breaks.map(x=>x.close??null),[null,11,12,13,null,null,9,null,14]);
assert.equal(new Set(breaks.map(x=>x.time)).size,breaks.length);
const keys=chartStyleGroups.flatMap(group=>group[1].map(entry=>entry[0]));
assert.equal(new Set(keys).size,13);

const day=Date.UTC(2026,0,12)/1000;
const action={date:'2026-01-12',dividend:1.33,split:0,time:day+50};
const history={source:'YAHOO FINANCE',interval:'1d',actions:[action,{...action,date:'2026-01-13'}]};
assert.deepEqual(chartDividends([bar(day,22)],history,false),[{time:day,date:action.date,amount:1.33}]);
assert.deepEqual(chartDividends([bar(day,22)],history,true),[]);
assert.deepEqual(chartDividends([bar(day,22)],{...history,interval:'1w'},false),[]);

const values=recipeValues([1,2,3,2,4].map((v,i)=>bar(i,v)),{...defaultRecipe,rsi:2,ema:2,wma:2});
assert.deepEqual(values.rsi.slice(0,4),[null,null,100,50]);
assert.equal(values.ema[3],75);
assert.ok(Math.abs(values.wma[3]-200/3)<1e-10);
assert.ok(validRecipe(defaultRecipe));
assert.equal(validRecipe({...defaultRecipe,ema:201}),false);
console.log('PASS 13 chart styles, Heikin Ashi/three-line break, verified dividend dates and typed RSI/EMA/WMA arithmetic');
