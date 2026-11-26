import {chartStyleGroups} from './chartStyles';

export function ChartStyleOptions(){
  return chartStyleGroups.map(([label,styles])=><optgroup key={label} label={label}>
    {styles.map(([value,name])=><option key={value} value={value}>{name}</option>)}
  </optgroup>);
}
