import TestConcept from './TestConcept';
import {useEffect,useRef,useState,type ReactNode,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight,Check,ChevronRight,Copy,GraduationCap,Leaf,LogOut,Plus,Printer,School,Users,X} from 'lucide-react';
import {request,creationAttempt,preview,readIdentity,rememberIdentity,normalizeCode,validCode,type Identity,type Student,type Adult,type Role,type Classroom,type LessonSession} from './api';
import {googleLogin,googleLogout} from './google';
import './journey.css';
import BulkStudents from './BulkStudents';
import StudentLearning from './StudentLearning';
import ChildSetup from './ChildSetup';
import ClassTopics from './ClassTopics';
import TopicPicker from './TopicPicker';
import {getNext,type Assignment,type NextLearning} from './learning';

type Dialog = 'test'|'join'|'child'|'class'|'student'|'roles'|'topics'|null;
type AccessSlip={name:string;code:string;kind:'student'|'class';student?:Student};
const grades=['Not in school yet',...Array.from({length:12},(_,i)=>`Grade ${i+1}`),'Mixed grades','Other'];
function Grade({onChange}:{onChange?:(value:string)=>void}){return <label>Grade<select name="grade" defaultValue="Grade 7" onChange={e=>onChange?.(e.target.value)}>{grades.map(g=><option key={g}>{g}</option>)}</select></label>;}
function Modal({title,children,close}:{title:string;children:ReactNode;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const el=ref.current;el?.showModal();return()=>el?.close();},[]);
  return <dialog className="journey-dialog" ref={ref} onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===e.currentTarget)close();}}><header><h2>{title}</h2><button type="button" className="j-icon" aria-label="Close dialog" onClick={close}><X size={20}/></button></header>{children}</dialog>;
}
function Form({onSubmit,children,busy,label}:{onSubmit:(form:FormData)=>void;children:ReactNode;busy:boolean;label:string}){
  return <form className="j-form" onSubmit={(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();onSubmit(new FormData(e.currentTarget));}}>{children}<button className="j-primary" disabled={busy}>{busy?'One moment…':label}<ArrowRight size={18}/></button></form>;
}
function CodeField({name='code',label='Student access code',value}:{name?:string;label?:string;value?:string}){
  const clean=(text:string)=>text.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
  const [code,setCode]=useState(()=>clean(value??'')),[position,setPosition]=useState(0),[focused,setFocused]=useState(false);
  const input=useRef<HTMLInputElement>(null);
  useEffect(()=>{setCode(clean(value??''));},[value]);
  return <label>{label}<span className="j-code-entry" onPointerDown={e=>{
    e.preventDefault();const bounds=e.currentTarget.getBoundingClientRect();const index=Math.min(code.length,5,Math.max(0,Math.floor((e.clientX-bounds.left)/bounds.width*6)));
    input.current?.focus();input.current?.setSelectionRange(index,Math.min(index+1,code.length));setPosition(index);
  }}><input ref={input} className="j-code-input" aria-label={label} name={name} value={code} required maxLength={6} minLength={6} autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onSelect={e=>setPosition(Math.min(5,e.currentTarget.selectionStart??0))} onChange={e=>{setCode(clean(e.currentTarget.value));setPosition(Math.min(5,e.currentTarget.selectionStart??0));}} onPaste={e=>{e.preventDefault();const next=clean(e.clipboardData.getData('text'));setCode(next);setPosition(Math.min(5,next.length));requestAnimationFrame(()=>input.current?.setSelectionRange(next.length,next.length));}}/><span className="j-code-boxes" aria-hidden="true">{Array.from({length:6},(_,i)=><span key={i} className={focused&&position===i?'active':''}>{code[i]||''}</span>)}</span></span></label>;
}
function Art(){return <div className="j-art j-savanna" aria-hidden="true"><div className="j-art-note">A little curiosity.<br/>A world of possibility.</div><img src="/images/savanna.jpg" alt="" width="740" height="578"/></div>;}


