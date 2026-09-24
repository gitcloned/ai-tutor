import {useEffect,useRef,useState} from 'react';
import {Camera,SwitchCamera,Trash2,X,ChevronLeft,ChevronRight} from 'lucide-react';
import {capturePage,pageUrl,type CameraPage} from './cameraPages';
import './camera.css';

export function CameraCapture({pages,add,remove,close,send,busy,canSend}:{pages:CameraPage[];add:(page:CameraPage)=>void;remove:(id:string)=>void;close:()=>void;send:()=>void;busy:boolean;canSend:boolean}){
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null);
  const [facing,setFacing]=useState<'user'|'environment'>(()=>sessionStorage.getItem('prodigy-camera')==='environment'?'environment':'user');
  const [ready,setReady]=useState(false),[error,setError]=useState(''),[capturing,setCapturing]=useState(false),[preview,setPreview]=useState<string|null>(null),[retry,setRetry]=useState(0);
  const taking=useRef(false);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
  useEffect(()=>{
    let disposed=false,stream:MediaStream|undefined;const element=video.current;
    setReady(false);setError('');
    async function open(){
      if(!navigator.mediaDevices?.getUserMedia){setError('Camera access needs HTTPS and a supported browser. Open the secure site to take photos.');return;}
      try{
        stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:2048},height:{ideal:1536}},audio:false});
        if(disposed){stream.getTracks().forEach(t=>t.stop());return;}
        if(element){element.srcObject=stream;await element.play();if(!disposed)setReady(true);}
      }catch{if(!disposed)setError('The camera could not open. Allow camera access in Safari or your browser settings, then try again.');}
    }
    void open();
    return()=>{disposed=true;stream?.getTracks().forEach(t=>t.stop());if(element)element.srcObject=null;};
  },[facing,retry]);
  async function capture(){
    if(!video.current||taking.current||!ready||busy)return;
    taking.current=true;setCapturing(true);
    try{add(await capturePage(video.current));setError('');}catch(e){setError((e as Error).message);}finally{taking.current=false;setCapturing(false);}
  }
  const selected=pages.find(p=>p.id===preview);
  return <dialog className="camera-dialog" ref={dialog} aria-label="Show your work" onCancel={e=>{e.preventDefault();if(!busy)close();}}>
    <header><button aria-label="Close camera" disabled={busy||capturing} onClick={close}><X/></button><div><h2>Show your work</h2><p>Take a photo of each page. Send them together.</p></div><button aria-label="Switch camera" disabled={capturing||busy} onClick={()=>{const next=facing==='user'?'environment':'user';sessionStorage.setItem('prodigy-camera',next);setFacing(next);setPreview(null);}}><SwitchCamera/></button></header>
    <div className="camera-stage">
      <video ref={video} muted playsInline autoPlay className={facing==='user'?'camera-selfie':''} style={{visibility:selected?'hidden':'visible'}}/>
      {selected&&<img className="camera-preview" src={pageUrl(selected)} alt={`Captured page ${pages.indexOf(selected)+1}`}/>}
      {!ready&&!error&&!selected&&<p className="camera-message">Opening camera…</p>}
      {error&&<div className="camera-message" role="alert"><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Try again</button></div>}
      {selected&&<div className="camera-preview-actions"><button onClick={()=>setPreview(null)}>Back to camera</button><button aria-label="Delete this page" disabled={busy} onClick={()=>{remove(selected.id);setPreview(null);}}><Trash2 size={18}/>Delete page</button></div>}
    </div>
    <div className="camera-thumbnails" aria-label="Captured pages">{pages.map((p,i)=><button key={p.id} aria-label={`Preview page ${i+1}`} aria-pressed={preview===p.id} onClick={()=>setPreview(p.id)}><img src={pageUrl(p)} alt=""/><span>{i+1}</span></button>)}{!pages.length&&<p>Your pages will appear here</p>}</div>
    <footer><p aria-live="polite">{pages.length?`${pages.length} ${pages.length===1?'page':'pages'} ready`:'Keep the whole page in view'}<small>{pages.length?'You can keep adding pages.':'Make sure the writing is clear.'}</small></p><button className="camera-shutter" aria-label="Capture page" disabled={!ready||capturing||busy} onClick={()=>{setPreview(null);void capture();}}><Camera size={30}/></button><button className="camera-send" aria-label={`Send ${pages.length} pages`} disabled={!pages.length||busy||capturing||!canSend} onClick={send}><span className="camera-send-orb"/>{busy?'Sending…':`Send ${pages.length||''} ${pages.length===1?'page':'pages'}`}</button></footer>
  </dialog>;
}

export function PagePreview({urls,close}:{urls:string[];close:()=>void}){
  const dialog=useRef<HTMLDialogElement>(null),[index,setIndex]=useState(0);
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();previous?.focus();};},[]);
  return <dialog ref={dialog} className="camera-dialog page-preview-dialog" aria-label="Your submitted pages" onCancel={e=>{e.preventDefault();close();}}>
    <header><h2>Your work · Page {index+1} of {urls.length}</h2><button aria-label="Close page preview" onClick={close}><X/></button></header>
    <div className="camera-stage"><img className="camera-preview" src={urls[index]} alt={`Page ${index+1}`}/></div>
    <footer><button disabled={index===0} aria-label="Previous page" onClick={()=>setIndex(i=>i-1)}><ChevronLeft/>Previous</button><span>{index+1} / {urls.length}</span><button disabled={index===urls.length-1} aria-label="Next page" onClick={()=>setIndex(i=>i+1)}>Next<ChevronRight/></button></footer>
  </dialog>;
}
