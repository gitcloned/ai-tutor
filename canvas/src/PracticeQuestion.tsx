import {BaseBoxShapeUtil,HTMLContainer,T,createShapeId,type Editor,type TLShape,useEditor,useValue} from 'tldraw';
import {useEffect,useState,useRef,useLayoutEffect} from 'react';
import './practiceQuestion.css';
export type PracticePresentation={sessionId:string;step:{id:string;type:string}|null;practice?:{index:number;total:number;earnedPoints:number;question:{id:string;stem:string;points?:number;timeSeconds?:number}|null;results:{questionId:string;outcome:string;awardedPoints:number}[]}|null};
declare module 'tldraw'{interface TLGlobalShapePropsMap{'practice-question':{w:number;h:number;key:string;data:string;deadline:number;finishedAt:number;awarded:number}}}
export type PracticeShape=TLShape<'practice-question'>;
export class PracticeQuestionUtil extends BaseBoxShapeUtil<PracticeShape>{
 static override type='practice-question' as const;
 static override props={w:T.number,h:T.number,key:T.string,data:T.string,deadline:T.number,finishedAt:T.number,awarded:T.number};
 getDefaultProps(){return {w:560,h:320,key:'',data:'{}',deadline:0,finishedAt:0,awarded:-1};}
 override canResize(){return false;}
 component(shape:PracticeShape){return <HTMLContainer><PracticeCard shape={shape}/></HTMLContainer>;}
 getIndicatorPath(shape:PracticeShape){const path=new Path2D();path.rect(0,0,shape.props.w,shape.props.h);return path;}
}
function PracticeCard({shape}:{shape:PracticeShape}){
 const editor=useEditor(),card=useRef<HTMLElement>(null);
 useLayoutEffect(()=>{
  const el=card.current;if(!el)return;
  const measure=()=>{
   const h=Math.ceil(el.offsetHeight),current=editor.getShape<PracticeShape>(shape.id);
   if(current&&h>0&&Math.abs(current.props.h-h)>1){
    editor.updateShape<PracticeShape>({id:shape.id,type:'practice-question',props:{h}});
    const working=editor.getCurrentPageShapes().find(s=>s.meta.practiceQuestionId===shape.id);
    if(working&&current.props.awarded<0)editor.updateShape({id:working.id,type:working.type,y:current.y+h+32});
   }
  };
  const observer=new ResizeObserver(measure);observer.observe(el);measure();return()=>observer.disconnect();
 },[editor,shape.id]);
 const data=JSON.parse(shape.props.data) as NonNullable<PracticePresentation['practice']>;
 const question=data.question!;
 return <section ref={card} className="practice-card" style={{width:shape.props.w}} aria-label={`Practice question ${data.index}`}>
  <div className="practice-stem">{question.stem}</div>
  {shape.props.awarded>=0&&<span className="practice-score">+{shape.props.awarded} points awarded</span>}
 </section>;
}

export function renderPractice(editor:Editor,event:PracticePresentation,locate:()=>{x:number;y:number}){
 const cards=editor.getCurrentPageShapes().filter((s):s is PracticeShape=>s.type==='practice-question');
 const practice=event.practice;
 for(const card of cards){
  const result=practice?.results.find(r=>card.props.key===`${event.sessionId}:${event.step?.id}:${r.questionId}`);
  if(result)editor.updateShape<PracticeShape>({id:card.id,type:card.type,props:{awarded:result.awardedPoints,finishedAt:card.props.finishedAt||Date.now()}});
 }
 const key=practice?.question?`${event.sessionId}:${event.step?.id}:${practice.question.id}`:null;
 for(const card of cards)if(card.props.key!==key&&card.meta.unpinned!==true)editor.updateShape({id:card.id,type:card.type,meta:{...card.meta,unpinned:true},props:{finishedAt:card.props.finishedAt||Date.now()}});
 if(event.step?.type!=='practice'||!practice?.question)return null;
 const existing=cards.find(s=>s.props.key===key);
 if(existing){editor.updateShape<PracticeShape>({id:existing.id,type:existing.type,...(!existing.meta.practiceFlow?locate():{}),meta:{...existing.meta,unpinned:false,practiceFlow:true},props:{data:JSON.stringify(practice),...(!existing.meta.practiceFlow?{w:1120}:{})}});return existing.id;}
 const id=createShapeId(),lines=practice.question.stem.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/32)),0);
 editor.createShape<PracticeShape>({id,type:'practice-question',...locate(),meta:{author:'tutor',kind:'practice',unpinned:false,practiceFlow:true},props:{key:key!,data:JSON.stringify(practice),w:1120,h:Math.max(60,lines*40)}});
 return id;
}
export function startPracticeTimer(editor:Editor){
 const card=editor.getCurrentPageShapes().find((s):s is PracticeShape=>s.type==='practice-question'&&s.meta.unpinned!==true);
 if(!card||card.props.deadline||card.props.finishedAt)return;
 const seconds=JSON.parse(card.props.data).question?.timeSeconds;
 if(seconds)editor.updateShape<PracticeShape>({id:card.id,type:card.type,props:{deadline:Date.now()+seconds*1000}});
}

export function PracticeHeader({editor}:{editor:Editor}){
 const summary=useValue('practice summary',()=>editor.getCurrentPage().meta.practiceSummary as {earnedPoints:number}|null,[editor]);
 const shape=useValue('current practice question',()=>editor.getCurrentPageShapes().find((s):s is PracticeShape=>s.type==='practice-question'&&s.meta.unpinned!==true),[editor]);
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(timer);},[]);
 if(!summary)return null;
 const data=shape?JSON.parse(shape.props.data) as NonNullable<PracticePresentation['practice']>:null;
 const seconds=data?.question?.timeSeconds;
 const remaining=seconds!==undefined&&shape?(shape.props.deadline?Math.min(seconds,Math.max(0,Math.ceil((shape.props.deadline-(shape.props.finishedAt||now))/1000))):seconds):undefined;
 return <><div className="practice-summary" aria-label="Practice progress"><strong>Practice</strong>{data&&<span>Question {data.index} of {data.total}</span>}{data?.question?.points!==undefined&&<span>{data.question.points} {data.question.points===1?'point':'points'}</span>}
 {remaining!==undefined&&<span className={`practice-countdown${remaining>0&&remaining<=10?' urgent':''}`} role="timer" aria-label="Time remaining" title={!shape?.props.deadline?'Starts after your tutor finishes.':remaining===0?'You can keep working.':'Time remaining'}>{remaining===0?'Time’s up':`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`}</span>}</div>
 <div className="practice-total" aria-label="Practice points earned">{summary.earnedPoints} points</div></>;
}
