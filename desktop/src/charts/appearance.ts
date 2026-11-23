import type { ChartAppearance } from '../types';

export const LIGHT_THEME = {
  background: '#F8FAFC',
  grid: '#E2E8F0',
  textColor: '#1E293B',
  secondaryText: '#64748B',
  borderColor: '#D5DEE9',
  borderSubtle: '#E2E8F0',
  hover: '#EAF1F9',
  selected: '#DBEAFE',
  accent: '#2563EB',
  bullish: '#159A80',
  bearish: '#E05B65',
  bullishText: '#0E8065',
  bearishText: '#C53030',
  volBullish: '#159a8050',
  volBearish: '#e05b6550',
  crosshair: '#94a3b8',
  crosshairLabel: '#334155'
};

export const DARK_THEME = {
  background: '#0e1723',
  grid: '#27384b',
  textColor: '#a9bbd0',
  secondaryText: '#617087',
  borderColor: '#2b3c50',
  borderSubtle: '#1c2634',
  hover: '#1c2635',
  selected: '#1c2e49',
  accent: '#75a6f8',
  bullish: '#28bea8',
  bearish: '#e77e94',
  bullishText: '#3bccab',
  bearishText: '#f07d89',
  volBullish: '#28bea855',
  volBearish: '#e77e9455',
  crosshair: '#7d9ab6',
  crosshairLabel: '#304d66'
};

export function getCandleColors(a: ChartAppearance | undefined, theme: 'dark' | 'light') {
  const isLight = theme === 'light';
  if (!a) {
    return {
      upColor: isLight ? LIGHT_THEME.bullish : DARK_THEME.bullish,
      downColor: isLight ? LIGHT_THEME.bearish : DARK_THEME.bearish,
      wickUpColor: isLight ? LIGHT_THEME.bullish : DARK_THEME.bullish,
      wickDownColor: isLight ? LIGHT_THEME.bearish : DARK_THEME.bearish,
      borderUpColor: isLight ? LIGHT_THEME.bullish : DARK_THEME.bullish,
      borderDownColor: isLight ? LIGHT_THEME.bearish : DARK_THEME.bearish,
      borders: false
    };
  }

  const isDefaultUp = !a.up_color || a.up_color.toLowerCase() === '#37c5a2' || a.up_color.toLowerCase() === '#159a80';
  const isDefaultDown = !a.down_color || a.down_color.toLowerCase() === '#ee6a79' || a.down_color.toLowerCase() === '#e05b65';
  const isDefaultWickUp = !a.wick_up || a.wick_up.toLowerCase() === '#37c5a2' || a.wick_up.toLowerCase() === '#159a80';
  const isDefaultWickDown = !a.wick_down || a.wick_down.toLowerCase() === '#ee6a79' || a.wick_down.toLowerCase() === '#e05b65';
  const isDefaultBorderUp = !a.border_up || a.border_up.toLowerCase() === '#37c5a2' || a.border_up.toLowerCase() === '#159a80';
  const isDefaultBorderDown = !a.border_down || a.border_down.toLowerCase() === '#ee6a79' || a.border_down.toLowerCase() === '#e05b65';

  return {
    upColor: isDefaultUp ? (isLight ? LIGHT_THEME.bullish : DARK_THEME.bullish) : a.up_color,
    downColor: isDefaultDown ? (isLight ? LIGHT_THEME.bearish : DARK_THEME.bearish) : a.down_color,
    wickUpColor: isDefaultWickUp ? (isLight ? LIGHT_THEME.bullish : DARK_THEME.bullish) : a.wick_up,
    wickDownColor: isDefaultWickDown ? (isLight ? LIGHT_THEME.bearish : DARK_THEME.bearish) : a.wick_down,
    borderUpColor: isDefaultBorderUp ? (isLight ? LIGHT_THEME.bullish : DARK_THEME.bullish) : a.border_up,
    borderDownColor: isDefaultBorderDown ? (isLight ? LIGHT_THEME.bearish : DARK_THEME.bearish) : a.border_down,
    borders: a.borders
  };
}

export function getVolumeColors(theme: 'dark' | 'light') {
  return {
    bullish: theme === 'light' ? LIGHT_THEME.volBullish : DARK_THEME.volBullish,
    bearish: theme === 'light' ? LIGHT_THEME.volBearish : DARK_THEME.volBearish
  };
}
