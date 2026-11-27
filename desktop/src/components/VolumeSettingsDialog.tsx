import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { VolumeSettings } from '../types';
import { getVolumeColors } from '../charts/appearance';

export function VolumeSettingsDialog({ value, theme, onSave, onClose }: {
  value: VolumeSettings;
  theme: 'dark' | 'light';
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
          const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button, input, select')];
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
        <label>Pane position<select value={draft.position}
          onChange={event=>setDraft({ ...draft, position: event.target.value === 'last' ? 'last' : 'first' })}>
          <option value="first">Above other indicator panes</option>
          <option value="last">Below other indicator panes</option>
        </select></label>
        <button className="text-link" onClick={()=>setDraft({ ...draft, up_color: null, down_color: null })}>Use theme colors</button>
      </div>
      <footer><button onClick={onClose}>Cancel</button>
        <button className="secondary-button" onClick={()=>{ onSave(draft); onClose(); }}>Apply settings</button></footer>
    </section>
  </div>;
}
