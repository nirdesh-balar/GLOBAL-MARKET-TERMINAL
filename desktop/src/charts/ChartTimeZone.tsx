import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export function ChartTimeZone({ value, instrumentZone, daily, onApply, onClose }: {
  value: string | null;
  instrumentZone: string;
  daily: boolean;
  onApply: (zone: string | null) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState(value);
  const [zones] = useState(() => {
    const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return [...new Set(['UTC', local, instrumentZone, ...(value ? [value] : []), ...Intl.supportedValuesOf('timeZone')])];
  });
  useEffect(() => {
    const node = dialog.current;
    const trigger = document.activeElement;
    node?.showModal();
    return () => {
      if (node?.open) node.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  const term = query.trim().toLowerCase().replaceAll(' ', '_');
  const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const options = zones.filter(zone => zone.toLowerCase().includes(term) ||
    (zone === localZone && 'local time'.includes(query.trim().toLowerCase())));

  return (
    <dialog ref={dialog} className="chart-timezone-dialog" aria-label="Chart display time zone"
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}>
      <header><h2>Chart display time zone</h2><button aria-label="Close time zone" onClick={onClose}><X size={17} /></button></header>
      <p>{daily ? 'Daily and higher-period candles keep their session dates. The selected zone is shown in the toolbar and used on intraday charts.' : 'Changes time labels only. Market sessions and chart data keep their original timestamps.'}</p>
      <label>Search time zones<input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Search a city or time zone" /></label>
      <fieldset>
        <legend>Display zone</legend>
        {(!term || `instrument ${instrumentZone.toLowerCase()}`.includes(term)) &&
          <label><input type="radio" name="zone" checked={selection === null} onChange={() => setSelection(null)} />Instrument default · {instrumentZone}</label>}
        {options.map(zone => <label key={zone}><input type="radio" name="zone" checked={selection === zone}
          onChange={() => setSelection(zone)} />{zone.replaceAll('_', ' ')}{zone === localZone ? ' · System' : ''}</label>)}
        {options.length === 0 && term && <p>No matching time zones.</p>}
      </fieldset>
      <footer><button onClick={onClose}>Cancel</button><button className="primary-button" onClick={() => onApply(selection)}>Apply</button></footer>
    </dialog>
  );
}
