import { ArrowDown, ArrowUp, Eye, EyeOff, Settings2, X } from 'lucide-react';
import { volumePanePosition, type VolumeInstance } from '../charts/volumeIndicator';

export function VolumeControls({ volume, adjacentPanes, onChange, onSettings, manager = false }: {
  volume: VolumeInstance;
  adjacentPanes: number;
  onChange: (value: VolumeInstance | null) => void;
  onSettings: () => void;
  manager?: boolean;
}) {
  const index = volumePanePosition(volume.position, adjacentPanes);
  const move = (offset: number) => onChange({ ...volume, position: index + offset });
  return <>
    <button title="Volume settings" aria-label={manager ? 'Settings volume' : 'Pane settings volume'} onClick={onSettings}>
      <Settings2 size={13}/>
    </button>
    <button title={volume.visible ? 'Hide Volume' : 'Show Volume'}
      aria-label={manager ? 'Visibility volume' : 'Hide study volume'} aria-pressed={volume.visible}
      onClick={()=>onChange({ ...volume, visible: !volume.visible })}>
      {volume.visible ? <Eye size={13}/> : <EyeOff size={13}/>}
    </button>
    {volume.placement === 'pane' && <span className="volume-order-controls">
      <button aria-label="Move Volume up" title="Move Volume up" disabled={index === 0} onClick={()=>move(-1)}><ArrowUp size={13}/></button>
      <button aria-label="Move Volume down" title="Move Volume down" disabled={index === adjacentPanes} onClick={()=>move(1)}><ArrowDown size={13}/></button>
    </span>}
    <button title="Remove Volume" aria-label={manager ? 'Delete volume' : 'Remove study volume'} onClick={()=>onChange(null)}>
      <X size={13}/>
    </button>
  </>;
}
