import {request} from './api';
export type Assignment={subjectId:string;topicId:string};
export type Topic={id:string;title:string;recommended?:boolean;recommendedGrades?:number[]};
export type CurriculumSubject={subjectId:string;title:string;strands:{id:string;title:string;units:{id:string;title:string;topics:Topic[]}[]}[]};
export type NextLearning={status:'continue';topicId:string;conceptId:string;conceptTitle?:string;state:string;resumeSessionId:string|null}|{status:'completed'}|{status:'unavailable';reason:string};
export type HomeTopic={topicId:string;title:string;strandTitle?:string;unitTitle?:string;status:'not_started'|'in_progress'|'completed'|'unavailable';reason?:string;next?:Extract<NextLearning,{status:'continue'}>};
export type LearningHome={subjects:{subjectId:string;title:string;topics:HomeTopic[]}[];continueWith:Extract<NextLearning,{status:'continue'}>|null};
export async function getHome(studentId:string):Promise<LearningHome>{
  const home=await request<LearningHome>(`/students/${encodeURIComponent(studentId)}/home`,undefined,'learning');
  // During rollout LP may return IDs without curriculum labels. Resolve labels
  // once from CMS; progression and continuation remain entirely owned by LP.
  if(home.subjects.some(s=>!s.title||s.topics.some(t=>!t.title))){
    const curriculum=await request<CurriculumSubject[]>('/curriculum',undefined,'cms');
    home.subjects=home.subjects.map(s=>{
      const source=curriculum.find(c=>c.subjectId===s.subjectId);
      if(!source)throw new Error('A subject is still being set up. Please try again shortly.');
      const labels=source.strands.flatMap(st=>st.units.flatMap(u=>u.topics.map(t=>({...t,strandTitle:st.title,unitTitle:u.title}))));
      return {...s,title:s.title||source.title,topics:s.topics.map(t=>{
        const label=labels.find(l=>l.id===t.topicId);
        return {...t,title:t.title||label?.title||'Topic being prepared',strandTitle:t.strandTitle||label?.strandTitle,unitTitle:t.unitTitle||label?.unitTitle,...(!label&&!t.title?{status:'unavailable' as const}: {})};
      })};
    });
  }
  const titles=new Map<string,Promise<string>>();
  const label=async(next:Extract<NextLearning,{status:'continue'}>)=>{
    if(next.conceptTitle)return next;
    if(!titles.has(next.conceptId))titles.set(next.conceptId,request<{title:string}>('/concepts/'+encodeURIComponent(next.conceptId),undefined,'cms').then(c=>c.title).catch(()=>'Current lesson'));
    return {...next,conceptTitle:await titles.get(next.conceptId)};
  };
  await Promise.all(home.subjects.flatMap(s=>s.topics).filter(t=>t.status==='in_progress').map(async topic=>{
    try {
      const next=await getNext(studentId,topic.topicId);
      if(next.status==='continue'&&next.conceptId&&next.state)topic.next=await label(next);
      else if(next.status==='completed')topic.status='completed';
      else {topic.status='unavailable';topic.reason=next.status==='unavailable'?next.reason:'Your next lesson is being prepared.';}
    }catch{topic.status='unavailable';topic.reason='Could not load the next lesson. Please refresh.';}
  }));
  if(home.continueWith?.resumeSessionId)home.continueWith=await label(home.continueWith);
  else home.continueWith=null;
  return home;
}
export const getNext=(studentId:string,topicId:string)=>request<NextLearning>(`/students/${encodeURIComponent(studentId)}/topics/${encodeURIComponent(topicId)}/next`,undefined,'learning');
