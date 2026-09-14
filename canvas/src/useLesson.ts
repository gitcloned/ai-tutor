import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { BlockAdapter, type WireEvent, type Block } from './protocol';
import { CanvasRenderer } from './renderer';
import { AudioPlayer, Playback, delay } from './playback';
import { spokenPrefix } from './captions';
import type {StudentInput} from './studentWork';
export type Phase='offline'|'connecting'|'ready'|'thinking'|'speaking'|'writing'|'waiting'|'paused';
export type Entry={kind:string;text:string};
export function useLesson(editor:Editor|null) {
  const [phase,setPhase]=useState<Phase>('offline'); const [connected,setConnected]=useState(false);
  const [caption,setCaption]=useState(''); const [question,setQuestion]=useState(''); const [title,setTitle]=useState('A little room to think');
  const [notice,setNotice]=useState(''); const [entries,setEntries]=useState<Entry[]>([]);
  const [follow,setFollow]=useState(true); const [simulated,setSimulated]=useState(false);
  const socket=useRef<WebSocket|null>(null), player=useRef<Playback|null>(null), renderer=useRef<CanvasRenderer|null>(null);
  const audio=useRef(new AudioPlayer()), adapter=useRef(new BlockAdapter()), waiting=useRef(false), paused=useRef(false), phaseBeforePause=useRef<Phase>('ready');
  const notify=useCallback((text:string)=>setNotice(text),[]);
  const connectionVersion=useRef(0),recordingPause=useRef(false);
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
      if(block.kind==='session') {
        renderer.current!.newLesson(block.content);setTitle(block.content);setQuestion('');waiting.current=false;setFollow(true);log('lesson',block.content);return;
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
      if(block.kind==='action') {
        if(block.action && typeof block.action==='object' && 'type' in block.action && block.action.type==='send-ok') {
          if(socket.current?.readyState===WebSocket.OPEN) socket.current.send(JSON.stringify({type:'message',text:'Ok'}));
        } return;
      }
      setPhase('writing');setCaption(block.kind==='svg'?'Let’s look at this together.':block.kind==='play'?'A different way to see it.':'Follow along, or try it yourself.');
      await renderer.current!.render(block,signal);
      if(signal.aborted) return;
      if(block.kind==='ask') {waiting.current=true;setQuestion(block.content);setCaption(block.content);setPhase('waiting');}
      log(block.kind,block.kind==='svg'?'Diagram added':block.content);
    },error=>notify((error as Error).message),()=>{
      if(socket.current?.readyState===WebSocket.OPEN && !paused.current) setPhase(waiting.current?'waiting':'ready');
    });
    player.current=playback;
    return ()=>{renderer.current?.dispose();socket.current?.close();socket.current=null;playback.cancel();audio.current.close();};
  },[editor,notify]);
  function connect(url:string) {
    try { const parsed=new URL(url);if(!['ws:','wss:'].includes(parsed.protocol)) throw new Error(); } catch {notify('Enter a WebSocket address starting with ws:// or wss://.');return false;}
    if(!player.current) return false;
    connectionVersion.current++;
    socket.current?.close();player.current.cancel();adapter.current.reset();paused.current=false;audio.current.pause(false);
    void audio.current.unlock().catch(()=>notify('Sound is blocked. Tap the tutor to enable audio.'));
    const ws=new WebSocket(url);socket.current=ws;setPhase('connecting');setNotice('');setQuestion('');waiting.current=false;
    ws.onopen=()=>{if(socket.current!==ws)return;setConnected(true);setPhase('ready');setCaption('Your tutor is getting ready.');};
    ws.onmessage=e=>{
      if(socket.current!==ws)return;
      try {
        const event=JSON.parse(e.data) as WireEvent;if(!event || typeof event.type!=='string') throw new Error();
        player.current!.add(adapter.current.accept(event));
      }
      catch {notify('One tutor event could not be read. You can reconnect if the lesson stops.');}
    };
    ws.onerror=()=>{if(socket.current===ws)notify('Could not reach the tutor. Check the replay server and connection address.');};
    ws.onclose=()=>{if(socket.current!==ws)return;player.current?.cancel();setConnected(false);setPhase('offline');setCaption('Your notebook is saved on this device.');paused.current=false;};
    return true;
  }
  function disconnect(){connectionVersion.current++;socket.current?.close();player.current?.cancel();setConnected(false);setPhase('offline');}
  function send(value:string|StudentInput) {
    if(socket.current?.readyState!==WebSocket.OPEN){notify('Connect to your tutor before sending a reply.');return false;}
    const input=typeof value==='string'?{text:value.trim()}:value;
    if(!input.text?.trim()&&!input.audio&&!input.images?.length)return false;
    try{socket.current.send(JSON.stringify({type:'message',...input}));}catch{notify('Could not send. Your work is still pending; tap to retry.');return false;}
    log('you',[input.text,input.audio?'Voice message':null,input.images?.length?'Canvas work shared':null].filter(Boolean).join('\n'));setQuestion('');waiting.current=false;setPhase('thinking');return true;
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
  return {phase,connected,caption,question,title,notice,notify,entries,follow,simulated,connect,disconnect,send,togglePause,recording,connectionVersion,stopFollowing,resumeFollowing,fit:resumeFollowing};
}
