import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {hilegaSource} from './pine-study-fixture.mjs';

const bundled=await build({entryPoints:['desktop/src/studies/pine.ts'],bundle:true,platform:'node',format:'esm',write:false});
const {compilePine,runPine,PineDiagnostic}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const bars=Array.from({length:330},(_,i)=>{
  const close=100+9*Math.sin(i/4.5)+.1*i;
  return {time:1700000000+60*i,open:close,high:close+1,low:close-1,close,volume:i%4===0?null:5};
});
const program=compilePine(hilegaSource);
assert.equal(program.version,4);
assert.equal(program.overlay,false);
const output=runPine(program,bars);
assert.equal(output.plots.length,4);
const actual=output.plots.map(plot=>plot.points.map(point=>point.value));
const rsi=Array(bars.length).fill(null),ema=Array(bars.length).fill(null),wma=Array(bars.length).fill(null);
const changes=bars.slice(1).map((row,i)=>row.close-bars[i].close);
let gain=changes.slice(0,9).reduce((sum,c)=>sum+Math.max(c,0),0)/9;
let loss=changes.slice(0,9).reduce((sum,c)=>sum+Math.max(-c,0),0)/9;
for(let i=9;i<bars.length;i++){
  if(i>9){const c=changes[i-1];gain=(8*gain+Math.max(0,c))/9;loss=(8*loss+Math.max(0,-c))/9;}
  rsi[i]=loss===0?100:100*gain/(gain+loss);
  ema[i]=i===9?rsi[i]:(ema[i-1]+rsi[i])/2;
  if(i>=29)wma[i]=rsi.slice(i-20,i+1).reduce((sum,r,j)=>sum+r*(j+1),0)/231;
}
let maxError=0;
for(const [n,expected] of [rsi,ema,wma,bars.map(()=>50)].entries()){
  for(const [i,reference] of expected.entries()){
    if(reference===null)assert.equal(actual[n][i],null);
    else {assert.equal(typeof actual[n][i],'number');maxError=Math.max(maxError,Math.abs(actual[n][i]-reference));}
  }
}
assert.ok(maxError<1e-9,`max numerical error ${maxError}`);
const colors=output.fills[0].colors.slice(29);
assert.equal(new Set(colors).size,2);
for(let i=29;i<bars.length;i++)assert.equal(output.fills[0].colors[i],ema[i]>=wma[i]?'#00bcd48c':'#f236458c');
const modern=compilePine(`//@version=6
indicator("Overlay", overlay = true)
period = input.int(3, minval = 1)
scale = input.float(-1.5, minval = -3)
src = input.source(hl2)
maybe = na(volume) ? na : src * scale
plot(ta.sma(maybe, period), color=color.new(color.green, 10), linewidth=4)
plot(nz(volume, 0) + hlc3 - ohlc4)
`);
assert.equal(modern.overlay,true);
const overlay=runPine(modern,bars);
assert.equal(overlay.plots[0].width,4);
assert.equal(overlay.plots[0].points[0].color,'#4caf50e6');
assert.equal(overlay.plots[0].points[4].value,null);
assert.ok(Math.abs(overlay.plots[0].points[5].value+1.5*[2,3,5].reduce((sum,i)=>sum+bars[i].close,0)/3)<1e-12);
assert.equal(overlay.plots[1].points[0].value,0);
assert.equal(compilePine('//@version=5\nindicator("A")\nplot(ta.ema(close, 2))').version,5);
for(const [source,line] of [
  ['//@version=8\nindicator("x")\nplot(close)',1],
  ['indicator("x")\nplot(request.security("BTC", "D", close))',2],
  ['indicator("x")\nstrategy.entry("x")\nplot(close)',2],
  ['indicator("x")\nplot(close, unknown = 7)',2],
  ['indicator("x")\nplot(ta.ema(close, 0))',2],
  ['indicator("x")\nplot(ta.ema(close, close))',2],
  ['indicator("x")\nplot(close, color=12)',2],
  ['indicator("x")\na=plot(close)\nb=hline(50)\nfill(a,b,color.red)',4],
  ['indicator("x")\nplot(close',2],
  ['indicator("x")\nplot(Math.random())',2],
  ['indicator("x")\nplot(__proto__)',2],
  ['x'.repeat(8193),1],
])assert.throws(()=>compilePine(source),error=>error instanceof PineDiagnostic&&error.line===line&&error.column>0);
const long=Array.from({length:10000},(_,i)=>({...bars[i%bars.length],time:i}));
assert.equal(runPine(program,long).plots[0].points.length,8000);
console.log(JSON.stringify({bars:bars.length,maxError,firstRsi:actual[0].findIndex(v=>v!==null),firstWma:actual[2].findIndex(v=>v!==null),
  last:actual.map(series=>series.at(-1)),aquaBars:colors.filter(c=>c==='#00bcd48c').length,redBars:colors.filter(c=>c==='#f236458c').length}));
console.log('PASS Pine v4/v5/v6 subset, independent RSI/EMA/WMA parity, fills, missing data and bounded syntax rejection.');
