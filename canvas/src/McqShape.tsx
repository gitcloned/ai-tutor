import {appreciate} from './appreciation';
import {BaseBoxShapeUtil,HTMLContainer,T,DefaultFontFaces,useEditor,useValue,type TLShape} from 'tldraw';
import {createContext,useContext,useRef,useState} from 'react';
import type {ChoiceAttempt,McqConfig} from './mcq';
import './mcq.css';
declare module 'tldraw'{interface TLGlobalShapePropsMap{'mcq':{w:number;h:number;questionId:string;config:string;selected:string}}}
export type McqShape=TLShape<'mcq'>;
export const McqContext=createContext<{enabled:boolean;submit:(choice:ChoiceAttempt)=>Promise<boolean>}>({enabled:false,submit:async()=>false});
export class McqShapeUtil extends BaseBoxShapeUtil<McqShape>{
  static override type='mcq' as const;
  static override props={w:T.number,h:T.number,questionId:T.string,config:T.string,selected:T.string};
  getDefaultProps(){return {w:500,h:220,questionId:'',config:'{"stem":"","choices":[],"answer":""}',selected:''};}
  override getFontFaces(){return [DefaultFontFaces.tldraw_draw.normal.normal];}
  override canResize(){return false;}
  override hideSelectionBoundsFg(){return true;}
  override hideSelectionBoundsBg(){return true;}
  override hideResizeHandles(){return true;}
  override hideRotateHandle(){return true;}
  component(shape:McqShape){return <McqView shape={shape}/>;}
  getIndicatorPath(){return undefined;}
  override toSvg(shape:McqShape){
    const config:McqConfig=JSON.parse(shape.props.config),row=(shape.props.h-36)/Math.max(1,config.choices.length);
    return <g>{config.choices.map((c,i)=><g key={c.key} transform={`translate(0 ${i*row})`}><rect width={shape.props.w} height={row-10} rx={12} fill={shape.props.selected===c.key?'#e5edf9':'#fffef9'} stroke="#b9cbdc"/><foreignObject x={16} y={8} width={shape.props.w-32} height={row-18}><div style={{fontFamily:'tldraw_draw',fontSize:24,color:'#293e34',overflowWrap:'anywhere'}}>{c.key.toUpperCase()}. {c.text}{shape.props.selected===c.key?' ✓':''}</div></foreignObject></g>)}</g>;
  }
}
function McqView({shape}:{shape:McqShape}){
  const editor=useEditor(),activity=useContext(McqContext),[pending,setPending]=useState(false);
  const touch=useRef<{id:number;x:number;y:number}|null>(null),lastTouch=useRef(0),submitting=useRef(false);
  const finger=useRef<{id:number;x:number;y:number}|null>(null);
  const config:McqConfig=JSON.parse(shape.props.config);
  const selecting=useValue('MCQ selection tool',()=>editor.getCurrentToolId()==='select',[editor]);
  const active=useValue('MCQ question active',()=>editor.getShape(shape.parentId as McqShape['id'])?.meta.questionActive===true,[editor,shape.parentId]);
  const solved=!!config.answer&&shape.props.selected===config.answer;
  const enabled=activity.enabled&&active&&!pending&&!solved;
  async function choose(key:string,text:string){
    if(!enabled||!selecting||submitting.current||key===shape.props.selected)return;
    submitting.current=true;setPending(true);
    try{
      const sent=await activity.submit({type:'choice-selected',questionId:shape.props.questionId,choice:key,text,...(config.answer?{correct:key===config.answer}:{})});
      if(sent&&editor.getShape(shape.id)){editor.updateShape<McqShape>({id:shape.id,type:'mcq',props:{selected:key}});if(key===config.answer)appreciate(editor,`mcq:${shape.id}`,shape.id);}
    }finally{submitting.current=false;setPending(false);}
  }
  return <HTMLContainer style={{width:shape.props.w,height:shape.props.h,pointerEvents:selecting?'all':'none'}}>
    <div className="mcq-options" data-mcq={shape.props.questionId} data-selected={shape.props.selected} style={{pointerEvents:selecting?'auto':'none'}}
      onPointerDown={e=>{if(selecting)e.stopPropagation();}} onPointerUp={e=>{if(selecting)e.stopPropagation();}} onKeyDown={e=>e.stopPropagation()}>
      <div className="mcq-rows" role="group" aria-label="Answer choices">
      {config.choices.map(c=>{
        const selected=shape.props.selected===c.key,result=selected&&config.answer?(solved?'correct':'incorrect'):'';
        return <button key={c.key} className={`mcq-option ${selected?'chosen':''} ${result}`} disabled={!enabled||!selecting||selected} tabIndex={selecting?0:-1} aria-pressed={selected} onPointerDown={e=>{
          if(e.pointerType!=='touch')return;
          touch.current=e.isPrimary?{id:e.pointerId,x:e.clientX,y:e.clientY}:null;
          if(e.isPrimary){try{e.currentTarget.setPointerCapture(e.pointerId);}catch{/* Touch events still provide a tap fallback. */}}
        }} onPointerMove={e=>{
          const start=touch.current;
          if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>10)touch.current=null;
        }} onPointerCancel={()=>{touch.current=null;}} onPointerUp={e=>{
          if(e.pointerType!=='touch')return;
          const start=touch.current;touch.current=null;
          if(start&&start.id===e.pointerId&&Math.hypot(e.clientX-start.x,e.clientY-start.y)<=10){lastTouch.current=Date.now();e.preventDefault();void choose(c.key,c.text);}
        }} onTouchStart={e=>{
          e.stopPropagation();
          const point=e.touches[0];
          finger.current=e.touches.length===1?{id:point.identifier,x:point.clientX,y:point.clientY}:null;
        }} onTouchMove={e=>{
          const start=finger.current,point=Array.from(e.touches).find(t=>t.identifier===start?.id);
          if(e.touches.length!==1||!point||!start||Math.hypot(point.clientX-start.x,point.clientY-start.y)>10)finger.current=null;
        }} onTouchCancel={()=>{finger.current=null;}} onTouchEnd={e=>{
          e.stopPropagation();
          const start=finger.current;finger.current=null;
          const point=Array.from(e.changedTouches).find(t=>t.identifier===start?.id);
          // Safari can cancel the pointer sequence while still delivering a
          // complete touch tap. Do not rely on its synthesized click.
          if(start&&point&&e.touches.length===0&&Math.hypot(point.clientX-start.x,point.clientY-start.y)<=10){
            lastTouch.current=Date.now();void choose(c.key,c.text);
          }
        }} onClick={e=>{if(e.detail!==0&&Date.now()-lastTouch.current<800)return;void choose(c.key,c.text);}}><span className="mcq-letter">{c.key.toUpperCase()}</span><span>{c.text}</span>{selected&&<span className="mcq-result" aria-label={result||'Selected'}>{result==='incorrect'?'↻':'✓'}</span>}</button>;
      })}
      </div>
      <p className="mcq-hint" role="status">{pending?'Sending…':solved?'Correct — well done!':!active?'Answer saved':!activity.enabled?'Listen to your tutor. You can still draw.':!selecting?'Use Select to tap an answer, or draw and send with the orb.':shape.props.selected?'Answer sent. You can choose again after feedback.':'Tap an answer to send it to your tutor.'}</p>
    </div>
  </HTMLContainer>;
}
