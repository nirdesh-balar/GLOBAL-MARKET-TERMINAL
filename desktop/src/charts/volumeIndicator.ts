import type { HistogramData, UTCTimestamp, WhitespaceData } from 'lightweight-charts';
import type { Candle, Pane, VolumeSettings } from '../types';
import { getVolumeColors } from './appearance';

export const VOLUME_SCALE_ID = 'gmt-volume';
export const VOLUME_OVERLAY_MARGINS = { top: .9, bottom: .012 };
export const defaultVolumeSettings: VolumeSettings = { version: 2, placement: 'chart', position: 'last' };
const legacyVolumeSettings: VolumeSettings = { ...defaultVolumeSettings, placement: 'pane', position: 'first' };

export function volumeSettings(pane: Pane): VolumeSettings {
  // Retain the saved placement/order for compatibility with earlier builds.
  // Current charts present both legacy and newly added Volume on the price pane.
  return pane.volume_settings ?? legacyVolumeSettings;
}

export type VolumeInstance = VolumeSettings & { visible: boolean };

export function volumeInstance(pane: Pane): VolumeInstance | null {
  // The legacy flag remains the visibility source. Settings on a hidden pane
  // mark an instance that can be shown again through Active indicators.
  return pane.volume || pane.volume_settings
    ? { ...volumeSettings(pane), visible: pane.volume } : null;
}

export function volumeInstancePatch(instance: VolumeInstance | null): Partial<Pane> {
  if (!instance) return { volume: false, volume_settings: null };
  const { visible, ...volume_settings } = instance;
  return { volume: visible, volume_settings };
}

export function volumeValue(candle: Candle | null | undefined, zeroIsMissing: boolean) {
  const value = candle?.volume;
  return typeof value === 'number' && Number.isFinite(value) && (zeroIsMissing ? value > 0 : value >= 0) ? value : null;
}

export function volumeColors(theme: 'dark' | 'light', settings: Pick<VolumeSettings, 'up_color' | 'down_color'>) {
  const defaults = getVolumeColors(theme);
  return {
    bullish: settings?.up_color ? settings.up_color + defaults.bullish.slice(7) : defaults.bullish,
    bearish: settings?.down_color ? settings.down_color + defaults.bearish.slice(7) : defaults.bearish,
  };
}

export function volumePoint(
  candle: Candle, zeroIsMissing: boolean, colors: ReturnType<typeof volumeColors>,
): HistogramData<UTCTimestamp> | WhitespaceData<UTCTimestamp> {
  const time = candle.time as UTCTimestamp;
  const value = volumeValue(candle, zeroIsMissing);
  return value === null ? { time } : { time, value, color: candle.close >= candle.open ? colors.bullish : colors.bearish };
}
