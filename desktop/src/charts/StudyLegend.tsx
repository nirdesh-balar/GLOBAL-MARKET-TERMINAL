import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, SlidersHorizontal, X } from 'lucide-react';
import type { Candle, Indicator } from '../types';
import { indicatorLabel, type Study } from './indicators';
import { isVolume, volumeUnits, type VolumeContext } from './volume';

export function studyLegendName(indicator: Indicator) {
  if (indicator.kind === 'STOCHRSI') {
    return `Stoch RSI ${indicator.period}/${indicator.stoch_period}/${indicator.k}/${indicator.d}`;
  }
  const name = indicatorLabel(indicator);
  if (indicator.kind === 'BB') return `${name} × ${indicator.deviation}`;
  if (indicator.kind === 'SUPERTREND') return `${name} × ${indicator.multiplier}`;
  return name;
}

export interface LegendValue { name: string; color: string; value: number | null }

export function studyLegendValues(
  series: readonly Study[], rows: readonly Candle[], index: number | undefined,
): Map<string, LegendValue[]> {
  const values = new Map<string, LegendValue[]>();
  for (const study of series) {
    if (study.profile) continue; // Visible-range profiles have no per-candle value.
    const time = index === undefined ? undefined : rows[index - (study.offset ?? 0)]?.time;
    let low = 0, high = study.points.length;
    while (time !== undefined && low < high) {
      const mid = (low + high) >>> 1;
      if (study.points[mid].time < time) low = mid + 1;
      else high = mid;
    }
    const point = study.points[low];
    const value = time !== undefined && point?.time === time && Number.isFinite(point.value) ? point.value : null;
    const color = value !== null && value < 0 && study.histogram ? study.down_color ?? study.color : study.color;
    const list = values.get(study.id) ?? [];
    list.push({ name: study.name, color, value });
    values.set(study.id, list);
  }
  return values;
}

const number = new Intl.NumberFormat('en-IN', { useGrouping: false, maximumFractionDigits: 8, minimumFractionDigits: 2 });

export function StudyValues({ values }: { values?: LegendValue[] }) {
  return <span className="study-values">{values?.map(({ name, color, value }, i) =>
    <span key={name + i} title={name} aria-label={`${name}: ${value === null ? 'Unavailable' : number.format(value)}`}
      data-study-output={name} data-value={value ?? undefined} style={{ color }}>
      {value === null ? '—' : number.format(value)}
    </span>)}</span>;
}

export function StudyLegend({ id, indicators, values, volumeInfo, referenceLabels, globallyHidden,
  onVisibility, onSettings, onRemove }: {
  id: string;
  indicators: readonly Indicator[];
  values: ReadonlyMap<string, LegendValue[]>;
  volumeInfo: VolumeContext;
  referenceLabels: ReadonlyMap<string, { brief: string; title: string }>;
  globallyHidden: boolean;
  onVisibility: (id: string) => void;
  onSettings: (indicator: Indicator) => void;
  onRemove: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!indicators.length || globallyHidden) return null;
  const rowsId = `study-legend-rows-${id}`;
  return <div className="study-legend-list">
    <button className="study-legend-toggle" type="button" aria-label={`Indicator legend pane ${id}`}
      aria-expanded={!collapsed} aria-controls={rowsId}
      title={collapsed ? 'Expand indicator legend' : 'Collapse indicator legend'}
      onClick={() => setCollapsed(value => !value)}>
      {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      <span data-testid={`study-legend-count-${id}`}>{indicators.length}</span>
    </button>
    <div id={rowsId} className="study-legend-rows" hidden={collapsed}>
      {indicators.map(indicator => {
        const { id: key, visible } = indicator;
        const name = studyLegendName(indicator);
        const reference = referenceLabels.get(key);
        return <div className="study-legend-row" key={key} data-testid={`study-legend-${id}-${key}`}
          data-visible={visible}>
          <span className="study-legend-name" style={{ color: indicator.color }} title={name}>{name}</span>
          {visible && <StudyValues values={values.get(key)} />}
          {isVolume(indicator.kind) && visible &&
            <small data-testid={`volume-study-unit-${id}-${key}`} title="Provider-specific volume units; cumulative values use loaded history.">
              {volumeUnits(indicator, volumeInfo)}
            </small>}
          {reference && visible &&
            <small data-testid={`reference-status-${id}-${key}`} title={reference.title}>{reference.brief}</small>}
          {indicator.kind === 'VRVP' && visible && <small>{volumeInfo.volume_unit}</small>}
          <span className="study-legend-actions">
            <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${name}`}
              title={`${visible ? 'Hide' : 'Show'} ${name}`} onClick={() => onVisibility(key)}>
              {visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
            <button type="button" data-testid={`legend-settings-${key}`} aria-label={`Edit ${name}`} title={`Edit ${name}`} onClick={() => onSettings(indicator)}>
              <SlidersHorizontal size={13} />
            </button>
            <button type="button" aria-label={`Remove ${name}`} title={`Remove ${name}`} onClick={() => onRemove(key)}>
              <X size={13} />
            </button>
          </span>
        </div>;
      })}
    </div>
  </div>;
}
