import {useEffect,useState} from 'react';
import {useValue,type Editor} from 'tldraw';
import {RotateCcw, CircleHelp, Check} from 'lucide-react';
import './helpChips.css';
export function HelpChips({editor,ready,turn,canRepeat,repeat,send}:{editor:Editor;ready:boolean;turn:number;canRepeat:boolean;repeat:()=>void;send:(text:string)=>boolean}){
  const [visible,setVisible]=useState(false);
  const activity=useValue('help chips activity',()=>editor.getCurrentPageShapes().some(shape=>{
    if(shape.type==='mcq')return editor.getShape(shape.parentId as typeof shape.id)?.meta.questionActive===true;
    if(shape.type==='function-graph'&&shape.meta.unpinned!==true){try{return JSON.parse(shape.props.config).mode==='ask';}catch{return false;}}
    return false;
  }),[editor]);
  useEffect(()=>{
    setVisible(false);
    if(!ready||!turn)return;
    let timer:ReturnType<typeof setTimeout>,held=false;
    const schedule=()=>{clearTimeout(timer);if(!held&&!document.hidden)timer=setTimeout(()=>setVisible(true),8000);};
    const interact=(event:Event)=>{
      // Pointer release can land outside the canvas (or on a chip). Always
      // release the hold before filtering UI interactions.
      if(['pointerup','pointercancel','blur','visibilitychange'].includes(event.type))held=false;
      if(event.target instanceof Element&&event.target.closest('.help-chips')){schedule();return;}
      // Hovering, including tracing the graph with no button held, is not input.
      if(event.type==='pointermove'&&!(event instanceof PointerEvent&&event.buttons))return;
      setVisible(false);
      if(event.type==='pointerdown')held=true;
      if(event.type==='pointerup'||event.type==='pointercancel')held=false;
      schedule();
    };
    const events=['pointermove','pointerdown','pointerup','pointercancel','keydown','input','wheel','visibilitychange'];
    for(const name of events)document.addEventListener(name,interact,true);
    window.addEventListener('blur',interact);
    window.addEventListener('focus',interact);
    schedule();return()=>{clearTimeout(timer);for(const name of events)document.removeEventListener(name,interact,true);window.removeEventListener('blur',interact);window.removeEventListener('focus',interact);};
  },[ready,turn]);
  function choose(text?:string){
    if(text&&!send(text))return;
    setVisible(false);if(!text)repeat();
  }
  if(!visible||!ready)return null;
  return <aside className="help-chips" aria-label="Quick help"><div><button className="help-unsure" onClick={()=>choose('I’m not sure')}><CircleHelp size={15} aria-hidden="true"/>I’m not sure</button>{!activity&&<button className="help-understand" onClick={()=>choose('I understand')}><Check size={15} aria-hidden="true"/>I understand</button>}{canRepeat&&<button className="help-repeat" onClick={()=>choose()}><RotateCcw size={15} aria-hidden="true"/>Hear it again</button>}</div></aside>;
}
