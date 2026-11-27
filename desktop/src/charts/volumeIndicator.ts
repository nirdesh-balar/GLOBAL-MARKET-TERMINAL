import type { HistogramData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';
import type { Candle, Pane, VolumeSettings } from '../types';
import { getVolumeColors } from './appearance';

export const defaultVolumeSettings: VolumeSettings = { position: 'first' };
export type VolumeInstance = VolumeSettings & { visible: boolean };

export function volumeInstance(pane: Pane): VolumeInstance | null {
  // The legacy flag remains the visibility source. Settings on a hidden pane
  // mark an instance that can be shown again through Active indicators.
  return pane.volume || pane.volume_settings
    ? { ...(pane.volume_settings ?? defaultVolumeSettings), visible: pane.volume } : null;
}

export function volumeInstancePatch(instance: VolumeInstance | null): Partial<Pane> {
  if (!instance) return { volume: false, volume_settings: null };
  const { visible, ...volume_settings } = instance;
  return { volume: visible, volume_settings };
}

export function volumeVisibilityPatch(pane: Pane, visible: boolean): Partial<Pane> {
  return { volume: visible, volume_settings: pane.volume_settings ?? defaultVolumeSettings };
}

export function volumeValue(candle: Candle | null | undefined, available: boolean) {
  const value = candle?.volume;
  return available && typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function volumeColors(theme: 'dark' | 'light', settings?: VolumeSettings | null) {
  const defaults = getVolumeColors(theme);
  return {
    bullish: settings?.up_color ? settings.up_color + defaults.bullish.slice(7) : defaults.bullish,
    bearish: settings?.down_color ? settings.down_color + defaults.bearish.slice(7) : defaults.bearish,
  };
}

export function volumePoint(
  candle: Candle, available: boolean, colors: ReturnType<typeof volumeColors>,
): HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp> {
  const time = candle.time as UTCTimestamp;
  const value = volumeValue(candle, available);
  return value === null ? { time } : { time, value, color: candle.close >= candle.open ? colors.bullish : colors.bearish };
}
