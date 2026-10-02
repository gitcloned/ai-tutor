import {request} from './api';
export type Assignment={subjectId:string;topicId:string};
export type Topic={id:string;title:string;recommended?:boolean;recommendedGrades?:number[]};
export type CurriculumSubject={subjectId:string;title:string;strands:{id:string;title:string;units:{id:string;title:string;topics:Topic[]}[]}[]};
export type NextLearning={status:'continue';topicId:string;conceptId:string;state:string;resumeSessionId:string|null}|{status:'completed'}|{status:'unavailable';reason:string};
export type HomeTopic={topicId:string;title:string;strandTitle?:string;unitTitle?:string;status:'not_started'|'in_progress'|'completed'|'unavailable';reason?:string};
export type LearningHome={subjects:{subjectId:string;title:string;topics:HomeTopic[]}[];continueWith:Extract<NextLearning,{status:'continue'}>|null};
export const getHome=(studentId:string)=>request<LearningHome>(`/students/${encodeURIComponent(studentId)}/home`,undefined,'learning');
export const getNext=(studentId:string,topicId:string)=>request<NextLearning>(`/students/${encodeURIComponent(studentId)}/topics/${encodeURIComponent(topicId)}/next`,undefined,'learning');
