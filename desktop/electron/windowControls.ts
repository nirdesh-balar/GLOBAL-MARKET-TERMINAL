import type {BrowserWindow} from 'electron';
export function windowControls(getWindow:()=>BrowserWindow|undefined){
 let pending:boolean|null=null;
 const state=()=>({fullscreen:!!getWindow()?.isFullScreen(),transitioning:pending!==null});
 async function control(action:unknown){
  const w=getWindow();if(!w||w.isDestroyed())throw Error('Window is unavailable');
  if(action==='status')return state();if(!['toggle','enter','exit'].includes(String(action)))throw Error('Window operation not allowed');
  if(pending!==null)return state();const target=action==='toggle'?!w.isFullScreen():action==='enter';
  if(target===w.isFullScreen())return state();pending=target;w.webContents.send('window-state',state());
  try{await new Promise<void>((resolve,reject)=>{
   const remove=()=>{if(target)w.removeListener('enter-full-screen',done);else w.removeListener('leave-full-screen',done);};
   const done=()=>{clearTimeout(timeout);remove();resolve();};
   const timeout=setTimeout(()=>{remove();w.isFullScreen()===target?resolve():reject(Error('Native fullscreen transition timed out; use the window menu to retry'));},10000);
   if(target)w.once('enter-full-screen',done);else w.once('leave-full-screen',done);w.setFullScreen(target);
  });}finally{pending=null;if(!w.isDestroyed())w.webContents.send('window-state',state());}
  return state();
 }
 return {control,state};
}
