import {useId,useLayoutEffect,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {ChartArea,ChartCandlestick,ChartColumn,Check,ChevronDown,TrendingUp} from 'lucide-react';
import {chartStyleGroups,type ChartStyle} from './chartStyles';

const menuWidth=210, menuHeight=352, edge=8, gap=4;
const anotherMenu='gmt-open-chart-type-menu';
const styles=chartStyleGroups.flatMap(([,group])=>[...group]);
const localIcons={
  bars:'M4 4v12m-2-7h2m0 3h3M11 2v12m-2-8h2m0 4h3M17 6v12m-2-6h2m0 3h2',
  'hlc-bars':'M4 4v12m0-5h3M11 2v12m0-6h3M17 6v12m0-6h2',
  hollow:'M5 2v5m0 6v5M3 7h4v6H3ZM14 2v3m0 8v5m-2-13h4v8h-4Z',
  markers:'M2 14l5-6 4 3 6-7M6 8h2m2 3h2m4-7h2',
  steps:'M2 16h5v-5h5V7h6V3',
  baseline:'M2 11h16M2 15l5-8 5 6 6-9',
  'high-low':'M4 3v14m-2-14h4m-4 14h4m8-13v10m-2-10h4m-4 10h4',
  'heikin-ashi':'M5 3v3m0 7v4M3 6h4v7H3Zm9 2h4v6h-4Zm0-4v4m0 6v4',
  'line-break':'M2 11h4v6H2Zm6-4h4v6H8Zm6-5h4v6h-4Z',
} as const;

function StyleIcon({style}:{style:ChartStyle}){
  const iconProps={size:16,'aria-hidden':true as const};
  if(style==='candles')return <ChartCandlestick {...iconProps}/>;
  if(style==='line')return <TrendingUp {...iconProps}/>;
  if(style==='area')return <ChartArea {...iconProps}/>;
  if(style==='columns')return <ChartColumn {...iconProps}/>;
  const path=localIcons[style];
  return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.35"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg>;
}

export function ChartTypeMenu({label,value,onChange,scope}:{label:string;value:ChartStyle;onChange:(value:ChartStyle)=>void;scope:string}){
  const id=useId();
  const anchor=useRef<HTMLButtonElement>(null);
  const panel=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const [host,setHost]=useState<HTMLElement|null>(null);
  const [position,setPosition]=useState<{left:number;top:number;width:number;maxHeight:number}|null>(null);
  const selected=styles.findIndex(([style])=>style===value);
  const current=styles[selected]?.[1]??'Candles';
  const close=(restore=false)=>{
    setOpen(false);setPosition(null);
    if(restore)anchor.current?.focus({preventScroll:true});
  };
  const show=()=>{
    const root=anchor.current?.closest<HTMLElement>('.terminal-shell');
    if(!root)return;
    document.dispatchEvent(new Event(anotherMenu));
    setHost(root);setOpen(true);
  };
  useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{
      const button=anchor.current;
      if(!button||!button.getClientRects().length){close();return;}
      const bounds=button.getBoundingClientRect();
      const w=window.innerWidth;
      const h=window.innerHeight;
      const width=Math.min(menuWidth,w-2*edge);
      const below=h-bounds.bottom-gap-edge,above=bounds.top-gap-edge;
      const rise=below<Math.min(menuHeight,165)&&above>below;
      const maxHeight=Math.max(0,Math.min(menuHeight,rise?above:below));
      const next={width,maxHeight,left:Math.max(edge,Math.min(bounds.left,w-width-edge)),
        top:rise?bounds.top-gap-Math.min(maxHeight,panel.current?.scrollHeight??maxHeight):bounds.bottom+gap};
      setPosition(old=>old&&old.width===next.width&&old.maxHeight===next.maxHeight&&old.left===next.left&&old.top===next.top?old:next);
    };
    const outside=(event:PointerEvent)=>{
      if(event.target instanceof Node&&!anchor.current?.contains(event.target)&&!panel.current?.contains(event.target))close();
    };
    const focusOutside=(event:FocusEvent)=>{
      if(event.target instanceof Node&&!anchor.current?.contains(event.target)&&!panel.current?.contains(event.target))close();
    };
    const other=()=>close();
    place();
    const observer=new ResizeObserver(place);
    if(anchor.current)observer.observe(anchor.current);
    if(panel.current)observer.observe(panel.current);
    window.addEventListener('resize',place);
    const scroll=(event:Event)=>{if(event.target!==panel.current)place();};
    window.addEventListener('scroll',scroll,true);
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('focusin',focusOutside);
    document.addEventListener(anotherMenu,other);
    return()=>{
      observer.disconnect();window.removeEventListener('resize',place);window.removeEventListener('scroll',scroll,true);
      document.removeEventListener('pointerdown',outside,true);document.removeEventListener('focusin',focusOutside);
      document.removeEventListener(anotherMenu,other);
    };
  },[open,scope]);
  const positioned=open&&!!position;
  useLayoutEffect(()=>{
    if(!positioned)return;
    const item=panel.current?.querySelector<HTMLElement>('[aria-checked="true"]')??panel.current?.querySelector<HTMLElement>('[role="menuitemradio"]');
    item?.focus({preventScroll:true});
    item?.scrollIntoView({block:'nearest'});
  },[positioned]);

  function handleMenu(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close(true);return;}
    if(event.key==='Tab'){close();anchor.current?.focus({preventScroll:true});return;}
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp'&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();event.stopPropagation();
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const index=items.indexOf(document.activeElement as HTMLButtonElement);
    const direction=event.key==='ArrowDown'?1:-1;
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+direction+items.length)%items.length;
    items[next]?.focus({preventScroll:true});items[next]?.scrollIntoView({block:'nearest'});
  }

  return <>
    <button ref={anchor} type="button" className="chart-type-anchor" aria-label={label} aria-haspopup="menu"
      aria-expanded={open} aria-controls={open?id:undefined} title={label+' · '+current} data-chart-style={value}
      onClick={()=>open?close(true):show()} onKeyDown={event=>{
        if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopPropagation();if(!open)show();}
      }}>
      <StyleIcon style={value}/><ChevronDown className="chart-type-chevron" size={11} aria-hidden="true"/>
    </button>
    {open&&host&&createPortal(<div className="chart-type-menu" id={id} role="menu" aria-label="Chart styles" ref={panel}
      style={position??{visibility:'hidden'}} onKeyDown={handleMenu}>
      {chartStyleGroups.map(([group,items])=><div role="group" aria-label={group} key={group} className="chart-type-group">
        {items.map(([style,name])=><button key={style} type="button" role="menuitemradio" aria-checked={style===value} data-style={style}
          tabIndex={-1} onClick={()=>{onChange(style);close(true);}}>
          <StyleIcon style={style}/><span>{name}</span>{style===value&&<Check className="chart-type-check" size={13} aria-hidden="true"/>}
        </button>)}
      </div>)}
    </div>,host)}
  </>;
}
