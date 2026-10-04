import {useEffect,useState} from 'react';
import {request} from './api';
import type {Assignment,CurriculumSubject} from './learning';
const label=(value:string,id:string)=>value&&value!==id&&!/^(?:x[0-9a-f]+:|[0-9a-f]{24}$)/i.test(value)?value:'';
export default function TopicPicker({grade,value,onChange,onReady,initialValue}:{initialValue?:Assignment[];grade:string;value:Assignment[];onChange:(value:Assignment[])=>void;onReady:(ready:boolean)=>void}){
  const [subjects,setSubjects]=useState<CurriculumSubject[]>([]),[error,setError]=useState(''),[revision,setRevision]=useState(0),[activeSubject,setActiveSubject]=useState(''),[showAll,setShowAll]=useState(false),[loading,setLoading]=useState(true),[search,setSearch]=useState(''),[selectedOnly,setSelectedOnly]=useState(false);
  useEffect(()=>{
    let active=true;onReady(false);setLoading(true);setError('');setSubjects([]);
    const number=grade.match(/\d+/)?.[0];
    request<CurriculumSubject[]>(`/curriculum${number?'?grade='+number:''}`,undefined,'cms').then(items=>{
      if(!active)return;
      const available=items.filter(s=>s.strands.some(st=>st.units.some(u=>u.topics.length)));
      const recommended=available.flatMap(s=>s.strands.flatMap(st=>st.units.flatMap(u=>u.topics.filter(t=>t.recommended).map(t=>({subjectId:s.subjectId,topicId:t.id})))));
      setSubjects(available);setActiveSubject(available.find(s=>recommended.some(t=>t.subjectId===s.subjectId))?.subjectId??available[0]?.subjectId??'');
      setShowAll(!!initialValue||!recommended.length);onChange(initialValue??recommended);setLoading(false);onReady(true);
    }).catch(e=>{if(active){setError(e.message);setLoading(false);}});return()=>{active=false;};
  },[grade,revision]);
  const current=subjects.find(s=>s.subjectId===activeSubject);
  const hasRecommendations=subjects.some(s=>s.strands.some(st=>st.units.some(u=>u.topics.some(t=>t.recommended))));
  const groups=current?.strands.flatMap(st=>st.units.map(u=>({id:u.id,title:[label(st.title,st.id),label(u.title,u.id)].filter(Boolean).join(' · '),topics:u.topics.filter(t=>(showAll||t.recommended)&&(!selectedOnly||value.some(v=>v.topicId===t.id))&&[t.title,st.title,u.title].join(' ').toLowerCase().includes(search.trim().toLowerCase()))}))).filter(g=>g.topics.length)??[];
  const visible=groups.flatMap(g=>g.topics);
  const selectVisible=()=>onChange([...value,...visible.filter(t=>!value.some(v=>v.topicId===t.id)).map(t=>({subjectId:current!.subjectId,topicId:t.id}))]);
  const clearVisible=()=>onChange(value.filter(v=>!visible.some(t=>t.id===v.topicId)));
  return <section className="j-topic-picker"><h3>Choose topics</h3><p>{hasRecommendations?`Suggestions for ${grade.toLowerCase()}. Change your selection anytime.`:'Browse the available topics. Grade suggestions aren’t available yet.'}</p>
    {error?<div role="alert">{error}<button type="button" className="j-link" onClick={()=>setRevision(v=>v+1)}>Try again</button></div>:loading?<p role="status">Loading topics…</p>:!subjects.length?<p>No topics available yet.</p>:<>
    <label className="j-topic-search">Search topics<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search a topic or strand…"/></label><div className="j-subject-tabs" role="tablist" aria-label="Subjects to learn">{subjects.map(s=><button type="button" role="tab" key={s.subjectId} aria-selected={activeSubject===s.subjectId} onClick={()=>setActiveSubject(s.subjectId)}>{label(s.title,s.subjectId)||'Subject'}</button>)}</div>
    <div className="j-topic-filters">{hasRecommendations&&<label className="j-check j-all-topics"><input type="checkbox" checked={showAll} onChange={e=>setShowAll(e.target.checked)}/><span>Show topics from all grades</span></label>}<label className="j-check"><input type="checkbox" checked={selectedOnly} onChange={e=>setSelectedOnly(e.target.checked)}/><span>Selected only</span></label></div><div className="j-topic-tools"><span>{visible.length} topics shown</span><button type="button" disabled={!visible.length} onClick={selectVisible}>Select shown</button><button type="button" disabled={!visible.some(t=>value.some(v=>v.topicId===t.id))} onClick={clearVisible}>Clear shown</button></div>
    <div className="j-picker-results" role="tabpanel" aria-label={current?.title??'Topics'}>{groups.length?groups.map(g=><fieldset key={g.id}>{g.title&&<legend>{g.title}</legend>}{g.topics.map(t=><label className={`j-check j-topic-choice ${value.some(v=>v.topicId===t.id)?'is-selected':''}`} key={t.id}><input type="checkbox" checked={value.some(v=>v.topicId===t.id)} onChange={e=>onChange(e.target.checked?[...value,{subjectId:current!.subjectId,topicId:t.id}]:value.filter(v=>v.topicId!==t.id))}/><span>{label(t.title,t.id)||'Topic'}{t.recommended&&<small>Suggested</small>}</span></label>)}</fieldset>):<p>{search?'No topics match your search. Try another word or change the filters.':selectedOnly?'No selected topics match these filters.':`No suggested topics for ${grade.toLowerCase()}. Show all grades to explore more.`}</p>}</div></>}
    <div className="j-picker-summary"><strong>{value.length} topics selected</strong><span>across {new Set(value.map(v=>v.subjectId)).size} subjects</span></div></section>;
}
