import {useEffect,useState} from 'react';
import {request,type Classroom} from './api';
import TopicPicker from './TopicPicker';
import type {Assignment} from './learning';
export default function ClassTopics({classroom,onSaved}:{classroom:Classroom;onSaved:()=>void}){
  const [original,setOriginal]=useState<Assignment[]|null>(null),[topics,setTopics]=useState<Assignment[]>([]),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setError('');request<{topics:Assignment[]}>(`/classrooms/${encodeURIComponent(classroom.id)}/topics`).then(r=>{if(active){setOriginal(r.topics);setTopics(r.topics);}}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[classroom.id,retry]);
  async function save(){setBusy(true);setError('');setMessage('');try{const r=await request<{status:string}>(`/classrooms/${encodeURIComponent(classroom.id)}/topics`,{topics,subjectIds:[...new Set(topics.map(t=>t.subjectId))]},'erp','PUT');setMessage(r.status==='ready'?'Topics saved for everyone in this class.':'Topics saved. Some learning spaces are still updating. Save again to retry.');onSaved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <>{original?<><TopicPicker grade={classroom.grade??'Mixed grades'} initialValue={original} value={topics} onChange={setTopics} onReady={setReady}/><button className="j-primary" disabled={!ready||busy} onClick={()=>void save()}>{busy?'Saving…':'Save topics'}</button></>:!error&&<p role="status">Loading class topics…</p>}{error&&<div role="alert">{error}{!original&&<button className="j-link" onClick={()=>setRetry(v=>v+1)}>Try again</button>}</div>}{message&&<p role="status">{message}</p>}</>;
}
