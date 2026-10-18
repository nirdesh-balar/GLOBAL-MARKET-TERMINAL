import type {StudyLayout} from '../types';
export const STUDY_MIN=104,PRICE_MIN=200,COLLAPSED=32;
export function studyHeight(id:string,value?:StudyLayout){return value?.collapsed?COLLAPSED:Math.max(id==='volume'?48:STUDY_MIN,Math.min(600,value?.height??(id==='volume'?64:STUDY_MIN)));}
export function chartHeight(viewport:number,ids:string[],layout:Record<string,StudyLayout>={}){return Math.max(viewport,PRICE_MIN+26+ids.reduce((sum,id)=>sum+studyHeight(id,layout[id])+1,0));}
