import {volumeInstance,volumeInstancePatch} from './volumeIndicator';
import {VolumeControls} from '../components/VolumeControls';
import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ChevronDown, ChevronRight, Eye, Settings2, X } from 'lucide-react';
import type { ISeriesApi, IChartApi } from 'lightweight-charts';
import type { Pane, StudyLayout } from '../types';
import type { Study } from './indicators';
import type { renderIndicatorPanes } from './IndicatorPane';
import { chartHeight, studyHeight, PRICE_MIN, STUDY_MIN, VOLUME_DEFAULT } from './studyLayout';
import { StudyValues, studyLegendName, type LegendValue } from './StudyLegend';

interface StudyHeader {
  id: string;
  group: string;
  index: number;
  name: string;
}

function retainedStudyLayout(pane:Pane) {
  return Object.fromEntries(Object.entries(pane.study_layout ?? {}).filter(([id])=>
    id==='volume'||pane.indicators.some(indicator=>indicator.id===id)||pane.local_studies?.some(study=>study.id===id)));
}

export function useStudyWorkspace(
  chart: RefObject<IChartApi | null>,
  container: RefObject<HTMLDivElement | null>,
  viewport: RefObject<HTMLDivElement | null>,
  render: RefObject<ReturnType<typeof renderIndicatorPanes>>,
  volumeSeries: RefObject<ISeriesApi<'Histogram'> | null>,
  pane: Pane,
  series: Study[],
  revision: string,
  onChange: (value: Partial<Pane>) => void,
) {
  const [height, setHeight] = useState(0);
  const [headers, setHeaders] = useState<StudyHeader[]>([]);
  const headerLayer = useRef<HTMLDivElement>(null);
  const layoutHeaders = useRef<() => void>(() => {});
  const latest = useRef({ pane, series, onChange });
  latest.current = { pane, series, onChange };

  useLayoutEffect(() => {
    const c = chart.current, el = container.current, view = viewport.current;
    if (!c || !el || !view) return;
    let fitFrame = 0, measureFrame = 0, saveFrame = 0;
    let drag: { pointer: number; width: number; height: number; stretch: Map<number, number> } | null = null;
    const { pane, series } = latest.current;
    const volumeIndex=volumeSeries.current?.getPane().paneIndex();
    const groups: StudyHeader[] = [
      ...(volumeIndex!==undefined&&volumeIndex>0 ? [{ id: 'volume', group: 'volume', index: volumeIndex, name: 'Volume' }] : []),
      ...[...render.current.slots].map(([group, nativePane]) => {
        const study = series.find(item => item.pane === group);
        const config = pane.indicators.find(item => item.id === study?.id);
        return { id: study?.id ?? group, group, index: nativePane.paneIndex(), name: config?.kind ?? group };
      }),
    ].sort((a,b)=>a.index-b.index);
    setHeaders(previous => previous.length === groups.length && previous.every((header, i) =>
      header.id === groups[i].id && header.group === groups[i].group &&
      header.index === groups[i].index && header.name === groups[i].name) ? previous : groups);

    const observed = new Set<HTMLElement>();
    const positions = () => {
      const layer = headerLayer.current;
      if (chart.current !== c || !layer || !el.clientWidth || !el.clientHeight) return;
      const panes = c.panes();
      const nodes = panes.map(item => item.getHTMLElement());
      const currentNodes = new Set(nodes.filter((node): node is HTMLElement => node !== null));
      for (const node of observed) {
        if (!currentNodes.has(node)) {
          paneObserver.unobserve(node);
          observed.delete(node);
        }
      }
      for (const node of currentNodes) {
        if (!observed.has(node)) {
          paneObserver.observe(node);
          observed.add(node);
        }
      }

      const origin = layer.getBoundingClientRect().top;
      const rows = groups.flatMap(header => {
        const node = nodes[header.index];
        if (!node) return [];
        return [{ ...header, top: node.getBoundingClientRect().top - origin,
          height: panes[header.index].getHeight(), collapsed: !!latest.current.pane.study_layout?.[header.id]?.collapsed }];
      });
      const snapshot = JSON.stringify(rows);
      if (el.dataset.studyPanes !== snapshot) el.dataset.studyPanes = snapshot;

      // The chart updates its native rows on its own frame. ResizeObserver
      // delivers their new sizes before paint, including during a held drag.
      const tops = new Map(rows.map(({ id, top }) => [id, `${top}px`]));
      for (const header of layer.children) {
        const node = header as HTMLElement;
        const top = tops.get(node.dataset.studyHeader || '') ?? '';
        if (node.style.top !== top) node.style.top = top;
      }
    };
    const paneObserver = new ResizeObserver(positions);
    layoutHeaders.current = positions;

    const timeAxisHeight = () => c.options().timeScale.visible ? Math.max(30, c.timeScale().height()) : 0;

    const fit = () => {
      if (chart.current !== c) return;
      const config = latest.current.pane.study_layout ?? {};
      setHeight(chartHeight(view.clientHeight, groups.map(header => header.id), config, timeAxisHeight()));
      cancelAnimationFrame(fitFrame);
      fitFrame = requestAnimationFrame(() => {
        if (chart.current !== c || !el.clientHeight || drag || saveFrame) return;
        const panes = c.panes();
        const rest = groups.reduce((total, header) => total + studyHeight(header.id, config[header.id]) + 1, 0);
        const main = panes[0];
        const widgetHeight = el.clientHeight - el.clientHeight % 2;
        const mainWeight = Math.max(PRICE_MIN, widgetHeight - timeAxisHeight() - rest);
        if (main && Math.abs(main.getStretchFactor() - mainWeight) > 0.01) main.setStretchFactor(mainWeight);
        for (const { id, index } of groups) {
          const study = panes[index];
          if (!study) continue;
          const weight = studyHeight(id, config[id]);
          if (Math.abs(study.getStretchFactor() - weight) > 0.01) study.setStretchFactor(weight);
          const collapsed = !!config[id]?.collapsed;
          for (const item of study.getSeries()) {
            if (item.options().visible === collapsed) item.applyOptions({ visible: !collapsed });
          }
        }
        // New pane elements can be created by the chart's next layout.
        cancelAnimationFrame(measureFrame);
        measureFrame = requestAnimationFrame(positions);
      });
    };
    const outerObserver = new ResizeObserver(fit);
    outerObserver.observe(view);
    outerObserver.observe(el);
    fit();
    positions();

    const down = (event: PointerEvent) => {
      if (chart.current !== c || !event.isPrimary || event.button !== 0 || saveFrame) return;
      const panes = c.panes();
      const below = panes.findIndex((item, index) => {
        const node = item.getHTMLElement();
        return index > 0 && node && Math.abs(node.getBoundingClientRect().top - event.clientY) < 5;
      });
      if (below < 1) return;
      drag = { pointer: event.pointerId, width: el.clientWidth, height: el.clientHeight,
        stretch: new Map([below - 1, below].map(index => [index, panes[index].getStretchFactor()])) };
    };
    const cancel = () => { drag = null; };
    const up = (event: PointerEvent) => {
      if (chart.current !== c || !drag || event.pointerId !== drag.pointer) return;
      const gesture = drag;
      drag = null;
      saveFrame = requestAnimationFrame(() => {
        saveFrame = 0;
        if (chart.current !== c) return;
        if (el.clientWidth !== gesture.width || el.clientHeight !== gesture.height) {
          fit();
          return;
        }
        const panes = c.panes();
        const grewOrShrank = new Set([...gesture.stretch].filter(([index, weight]) =>
          Math.abs((panes[index]?.getStretchFactor() ?? weight) - weight) > 0.01).map(([index]) => index));
        if (!grewOrShrank.size) return;

        const current = latest.current.pane;
        const layout = retainedStudyLayout(current);
        let changed = false;
        for (const { id, index } of groups) {
          const study = panes[index];
          if (!study || !grewOrShrank.has(index) || layout[id]?.collapsed) continue;
          const resized = studyHeight(id, { collapsed: false, height: Math.round(study.getHeight()) });
          if (resized === studyHeight(id, layout[id])) continue;
          layout[id] = { collapsed: false, height: resized };
          changed = true;
        }
        if (changed) latest.current.onChange({ study_layout: layout });
        else fit();
      });
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    return () => {
      outerObserver.disconnect();
      paneObserver.disconnect();
      cancelAnimationFrame(fitFrame);
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(saveFrame);
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      layoutHeaders.current = () => {};
    };
  }, [revision, pane.study_layout, pane.volume]);

  useLayoutEffect(() => { layoutHeaders.current(); }, [headers]);
  return { height, headers, headerLayer };
}

export function StudyPaneControls({ rows, layer, pane, values, volume, volumeStale, onChange, onSettings }: {
  rows: StudyHeader[];
  values: ReadonlyMap<string, LegendValue[]>;
  volume: number | null;
  volumeStale: boolean;
  layer: RefObject<HTMLDivElement | null>;
  pane: Pane;
  onChange: (value: Partial<Pane>) => void;
  onSettings: (id: string) => void;
}) {
  const change = (id: string, value: Partial<StudyLayout>) => onChange({
    study_layout: {
      ...retainedStudyLayout(pane),
      [id]: { height: id === 'volume' ? VOLUME_DEFAULT : STUDY_MIN, collapsed: false, ...pane.study_layout?.[id], ...value },
    },
  });

  return <div className="study-pane-headers" ref={layer}>
    {rows.map(({ id, name }) => {
      const instance=id==='volume'?volumeInstance(pane):null;
      if (instance?.visible&&instance.placement==='pane') {
        const collapsed=!!pane.study_layout?.volume?.collapsed;
        return <div key={id} className="study-pane-controls volume-pane-controls"
          data-study-header={id} data-testid={`study-controls-${pane.id}-volume`} onPointerDown={event=>event.stopPropagation()}>
          <button aria-label={`${collapsed?'Expand':'Collapse'} study volume`} aria-expanded={!collapsed}
            onClick={()=>change(id,{collapsed:!collapsed})}>{collapsed?<ChevronRight size={12}/>:<ChevronDown size={12}/>}</button>
          <span data-testid={`volume-legend-${pane.id}`} className="volume-pane-label">
            Volume{!collapsed&&(volume===null?' unavailable':<> <StudyValues values={[{name:'Volume',color:'var(--muted)',value:volume}]}/></>)}
          </span>
          {!collapsed&&volumeStale&&<small title="Showing stored Volume history">Stale</small>}
          <VolumeControls volume={instance} adjacentPanes={rows.filter(row=>row.id!=='volume').length}
            onSettings={()=>onSettings(id)} onChange={value=>onChange(volumeInstancePatch(value))}/>
        </div>;
      }
      if (id==='volume') return null;
      const collapsed = !!pane.study_layout?.[id]?.collapsed;
      const indicator = pane.indicators.find(item => item.id === id);
      const local=pane.local_studies?.find(item=>item.id===id);
      const label=indicator?studyLegendName(indicator):local?.name??name;
      return <div key={id} className="study-pane-controls" data-study-header={id}
        data-testid={`study-controls-${pane.id}-${id}`} onPointerDown={event => event.stopPropagation()}>
        <button aria-label={`${collapsed ? 'Expand' : 'Collapse'} study ${id}`} aria-expanded={!collapsed}
          title="Collapse / expand this study pane" onClick={() => change(id, { collapsed: !collapsed })}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}<span title={label}>{label}</span>
        </button>
        {!collapsed && <StudyValues values={values.get(id)} />}
        {(indicator||(local&&'script_id' in local)) && <button title="Study settings" aria-label={`Pane settings ${id}`} onClick={() => onSettings(id)}>
          <Settings2 size={12} />
        </button>}
        <button title="Hide this study" aria-label={`Hide study ${id}`} onClick={() => local ? onChange({local_studies:pane.local_studies?.map(item=>item.id===id?{...item,visible:false}:item)})
            : onChange({ indicators: pane.indicators.map(item => item.id === id ? { ...item, visible: false } : item) })}>
          <Eye size={12} />
        </button>
        <button title="Remove this indicator" aria-label={`Remove study ${id}`}
          onClick={() => local?onChange({local_studies:pane.local_studies?.filter(item=>item.id!==id)}):
            onChange({ indicators: pane.indicators.filter(item => item.id !== id) })}>
          <X size={12} />
        </button>
      </div>;
    })}
  </div>;
}
