import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { recipeSources, validRecipe, type StudyRecipe } from './recipes';

export function RecipeSettingsDialog({ name, recipe, onClose, onSave }: {
  name: string;
  recipe: StudyRecipe;
  onClose: () => void;
  onSave: (recipe: StudyRecipe) => void;
}) {
  const [draft, setDraft] = useState(recipe);
  const source = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    source.current?.focus();
    return () => previous?.focus();
  }, []);

  return <div className="modal-backdrop" onClick={onClose}>
    <form className="indicator-settings-dialog" role="dialog" aria-modal="true" aria-label="Legacy study settings"
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onClose();
      }} onSubmit={event => {
        event.preventDefault();
        if (validRecipe(draft)) onSave(draft);
      }}>
      <header><h2>{name} settings</h2>
        <button type="button" aria-label="Close legacy study settings" onClick={onClose}><X size={18} /></button>
      </header>
      <div className="indicator-fields">
        <label>Source<select ref={source} value={draft.source}
          onChange={event => setDraft({ ...draft, source: event.target.value as StudyRecipe['source'] })}>
          {recipeSources.map(value => <option key={value}>{value}</option>)}
        </select></label>
        {(['rsi', 'ema', 'wma'] as const).map(field => <label key={field}>{field.toUpperCase()} length
          <input required type="number" min="2" max="200" value={Number.isFinite(draft[field]) ? draft[field] : ''}
            onChange={event => setDraft({ ...draft, [field]: event.target.valueAsNumber })} />
        </label>)}
      </div>
      <footer>
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="submit" className="secondary-button" disabled={!validRecipe(draft)}>Apply settings</button>
      </footer>
    </form>
  </div>;
}
