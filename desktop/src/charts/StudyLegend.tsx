import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, Settings2, X } from 'lucide-react';
import { VolumeControls } from '../components/VolumeControls';
import type { VolumeInstance } from './volumeIndicator';
import type { Candle, Indicator, Pane } from '../types';
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
    const color = study.histogram
      ? value !== null && value < 0 ? study.down_color ?? study.color : study.color
      : value !== null ? point?.color ?? study.color : study.color;
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
      data-study-output={name} data-value={value ?? undefined} style={value === null ? undefined : { color }}>
      {value === null ? '—' : number.format(value)}
    </span>)}</span>;
}

export function StudyLegendLabel({ label, parameters = false }: { label: string; parameters?: boolean }) {
  const separator = parameters ? label.search(/ (?=\d|session\b|week\b|month\b|year\b|[·×])/i) : -1;
  return <span className="study-legend-name" title={label}>
    {separator < 0 ? label : <>{label.slice(0, separator)}<span className="study-legend-parameters">{label.slice(separator)}</span></>}
  </span>;
}

export function StudyLegendActions({ visible, label, onVisibility, onSettings, onRemove,
  visibilityLabel, settingsLabel, settingsId, removeLabel }: {
  visible: boolean;
  label: string;
  onVisibility: () => void;
  onSettings: () => void;
  onRemove: () => void;
  visibilityLabel?: string;
  settingsLabel?: string;
  settingsId?: string;
  removeLabel?: string;
}) {
  const visibility = `${visible ? 'Hide' : 'Show'} ${label}`;
  return <span className="study-legend-actions">
    <button type="button" aria-label={visibilityLabel ?? visibility} title={visibility} onClick={onVisibility}>
      {visible ? <Eye size={13} /> : <EyeOff size={13} />}
    </button>
    <button type="button" data-testid={settingsId} aria-label={settingsLabel ?? `Edit ${label}`} title={`Edit ${label}`} onClick={onSettings}>
      <Settings2 size={13} />
    </button>
    <button type="button" aria-label={removeLabel ?? `Remove ${label}`} title={`Remove ${label}`} onClick={onRemove}>
      <X size={13} />
    </button>
  </span>;
}

export type StudyReferenceLabels = ReadonlyMap<string, { brief: string; title: string }>;

export function StudyLegendMetadata({ chartId, indicator, volumeInfo, referenceLabels }: {
  chartId: string;
  indicator: Indicator;
  volumeInfo: VolumeContext;
  referenceLabels: StudyReferenceLabels;
}) {
  const reference = referenceLabels.get(indicator.id);
  return <>
    {isVolume(indicator.kind) && <small data-testid={`volume-study-unit-${chartId}-${indicator.id}`}
      title="Provider-specific volume units; cumulative values use loaded history.">{volumeUnits(indicator, volumeInfo)}</small>}
    {reference && <small data-testid={`reference-status-${chartId}-${indicator.id}`} title={reference.title}>{reference.brief}</small>}
    {indicator.kind === 'VRVP' && <small>{volumeInfo.volume_unit}</small>}
  </>;
}

type LocalStudy = NonNullable<Pane['local_studies']>[number];

export function StudyLegend({ id, indicators, localStudies = [], paneStudyIds, values, volumeInfo, referenceLabels, globallyHidden,
  onVisibility, onSettings, onRemove, onLocalVisibility, onLocalSettings, onLocalRemove, volume }: {
  id: string;
  indicators: readonly Indicator[];
  localStudies?: readonly LocalStudy[];
  paneStudyIds: readonly string[];
  values: ReadonlyMap<string, LegendValue[]>;
  volumeInfo: VolumeContext;
  referenceLabels: StudyReferenceLabels;
  globallyHidden: boolean;
  onVisibility: (id: string) => void;
  onSettings: (indicator: Indicator) => void;
  onRemove: (id: string) => void;
  onLocalVisibility: (id: string) => void;
  onLocalSettings: (study: LocalStudy) => void;
  onLocalRemove: (id: string) => void;
  volume?: {
    instance: VolumeInstance;
    value: number | null;
    color?: string;
    stale: boolean;
    onChange: (value: VolumeInstance | null) => void;
    onSettings: () => void;
  };
}) {
  const [collapsed, setCollapsed] = useState(false);
  const legendIndicators = globallyHidden ? [] : indicators;
  const legendLocalStudies = globallyHidden ? [] : localStudies;
  const count = legendIndicators.length + legendLocalStudies.length + Number(!!volume);
  if (!count) return null;
  const rows = legendIndicators.filter(study => !study.visible || !paneStudyIds.includes(study.id)).map(indicator => {
    const { id: key, visible } = indicator;
    const name = studyLegendName(indicator);
    return <div className="study-legend-row" key={key} data-testid={`study-legend-${id}-${key}`} data-visible={visible}>
      <StudyLegendLabel label={name} parameters />
      {visible && <StudyValues values={values.get(key)} />}
      {visible && <StudyLegendMetadata chartId={id} indicator={indicator} volumeInfo={volumeInfo} referenceLabels={referenceLabels} />}
      <StudyLegendActions visible={visible} label={name} onVisibility={() => onVisibility(key)}
        settingsId={`legend-settings-${key}`} onSettings={() => onSettings(indicator)} onRemove={() => onRemove(key)} />
    </div>;
  });
  if (volume) {
    const { instance, value, color, stale, onChange, onSettings } = volume;
    const index = Math.min(instance.legend_position ?? rows.length, rows.length);
    rows.splice(index, 0, <div className="study-legend-row volume-legend-row" key="volume-overlay"
      data-testid={`study-legend-${id}-volume`} data-visible={instance.visible}>
      <span className="volume-legend-readout" data-testid={`volume-legend-${id}`}>
        <StudyLegendLabel label="Volume" />
        {instance.visible && (value === null ? ' unavailable' : <> <StudyValues values={[{ name: 'Volume', color: color ?? 'var(--muted)', value }]} /></>)}
      </span>
      {instance.visible && stale && <small title="Showing stored Volume history">Stale</small>}
      <span className="study-legend-actions"><VolumeControls volume={instance} onChange={onChange} onSettings={onSettings} /></span>
    </div>);
  }
  for (const study of legendLocalStudies) {
    if (study.visible && paneStudyIds.includes(study.id)) continue;
    rows.push(<div className="study-legend-row" key={study.id} data-testid={`study-legend-${id}-${study.id}`} data-visible={study.visible}>
      <StudyLegendLabel label={study.name} />
      {study.visible && <StudyValues values={values.get(study.id)} />}
      <StudyLegendActions visible={study.visible} label={study.name} onVisibility={() => onLocalVisibility(study.id)}
        onSettings={() => onLocalSettings(study)} onRemove={() => onLocalRemove(study.id)} removeLabel={`Remove local study ${study.name}`} />
    </div>);
  }
  const rowsId = `study-legend-rows-${id}`;
  return <div className="study-legend-list">
    <button className="study-legend-toggle" type="button" aria-label={`Indicator legend pane ${id}`}
      aria-expanded={!collapsed} aria-controls={rowsId}
      title={collapsed ? 'Expand indicator legend' : 'Collapse indicator legend'}
      onClick={() => setCollapsed(value => !value)}>
      {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      <span data-testid={`study-legend-count-${id}`}>{count}</span>
    </button>
    <div id={rowsId} className="study-legend-rows" hidden={collapsed}>{rows}</div>
  </div>;
}
