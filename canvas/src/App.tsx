import {ConnectionOptions} from './ConnectionOptions';
import {CameraCapture,PagePreview} from './CameraCapture';
import {PageStackUtil,PageStackContext,addPageStack} from './PageStack';
import type {CameraPage} from './cameraPages';
import {Appreciation} from './appreciation';
import {LessonEmbedUtil,LessonVideoUtil,VideoCardContext} from './VideoCard';
import { useEffect, useState, useRef } from 'react';
import { Tldraw, DefaultColorStyle, type Editor, useValue } from 'tldraw';
import {QuestionFrameUtil} from './QuestionFrame';
import {VideoLesson} from './VideoLesson';
import {upgradeQuestionLayout} from './questions';
import { ArrowUpRight, ArrowLeft, BookOpen, X, Send, Focus, Minus, Plus, Download, Leaf } from 'lucide-react';
import { Toolbar } from './Toolbar';
import {LessonNotifications} from './LessonNotifications';
import { Orb } from './Orb';
import {HelpChips} from './HelpChips';
import {InputHints,learnedInput} from './InputHints';
import {McqShapeUtil,McqContext} from './McqShape';
import type {ChoiceAttempt} from './mcq';
import { Notebook } from './Notebook';
import {initialTutorUrl,successfulTutors} from './tutorUrl';
import {StudentWork,type MediaInput} from './studentWork';
import { ModelShapeUtil } from './models/ModelShape';
import {FunctionGraphShapeUtil,GraphActivityContext} from './models/FunctionGraphShape';
const modelShapeUtils=[PageStackUtil,LessonEmbedUtil,LessonVideoUtil,McqShapeUtil,ModelShapeUtil,FunctionGraphShapeUtil,QuestionFrameUtil.configure({getCustomDisplayValues:(_editor,shape)=>shape.meta.kind==='question'?{fillColor:'transparent',strokeColor:'transparent',headingFillColor:'transparent',headingStrokeColor:'transparent',headingTextColor:'transparent',showColorsFillColor:'transparent',showColorsStrokeColor:'transparent',showColorsHeadingFillColor:'transparent',showColorsHeadingStrokeColor:'transparent',showColorsHeadingTextColor:'transparent'}:{}})];
function applyCanvasTheme(editor:Editor) {
  const theme=editor.getTheme('default');
  if(theme)editor.updateTheme({...theme,fontSize:18,colors:{...theme.colors,light:{...theme.colors.light,green:{...theme.colors.light.green,solid:'#416653',fill:'#416653'}}}});
}
import { useLesson } from './useLesson';
import 'tldraw/tldraw.css';
import './styles.css';
import './tutorSpace.css';
function LessonName({editor}:{editor:Editor}) {
  const name=useValue('lesson name',()=>editor.getCurrentPage().name,[editor]);
  return <strong>{name==='Page 1'?'Your canvas':name}</strong>;
}
function CanvasControls({editor,fit}:{editor:Editor;fit:()=>void}) {
  const zoom=useValue('zoom',()=>Math.round(editor.getZoomLevel()*100),[editor]);
  return <div className="zoom-controls"><button aria-label="Zoom out" onClick={()=>editor.zoomOut()}><Minus size={16}/></button><button onClick={fit} title="Fit lesson" aria-label="Fit lesson">{zoom}%</button><button aria-label="Zoom in" onClick={()=>editor.zoomIn()}><Plus size={16}/></button></div>;
}
export default function App() {
  const [editor,setEditor]=useState<Editor|null>(null);const lesson=useLesson(editor);
  const [sheet,setSheet]=useState<'connect'|'reply'|'transcript'|null>(null),[notebook,setNotebook]=useState(false),[reply,setReply]=useState('');
  const [recentTutors,setRecentTutors]=useState(successfulTutors);
  const [url,setUrl]=useState(()=>successfulTutors()[0]||initialTutorUrl(window.location,localStorage.getItem('prodigy-ws')));
  useEffect(()=>{if(lesson.connectionError)setSheet('connect');},[lesson.connectionError]);
  useEffect(()=>{if(lesson.connected){setRecentTutors(successfulTutors());setSheet(current=>current==='connect'?null:current);}},[lesson.connected,lesson.successfulUrl]);
  function tryConnect(address:string){setUrl(address);lesson.connect(address);}
  function connectTutor(){if(lesson.connected||lesson.phase==='connecting'){setSheet('connect');return;}const last=successfulTutors()[0];if(last)tryConnect(last);else setSheet('connect');}
  const [hasContent,setHasContent]=useState(false);
  const captionText=useRef<HTMLParagraphElement>(null);
  useEffect(()=>{const text=captionText.current;if(text)text.scrollTop=text.scrollHeight;},[lesson.caption]);
  const [preparing,setPreparing]=useState(false);
  const [camera,setCamera]=useState(false),[attachments,setAttachments]=useState<Record<string,CameraPage[]>>({}),[pagePreview,setPagePreview]=useState<string[]|null>(null);
  const canvasPage=useValue('camera attachment page',()=>editor?.getCurrentPageId()??'',[editor]);
  const cameraPages=attachments[canvasPage]??[];
  function setCameraPages(update:(pages:CameraPage[])=>CameraPage[]){setAttachments(current=>({...current,[canvasPage]:update(current[canvasPage]??[])}));}
  useEffect(()=>{setCamera(false);setPagePreview(null);},[canvasPage]);
  useEffect(()=>{if(lesson.openCamera){setCamera(true);lesson.resetOpenCamera();}},[lesson.openCamera]);
  const cameraPagesRef=useRef(cameraPages);cameraPagesRef.current=cameraPages;
  const canvasPointer=useRef<{x:number;y:number}|null>(null);
  const work=useRef<StudentWork|null>(null),sending=useRef(false),pendingAudio=useRef<MediaInput|undefined>(undefined);
  const replyRef=useRef(reply);replyRef.current=reply;
  useEffect(()=>{work.current=editor?new StudentWork(editor):null;},[editor]);
  const dialogRef=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    if(!sheet)return;
    const previous=document.activeElement as HTMLElement|null;
    const trap=(e:KeyboardEvent)=>{if(e.key!=='Tab')return;const items=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,textarea,a[href]')??[]);const first=items[0],last=items[items.length-1];if(!first)return;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}};
    const timer=setTimeout(()=>{if(!dialogRef.current?.contains(document.activeElement))dialogRef.current?.querySelector<HTMLElement>('button')?.focus();},0);
    document.addEventListener('keydown',trap);return()=>{clearTimeout(timer);document.removeEventListener('keydown',trap);previous?.focus();};
  },[sheet]);
  useEffect(()=>{if(!editor)return;const refresh=()=>setHasContent(editor.getCurrentPageShapes().length>0);refresh();return editor.store.listen(refresh);},[editor]);
  useEffect(()=>{function escape(e:KeyboardEvent){if(e.key==='Escape'){setSheet(null);setNotebook(false);}}window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
  async function sendWork(audio?:MediaInput,activity?:ChoiceAttempt):Promise<boolean>{
    if(audio)pendingAudio.current=audio;
    if(!lesson.connected){setSheet('connect');return false;}
    if(sending.current||(lesson.submission!=='idle'||lesson.tutorBusy)||!work.current||!editor)return false;
    sending.current=true;setPreparing(true);const version=lesson.connectionVersion.current,page=editor.getCurrentPageId(),draft=replyRef.current.trim(),voice=pendingAudio.current,photos=cameraPagesRef.current;
    try{
      editor.complete();
      const delta=await work.current.prepare();
      if(version!==lesson.connectionVersion.current||page!==editor.getCurrentPageId()){lesson.notify('The lesson changed. Your work is still pending.');return false;}
      const text=[draft,delta.text,photos.length?`My photographed work: ${photos.length} pages in capture order (the first ${photos.length} images).`:null].filter(Boolean).join('\n');
      const images=[...photos.map(({data,mimeType})=>({data,mimeType})),...delta.images];
      if(!text&&!voice&&!images.length&&!activity){lesson.notify('No new work to send. Draw, type, or hold the orb to speak.');return false;}
      if(lesson.send({...(activity?{activity}:{}),...(text?{text}:{}),...(voice?{audio:voice}:{}),...(images.length?{images}:{})})){
        delta.commit();
        if(photos.length){setCameraPages(current=>current.filter(p=>!photos.some(sent=>sent.id===p.id)));setCamera(false);try{addPageStack(editor,photos);}catch{lesson.notify('Your photos were sent, but the canvas preview could not be saved.');}}
        if(replyRef.current.trim()===draft)setReply('');if(pendingAudio.current===voice)pendingAudio.current=undefined;setSheet(null);return true;
      }
    }catch{lesson.notify('Could not prepare your work. It is still pending. Try sending it again.','retry');}finally{sending.current=false;setPreparing(false);}
    return false;
  }
  function tapOrb(){if(!lesson.connected){setSheet('connect');return;}void sendWork();}
  async function exportPage(){
    if(!editor)return;const ids=[...editor.getCurrentPageShapeIds()];if(!ids.length){lesson.notify('Write or draw something first, then export your page.');return;}
    try{const result=await editor.toImageDataUrl(ids,{format:'png',background:true,padding:40});const link=document.createElement('a');link.href=result.url;link.download='prodigy-notebook.png';link.click();}catch{lesson.notify('This page could not be exported. Some embedded media may not support export.');}
  }
  return <main className="app">
    <section className="canvas-area" aria-label="Shared learning canvas" onPointerDown={e=>{canvasPointer.current=(e.target as HTMLElement).closest('.tl-canvas')?{x:e.clientX,y:e.clientY}:null;}} onPointerMove={e=>{const start=canvasPointer.current;if(start&&e.buttons&&(editor?.inputs.isPanning||editor?.getCurrentToolId()==='hand'||e.buttons===4)&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8){lesson.stopFollowing();canvasPointer.current=null;}}} onPointerUp={()=>{canvasPointer.current=null;}} onPointerCancel={()=>{canvasPointer.current=null;}} onWheel={()=>lesson.stopFollowing()}>
      <PageStackContext.Provider value={setPagePreview}>
      <VideoCardContext.Provider value={{enabled:!lesson.tutorBusy&&!preparing&&!lesson.video,open:lesson.rewatch}}>
      <McqContext.Provider value={{enabled:lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'&&!preparing,submit:choice=>sendWork(undefined,choice)}}>
      <GraphActivityContext.Provider value={{enabled:lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle',submit:activity=>lesson.send({activity})}}>
        <Tldraw hideUi shapeUtils={modelShapeUtils} persistenceKey="prodigy-canvas-v1" onMount={ed=>{applyCanvasTheme(ed);ed.user.updateUserPreferences({colorScheme:'light'});ed.updateInstanceState({isGridMode:true});upgradeQuestionLayout(ed);ed.setCurrentTool('draw');ed.setStyleForNextShapes(DefaultColorStyle,'blue');setEditor(ed);}}><Toolbar/></Tldraw>
      </GraphActivityContext.Provider>
      </McqContext.Provider>
      </VideoCardContext.Provider>
      </PageStackContext.Provider>
    </section>
    {!hasContent && !lesson.connected && <div className="welcome"><span className="welcome-mark"><Leaf size={28} strokeWidth={1.3}/></span><p className="welcome-kicker">Let curiosity lead.</p><h1>Big ideas start<br/>with a little scribble.</h1><p>A space to wonder, work things out,<br/>and learn together with your tutor.</p><button className="primary" onClick={connectTutor}>Start learning <ArrowUpRight size={17}/></button><span className="welcome-note">Or pick up a pencil and make this space yours.</span></div>}
    {hasContent && <div className="canvas-caption"><span className="tiny-leaf"><Leaf size={14}/></span><span>Your thinking belongs here.</span></div>}
    {!lesson.follow&&hasContent&&<button className="follow-button" onClick={lesson.resumeFollowing}><Focus size={16}/>Back to the lesson</button>}

    <footer className="tutor-space" aria-label="Tutor and responses">
    <button className="canvas-back" aria-label="Go back" title="Go back" onClick={()=>{if(window.history.length>1)window.history.back();else setNotebook(true);}}><ArrowLeft size={18}/></button>
    <div className="lesson-tools">
      <button className="notebook-button lesson-breadcrumb" aria-label="Lesson notebook" title="Lesson notebook" onClick={()=>setNotebook(!notebook)}><BookOpen size={17}/>{editor?<LessonName editor={editor}/>:<strong>Your canvas</strong>}</button>
      <div className="lesson-tools-actions"><button className={`connection ${lesson.connected?'online':''}`} onClick={connectTutor} title="Tutor connection"><span/>{lesson.connected?'Connected':lesson.phase==='connecting'?'Connecting…':'Connect tutor'}</button>
    <div className="footer-utilities">{editor&&<CanvasControls editor={editor} fit={lesson.fit}/>}<button title="Export page" aria-label="Export page" onClick={exportPage}><Download size={16}/></button></div>
      </div>
    </div>
    {lesson.caption&&lesson.connected&&<div className={`caption ${lesson.phase==='waiting'?'question-caption':''}`} aria-live="polite"><span>{lesson.phase==='waiting'?'Take your time':lesson.simulated?'Replay narration':'Your tutor'}</span><p ref={captionText} tabIndex={0} aria-label="Tutor captions">{lesson.caption}</p></div>}
    <Orb pageCount={cameraPages.length} onCamera={()=>setCamera(true)} tutorBusy={lesson.tutorBusy} phase={lesson.phase} submission={lesson.submission} preparing={preparing} watching={!!lesson.video} onTap={tapOrb} onAudio={audio=>{learnedInput('speak');void sendWork(audio);}} onRecording={lesson.recording} notify={lesson.notify}/>
    </footer>
    {editor&&<Appreciation editor={editor}/>}
    {editor&&<HelpChips editor={editor} turn={lesson.endedTurns} ready={lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'&&!preparing&&!lesson.video&&!camera&&!pagePreview&&!sheet&&!notebook&&!lesson.issue&&['ready','waiting'].includes(lesson.phase)} canRepeat={lesson.canRepeat} repeat={lesson.repeatNarration} send={text=>lesson.send(text)}/>}
    {editor&&<InputHints key={lesson.connectionVersion.current} editor={editor} turn={lesson.endedTurns} ready={lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'&&!preparing&&['ready','waiting'].includes(lesson.phase)} blocked={!!lesson.video||camera||!!pagePreview||!!sheet||notebook}/>}
    {camera&&<CameraCapture pages={cameraPages} add={p=>setCameraPages(current=>[...current,p])} remove={id=>setCameraPages(current=>current.filter(p=>p.id!==id))} close={()=>setCamera(false)} send={()=>{void sendWork();}} busy={preparing} canSend={lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'}/> }
    {pagePreview&&<PagePreview urls={pagePreview} close={()=>setPagePreview(null)}/>}
    {lesson.video&&<VideoLesson rewatching={lesson.rewatching} media={lesson.video} onDone={lesson.doneWatching}/>}
    <LessonNotifications warnings={lesson.warnings} clear={lesson.clearWarnings} issue={lesson.video?null:lesson.issue} dismiss={lesson.dismissIssue} act={action=>{lesson.dismissIssue();if(action==='retry')void sendWork();else if(action==='sound')void lesson.enableSound();else setSheet(action==='reply'?'reply':'connect');}}/>
    {notebook&&editor&&<Notebook editor={editor} connected={lesson.connected} close={()=>setNotebook(false)}/>}
    {sheet&&<div className="sheet-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setSheet(null);}}><section ref={dialogRef} className={`sheet ${sheet==='transcript'?'transcript-sheet':sheet==='connect'?'connection-sheet':''}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title"><button className="close-sheet" aria-label="Close dialog" onClick={()=>setSheet(null)}><X size={20}/></button>
      {sheet==='connect'&&<ConnectionOptions url={url} setUrl={setUrl} recent={recentTutors} connected={lesson.connected} connecting={lesson.phase==='connecting'} error={lesson.connectionError} connect={tryConnect} disconnect={()=>{lesson.disconnect();setSheet(null);}}/>}
      {sheet==='reply'&&<><div className="sheet-symbol"><PencilIcon/></div><h2 id="sheet-title">What are you thinking?</h2><p>{lesson.question||'Share a thought, ask a question, or tell your tutor where you got stuck.'}</p><form onSubmit={e=>{e.preventDefault();void sendWork();}}><textarea aria-label="Your reply" autoFocus value={reply} onChange={e=>setReply(e.target.value)} placeholder="I think…" rows={4}/><button className="primary" disabled={!reply.trim()||!lesson.connected||preparing||(lesson.submission!=='idle'||lesson.tutorBusy)} type="submit">Send to tutor <Send size={17}/></button></form><p className="footnote">New canvas work is included with your reply. Your notebook stays on this device.{!lesson.connected&&' Connect to your tutor to send.'}</p></>}
      {sheet==='transcript'&&<><h2 id="sheet-title">Our conversation</h2><p>Catch a thought you want to revisit.</p><div className="conversation">{lesson.entries.length?lesson.entries.map((entry,index)=><article className={entry.kind==='you'?'from-you':''} key={index}><span>{entry.kind==='you'?'You':entry.kind==='lesson'?'Lesson':'Prodigy'}</span><p>{entry.text}</p></article>):<p className="empty-conversation">Your lesson conversation will appear here when you connect.</p>}</div></>}
    </section></div>}
  </main>;
}
function PencilIcon(){return <Leaf size={24}/>;}
