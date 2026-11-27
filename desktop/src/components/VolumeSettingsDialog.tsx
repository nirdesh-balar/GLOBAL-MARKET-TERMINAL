import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { VolumeSettings } from '../types';
import { volumePanePosition } from '../charts/volumeIndicator';
import { getVolumeColors } from '../charts/appearance';

export function VolumeSettingsDialog({ value, theme, adjacentPanes, onSave, onClose }: {
  value: VolumeSettings;
  theme: 'dark' | 'light';
  adjacentPanes: number;
  onSave: (value: VolumeSettings) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const dialog = useRef<HTMLElement>(null);
  const defaults = getVolumeColors(theme);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector('button')?.focus();
    return () => previous?.focus();
  }, []);

  return <div className="modal-backdrop nested-modal" onClick={onClose}>
    <section ref={dialog} className="indicator-settings-dialog" role="dialog" aria-label="Volume settings"
      aria-modal="true" onClick={event=>event.stopPropagation()} onKeyDown={event=>{
        if (event.key === 'Escape') {
          event.stopPropagation();
          onClose();
        }
        if (event.key === 'Tab') {
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input, select')];
          const target = event.shiftKey ? controls.at(-1) : controls[0];
          const boundary = event.shiftKey ? controls[0] : controls.at(-1);
          if (document.activeElement === boundary) {
            event.preventDefault();
            target?.focus();
          }
        }
      }}>
      <header><h2>Volume settings</h2><button aria-label="Close Volume settings" onClick={onClose}><X size={18}/></button></header>
      <div className="indicator-fields">
        <label>Up bar color<input type="color" value={draft.up_color ?? defaults.bullish.slice(0, 7)}
          onChange={event=>setDraft({ ...draft, up_color: event.target.value })}/></label>
        <label>Down bar color<input type="color" value={draft.down_color ?? defaults.bearish.slice(0, 7)}
          onChange={event=>setDraft({ ...draft, down_color: event.target.value })}/></label>
        <label>Volume placement<select value={draft.placement}
          onChange={event=>setDraft({ ...draft, placement: event.target.value === 'pane' ? 'pane' : 'chart' })}>
          <option value="chart">Main Chart — Bottom</option>
          <option value="pane">Separate Indicator Pane</option>
        </select></label>
        <button className="text-link" disabled={draft.placement==='chart'}
          onClick={()=>setDraft({ ...draft, placement:'chart' })}>Move to Main Chart</button>
        <button className="text-link" disabled={draft.placement==='pane'&&volumePanePosition(draft.position,adjacentPanes)===adjacentPanes}
          onClick={()=>setDraft({ ...draft, placement:'pane', position:'last' })}>Move to Separate Pane Below</button>
        <button className="text-link" onClick={()=>setDraft({ ...draft, up_color: null, down_color: null })}>Use theme colors</button>
      </div>
      <footer><button onClick={onClose}>Cancel</button>
        <button className="secondary-button" onClick={()=>{ onSave(draft); onClose(); }}>Apply settings</button></footer>
    </section>
  </div>;
}
