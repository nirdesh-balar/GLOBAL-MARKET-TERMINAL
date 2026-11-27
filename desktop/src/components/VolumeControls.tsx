import { useId, useRef, type KeyboardEvent } from 'react';
import { ArrowDown, ArrowUp, Ellipsis, Eye, EyeOff, Settings2, X } from 'lucide-react';
import { volumePanePosition, type VolumeInstance } from '../charts/volumeIndicator';

export function VolumeControls({ volume, adjacentPanes, onChange, onSettings, manager = false, legendOrder }: {
  volume: VolumeInstance;
  adjacentPanes: number;
  onChange: (value: VolumeInstance | null) => void;
  onSettings: () => void;
  manager?: boolean;
  legendOrder?: { index: number; count: number };
}) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const visibleLabel = volume.visible ? 'Hide Volume' : 'Show Volume';
  const closeMenu = () => {
    menu.current?.hidePopover();
    trigger.current?.focus({preventScroll:true});
  };
  if (legendOrder) {
    const dismissOnEscape = (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Escape' || !menu.current?.matches(':popover-open')) return;
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    };
    const move = (offset: number) => {
      closeMenu();
      onChange({ ...volume, legend_position: legendOrder.index + offset });
    };
    return <>
      <button type="button" aria-label={visibleLabel} title={visibleLabel} onClick={()=>onChange({...volume,visible:!volume.visible})}>
        {volume.visible?<Eye size={13}/>:<EyeOff size={13}/>}
      </button>
      <button type="button" aria-label="Edit Volume" title="Volume settings" onClick={onSettings}><Settings2 size={13}/></button>
      <button type="button" ref={trigger} aria-label="More Volume actions" title="More Volume actions" popoverTarget={menuId}
        onKeyDown={dismissOnEscape} onClick={event=>{
          const bounds=event.currentTarget.getBoundingClientRect();
          if(menu.current){
            menu.current.style.left=`${Math.max(8,Math.min(bounds.left,innerWidth-185))}px`;
            menu.current.style.top=`${Math.max(8,Math.min(bounds.bottom+4,innerHeight-132))}px`;
          }
        }}><Ellipsis size={14}/></button>
      <div id={menuId} ref={menu} popover="auto" className="volume-legend-menu" role="group" aria-label="Volume actions"
        onKeyDown={dismissOnEscape}>
        <button type="button" disabled={legendOrder.index===0} onClick={()=>move(-1)}>Move Volume up</button>
        <button type="button" disabled={legendOrder.index===legendOrder.count} onClick={()=>move(1)}>Move Volume down</button>
        <button type="button" onClick={()=>{closeMenu();onChange({...volume,placement:'pane'});}}>Move to Separate Pane</button>
        <button type="button" onClick={()=>{closeMenu();onChange(null);}}>Remove Volume</button>
      </div>
    </>;
  }

  const index = volumePanePosition(volume.position, adjacentPanes);
  const move = (offset: number) => onChange({ ...volume, position: index + offset });
  return <>
    <button title="Volume settings" aria-label={manager ? 'Settings volume' : 'Pane settings volume'} onClick={onSettings}>
      <Settings2 size={13}/>
    </button>
    <button title={visibleLabel}
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
