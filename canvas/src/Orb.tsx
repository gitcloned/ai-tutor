import { useRef, useState, useEffect } from 'react';
import { Pause, Play, Mic } from 'lucide-react';
import type { Phase } from './useLesson';
interface Recognition {lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start():void;stop():void;abort():void;}
export function Orb({phase,onTap,onSpeech,notify}:{phase:Phase;onTap:()=>void;onSpeech:(text:string)=>void;notify:(text:string)=>void}) {
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null), held=useRef(false), cancelled=useRef(false), transcript=useRef(''), recognition=useRef<Recognition|null>(null);
  const startPoint=useRef({x:0,y:0}); const [listening,setListening]=useState(false);
  const busy=['speaking','writing','thinking','connecting'].includes(phase);
  useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);recognition.current?.abort();},[]);
  function start(){
    held.current=true;
    const Speech=(window as unknown as {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition}).SpeechRecognition ?? (window as unknown as {webkitSpeechRecognition?:new()=>Recognition}).webkitSpeechRecognition;
    if(!Speech){notify('Voice input is not available in this browser. Use the keyboard button to reply.');return;}
    if(phase==='offline'||phase==='connecting'){notify('Connect to your tutor before speaking.');return;}
    if(busy||phase==='paused'){notify('Finish or resume the current explanation before sending a voice reply.');return;}
    cancelled.current=false;transcript.current='';const r=new Speech();recognition.current=r;r.lang='en-US';r.continuous=true;r.interimResults=false;
    r.onresult=e=>{transcript.current=Array.from(e.results).map(result=>result[0].transcript).join(' ');};
    r.onerror=e=>{cancelled.current=true;notify(e.error==='not-allowed'?'Microphone permission was denied. You can type your reply.':'Voice input stopped. Try again or type your reply.');setListening(false);};
    r.onend=()=>{setListening(false);recognition.current=null;if(!cancelled.current&&transcript.current.trim())onSpeech(transcript.current);};
    try{r.start();setListening(true);}catch{notify('Voice input could not start. You can type your reply.');}
  }
  function release(cancel=false){
    if(timer.current){clearTimeout(timer.current);timer.current=null;}
    if(cancel){cancelled.current=true;recognition.current?.abort();setListening(false);}
    else if(held.current){recognition.current?.stop();setListening(false);}
    else onTap();
  }
  return <div className="orb-wrap">
    <span className="orb-label" aria-live="polite">{listening?'Listening…':({offline:'Meet your tutor',connecting:'Connecting…',ready:'Here with you',thinking:'Thinking…',speaking:'Explaining…',writing:'Writing…',waiting:'Your turn',paused:'Paused'})[phase]}</span>
    <button className={`orb ${busy?'active':''} ${listening?'listening':''}`} aria-label={listening?'Release to send voice reply':phase==='paused'?'Resume tutor':busy?'Pause tutor':'Share your work; hold to speak'}
      onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);held.current=false;cancelled.current=false;startPoint.current={x:e.clientX,y:e.clientY};timer.current=setTimeout(start,420);}}
      onPointerMove={e=>{if(e.buttons && Math.hypot(e.clientX-startPoint.current.x,e.clientY-startPoint.current.y)>90){cancelled.current=true;if(timer.current)clearTimeout(timer.current);recognition.current?.abort();setListening(false);held.current=true;}}}
      onPointerUp={()=>release(cancelled.current)} onPointerCancel={()=>release(true)}
      onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();held.current=false;timer.current=setTimeout(start,420);}}}
      onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();release();}}}>
      <span className="orb-ring one"/><span className="orb-ring two"/><span className="orb-core"/>
      <span className="orb-icon">{listening?<Mic size={22}/>:phase==='paused'?<Play size={22}/>:busy?<Pause size={20}/>:null}</span>
    </button>
    <span className="orb-hint">{listening?'Release to send · Slide away to cancel':'Tap to share · Hold to talk'}</span>
  </div>;
}
