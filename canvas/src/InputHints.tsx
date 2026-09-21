import {useEffect,useRef,useState} from 'react';
import {useValue,type Editor} from 'tldraw';
import {Hand,MousePointer2,Mic,Undo2} from 'lucide-react';
import type {GraphConfig,GraphPoint} from './models/functionGraph';
import './inputHints.css';

type Kind='write'|'speak';
const storageKey='prodigy-input-hints-v1';
let memory:Partial<Record<Kind,boolean>>={};
function completed(){
  try{return {...memory,...JSON.parse(localStorage.getItem(storageKey)??'{}')};}catch{return memory;}
}
export function learnedInput(kind:Kind){
  memory={...completed(),[kind]:true};
  try{localStorage.setItem(storageKey,JSON.stringify(memory));}catch{/* Still remembered for this visit. */}
  window.dispatchEvent(new Event('prodigy-input-learned'));
}

export function InputHints({editor,turn,ready,blocked}:{editor:Editor;turn:number;ready:boolean;blocked:boolean}){
  const [hint,setHint]=useState<Kind|null>(null);
  const usedTurn=useRef(0),active=useRef<Kind|null>(null);
  const pointerHeld=useRef(false);
  const graphWaiting=useValue('graph awaiting input',()=>editor.getCurrentPageShapes().some(shape=>{
    if(shape.type!=='function-graph')return false;
    try{
      const config:GraphConfig=JSON.parse(shape.props.config),points:GraphPoint[]=JSON.parse(shape.props.points);
      return config.mode==='ask'&&(config.targets.length
        ?config.targets.some(x=>!points.some(p=>p.correct&&p.x===x))
        :!points.some(p=>p.correct));
    }catch{return true;}
  }),[editor]);
  const cancel=()=>{active.current=null;setHint(null);};
  useEffect(()=>{
    return editor.store.listen(({changes})=>{
      const records=[...Object.values(changes.added),...Object.values(changes.updated).map(([,next])=>next)];
      if(records.some(record=>record.typeName==='shape'&&['draw','text'].includes(record.type)&&record.meta.author!=='tutor'))learnedInput('write');
    },{scope:'document',source:'user'});
  },[editor]);
  useEffect(()=>{
    const interrupt=()=>{usedTurn.current=turn;cancel();};
    const press=()=>{pointerHeld.current=true;interrupt();};
    const release=()=>{pointerHeld.current=false;};
    const learned=()=>{if(active.current&&completed()[active.current])interrupt();};
    window.addEventListener('pointerdown',press,true);
    window.addEventListener('pointerup',release,true);
    window.addEventListener('pointercancel',release,true);
    window.addEventListener('keydown',interrupt,true);
    window.addEventListener('wheel',interrupt,true);
    window.addEventListener('prodigy-input-learned',learned);
    return()=>{
      window.removeEventListener('pointerdown',press,true);
      window.removeEventListener('pointerup',release,true);
      window.removeEventListener('pointercancel',release,true);
      window.removeEventListener('keydown',interrupt,true);
      window.removeEventListener('wheel',interrupt,true);
      window.removeEventListener('prodigy-input-learned',learned);
    };
  },[turn]);
  useEffect(()=>{
    cancel();
    if(!turn||!ready||blocked||graphWaiting||usedTurn.current===turn)return;
    const timer=setTimeout(()=>{
      if(usedTurn.current===turn||document.hidden)return;
      if(pointerHeld.current){usedTurn.current=turn;return;}
      const seen=completed(),kind:Kind|null=!seen.write?'write':!seen.speak?'speak':null;
      if(!kind)return;
      usedTurn.current=turn;
      // Record before showing; interruptions must not repeatedly restart a hint.
      learnedInput(kind);active.current=kind;setHint(kind);
    },2000);
    return()=>clearTimeout(timer);
  },[turn,ready,blocked,graphWaiting]);
  useEffect(()=>{
    const hide=()=>{usedTurn.current=turn;cancel();};
    document.addEventListener('visibilitychange',hide);
    return()=>document.removeEventListener('visibilitychange',hide);
  },[turn]);
  return hint?<InputDemo kind={hint} done={cancel}/>:null;
}

function InputDemo({kind,done}:{kind:Kind;done:()=>void}){
  const [step,setStep]=useState(0),[bounds,setBounds]=useState({x:0,y:0,w:0,h:0});
  const [cardAnchor,setCardAnchor]=useState({x:0,y:0,w:0});
  const doneRef=useRef(done);doneRef.current=done;
  useEffect(()=>{
    const timers=[setTimeout(()=>setStep(1),1000),setTimeout(()=>setStep(2),kind==='write'?3400:2900),setTimeout(()=>doneRef.current(),kind==='write'?5000:4200)];
    return()=>timers.forEach(clearTimeout);
  },[kind]);
  useEffect(()=>{
    const update=()=>{
      const selector=kind==='speak'?'.orb':step===2?'.toolbar [aria-label="Undo"]':'.toolbar [aria-label="Pencil (D)"]';
      const rect=document.querySelector(selector)?.getBoundingClientRect();
      if(rect)setBounds({x:rect.x,y:rect.y,w:rect.width,h:rect.height});
      const anchor=document.querySelector(kind==='write'?'.toolbar [aria-label="Pencil (D)"]':'.orb')?.getBoundingClientRect();
      if(anchor)setCardAnchor({x:anchor.x,y:anchor.y,w:anchor.width});
    };
    update();window.addEventListener('resize',update);return()=>window.removeEventListener('resize',update);
  },[kind,step]);
  const left=kind==='write'?Math.min(cardAnchor.x+cardAnchor.w+20,window.innerWidth-270):Math.max(12,Math.min(cardAnchor.x-210,window.innerWidth-270));
  const top=kind==='write'?Math.max(85,Math.min(cardAnchor.y,window.innerHeight-230)):Math.max(85,cardAnchor.y-210);
  const title=kind==='write'?['Tap the pencil','Write your idea','Undo if you want to try again'][step]:['Hold the orb to speak','Keep holding while you talk','Release to send'][step];
  const drawing=kind==='write'&&step===1;
  return <div className="input-demo" data-onboarding={kind} data-step={step}>
    <div className="input-demo-ring" style={{left:bounds.x-5,top:bounds.y-5,width:bounds.w+10,height:bounds.h+10}}/>
    <div className={`input-demo-pointer ${drawing?'drawing':''}`} aria-hidden="true" style={{left:drawing?left+35:bounds.x+bounds.w*.6,top:drawing?top+115:bounds.y+bounds.h*.65}}>{kind==='write'?<MousePointer2 size={27}/>:<Hand size={32}/>}</div>
    <div className="input-demo-card" style={{left,top}} role="status">
      <span className="input-demo-eyebrow">A little practice</span>
      <strong>{title}</strong>
      {kind==='write'?<svg aria-hidden="true" viewBox="0 0 220 65"><path className={`demo-ink step-${step}`} pathLength="1" d="M20 48 Q28 5 37 19 Q40 32 23 38 L50 40 M70 23 Q93 8 91 30 Q88 47 68 47 M124 16 L108 39 L139 39 M133 15 L127 52"/>{step===2&&<foreignObject x="90" y="15" width="40" height="40"><Undo2 size={28}/></foreignObject>}</svg>:<div className={`demo-voice step-${step}`} aria-hidden="true"><Mic size={23}/><i/><i/><i/><i/><i/></div>}
      <p>{kind==='write'?'Use the canvas to show your thinking.':'Your tutor will hear you when you let go.'}</p>
    </div>
  </div>;
}
