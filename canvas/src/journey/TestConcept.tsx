import {useEffect,useState} from 'react';
import {request} from './api';
import type {CurriculumSubject} from './learning';
import type {LessonBinding} from '../notebookStorage';

type Concept={id:string;title:string;stages:string[]};
export async function launchTest(conceptId:string,stage:string){
  const session=await request<LessonBinding>('/test-sessions',{conceptId,stage},'agent');
  sessionStorage.setItem('prodigy-journey-lesson',JSON.stringify(session));
  sessionStorage.setItem('prodigy-session-'+session.sessionId,JSON.stringify(session));
  location.assign('/sessions/'+encodeURIComponent(session.sessionId));
}
export default function TestConcept(){
  const [topics,setTopics]=useState<{id:string;title:string}[]>([]),[topic,setTopic]=useState('');
  const [concepts,setConcepts]=useState<Concept[]>([]),[concept,setConcept]=useState<Concept|null>(null);
  const [stage,setStage]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  useEffect(()=>{let active=true;request<CurriculumSubject[]>('/curriculum',undefined,'cms').then(data=>{if(active){setTopics(data.flatMap(s=>s.strands.flatMap(st=>st.units.flatMap(u=>u.topics.map(t=>({id:t.id,title:`${s.title} · ${t.title}`}))))));setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[]);
  useEffect(()=>{setConcept(null);setStage('');setConcepts([]);if(!topic)return;let active=true;setLoading(true);setError('');request<Concept[]>('/test-concepts?topicId='+encodeURIComponent(topic),undefined,'agent').then(data=>{if(active){setConcepts(data);setLoading(false);}}).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};},[topic]);
  return <div className="j-form">
    <p>Launch a fresh session without changing any student’s progress.</p>
    <label>Topic<select value={topic} disabled={busy} onChange={e=>setTopic(e.target.value)}><option value="">Choose a topic</option>{topics.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    {topic&&<><label>Find a concept<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search concepts…"/></label>
    <div className="j-role-options" style={{maxHeight:260,overflowY:'auto'}}>{concepts.filter(c=>c.title.toLowerCase().includes(search.toLowerCase())).map(c=><button type="button" key={c.id} disabled={busy} aria-pressed={concept?.id===c.id} className={concept?.id===c.id?'active':''} onClick={()=>{setConcept(c);setStage('');}}>{c.title}</button>)}</div></>}
    {loading&&<p role="status">Loading…</p>}
    {topic&&!loading&&!concepts.length&&<p>No concepts available for this topic.</p>}
    {concept&&<fieldset><legend>Start at</legend><div className="j-role-options">{['Assess','Learn','Master'].map(s=><button type="button" key={s} disabled={busy||!concept.stages.includes(s)} title={!concept.stages.includes(s)?'No content available for this stage':undefined} aria-pressed={stage===s} className={stage===s?'active':''} onClick={()=>setStage(s)}>{s}</button>)}</div></fieldset>}
    {error&&<p className="j-error" role="alert">{error}</p>}
    <button className="j-primary" disabled={busy||!concept||!stage} onClick={async()=>{setBusy(true);setError('');try{await launchTest(concept!.id,stage);}catch(e){setError((e as Error).message);setBusy(false);}}}>{busy?'Starting…':'Start test session'}</button>
    <a className="j-link" href="/test-session">Connect to a tutor address</a>
  </div>;
}
