import {indicatorCatalog} from '../charts/indicators';
import {volumeAliases} from '../charts/volume';
import {customAliases} from '../charts/custom';
import type {IndicatorKind} from '../types';
export const libraryCategories=['All','Trend','Momentum','Volatility','Volume','Pivot & Support/Resistance','Custom/Advanced','Moving averages','Volume & Liquidity','Pivots & Sessions','Advanced studies'];
const full:Partial<Record<IndicatorKind,string[]>>={SMA:['Simple Moving Average'],EMA:['Exponential Moving Average'],WMA:['Weighted Moving Average'],VWMA:['Volume Weighted Moving Average'],RSI:['Relative Strength Index'],MACD:['Moving Average Convergence Divergence'],STOCHRSI:['Stochastic Relative Strength Index'],ATR:['Average True Range'],BB:['Bollinger Bands'],VWAP:['Volume Weighted Average Price']};
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function libraryGroup(category:string){return category==='Moving averages'?'Trend':category==='Volume & Liquidity'?'Volume':category==='Pivots & Sessions'?'Pivot & Support/Resistance':category==='Advanced studies'?'Custom/Advanced':category;}
const entries=indicatorCatalog.map(c=>({...c,search:normalize([c.kind,c.name,...(full[c.kind]??[]),...(volumeAliases[c.kind]??[]),...(customAliases[c.kind]??[])].join(' '))}));
export function searchLibrary(query:string,category:string){const terms=normalize(query).split(' ').filter(Boolean);return entries.filter(c=>(category==='All'||c.category===category||libraryGroup(c.category)===category)&&terms.every(t=>c.search.includes(t)));}