export default function Journey(){
  const [identity,setIdentity]=useState<Identity|null>(readIdentity);
  const [entry,setEntry]=useState<'student'|'adult'|'help'>('student');
  const [classes,setClasses]=useState<Classroom[]>([]),[students,setStudents]=useState<Student[]>([]);
  const [selected,setSelected]=useState<Classroom|null>(null),[roster,setRoster]=useState<Student[]>([]),[asChild,setAsChild]=useState<Student|null>(()=>{try{const saved=JSON.parse(sessionStorage.getItem('prodigy-journey-child')||'null');return identity?.type==='adult'&&saved?.userId===identity.userId?saved.student:null;}catch{return null;}});
  const [tab,setTab]=useState<Role>(()=>identity?.type==='adult'&&!identity.roles.includes('teacher')?'parent':'teacher'),[dialog,setDialog]=useState<Dialog>(null),[slip,setSlip]=useState<AccessSlip|null>(null);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[revision,setRevision]=useState(0),[copied,setCopied]=useState(false);
  const [confirmReset,setConfirmReset]=useState(false);
  const [roles,setRoles]=useState<Role[]>([]);
  const [setupGrade,setSetupGrade]=useState('Grade 7'),[topics,setTopics]=useState<Assignment[]>([]),[topicsReady,setTopicsReady]=useState(false);
  useEffect(()=>{setSetupGrade('Grade 7');setTopics([]);setTopicsReady(false);},[dialog]);
  const initialJoin=new URLSearchParams(location.search).get('join')||'';
  const [pendingJoin,setPendingJoin]=useState(initialJoin);
  useEffect(()=>{if(identity?.type==='adult'&&asChild)sessionStorage.setItem('prodigy-journey-child',JSON.stringify({userId:identity.userId,student:asChild}));else sessionStorage.removeItem('prodigy-journey-child');},[identity,asChild]);
  const student=asChild??(identity?.type==='student'?identity:null);
  const adult=identity?.type==='adult'?identity:null;
  function route(path:string){history.pushState({},'',path+(preview?'?preview=1':''));}
  function login(value:Identity,remember=false){route('/home');rememberIdentity(value,remember);setIdentity(value);setSelected(null);setAsChild(null);setError('');if(value.type==='adult'){setTab(value.roles.includes('teacher')?'teacher':'parent');setRoles(value.roles);}}
  function openClass(c:Classroom){route('/classes/'+c.id);setSelected(c);}
  useEffect(()=>{
    function restore(){
      const [kind,id]=location.pathname.split('/').slice(1);
      if(kind==='classes'&&classes.length){const found=classes.find(c=>c.id===id);if(found)setSelected(found);else{route('/home');setSelected(null);}}
      else if(kind==='students'&&adult&&students.length){const found=students.find(s=>s.studentId===id);if(found)setAsChild(found);else{route('/home');setAsChild(null);}}
      else if(kind==='home'){setSelected(null);setAsChild(null);}
    }
    restore();window.addEventListener('popstate',restore);return()=>window.removeEventListener('popstate',restore);
  },[classes,students]);
  async function showCode(s:Student){await action(async()=>{const result=await request<{code:string|null}>(`/students/${s.studentId}/code`);setConfirmReset(false);setCopied(false);setSlip({name:s.name,kind:'student',code:result.code??'',student:s});});}
  async function action(work:()=>Promise<void>){if(busy)return;setBusy(true);setError('');setNotice('');try{await work();}catch(e){setError((e as Error).message||'Something went wrong. Please try again.');}finally{setBusy(false);}}
  useEffect(()=>{
    if(!identity)return;
    let current=true;setLoading(true);setError('');
    const query=student?`studentId=${encodeURIComponent(student.studentId)}`:`userId=${encodeURIComponent(adult!.userId)}`;
    Promise.all([request<Classroom[]>(`/classrooms?${query}`),student?Promise.resolve([]):request<Student[]>(`/students?${query}`)])
      .then(([rooms,items])=>{if(!current)return;setClasses(rooms.filter(c=>c.kind!=='personal'));if(!student)setStudents(items as Student[]);const [kind,id]=location.pathname.split('/').slice(1);if(kind==='classes'&&!rooms.some(c=>c.id===id)){route('/home');setSelected(null);}if(kind==='students'&&!student&&!((items as Student[]).some(s=>s.studentId===id))){route('/home');setAsChild(null);}})
      .catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[identity,asChild,revision]);
  useEffect(()=>{
    if(!adult||student||!selected){setRoster([]);return;}
    let current=true;setLoading(true);
    request<Student[]>(`/classrooms/${encodeURIComponent(selected.id)}/students`).then(items=>{if(current)setRoster(items);}).catch(e=>{if(current)setError(e.message);}).finally(()=>{if(current)setLoading(false);});
    return()=>{current=false;};
  },[selected,adult,student,revision]);
  useEffect(()=>{if(student&&pendingJoin)setDialog('join');},[student?.studentId,pendingJoin]);
  useEffect(()=>{if(adult&&!adult.roles.length){setRoles([]);setDialog('roles');}},[adult]);
  function closeDialog(){if(busy)return;setDialog(null);setError('');if(dialog==='join')setPendingJoin('');}
  async function signOut(){await action(async()=>{if(!preview){await request('/auth/logout',{});await googleLogout();}rememberIdentity(null);route('/login');sessionStorage.removeItem('prodigy-journey-lesson');setIdentity(null);setAsChild(null);setSelected(null);setDialog(null);setSlip(null);setClasses([]);setStudents([]);setEntry('student');});}
  async function start(topicId:string,_next?:Extract<NextLearning,{status:'continue'}>){await action(async()=>{
    if(preview){setNotice('This is a preview. Your real lesson will open on the canvas when the tutor service is connected.');return;}
    const next=await getNext(student!.studentId,topicId);
    if(next.status==='completed'){setNotice('You’ve completed this topic. Choose another one to explore.');setRevision(v=>v+1);return;}
    if(next.status==='unavailable')throw new Error(next.reason);
    const session=await request<LessonSession>('/sessions',{studentId:student!.studentId,topicId,conceptId:next.conceptId,resumeSessionId:next.resumeSessionId},'agent');
    const url=new URL(session.wsUrl);if(!['ws:','wss:'].includes(url.protocol))throw new Error('The tutor returned an invalid connection address. Please try again.');
    sessionStorage.setItem('prodigy-journey-lesson',JSON.stringify({wsUrl:url.href,sessionId:session.sessionId,returnUrl:'/home',studentId:student!.studentId}));
    sessionStorage.setItem('prodigy-session-'+session.sessionId,sessionStorage.getItem('prodigy-journey-lesson')!);
    location.assign('/sessions/'+encodeURIComponent(session.sessionId));
  });}
  async function saveChild(form:FormData,chosenTopics=topics){await action(async()=>{
    const name=String(form.get('name')).trim();if(!name)throw new Error('Please enter a name.');
    const payload={userId:adult!.userId,name,grade:form.get('grade'),setupContext:dialog==='child'?'parent':'teacher',...(dialog==='child'?{topics:chosenTopics,subjectIds:[...new Set(chosenTopics.map(t=>t.subjectId))]}:{}),...(form.get('age')?{age:Number(form.get('age'))}:{})};
    const attempt=creationAttempt(dialog==='child'?'child':`student-${selected?.id}`,payload);
    const created=await request<Student&{code:string;setupStatus?:string}>('/students',{...payload,idempotencyKey:attempt.key});
    if(!created.setupStatus||created.setupStatus==='ready')attempt.done();
    if(created.setupStatus&&created.setupStatus!=='ready')setNotice('The profile is saved. Learning setup is still pending; refresh the learning space shortly.');
    // Keep the issued code even if enrollment needs retrying later.
    setConfirmReset(false);setSlip({name:created.name,code:created.code,kind:'student',student:created});setDialog(null);setRevision(v=>v+1);
    if(selected&&dialog==='student'){
      try{await request(`/classrooms/${selected.id}/students`,{studentId:created.studentId});}
      catch{throw new Error('The profile was created, but could not be added to this class. Save the code, then use Add student → existing profile to try again.');}
      finally{setRevision(v=>v+1);}
    }
  });}
  async function copyCode(){if(!slip)return;try{await navigator.clipboard.writeText(slip.code);setCopied(true);}catch{setError('Copy is unavailable. Select the code and copy it, or print the slip.');}}
  return <div className="journey">
    {preview&&<div className="j-preview"><span>Preview · Sample accounts and changes stay on this device.</span><a href="/home">Exit preview</a></div>}
    <header className="j-header"><a className="j-brand" href={preview?'/home?preview=1':'/home'}>Prodigy<span>.</span></a>{identity&&<div className="j-account"><button className="j-logout" onClick={()=>setDialog('test')}>Test a concept</button><span className="j-avatar">{identity.name.charAt(0)}</span><span>{identity.name}</span><button className="j-logout" onClick={()=>void signOut()} disabled={busy} aria-label={identity.type==='student'?'Switch student':'Sign out'} title={identity.type==='student'?'Switch student':'Sign out'}><LogOut size={18}/>{identity.type==='student'?'Switch student':'Sign out'}</button></div>}</header>
    {!identity?<main className="j-entry"><Art/><section className="j-entry-panel"><div className="j-entry-tabs" role="group" aria-label="Sign-in type"><button className={entry!=='adult'?'active':''} onClick={()=>{setEntry('student');setError('');}}>I’m a student</button><button className={entry==='adult'?'active':''} onClick={()=>{setEntry('adult');setError('');}}>Parent or teacher</button></div>
      {entry==='student'?<><p>Enter your code. Your tutor will meet you there.</p>{pendingJoin&&<div className="j-callout">Sign in first, then join your teacher’s class.</div>}<Form busy={busy} label="Let’s get started" onSubmit={form=>void action(async()=>{const code=normalizeCode(String(form.get('code')));if(!validCode(code))throw new Error('Use the 6-character code from your parent or teacher.');const profile=await request<Student>('/auth/student',{code});login({type:'student',...profile},form.has('remember'));})}><CodeField/><label className="j-check"><input type="checkbox" name="remember"/><span>Remember me on this device<small>Only on a device you use yourself.</small></span></label></Form><button className="j-link" onClick={()=>setEntry('help')}>Need help finding your code?</button>{preview&&<p className="j-preview-hint">Try student code <b>K7M9R2</b>. Join a class with <b>B3MN8P</b>.</p>}</>:entry==='adult'?<><h1>A little support.<br/>A lot of possibility.</h1><p>Help a child discover what they can do. Set up their learning space in a few simple steps.</p><button className="j-google" disabled={busy} onClick={()=>void action(async()=>{if(!preview)await googleLogin();const user=await request<Adult>('/auth/google',{});login({type:'adult',...user});})}><span className="j-google-g">G</span>{busy?'Signing in…':preview?'Try adult setup':'Continue with Google'}</button><p className="j-muted">For parents and teachers. Children only need their student access code.</p></>:<><h1>Let’s find your code.</h1><p>Your parent or teacher has your six-character student access code. Ask them for it, or ask them to create your profile.</p><button className="j-primary" onClick={()=>setEntry('student')}><ArrowLeft size={18}/> Back to sign in</button><button className="j-link" onClick={()=>setEntry('adult')}>I’m a parent or teacher</button></>}
      {error&&<div className="j-error" role="alert">{error}</div>}
    </section></main>:<main className="j-dashboard">
      {asChild&&<div className="j-child-banner"><span>Learning as {asChild.name}</span><button className="j-link" onClick={()=>{route('/home');setAsChild(null);setSelected(null);}}>Back to your dashboard</button></div>}
      <div className="j-page-title"><div>{selected?<><button className="j-link j-back" onClick={()=>{route('/home');setSelected(null);setError('');}}><ArrowLeft size={16}/> {student?'My learning':'My classes'}</button><h1>{selected.name}</h1><p>{selected.grade} · {selected.subject}</p></>:<><h1>{student?`Hi, ${student.name.split(' ')[0]}.`:`Welcome, ${adult?.name.split(' ')[0]}.`}</h1><p>{student?'What would you like to discover today?':'Make a little room for learning.'}</p></>}</div>
        {student?<button className="j-secondary" onClick={()=>{setError('');setDialog('join');}}><Plus size={18}/> Join a class</button>:<button className="j-primary" disabled={!adult?.roles.length} onClick={()=>{setError('');setDialog(selected?'student':tab==='teacher'?'class':'child');}}><Plus size={18}/>{selected?'Add student':tab==='teacher'?'Create a class':'Add a child'}</button>}
      </div>
      {error&&!dialog&&!slip&&<div className="j-error" role="alert">{error}<button className="j-link" onClick={()=>setRevision(v=>v+1)}>Try again</button></div>}
      {notice&&<div className="j-notice" role="status"><Check size={18}/>{notice}<button className="j-icon" aria-label="Dismiss message" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {loading&&<p className="j-loading" role="status">Getting your learning space ready…</p>}
      {student?<>
        <StudentLearning classes={classes} studentId={student.studentId} revision={revision} busy={busy} start={(topic,next)=>void start(topic,next)}/>
      </>:<>
        {!selected&&<div className="j-adult-tabs"><div role="group" aria-label="Dashboard view">{adult?.roles.map(role=><button className={tab===role?'active':''} key={role} onClick={()=>setTab(role)}>{role==='teacher'?'My classes':'My children'}</button>)}</div><button className="j-link" onClick={()=>{setRoles(adult?.roles??[]);setDialog('roles');}}>Change roles</button></div>}
        {selected?<section className="j-section"><div className="j-section-title"><button className="j-secondary" onClick={()=>setDialog('topics')}>Choose topics</button><h2>Students <span className="j-count">{roster.length}</span></h2><button className="j-link" onClick={()=>void action(async()=>{const result=await request<{code:string}>(`/classrooms/${selected.id}/reset-code`,{userId:adult!.userId});setCopied(false);setSlip({name:selected.name,code:result.code,kind:'class'});})}>Create a new invitation code</button></div><p className="j-muted">A new invitation replaces the old code. Students already in this class stay enrolled.</p>{roster.length?<div className="j-student-list">{roster.map(s=><div className="j-student-row" key={s.studentId}><span className="j-avatar">{s.name[0]}</span><div><strong>{s.name}</strong><small>{s.grade}</small></div><button className="j-link" onClick={()=>void showCode(s)}>View code</button></div>)}</div>:!loading&&<div className="j-empty"><Users size={35}/><h2>Your class is ready for its first students.</h2><p>Add a new student, or share an invitation with students who already use Prodigy.</p><button className="j-secondary" onClick={()=>setDialog('student')}><Plus size={18}/> Add student</button></div>}</section>:tab==='teacher'?<section className="j-section">{classes.length?<div className="j-class-grid">{classes.map(c=><button className="j-class-card" key={c.id} onClick={()=>openClass(c)}><School size={27}/><span><strong>{c.name}</strong><small>{c.subject} · {c.grade}</small></span><ChevronRight size={20}/></button>)}</div>:!loading&&<div className="j-empty"><School size={36}/><h2>A class starts with you.</h2><p>Create a class, invite your students, and give everyone a space to learn.</p><button className="j-primary" onClick={()=>setDialog('class')}>Create your first class</button></div>}<aside className="j-tip"><Leaf size={20}/><p>One child, one learning journey. Students can join your class with their existing profile.</p></aside></section>:<section className="j-section">{students.length?<div className="j-children">{students.map(s=><article className="j-child-card" key={s.studentId}><span className="j-child-avatar">{s.name[0]}</span><h2>{s.name}</h2><p>{s.grade}</p><button className="j-primary" onClick={()=>{route('/students/'+s.studentId);setAsChild(s);setSelected(null);}}>Open learning space <ArrowRight size={17}/></button><button className="j-link" onClick={()=>void showCode(s)}>View access code</button></article>)}</div>:!loading&&<div className="j-empty"><GraduationCap size={38}/><h2>Their next discovery starts here.</h2><p>Add your child’s profile. We’ll give them a code they can use to come back on their own.</p><button className="j-primary" onClick={()=>setDialog('child')}>Add your first child</button></div>}</section>}
      </>}
    </main>}
    <footer className="j-footer"><Leaf size={15}/><span>A little progress, every day.</span><a href="/home">Home</a></footer>
    {dialog&&identity&&<Modal title={dialog==='test'?'Test a concept':dialog==='topics'?'Class topics':dialog==='roles'?'How will you use Prodigy?':dialog==='join'?'Join your class':dialog==='class'?'Create a class':dialog==='student'?'Add a student':'Add your child'} close={closeDialog}>
      {dialog==='test'?<TestConcept/>:dialog==='child'?<ChildSetup busy={busy} save={(form,chosen)=>void saveChild(form,chosen)}/>:dialog==='topics'&&selected?<ClassTopics classroom={selected} onSaved={()=>setRevision(v=>v+1)}/>:dialog==='roles'?<><p>Choose one or both. You can change this later.</p><div className="j-role-options">{(['parent','teacher'] as Role[]).map(role=><button key={role} aria-pressed={roles.includes(role)} className={roles.includes(role)?'active':''} onClick={()=>setRoles(old=>old.includes(role)?old.filter(r=>r!==role):[...old,role])}>{role==='parent'?<Users/>:<School/>}<span><strong>I’m a {role}</strong><small>{role==='parent'?'Support my child’s learning':'Create classes for my students'}</small></span>{roles.includes(role)&&<Check size={20}/>}</button>)}</div><button className="j-primary" disabled={busy||!roles.length} onClick={()=>void action(async()=>{const updated=await request<Adult>('/me',{userId:adult!.userId,roles});login({type:'adult',...updated,token:adult!.token});setDialog(null);})}>{busy?'Saving…':'Continue'}<ArrowRight size={18}/></button></>:dialog==='join'?<><p>Your teacher has a class code for you. It’s different from your student access code.</p><Form busy={busy} label="Join class" onSubmit={form=>void action(async()=>{const code=normalizeCode(String(form.get('classCode')));if(!validCode(code))throw new Error('Enter the 6-character class code from your teacher.');const joined=await request<{name:string;status:string}>('/classrooms/join',{studentId:student!.studentId,classCode:code});setNotice(joined.status==='already_joined'?`You’re already in ${joined.name}.`:`You’ve joined ${joined.name}.`);setDialog(null);setPendingJoin('');setRevision(v=>v+1);})}><CodeField name="classCode" label="Class code" value={pendingJoin}/></Form></>:dialog==='class'?<Form busy={busy||!topicsReady} label="Create class" onSubmit={form=>void action(async()=>{const name=String(form.get('name')).trim();if(!name)throw new Error('Please give your class a name.');const payload={userId:adult!.userId,name,grade:form.get('grade'),topics,subjectIds:[...new Set(topics.map(t=>t.subjectId))]};const attempt=creationAttempt('class',payload);const created=await request<{id?:string;classroomId:string;classCode:string}>('/classrooms',{...payload,idempotencyKey:attempt.key});attempt.done();setSlip({name,code:created.classCode,kind:'class'});setCopied(false);setDialog(null);setRevision(v=>v+1);})}><label>Class name<input name="name" placeholder="e.g. Grade 7 Maths" required maxLength={80}/></label><Grade onChange={setSetupGrade}/><TopicPicker grade={setupGrade} value={topics} onChange={setTopics} onReady={setTopicsReady}/></Form>:<><p>{dialog==='student'?'Already using Prodigy? Ask the student to join with their existing profile using your class code.':'Give your child a space of their own. They won’t need a Google account.'}</p><Form busy={busy} label={dialog==='student'?'Create student profile':'Create child profile'} onSubmit={form=>void saveChild(form)}><label>{dialog==='student'?'Student’s name':'What should we call your child?'}<input name="name" required maxLength={80} autoComplete="off"/></label><div className="j-form-pair"><Grade onChange={setSetupGrade}/><label><span>Age <span className="j-optional">(optional)</span></span><input name="age" type="number" min={3} max={25}/></label></div></Form>{dialog==='student'&&selected&&<BulkStudents userId={adult!.userId} classroomId={selected.id} grade={selected.grade} onChange={()=>setRevision(v=>v+1)}/>} {dialog==='student'&&students.filter(s=>!roster.some(r=>r.studentId===s.studentId)).length>0&&<div className="j-existing"><h3>Or add an existing profile</h3>{students.filter(s=>!roster.some(r=>r.studentId===s.studentId)).map(s=><button key={s.studentId} className="j-link" disabled={busy} onClick={()=>void action(async()=>{await request(`/classrooms/${selected!.id}/students`,{studentId:s.studentId});setDialog(null);setRevision(v=>v+1);})}><Plus size={16}/>{s.name} · {s.grade}</button>)}</div>}</>}
      {error&&<div className="j-error" role="alert">{error}</div>}
    </Modal>}
    {slip&&<Modal title={slip.kind==='student'?'Their own way back in.':'Your class is ready.'} close={()=>{setSlip(null);setCopied(false);setError('');}}><div className="j-access-slip"><p>{slip.name}</p><span>{slip.kind==='student'?'Student access code':'Class invitation code'}</span><strong>{slip.code||'Not available yet'}</strong>{!slip.code&&<p>This older profile needs a one-time reset to display its code.</p>}<p className="j-muted">{slip.kind==='student'?'Keep this code private. Use it to sign in to Prodigy.':'Share this code with your students. They’ll sign in with their own student code to join.'}</p></div><p className="j-muted">You can view or reset this code from the student profile.</p><div className="j-actions"><button className="j-secondary" disabled={!slip.code||busy} onClick={()=>void copyCode()}>{copied?<Check size={17}/>:<Copy size={17}/>} {copied?'Copied':'Copy code'}</button><button className="j-secondary" disabled={!slip.code||busy} onClick={()=>window.print()}><Printer size={17}/> Print slip</button></div>{slip.student&&(confirmReset?<div className="j-reset-confirm"><p>The old code will stop working. Their profile and learning will stay the same.</p><div className="j-actions"><button className="j-secondary" disabled={busy} onClick={()=>setConfirmReset(false)}>Keep current code</button><button className="j-secondary" disabled={busy} onClick={()=>void action(async()=>{const result=await request<{code:string}>(`/students/${slip.student!.studentId}/reset-code`,{userId:adult!.userId});setSlip({...slip,code:result.code});setConfirmReset(false);setCopied(false);})}>Create new code</button></div></div>:<button className="j-link" disabled={busy} onClick={()=>setConfirmReset(true)}>Reset access code</button>)}{error&&<div className="j-error" role="alert">{error}</div>}<button className="j-primary" onClick={()=>{setSlip(null);setCopied(false);setError('');}}>I’ve saved it <Check size={17}/></button></Modal>}

  </div>;
}
