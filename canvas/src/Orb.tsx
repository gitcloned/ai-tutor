import {useRef,useState,useEffect} from 'react';
import {Mic,Check,LoaderCircle} from 'lucide-react';
import type {Phase} from './useLesson';
import {blobInput,type MediaInput} from './studentWork';

export function Orb({tutorBusy=false,phase,submission='idle',preparing=false,watching=false,onTap,onAudio,onRecording,notify}:{tutorBusy?:boolean;phase:Phase;submission?:'idle'|'sent'|'waiting';preparing?:boolean;watching?:boolean;onTap:()=>void;onAudio:(audio:MediaInput)=>void;onRecording:(active:boolean)=>void;notify:(text:string,action?:'connect'|'reply'|'retry'|'sound')=>void}) {
  const timer=useRef<ReturnType<typeof setTimeout>|null>(null),held=useRef(false),pressed=useRef(false),cancelled=useRef(false);
  const generation=useRef(0),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null);
  const callbacks=useRef({onAudio,onRecording,notify});callbacks.current={onAudio,onRecording,notify};
  const startPoint=useRef({x:0,y:0});const [listening,setListening]=useState(false);
  const [pressing,setPressing]=useState(false),[requesting,setRequesting]=useState(false);
  const busy=tutorBusy||['speaking','writing','thinking','connecting'].includes(phase);
  const unavailable=phase!=='offline'&&(tutorBusy||preparing||submission!=='idle'||phase==='connecting'||watching);
  const status=preparing?'Sending…':submission==='sent'?'Sent':submission==='waiting'?'Waiting for tutor…':null;
  const state=listening?'listening':requesting?'microphone':preparing?'sending':submission==='sent'?'sent':submission==='waiting'?'thinking':watching?'watching':phase==='connecting'?'connecting':pressing?'holding':phase==='speaking'?'speaking':phase==='writing'?'writing':tutorBusy?'thinking':phase==='paused'?'paused':phase==='offline'?'offline':'ready';
  function stopTracks(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;}
  function stop(cancel:boolean){
    pressed.current=false;cancelled.current=cancel;
    setPressing(false);setRequesting(false);
    if(timer.current)clearTimeout(timer.current);
    if(recorder.current?.state==='recording')recorder.current.stop();
    else {stopTracks();setListening(false);callbacks.current.onRecording(false);}
  }
  useEffect(()=>()=>{generation.current++;cancelled.current=true;pressed.current=false;if(timer.current)clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stopTracks();callbacks.current.onRecording(false);},[]);
  useEffect(()=>{if(phase==='offline'||phase==='connecting'){generation.current++;stop(true);}},[phase]);
  async function start(){
    held.current=true;
    if(phase==='offline'){onTap();return;}
    if(phase==='connecting')return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){notify('Audio recording is unavailable in this browser. You can type your reply.','reply');return;}
    const token=++generation.current;
    setRequesting(true);
    try {
      const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(!pressed.current||cancelled.current||token!==generation.current){mic.getTracks().forEach(t=>t.stop());return;}
      stream.current=mic;
      const mimeType=['audio/webm;codecs=opus','audio/mp4','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));
      const r=new MediaRecorder(mic,mimeType?{mimeType}:undefined),chunks:Blob[]=[];recorder.current=r;
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onerror=()=>{cancelled.current=true;stopTracks();setListening(false);callbacks.current.onRecording(false);notify('Recording failed. You can type your reply or try holding the orb again.','reply');};
      r.onstop=async()=>{
        stopTracks();recorder.current=null;setListening(false);callbacks.current.onRecording(false);
        if(cancelled.current||token!==generation.current)return;
        const blob=new Blob(chunks,{type:r.mimeType});if(!blob.size)return;
        try{const audio=await blobInput(blob);if(token===generation.current)callbacks.current.onAudio(audio);}catch(e){callbacks.current.notify((e as Error).message);}
      };
      r.start();setListening(true);callbacks.current.onRecording(true);
    } catch {stopTracks();setListening(false);notify('Microphone access failed. Allow microphone access in your browser, or type your reply.','reply');}
    finally{if(token===generation.current)setRequesting(false);}
  }
  function begin(){if(unavailable||pressed.current||recorder.current)return;pressed.current=true;setPressing(true);held.current=false;cancelled.current=false;timer.current=setTimeout(start,420);}
  function release(cancel=false){if(!pressed.current)return;const wasHeld=held.current;stop(cancel);if(!cancel&&!wasHeld&&!unavailable)onTap();}
  return <div className="orb-wrap">
    <span className="orb-label" aria-live="polite">{listening?'Listening…':requesting?'Opening microphone…':pressing?'Keep holding…':status??(watching?'Watch at your pace':({offline:'Meet your tutor',connecting:'Connecting…',ready:'Here with you',thinking:'Thinking…',speaking:'Explaining…',writing:'Writing…',waiting:'Your turn',paused:'Paused'})[phase])}</span>
    <button data-state={state} className={`orb ${busy?'active':''} ${listening?'listening':''} ${unavailable?'unavailable':'available'} ${submission==='sent'?'submitted':''}`} disabled={unavailable} aria-busy={tutorBusy||preparing||submission==='waiting'} aria-label={listening?'Release to send audio':'Send new work; hold to speak'}
      onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);startPoint.current={x:e.clientX,y:e.clientY};begin();}}
      onPointerMove={e=>{if(e.buttons&&Math.hypot(e.clientX-startPoint.current.x,e.clientY-startPoint.current.y)>90){held.current=true;stop(true);}}}
      onPointerUp={()=>release(cancelled.current)} onPointerCancel={()=>release(true)}
      onKeyDown={e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();begin();}if(e.key==='Escape')release(true);}}
      onKeyUp={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();release();}}}>
      <span className="orb-ring one"/><span className="orb-ring two"/><span className="orb-core"/>
      <span className="orb-voice" aria-hidden="true"><i/><i/><i/><i/><i/></span>
      <span className="orb-icon">{listening?<Mic size={22}/>:submission==='sent'?<Check size={25}/>:preparing||submission==='waiting'?<LoaderCircle className="orb-spinner" size={22}/>:null}</span>
    </button>
    <span className="orb-hint">{listening?'Release to send · Slide away to cancel':submission==='sent'?'Your work is on its way':unavailable?'You can keep working on the canvas':phase==='offline'?'Tap to connect':'Tap to send · Hold to talk'}</span>
  </div>;
}
