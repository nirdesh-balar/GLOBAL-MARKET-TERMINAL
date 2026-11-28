import { Eye, EyeOff, Settings2, X } from 'lucide-react';
import type { VolumeInstance } from '../charts/volumeIndicator';

export function VolumeControls({ volume, onChange, onSettings, manager = false }: {
  volume: VolumeInstance;
  onChange: (value: VolumeInstance | null) => void;
  onSettings: () => void;
  manager?: boolean;
}) {
  const visibility = volume.visible ? 'Hide Volume' : 'Show Volume';
  return <>
    <button type="button" title={visibility} aria-label={manager ? 'Visibility volume' : visibility} aria-pressed={volume.visible}
      onClick={() => onChange({ ...volume, visible: !volume.visible })}>
      {volume.visible ? <Eye size={13} /> : <EyeOff size={13} />}
    </button>
    <button type="button" title="Volume settings" aria-label={manager ? 'Settings volume' : 'Edit Volume'} onClick={onSettings}>
      <Settings2 size={13} />
    </button>
    <button type="button" title="Remove Volume" aria-label={manager ? 'Delete volume' : 'Remove Volume'} onClick={() => onChange(null)}>
      <X size={13} />
    </button>
  </>;
}
