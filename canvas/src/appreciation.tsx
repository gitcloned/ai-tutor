import {useEffect,useState} from 'react';
import {useValue,type Editor,type TLShapeId} from 'tldraw';
import './appreciation.css';
export function appreciate(editor:Editor,key:string,shapeId?:TLShapeId,praise=false){
  const page=editor.getCurrentPage();
  const keys=Array.isArray(page.meta.clapKeys)?page.meta.clapKeys.filter((k):k is string=>typeof k==='string'):[];
  if(keys.includes(key)||(praise&&page.meta.responseAppreciated===true))return;
  editor.updatePage({id:page.id,meta:{...page.meta,clapKeys:[...keys,key],responseAppreciated:true}});
  const bounds=shapeId?editor.getShapePageBounds(shapeId):null;
  const point=bounds?editor.pageToScreen({x:bounds.maxX-20,y:bounds.y+24}):{x:window.innerWidth-140,y:150};
  window.dispatchEvent(new CustomEvent('prodigy-clap',{detail:{x:Math.max(60,Math.min(window.innerWidth-60,point.x)),y:Math.max(70,Math.min(window.innerHeight-160,point.y))}}));
}
export const isPraise=(text:string)=>/^(spot on|exactly right|well done|great job|you got it|that's right|that’s right|correct)[!.\s]*$/i.test(text.trim());
export function Appreciation({editor}:{editor:Editor}){
  const count=useValue('claps',()=>{const keys=editor.getCurrentPage().meta.clapKeys;return Array.isArray(keys)?keys.length:0;},[editor]);
  const [clap,setClap]=useState<{x:number;y:number;id:number}|null>(null);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const receive=(event:Event)=>{setClap({...((event as CustomEvent).detail),id:Date.now()});clearTimeout(timer);timer=setTimeout(()=>setClap(null),1600);};
    window.addEventListener('prodigy-clap',receive);return()=>{clearTimeout(timer);window.removeEventListener('prodigy-clap',receive);};
  },[]);
  return <><div className="clap-counter" aria-label={`${count} claps earned`}><span aria-hidden="true">👏</span><span>{count}</span></div>{clap&&<div key={clap.id} className="clap-burst" aria-hidden="true" style={{left:clap.x,top:clap.y,'--clap-x':`${window.innerWidth-65-clap.x}px`,'--clap-y':`${30-clap.y}px`} as React.CSSProperties}>👏</div>}</>;
}
