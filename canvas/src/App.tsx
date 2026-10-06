import {launchTest} from './journey/TestConcept';
import {PracticeQuestionUtil,PracticeHeader} from './PracticeQuestion';
import {request} from './journey/api';
import {getNext,type NextLearning} from './journey/learning';
import {NotebookSync,type LessonBinding} from './notebookStorage';
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
const modelShapeUtils=[PracticeQuestionUtil,PageStackUtil,LessonEmbedUtil,LessonVideoUtil,McqShapeUtil,ModelShapeUtil,FunctionGraphShapeUtil,QuestionFrameUtil.configure({getCustomDisplayValues:(_editor,shape)=>shape.meta.kind==='question'?{fillColor:'transparent',strokeColor:'transparent',headingFillColor:'transparent',headingStrokeColor:'transparent',headingTextColor:'transparent',showColorsFillColor:'transparent',showColorsStrokeColor:'transparent',showColorsHeadingFillColor:'transparent',showColorsHeadingStrokeColor:'transparent',showColorsHeadingTextColor:'transparent'}:{}})];
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
  const [sheet,setSheet]=useState<'connect'|'reply'|'transcript'|null>(location.pathname==='/test-session'?'connect':null),[notebook,setNotebook]=useState(false),[reply,setReply]=useState('');
  const [recentTutors,setRecentTutors]=useState(successfulTutors);
  const [url,setUrl]=useState(()=>successfulTutors()[0]||initialTutorUrl(window.location,localStorage.getItem('prodigy-ws')));
  useEffect(()=>{if(lesson.connectionError)setSheet('connect');},[lesson.connectionError]);
  useEffect(()=>{if(lesson.connected){setRecentTutors(successfulTutors());setSheet(current=>current==='connect'?null:current);}},[lesson.connected,lesson.successfulUrl]);
  const reconnecting=useRef(false);
  async function tryConnect(address:string){
    if(reconnecting.current)return;
    // Managed lessons need a current ticket, especially after the server restarts.
    if(binding&&location.pathname.startsWith('/sessions/')){
      reconnecting.current=true;
      try {
        const fresh=await request<LessonBinding>('/sessions/'+encodeURIComponent(binding.sessionId),undefined,'agent');
        if(fresh.completed){Object.assign(binding,fresh);setFinished(true);setReviewNotebook(false);setSheet(null);lesson.disconnect();return;}
        sessionStorage.setItem('prodigy-journey-lesson',JSON.stringify(fresh));
        binding.sessionId=fresh.sessionId;binding.wsUrl=fresh.wsUrl;
        window.history.replaceState(null,'','/sessions/'+encodeURIComponent(fresh.sessionId));
        setUrl(fresh.wsUrl);lesson.connect(fresh.wsUrl);
      } catch {
        lesson.notify('Your tutor is not available yet. Check that the server is running, then reconnect. Your canvas is still here.','connect');
      } finally {reconnecting.current=false;}
      return;
    }
    setUrl(address);lesson.connect(address);
  }
  function connectTutor(){if(isComplete||reviewNotebook||openingNotebook||notebookError)return;if(lesson.connected||lesson.phase==='connecting'){setSheet('connect');return;}const last=successfulTutors()[0];if(last)tryConnect(last);else setSheet('connect');}
  const [binding]=useState<LessonBinding|null>(()=>location.pathname==='/test-session'?null:JSON.parse(sessionStorage.getItem('prodigy-journey-lesson')||'null'));
  const [finished,setFinished]=useState(!!binding?.completed),[nextLearning,setNextLearning]=useState<NextLearning|null>(null),[completionError,setCompletionError]=useState(''),[startingNext,setStartingNext]=useState(false),[completionRetry,setCompletionRetry]=useState(0);
  const isComplete=finished||lesson.completed;
  useEffect(()=>{
    if(!isComplete||!binding||binding.test)return;
    let cancelled=false;
    setCompletionError('');
    void (async()=>{
      const fresh=await request<LessonBinding>('/sessions/'+encodeURIComponent(binding.sessionId),undefined,'agent');
      const topicId=fresh.topicId??binding.topicId;
      if(!topicId)throw new Error('Open Home to choose your next lesson.');
      const next=await getNext(binding.studentId,topicId);
      if(!cancelled)setNextLearning(next);
    })().catch(e=>{if(!cancelled)setCompletionError(e.message);});
    return()=>{cancelled=true;};
  },[isComplete,binding,completionRetry]);
  async function continueLearning(){
    if(!binding||nextLearning?.status!=='continue'||startingNext)return;
    setStartingNext(true);setCompletionError('');
    try{
      await notebookSync.current?.save();
      const next=await getNext(binding.studentId,nextLearning.topicId);
      if(next.status!=='continue'){setNextLearning(next);return;}
      const session=await request<{sessionId:string}>('/sessions',{studentId:binding.studentId,topicId:next.topicId,conceptId:next.conceptId,resumeSessionId:next.resumeSessionId},'agent');
      lesson.disconnect();location.assign('/sessions/'+encodeURIComponent(session.sessionId));
    }catch(e){setCompletionError((e as Error).message);}finally{setStartingNext(false);}
  }
  const notebookSync=useRef<NotebookSync|null>(null);
  const [reviewNotebook,setReviewNotebook]=useState(false),[openingNotebook,setOpeningNotebook]=useState(false),[notebookError,setNotebookError]=useState('');
  useEffect(()=>{
    if(!editor||!binding||(!binding.wsUrl&&!binding.completed)||!location.pathname.startsWith('/sessions/'))return;
    let cancelled=false;
    const sync=new NotebookSync(editor,binding,lesson.notify);notebookSync.current=sync;
    setOpeningNotebook(true);
    void sync.restore().then(restored=>{
      if(cancelled)return;
      setOpeningNotebook(false);
      if(binding.completed){editor.setCurrentTool('hand');setFinished(true);}else if(restored&&binding.resumed!==false){editor.setCurrentTool('hand');setReviewNotebook(true);}else tryConnect(binding.wsUrl);
    }).catch(()=>{if(!cancelled){setOpeningNotebook(false);setNotebookError('We couldn’t open your notebook. Try again to keep your previous work.');}});
    const save=()=>{void sync.save(true);};
    const hidden=()=>{if(document.visibilityState==='hidden')save();};
    window.addEventListener('pagehide',save);document.addEventListener('visibilitychange',hidden);
    return()=>{cancelled=true;sync.dispose();window.removeEventListener('pagehide',save);document.removeEventListener('visibilitychange',hidden);};
  },[editor]);
  useEffect(()=>{if(lesson.savedTurn>0)void notebookSync.current?.save();},[lesson.savedTurn]);
  async function leaveLesson(){lesson.disconnect();await notebookSync.current?.save();window.location.assign('/home');}
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
    if(isComplete||sending.current||(lesson.submission!=='idle'||lesson.tutorBusy)||!work.current||!editor)return false;
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
  function tapOrb(){if(isComplete||reviewNotebook||openingNotebook||notebookError)return;if(!lesson.connected){setSheet('connect');return;}void sendWork();}
  async function exportPage(){
    if(!editor)return;const ids=[...editor.getCurrentPageShapeIds()];if(!ids.length){lesson.notify('Write or draw something first, then export your page.');return;}
    try{const result=await editor.toImageDataUrl(ids,{format:'png',background:true,padding:40});const link=document.createElement('a');link.href=result.url;link.download='prodigy-notebook.png';link.click();}catch{lesson.notify('This page could not be exported. Some embedded media may not support export.');}
  }
  return <main className="app">
    <section className="canvas-area" aria-label="Shared learning canvas" onPointerDown={e=>{canvasPointer.current=(e.target as HTMLElement).closest('.tl-canvas')?{x:e.clientX,y:e.clientY}:null;}} onPointerMove={e=>{const start=canvasPointer.current;if(start&&e.buttons&&(editor?.inputs.isPanning||editor?.getCurrentToolId()==='hand'||e.buttons===4)&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>8){lesson.stopFollowing();canvasPointer.current=null;}}} onPointerUp={()=>{canvasPointer.current=null;}} onPointerCancel={()=>{canvasPointer.current=null;}} onWheel={()=>lesson.stopFollowing()}>
      <PageStackContext.Provider value={setPagePreview}>
      <VideoCardContext.Provider value={{enabled:!lesson.tutorBusy&&!preparing&&!lesson.video,open:lesson.rewatch}}>
      <McqContext.Provider value={{enabled:!isComplete&&lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'&&!preparing,submit:choice=>sendWork(undefined,choice)}}>
      <GraphActivityContext.Provider value={{enabled:!isComplete&&lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle',submit:activity=>lesson.send({activity})}}>
        <Tldraw options={{maxPages:1000}} hideUi shapeUtils={modelShapeUtils} persistenceKey={location.pathname==='/test-session'?'prodigy-canvas-test-sessions':'prodigy-canvas-student-'+binding?.studentId} onMount={ed=>{applyCanvasTheme(ed);ed.user.updateUserPreferences({colorScheme:'light'});ed.updateInstanceState({isGridMode:true});upgradeQuestionLayout(ed);ed.setCurrentTool('draw');ed.setStyleForNextShapes(DefaultColorStyle,'blue');setEditor(ed);}}><Toolbar/></Tldraw>
      </GraphActivityContext.Provider>
      </McqContext.Provider>
      </VideoCardContext.Provider>
      </PageStackContext.Provider>
    </section>

    {editor&&<PracticeHeader editor={editor}/>}
    {!hasContent && !lesson.connected && !openingNotebook && !reviewNotebook && !notebookError && <div className="welcome"><span className="welcome-mark"><Leaf size={28} strokeWidth={1.3}/></span><p className="welcome-kicker">Let curiosity lead.</p><h1>Big ideas start<br/>with a little scribble.</h1><p>A space to wonder, work things out,<br/>and learn together with your tutor.</p><button className="primary" onClick={connectTutor}>Start learning <ArrowUpRight size={17}/></button><span className="welcome-note">Or pick up a pencil and make this space yours.</span></div>}
    {hasContent && <div className="canvas-caption"><span className="tiny-leaf"><Leaf size={14}/></span><span>Your thinking belongs here.</span></div>}
    {!lesson.follow&&hasContent&&<button className="follow-button" onClick={lesson.resumeFollowing}><Focus size={16}/>Back to the lesson</button>}

    {isComplete&&!openingNotebook&&<div className="notebook-resume" role="status"><span>Lesson complete.</span><p>{binding?.test?'Test session complete. Restart or choose another concept from Home.':nextLearning?.status==='completed'?'You’ve completed this topic.':nextLearning?.status==='continue'?'Ready for your next step?':'Finding your next step…'}</p>{nextLearning?.status==='continue'&&<button className="primary" disabled={startingNext} onClick={()=>void continueLearning()}>{startingNext?'Opening…':['clarity','mastering'].includes(nextLearning.state)?(nextLearning.resumeSessionId?'Resume practice':'Start practice'):'Continue'} <ArrowUpRight size={18}/></button>}{(completionError||nextLearning?.status==='unavailable')&&<p role="alert">{completionError||(nextLearning?.status==='unavailable'?nextLearning.reason:'')} <button onClick={()=>setCompletionRetry(v=>v+1)}>Try again</button></p>}<button disabled={startingNext} onClick={()=>void leaveLesson()}>Back to Home</button></div>}
    {!isComplete&&(openingNotebook||reviewNotebook||notebookError)&&<div className="notebook-resume" role="status">
      {openingNotebook?<span>Opening your notebook…</span>:notebookError?<><span>{notebookError}</span><button className="primary" onClick={()=>location.reload()}>Try again</button></>:<><span>Take a moment to look back.</span><button className="primary" onClick={()=>{setReviewNotebook(false);if(binding)tryConnect(binding.wsUrl);}}>Let’s start <ArrowUpRight size={18}/></button></>}
    </div>}
    <footer className="tutor-space" aria-label="Tutor and responses">
    <button className="canvas-back" aria-label="Go back" title="Go back" onClick={()=>{if(location.pathname.startsWith('/sessions/')){void leaveLesson();}else if(location.pathname==='/test-session'){lesson.disconnect();window.location.assign('/home');}else if(window.history.length>1)window.history.back();else window.location.assign('/home');}}><ArrowLeft size={18}/></button>
    <div className="lesson-tools">
      <div className="lesson-title-row"><button className="notebook-button lesson-breadcrumb" aria-label="Lesson notebook" title="Lesson notebook" onClick={()=>setNotebook(!notebook)}><BookOpen size={17}/>{editor?<LessonName editor={editor}/>:<strong>Your canvas</strong>}</button>{binding?.test&&<div className="practice-test-controls"><span>Test · {binding.test.stage}</span><button disabled={startingNext} onClick={async()=>{setStartingNext(true);try{await launchTest(binding.test!.conceptId,binding.test!.stage);}catch(e){lesson.notify((e as Error).message);setStartingNext(false);}}}>Restart</button></div>}</div>
      <div className="lesson-tools-actions"><button className={`connection ${lesson.connected?'online':''}`} onClick={connectTutor} title="Tutor connection"><span/>{lesson.connected?'Connected':lesson.phase==='connecting'?'Connecting…':'Connect tutor'}</button>

    <div className="footer-utilities">{editor&&<CanvasControls editor={editor} fit={lesson.fit}/>}<button title="Export page" aria-label="Export page" onClick={exportPage}><Download size={16}/></button></div>
      </div>
    </div>
    {lesson.caption&&lesson.connected&&<div className={`caption ${lesson.phase==='waiting'?'question-caption':''}`} aria-live="polite"><span>{lesson.phase==='waiting'?'Take your time':lesson.simulated?'Replay narration':'Your tutor'}</span><p ref={captionText} tabIndex={0} aria-label="Tutor captions">{lesson.caption}</p></div>}
    <Orb pageCount={cameraPages.length} onCamera={()=>setCamera(true)} tutorBusy={lesson.tutorBusy} phase={lesson.phase} submission={lesson.submission} preparing={preparing} watching={!!lesson.video} onTap={tapOrb} onAudio={audio=>{learnedInput('speak');void sendWork(audio);}} onRecording={lesson.recording} notify={lesson.notify}/>
    </footer>
    {editor&&<Appreciation editor={editor}/>}
    {editor&&<HelpChips editor={editor} turn={lesson.endedTurns} ready={lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'&&!preparing&&!lesson.video&&!camera&&!pagePreview&&!sheet&&!notebook&&(!lesson.issue||lesson.issue.action==='tutor-retry')&&['ready','waiting'].includes(lesson.phase)} canRepeat={lesson.canRepeat} repeat={lesson.repeatNarration} send={text=>lesson.send(text)}/>}
    {editor&&<InputHints key={lesson.connectionVersion.current} editor={editor} turn={lesson.endedTurns} ready={lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'&&!preparing&&['ready','waiting'].includes(lesson.phase)} blocked={!!lesson.video||camera||!!pagePreview||!!sheet||notebook}/>}
    {camera&&<CameraCapture pages={cameraPages} add={p=>setCameraPages(current=>[...current,p])} remove={id=>setCameraPages(current=>current.filter(p=>p.id!==id))} close={()=>setCamera(false)} send={()=>{void sendWork();}} busy={preparing} canSend={lesson.connected&&!lesson.tutorBusy&&lesson.submission==='idle'}/> }
    {pagePreview&&<PagePreview urls={pagePreview} close={()=>setPagePreview(null)}/>}
    {lesson.video&&<VideoLesson rewatching={lesson.rewatching} media={lesson.video} onDone={lesson.doneWatching}/>}
    <LessonNotifications warnings={lesson.warnings} clear={lesson.clearWarnings} issue={lesson.video?null:lesson.issue} dismiss={lesson.dismissIssue} act={action=>{lesson.dismissIssue();if(action==='connect'&&binding){void tryConnect(binding.wsUrl);}else if(action==='tutor-retry')lesson.send('Your last response was interrupted. Please continue helping with my last message, using any work I already sent.');else if(action==='retry')void sendWork();else if(action==='sound')void lesson.enableSound();else setSheet(action==='reply'?'reply':'connect');}}/>
    {notebook&&editor&&<Notebook editor={editor} beforeDelete={lesson.beforeDeletePage} close={()=>setNotebook(false)}/>}
    {sheet&&<div className="sheet-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)setSheet(null);}}><section ref={dialogRef} className={`sheet ${sheet==='transcript'?'transcript-sheet':sheet==='connect'?'connection-sheet':''}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title"><button className="close-sheet" aria-label="Close dialog" onClick={()=>setSheet(null)}><X size={20}/></button>
      {sheet==='connect'&&<ConnectionOptions url={url} setUrl={setUrl} recent={recentTutors} connected={lesson.connected} connecting={lesson.phase==='connecting'} error={lesson.connectionError} connect={tryConnect} disconnect={()=>{lesson.disconnect();setSheet(null);}}/>}
      {sheet==='reply'&&<><div className="sheet-symbol"><PencilIcon/></div><h2 id="sheet-title">What are you thinking?</h2><p>{lesson.question||'Share a thought, ask a question, or tell your tutor where you got stuck.'}</p><form onSubmit={e=>{e.preventDefault();void sendWork();}}><textarea aria-label="Your reply" autoFocus value={reply} onChange={e=>setReply(e.target.value)} placeholder="I think…" rows={4}/><button className="primary" disabled={!reply.trim()||!lesson.connected||preparing||(lesson.submission!=='idle'||lesson.tutorBusy)} type="submit">Send to tutor <Send size={17}/></button></form><p className="footnote">New canvas work is included with your reply. Your notebook stays on this device.{!lesson.connected&&' Connect to your tutor to send.'}</p></>}
      {sheet==='transcript'&&<><h2 id="sheet-title">Our conversation</h2><p>Catch a thought you want to revisit.</p><div className="conversation">{lesson.entries.length?lesson.entries.map((entry,index)=><article className={entry.kind==='you'?'from-you':''} key={index}><span>{entry.kind==='you'?'You':entry.kind==='lesson'?'Lesson':'Prodigy'}</span><p>{entry.text}</p></article>):<p className="empty-conversation">Your lesson conversation will appear here when you connect.</p>}</div></>}
    </section></div>}
  </main>;
}
function PencilIcon(){return <Leaf size={24}/>;}
