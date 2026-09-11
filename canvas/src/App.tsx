import { useEffect, useState, useRef } from 'react';
import { Tldraw, type Editor, useValue } from 'tldraw';
import { ArrowUpRight, BookOpen, ChevronRight, X, Keyboard, Send, Focus, Minus, Plus, Plug, Download, MessageCircle, Volume2, Leaf } from 'lucide-react';
import { Toolbar } from './Toolbar';
import { Orb } from './Orb';
import { useLesson } from './useLesson';
import 'tldraw/tldraw.css';
import './styles.css';
function LessonName({editor}:{editor:Editor}) {
  const name=useValue('lesson name',()=>editor.getCurrentPage().name,[editor]);
  return <strong>{name==='Page 1'?'Your canvas':name}</strong>;
}
function CanvasControls({editor,fit}:{editor:Editor;fit:()=>void}) {
  const zoom=useValue('zoom',()=>Math.round(editor.getZoomLevel()*100),[editor]);
  return <div className="zoom-controls"><button aria-label="Zoom out" onClick={()=>editor.zoomOut()}><Minus size={16}/></button><button onClick={fit} title="Fit lesson" aria-label="Fit lesson">{zoom}%</button><button aria-label="Zoom in" onClick={()=>editor.zoomIn()}><Plus size={16}/></button></div>;
}
function Notebook({editor,close}:{editor:Editor;close:()=>void}) {
  const pages=useValue('pages',()=>editor.getPages(),[editor]);
  const current=useValue('page',()=>editor.getCurrentPageId(),[editor]);
  return <aside className="notebook panel"><div className="panel-heading"><div><span className="eyebrow">Saved on this device</span><h2>Your notebook</h2></div><button aria-label="Close notebook" onClick={close}><X size={20}/></button></div><p className="panel-intro">Every explanation. Every attempt.<br/>A little more understanding.</p><div className="page-list">{pages.map((page,index)=><button className={current===page.id?'current':''} key={page.id} onClick={()=>{editor.setCurrentPage(page.id);editor.zoomToFit({animation:{duration:250}});close();}}><span className="page-number">{String(index+1).padStart(2,'0')}</span><span>{page.name}<small>{current===page.id?'Open now':'Return to this page'}</small></span><ChevronRight size={16}/></button>)}</div><p className="footnote">Your drawings are saved in this browser. Export a page to keep a copy elsewhere.</p></aside>;
}
export default function App() {
  const [editor,setEditor]=useState<Editor|null>(null);const lesson=useLesson(editor);
  const [sheet,setSheet]=useState<'connect'|'reply'|'transcript'|null>(null),[notebook,setNotebook]=useState(false),[reply,setReply]=useState('');
  const [url,setUrl]=useState(()=>localStorage.getItem('prodigy-ws')||'ws://localhost:8080');
  const [hasContent,setHasContent]=useState(false);
  const dialogRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!sheet)return;
    const previous=document.activeElement as HTMLElement|null;
    const trap=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,a[href]')??[]);const first=items[0],last=items[items.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
    const timer=setTimeout(()=>{if(!dialogRef.current?.contains(document.activeElement))dialogRef.current?.querySelector<HTMLElement>('button')?.focus();},0);
    document.addEventListener('keydown',trap);return()=>{clearTimeout(timer);document.removeEventListener('keydown',trap);previous?.focus();};
  },[sheet]);
  useEffect(()=>{if(!editor)return;const refresh=()=>setHasContent(editor.getCurrentPageShapes().length>0);refresh();return editor.store.listen(refresh);},[editor]);
  useEffect(()=>{if(!lesson.notice)return;const timeout=setTimeout(()=>lesson.notify(''),9000);return()=>clearTimeout(timeout);},[lesson.notice]);
  useEffect(()=>{function escape(e:KeyboardEvent){if(e.key==='Escape'){setSheet(null);setNotebook(false);}}window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  function tapOrb(){if(['speaking','writing','thinking','paused'].includes(lesson.phase))lesson.togglePause();else setSheet(lesson.connected?'reply':'connect');}
  async function exportPage(){
    if(!editor)return;const ids=[...editor.getCurrentPageShapeIds()];if(!ids.length){lesson.notify('Write or draw something first, then export your page.');return;}
    try{const result=await editor.toImageDataUrl(ids,{format:'png',background:true,padding:40});const link=document.createElement('a');link.href=result.url;link.download='prodigy-notebook.png';link.click();}catch{lesson.notify('This page could not be exported. Some embedded media may not support export.');}
  }
  return <main className="app">
    <header className="app-header"><a className="wordmark" href="/" aria-label="Prodigy home">Prodigy<span className="brand-dot"/></a><span className="header-rule"/><div className="lesson-breadcrumb"><span>Learn together</span><ChevronRight size={13}/>{editor?<LessonName editor={editor}/>:<strong>Your canvas</strong>}</div><div className="header-actions"><button className={`connection ${lesson.connected?'online':''}`} onClick={()=>setSheet('connect')} title="Tutor connection"><span/>{lesson.connected?'Connected':'Connect tutor'}</button><button className="notebook-button" onClick={()=>setNotebook(!notebook)}><BookOpen size={17}/><span>Lesson notebook</span></button><button className="avatar" title="Your learning space" onClick={()=>setNotebook(!notebook)}>S</button></div></header>
    <section className="canvas-area" aria-label="Shared learning canvas" onPointerDown={e=>{if((e.target as HTMLElement).closest('.tl-canvas'))lesson.stopFollowing();}} onWheel={()=>lesson.stopFollowing()}>
      <Tldraw hideUi persistenceKey="prodigy-canvas-v1" onMount={ed=>{ed.user.updateUserPreferences({colorScheme:'light'});ed.updateInstanceState({isGridMode:true});setEditor(ed);}}><Toolbar/></Tldraw>
    </section>
    {!hasContent && <div className="welcome"><span className="welcome-mark"><Leaf size={28} strokeWidth={1.3}/></span><p className="welcome-kicker">Let curiosity lead.</p><h1>Big ideas start<br/>with a little scribble.</h1><p>A space to wonder, work things out,<br/>and learn together with your tutor.</p><button className="primary" onClick={()=>setSheet('connect')}>Start learning <ArrowUpRight size={17}/></button><span className="welcome-note">Or pick up a pencil and make this space yours.</span></div>}
    {hasContent && <div className="canvas-caption"><span className="tiny-leaf"><Leaf size={14}/></span><span>Your thinking belongs here.</span></div>}
    {!lesson.follow&&hasContent&&<button className="follow-button" onClick={lesson.resumeFollowing}><Focus size={16}/>Back to the lesson</button>}
    {editor&&<CanvasControls editor={editor} fit={lesson.fit}/>}
    <div className="bottom-actions"><button title="Type a reply" aria-label="Type a reply" onClick={()=>setSheet('reply')}><Keyboard size={19}/></button><button title="Lesson conversation" aria-label="Lesson conversation" onClick={()=>setSheet('transcript')}><MessageCircle size={18}/></button><button title="Export page" aria-label="Export page" onClick={exportPage}><Download size={18}/></button></div>
    {lesson.caption&&lesson.connected&&<div className={`caption ${lesson.phase==='waiting'?'question-caption':''}`} aria-live="polite"><span>{lesson.phase==='waiting'?'Take your time':lesson.simulated?'Replay narration':'Your tutor'}</span><p>{lesson.caption}</p></div>}
    <Orb phase={lesson.phase} onTap={tapOrb} onSpeech={text=>{setReply(text);setSheet('reply');}} notify={lesson.notify}/>
    {lesson.notice&&<div className="toast" role="status">{lesson.notice}<button aria-label="Dismiss notification" onClick={()=>lesson.notify('')}><X size={16}/></button></div>}
    {notebook&&editor&&<Notebook editor={editor} close={()=>setNotebook(false)}/>}
    {sheet&&<div className="sheet-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setSheet(null);}}><section ref={dialogRef} className={`sheet ${sheet==='transcript'?'transcript-sheet':''}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title"><button className="close-sheet" aria-label="Close dialog" onClick={()=>setSheet(null)}><X size={20}/></button>
      {sheet==='connect'&&<><div className="sheet-symbol"><Plug size={24}/></div><h2 id="sheet-title">Meet on the canvas.</h2><p>Connect to a lesson and watch your tutor bring ideas to life.</p><form onSubmit={e=>{e.preventDefault();if(lesson.connect(url)){localStorage.setItem('prodigy-ws',url);setSheet(null);}}}><label htmlFor="ws-url">Tutor address</label><input autoFocus id="ws-url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="ws://localhost:8080" spellCheck={false}/><button className="primary" type="submit">{lesson.connected?'Reconnect':'Connect to tutor'}<ArrowUpRight size={17}/></button></form><div className="connection-note"><Volume2 size={17}/><span>Sound is enabled when you connect. The replay tool displays narration as captions.</span></div>{lesson.connected&&<button className="text-button" onClick={()=>{lesson.disconnect();setSheet(null);}}>Disconnect and keep my notebook</button>}</>}
      {sheet==='reply'&&<><div className="sheet-symbol"><PencilIcon/></div><h2 id="sheet-title">What are you thinking?</h2><p>{lesson.question||'Share a thought, ask a question, or tell your tutor where you got stuck.'}</p><form onSubmit={e=>{e.preventDefault();if(lesson.send(reply)){setReply('');setSheet(null);}}}><textarea aria-label="Your reply" autoFocus value={reply} onChange={e=>setReply(e.target.value)} placeholder="I think…" rows={4}/><button className="primary" disabled={!reply.trim()||!lesson.connected} type="submit">Send to tutor <Send size={17}/></button></form><p className="footnote">Your drawing stays in your notebook. This connection accepts text replies; image sharing is not supported yet.{!lesson.connected&&' Connect to your tutor to send.'}</p></>}
      {sheet==='transcript'&&<><h2 id="sheet-title">Our conversation</h2><p>Catch a thought you want to revisit.</p><div className="conversation">{lesson.entries.length?lesson.entries.map((entry,index)=><article className={entry.kind==='you'?'from-you':''} key={index}><span>{entry.kind==='you'?'You':entry.kind==='lesson'?'Lesson':'Prodigy'}</span><p>{entry.text}</p></article>):<p className="empty-conversation">Your lesson conversation will appear here when you connect.</p>}</div></>}
    </section></div>}
  </main>;
}
function PencilIcon(){return <Leaf size={24}/>;}
