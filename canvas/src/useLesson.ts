import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { BlockAdapter, safeMedia, type WireEvent, type Block } from './protocol';
import type {LessonVideo} from './VideoLesson';
import { CanvasRenderer } from './renderer';
import { AudioPlayer, Playback, delay } from './playback';
import { spokenPrefix } from './captions';
import type {StudentInput} from './studentWork';
export type Phase='offline'|'connecting'|'ready'|'thinking'|'speaking'|'writing'|'waiting'|'paused';
export type Entry={kind:string;text:string};
declare global {interface Window {canvasPlaybackDiagnostics?:()=>unknown;}}
export function useLesson(editor:Editor|null) {
  const [phase,setPhase]=useState<Phase>('offline'); const [connected,setConnected]=useState(false);
  const [caption,setCaption]=useState(''); const [question,setQuestion]=useState(''); const [title,setTitle]=useState('A little room to think');
  const [notice,setNotice]=useState(''); const [entries,setEntries]=useState<Entry[]>([]);
  const [follow,setFollow]=useState(true); const [simulated,setSimulated]=useState(false);
  const [video,setVideo]=useState<LessonVideo|null>(null),[submission,setSubmission]=useState<'idle'|'sent'|'waiting'>('idle');
  const pendingReply=useRef(false),sentTimer=useRef<ReturnType<typeof setTimeout>|null>(null),finishVideo=useRef<(()=>void)|null>(null);
  const clearSubmission=()=>{pendingReply.current=false;if(sentTimer.current)clearTimeout(sentTimer.current);setSubmission('idle');};
  const receivedReply=()=>{pendingReply.current=false;setSubmission(current=>current==='sent'?'sent':'idle');};
  const socket=useRef<WebSocket|null>(null), player=useRef<Playback|null>(null), renderer=useRef<CanvasRenderer|null>(null);
  const audio=useRef(new AudioPlayer()), adapter=useRef(new BlockAdapter()), waiting=useRef(false), paused=useRef(false), phaseBeforePause=useRef<Phase>('ready');
  const notify=useCallback((text:string)=>setNotice(text),[]);
  const connectionVersion=useRef(0),recordingPause=useRef(false);
  // Metadata only: never retain student input, audio bytes, or lesson text here.
  const trace=useRef<{at:string;event:string}[]>([]);
  const record=(event:string)=>{trace.current.push({at:new Date().toISOString(),event});if(trace.current.length>200)trace.current.shift();};
  const log=(kind:string,text:string)=>setEntries(old=>[...old.slice(-199),{kind,text}]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;
    const resize=()=>{clearTimeout(timer);timer=setTimeout(()=>renderer.current?.refocus(),200);};
    window.addEventListener('resize',resize);
    return()=>{clearTimeout(timer);window.removeEventListener('resize',resize);};
  },[]);
  useEffect(()=>{
    if(!editor) return;
    renderer.current=new CanvasRenderer(editor,()=>paused.current);
    const playback=new Playback(async(block:Block,signal)=>{
      if(signal.aborted) return;
      record(`present:${block.kind}`);
      if(block.kind==='session') {
        renderer.current!.newLesson(block.content);setTitle(block.content);setQuestion('');waiting.current=false;setFollow(true);log('lesson',block.content);return;
      }
      if(block.kind==='question'){
        waiting.current=false;setQuestion('');await renderer.current!.render(block,signal);return;
      }
      if(block.kind==='write' && block.content.startsWith('📖')) {
        const name=block.content.replace(/^📖\s*/,''); renderer.current!.newLesson(name); setTitle(name);setQuestion(''); waiting.current=false;setFollow(true);log('lesson',name);return;
      }
      if(block.kind==='speech') {
        waiting.current=false;setQuestion('');setSimulated(true);setPhase('speaking');log('tutor',block.content);
        const duration=Math.min(4500,Math.max(1000,block.content.length*28));
        for(let elapsed=0;elapsed<duration;elapsed+=40) {
          if(signal.aborted)return;
          setCaption(spokenPrefix(block.content,elapsed,duration));
          await delay(Math.min(40,duration-elapsed),signal,()=>paused.current);
        }
        if(!signal.aborted)setCaption(block.content);return;
      }
      if(block.kind==='audio') {
        waiting.current=false;setQuestion('');setSimulated(false);setPhase('speaking');
        const sentence=block.attrs.sentence;
        if(sentence){setCaption('');log('tutor',sentence);}
        await audio.current.play(block.content,signal,sentence?(elapsed,duration)=>setCaption(spokenPrefix(sentence,elapsed,duration)):undefined);return;
      }
      if(block.kind==='error') {notify(block.content);setPhase('ready');return;}
      if(block.kind==='play'){
        await renderer.current!.render(block,signal);
        const media=safeMedia(block.content);
        if(media&&media.kind!=='link'&&!signal.aborted){
          setVideo(media);setPhase('waiting');log('play',media.url);
          await new Promise<void>(resolve=>{
            const done=()=>{signal.removeEventListener('abort',done);finishVideo.current=null;setVideo(null);resolve();};
            finishVideo.current=done;signal.addEventListener('abort',done,{once:true});
            if(signal.aborted)done();
          });
        }
        return;
      }
      if(block.kind==='action') {
        if(block.action && typeof block.action==='object' && 'type' in block.action && block.action.type==='send-ok') {
          if(socket.current?.readyState===WebSocket.OPEN) socket.current.send(JSON.stringify({type:'message',text:'Ok'}));
        } return;
      }
      setPhase('writing');setCaption(block.kind==='svg'?'Let’s look at this together.':'Follow along, or try it yourself.');
      await renderer.current!.render(block,signal);
      if(signal.aborted) return;
      if(block.kind==='ask') {waiting.current=true;setQuestion(block.content);setCaption(block.content);setPhase('waiting');}
      log(block.kind,block.kind==='svg'?'Diagram added':block.content);
    },error=>{record(`failed:${(error as Error).name}`);console.error('Canvas playback failed',error);notify((error as Error).message);},()=>{
      record('idle');
      if(socket.current?.readyState===WebSocket.OPEN && !paused.current) setPhase(pendingReply.current?'thinking':waiting.current?'waiting':'ready');
    });
    player.current=playback;
    const diagnostics=()=>({playback:playback.snapshot(),audio:audio.current.state,events:[...trace.current]});
    window.canvasPlaybackDiagnostics=diagnostics;
    return ()=>{if(window.canvasPlaybackDiagnostics===diagnostics)delete window.canvasPlaybackDiagnostics;if(sentTimer.current)clearTimeout(sentTimer.current);renderer.current?.dispose();socket.current?.close();socket.current=null;playback.cancel();audio.current.close();};
  },[editor,notify]);
  function connect(url:string) {
    try { const parsed=new URL(url);if(!['ws:','wss:'].includes(parsed.protocol)) throw new Error(); } catch {notify('Enter a WebSocket address starting with ws:// or wss://.');return false;}
    if(!player.current) return false;
    connectionVersion.current++;
    clearSubmission();
    socket.current?.close();player.current.cancel();adapter.current.reset();paused.current=false;audio.current.pause(false);
    void audio.current.unlock().catch(()=>notify('Sound is blocked. Tap the tutor to enable audio.'));
    const ws=new WebSocket(url);socket.current=ws;setPhase('connecting');setNotice('');setQuestion('');waiting.current=false;
    ws.onopen=()=>{if(socket.current!==ws)return;setConnected(true);setPhase('ready');setCaption('Your tutor is getting ready.');};
    ws.onmessage=e=>{
      if(socket.current!==ws)return;
      try {
        const event=JSON.parse(e.data) as WireEvent;if(!event || typeof event.type!=='string') throw new Error();
        record(`received:${event.type}${event.event?.type?`:${event.event.type}`:''}`);
        if(['text_chunk','audio_chunk','ask','annotate','svg','play','error'].includes(event.type)||(event.type==='event'&&(event as WireEvent&{event?:{type:string}}).event?.type==='tutor-ended'))receivedReply();
        player.current!.add(adapter.current.accept(event));
      }
      catch {notify('One tutor event could not be read. You can reconnect if the lesson stops.');}
    };
    ws.onerror=()=>{if(socket.current===ws)notify('Could not reach the tutor. Check the replay server and connection address.');};
    ws.onclose=()=>{if(socket.current!==ws)return;clearSubmission();player.current?.cancel();setConnected(false);setPhase('offline');setCaption('Your notebook is saved on this device.');paused.current=false;};
    return true;
  }
  function disconnect(){connectionVersion.current++;clearSubmission();socket.current?.close();player.current?.cancel();setConnected(false);setPhase('offline');}
  function send(value:string|StudentInput) {
    if(socket.current?.readyState!==WebSocket.OPEN){notify('Connect to your tutor before sending a reply.');return false;}
    if(pendingReply.current){notify('Your work was sent. Wait for your tutor to respond.');return false;}
    const input=typeof value==='string'?{text:value.trim()}:value;
    if(!input.text?.trim()&&!input.audio&&!input.images?.length)return false;
    try{socket.current.send(JSON.stringify({type:'message',...input}));}catch{notify('Could not send. Your work is still pending; tap to retry.');return false;}
    pendingReply.current=true;setSubmission('sent');
    if(sentTimer.current)clearTimeout(sentTimer.current);
    sentTimer.current=setTimeout(()=>setSubmission(pendingReply.current?'waiting':'idle'),900);
    log('you',[input.text,input.audio?'Voice message':null,input.images?.length?'Canvas work shared':null].filter(Boolean).join('\n'));setQuestion('');waiting.current=false;setPhase('thinking');return true;
  }
  function doneWatching(){
    if(!finishVideo.current)return false;
    if(!send('I am done watching'))return false;
    finishVideo.current();return true;
  }
  function recording(active:boolean){
    if(active){recordingPause.current=!paused.current;if(recordingPause.current)togglePause();}
    else if(recordingPause.current){recordingPause.current=false;if(paused.current)togglePause();}
  }
  function togglePause() {
    paused.current=!paused.current;
    if(paused.current){phaseBeforePause.current=phase;setPhase('paused');}else setPhase(phaseBeforePause.current);
    player.current?.setPaused(paused.current);audio.current.pause(paused.current);
  }
  function stopFollowing(){if(renderer.current)renderer.current.follow=false;setFollow(false);}
  function resumeFollowing(){if(renderer.current){renderer.current.follow=true;renderer.current.fit();}setFollow(true);}
  return {phase,connected,caption,question,title,notice,notify,entries,follow,simulated,video,doneWatching,submission,connect,disconnect,send,togglePause,recording,connectionVersion,stopFollowing,resumeFollowing,fit:resumeFollowing};
}
