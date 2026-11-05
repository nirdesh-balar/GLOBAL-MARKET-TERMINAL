export type FlagColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'cyan' | 'pink';

export interface FlagColorDef {
  id: FlagColor;
  name: string;
  defaultLabel: string;
  hex: string;
}

export const FLAG_COLORS: Record<FlagColor, FlagColorDef> = {
  red:    { id: 'red',    name: 'Red',    defaultLabel: 'Red List',    hex: '#EF4444' },
  blue:   { id: 'blue',   name: 'Blue',   defaultLabel: 'Blue List',   hex: '#3B82F6' },
  green:  { id: 'green',  name: 'Green',  defaultLabel: 'Green List',  hex: '#22C55E' },
  yellow: { id: 'yellow', name: 'Yellow', defaultLabel: 'Yellow List', hex: '#EAB308' },
  purple: { id: 'purple', name: 'Purple', defaultLabel: 'Purple List', hex: '#A855F7' },
  cyan:   { id: 'cyan',   name: 'Cyan',   defaultLabel: 'Cyan List',   hex: '#06B6D4' },
  pink:   { id: 'pink',   name: 'Pink',   defaultLabel: 'Pink List',   hex: '#EC4899' },
};

export const ORDERED_FLAG_COLORS: FlagColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'cyan', 'pink'];

export function isFlagColor(val: string): val is FlagColor {
  return val in FLAG_COLORS;
}
