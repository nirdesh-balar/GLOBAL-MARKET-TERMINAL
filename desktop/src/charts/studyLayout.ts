import type {StudyLayout} from '../types';
export const STUDY_MIN=104,PRICE_MIN=200,COLLAPSED=32,VOLUME_DEFAULT=52;
export function studyHeight(id:string,value?:StudyLayout){return value?.collapsed?COLLAPSED:Math.max(id==='volume'?48:STUDY_MIN,Math.min(600,value?.height??(id==='volume'?VOLUME_DEFAULT:STUDY_MIN)));}
export function chartHeight(viewport:number,ids:string[],layout:Record<string,StudyLayout>,axisHeight:number){
  const minimum=PRICE_MIN+axisHeight+ids.reduce((sum,id)=>sum+studyHeight(id,layout[id])+1,0);
  // Lightweight Charts rounds the widget height down to an even CSS pixel count.
  return Math.max(viewport,Math.ceil(minimum/2)*2);
}
