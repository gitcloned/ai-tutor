import {useEffect,useState} from 'react';
import {request} from './api';
import type {Assignment,CurriculumSubject} from './learning';
export default function TopicPicker({grade,value,onChange,onReady}:{grade:string;value:Assignment[];onChange:(value:Assignment[])=>void;onReady:(ready:boolean)=>void}){
  const [subjects,setSubjects]=useState<CurriculumSubject[]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;onReady(false);setError('');setSubjects([]);
    const number=grade.match(/\d+/)?.[0];
    request<CurriculumSubject[]>(`/curriculum${number?'?grade='+number:''}`,undefined,'cms').then(items=>{
      if(!active)return;setSubjects(items);onReady(true);
      onChange(items.flatMap(s=>s.strands.flatMap(st=>st.units.flatMap(u=>u.topics.filter(t=>t.recommended).map(t=>({subjectId:s.subjectId,topicId:t.id}))))));
    }).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};
  },[grade,revision]);
  return <section className="j-topic-picker"><h3>What will they learn?</h3><p>Suggested for {grade.toLowerCase()}. You can choose topics from any grade.</p>{error?<div role="alert">{error}<button type="button" className="j-link" onClick={()=>setRevision(v=>v+1)}>Try again</button></div>:!subjects.length?<p>No topics available yet.</p>:subjects.map(s=><details key={s.subjectId} open><summary>{s.title}</summary>{s.strands.map(st=><div key={st.id}><h4>{st.title}</h4>{st.units.map(u=><fieldset key={u.id}><legend>{u.title}</legend>{u.topics.map(t=><label className="j-check" key={t.id}><input type="checkbox" checked={value.some(v=>v.topicId===t.id)} onChange={e=>onChange(e.target.checked?[...value,{subjectId:s.subjectId,topicId:t.id}]:value.filter(v=>v.topicId!==t.id))}/><span>{t.title}{t.recommended&&<small>Suggested</small>}</span></label>)}</fieldset>)}</div>)}</details>)}<small>{value.length} topics selected</small></section>;
}
