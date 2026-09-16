import {useEffect,useRef,useState} from 'react';
import {Check,Maximize,Play} from 'lucide-react';
import type {safeMedia} from './protocol';

export type LessonVideo=NonNullable<ReturnType<typeof safeMedia>>;

export function VideoLesson({media,onDone}:{media:LessonVideo;onDone:()=>boolean}){
  const dialog=useRef<HTMLDialogElement>(null),video=useRef<HTMLVideoElement>(null),iframe=useRef<HTMLIFrameElement>(null);
  const [blocked,setBlocked]=useState(false),[failed,setFailed]=useState(false);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const element=dialog.current,player=video.current;
    element?.showModal();
    // Native fullscreen may require a click; the viewer fills the viewport even
    // when the browser declines this automatic request.
    void element?.requestFullscreen?.().catch(()=>{});
    if(player)void player.play().catch(()=>setBlocked(true));
    return()=>{player?.pause();element?.close();previous?.focus();};
  },[]);
  function pause(){
    video.current?.pause();
    iframe.current?.contentWindow?.postMessage(JSON.stringify({event:'command',func:'pauseVideo',args:[]}),'https://www.youtube.com');
  }
  function done(){pause();onDone();}
  const id=media.kind==='youtube'?new URL(media.url).searchParams.get('v'):null;
  const embed=id?`https://www.youtube.com/embed/${id}?autoplay=1&playsinline=1&fs=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`:undefined;
  return <dialog ref={dialog} className="video-lesson" aria-labelledby="video-title" onCancel={e=>{e.preventDefault();done();}}>
    <header><h2 id="video-title">Watch together</h2><button aria-label="Make video fullscreen" onClick={()=>{void dialog.current?.requestFullscreen?.().catch(()=>{});}}><Maximize size={18}/></button></header>
    <div className="video-stage">
      {media.kind==='youtube'?<iframe ref={iframe} src={embed} title="Lesson video" allow="autoplay; picture-in-picture"/>:
        <video ref={video} src={media.url} controls controlsList="nofullscreen" autoPlay playsInline onPlaying={()=>setBlocked(false)} onError={()=>setFailed(true)}/>}
      {blocked&&!failed&&<button className="video-start" onClick={()=>{void video.current?.play().then(()=>setBlocked(false)).catch(()=>setBlocked(true));}}><Play size={22}/>Play video</button>}
      {failed&&<p className="video-failed">This video couldn’t load. You can return to your tutor.</p>}
    </div>
    <footer><p>Take your time. Let your tutor know when you’re done.</p><button className="primary" onClick={done}><Check size={18}/>I’m done watching</button></footer>
  </dialog>;
}
