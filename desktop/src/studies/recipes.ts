import type {Candle,PriceSource} from '../types';
import type {Study} from '../charts/indicators';
import {rsi,rolling,smooth} from '../charts/math';

export interface StudyRecipe {version:1;source:PriceSource;rsi:number;ema:number;wma:number}
export type RecipeOutput='rsi'|'ema'|'wma';
export interface RecipeRule {recipe:StudyRecipe;output:RecipeOutput;direction:'above'|'below';level:number}
export interface StudyRevision extends RecipeRule {number:number}
export interface LocalStudy {id:string;name:string;category:'indicator'|'rule'|'library';revisions:StudyRevision[]}
interface StudyInstance {id:string;name:string;visible:boolean}
export type AppliedStudy=StudyInstance&({recipe:StudyRecipe}|{script_id:string});

export const defaultRecipe:StudyRecipe={version:1,source:'close',rsi:9,ema:3,wma:21};
export const recipeSources:PriceSource[]=['close','open','high','low','HL2','HLC3','OHLC4'];
export function validRecipe(recipe:StudyRecipe){
  return recipe.version===1&&recipeSources.includes(recipe.source)&&
    [recipe.rsi,recipe.ema,recipe.wma].every(n=>Number.isInteger(n)&&n>=2&&n<=200);
}
export function recipeValues(rows:Candle[],recipe:StudyRecipe){
  const input=rows.map(r=>{
    switch(recipe.source){
      case 'HL2': return (r.high+r.low)/2;
      case 'HLC3': return (r.high+r.low+r.close)/3;
      case 'OHLC4': return (r.open+r.high+r.low+r.close)/4;
      default: return r[recipe.source];
    }
  });
  const values=rsi(input,recipe.rsi);
  return {rsi:values,ema:smooth(values,recipe.ema),wma:rolling(values,recipe.wma,true)};
}
export function recipeSeries(rows:Candle[],applied:readonly AppliedStudy[]):Study[]{
  return applied.flatMap(item=>{
    if(!item.visible||!('recipe' in item)||!validRecipe(item.recipe))return [];
    const values=recipeValues(rows,item.recipe);
    return (['rsi','ema','wma'] as const).map((key,index)=>({
      id:item.id,name:index===0?'RSI':key.toUpperCase()+' of RSI',pane:item.id,histogram:false,
      color:['#97a9ef','#42bbac','#efae69'][index],width:1 as const,style:0 as const,
      levels:index===0?[50]:[],points:rows.map((row,i)=>({time:row.time,value:values[key][i]??null})),
    }));
  });
}
