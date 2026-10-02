import {adultToken} from './google';
export type Role = 'parent'|'teacher';
export type Student = {token?:string;studentId:string;name:string;grade:string;age?:number};
export type Adult = {token?:string;userId:string;name:string;email:string;roles:Role[]};
export type Identity = ({type:'student'}&Student)|({type:'adult'}&Adult);
export type Classroom = {id:string;name:string;subject:string;grade:string;createdByUserId:string;status:string};
export type Concept = {id:string;title:string;description?:string};
export type LessonSession = {sessionId:string;resumed:boolean;wsUrl:string;concept:{id:string;title:string}};
export const preview = new URLSearchParams(location.search).get('preview')==='1';
const alphabet='BCDFGHJKLMNPQRSTVWXYZ23456789';
export const normalizeCode=(value:string)=>value.trim().toUpperCase();
export const validCode=(value:string)=>new RegExp(`^[${alphabet}]{6}$`).test(normalizeCode(value));
const demoKey='prodigy-journey-preview-v1';
const identityKey=`prodigy-journey-${preview?'preview':'live'}-identity`;
export function readIdentity():Identity|null {
  try {return JSON.parse(sessionStorage.getItem(identityKey)||localStorage.getItem(identityKey)||'null');}catch{return null;}
}
export function refreshIdentity(identity:Identity){rememberIdentity(identity,!!localStorage.getItem(identityKey));}
export function rememberIdentity(identity:Identity|null,remember=false){
  localStorage.removeItem(identityKey);sessionStorage.removeItem(identityKey);
  if(identity)(remember?localStorage:sessionStorage).setItem(identityKey,JSON.stringify(identity));
}
function apiBase(service:'erp'|'agent'){
  const configured=service==='erp'?import.meta.env.VITE_ERP_API_URL:import.meta.env.VITE_AGENT_API_URL;
  if(configured)return configured.replace(/\/$/,'');
  if(location.protocol==='https:')throw new Error('This service is not connected yet. Please try again once setup is complete.');
  return `http://${location.hostname.includes(':')?'['+location.hostname+']':location.hostname}:${service==='erp'?32005:32004}`;
}
export async function request<T>(path:string,body?:unknown,service:'erp'|'agent'='erp'):Promise<T>{
  if(preview)return demoRequest(path,body) as T;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
    const headers:Record<string,string>={'Content-Type':'application/json'};
    // Google identity is verified on sign-in; ERP uses the selected adult ID
    // as lightweight context for the agreed MVP.
    if(path==='/auth/google'){
      const token=await adultToken();if(token)headers.Authorization=`Bearer ${token}`;
    }else {
      const identity=readIdentity();if(identity?.token)headers.Authorization=`Bearer ${identity.token}`;
    }
    const response=await fetch(apiBase(service)+path,{method:body===undefined?'GET':path==='/me'?'PATCH':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(response.status===401&&path!=='/auth/student'&&path!=='/auth/google'){rememberIdentity(null);location.assign('/login');}
    if(!response.ok)throw new Error(data.error||'That did not work. Please try again.');
    if(service==='agent'&&path==='/sessions'&&data.sessionId&&!data.wsUrl){
      const ws=new URL(apiBase('agent'));ws.protocol=ws.protocol==='https:'?'wss:':'ws:';ws.searchParams.set('sessionId',data.sessionId);data.wsUrl=ws.href;
    }
    return data as T;
  }catch(error){
    if((error as Error).name==='AbortError')throw new Error('The service took too long to respond. Please try again.');
    if(error instanceof TypeError)throw new Error('We could not reach Prodigy. Check your connection and try again.');
    throw error;
  }finally{clearTimeout(timer);}
}
type DemoData={students:(Student&{userId:string;code:string})[];adults:Adult[];classes:(Classroom&{code:string})[];enrollments:{studentId:string;classroomId:string}[]};
const concepts:Concept[]=[
  {id:'2-variable-linear-equations-graphs',title:'Two-variable linear equations',description:'Explore how an equation becomes a line. Plot points and find the pattern.'},
  {id:'graphing-solutions-to-2-variable-linear-equations-1',title:'Graphing solutions',description:'Connect equations, coordinate pairs, and the points on a graph.'},
  {id:'algebraic-expression-basics',title:'Algebraic expressions',description:'Get comfortable with numbers, letters, and what they mean together.'},
];
function demoData():DemoData{
  try{const saved=localStorage.getItem(demoKey);if(saved)return JSON.parse(saved);}catch{}
  return {students:[{studentId:'preview-student',name:'Aarav',grade:'Grade 7',userId:'preview-adult',code:'K7M9R2'}],adults:[{userId:'preview-adult',name:'Meera',email:'meera@example.com',roles:[]}],classes:[{id:'preview-class',name:'Grade 7 Maths',subject:'Mathematics',grade:'Grade 7',createdByUserId:'preview-adult',status:'active',code:'B3MN8P'}],enrollments:[]};
}
function code(data:DemoData){let value='';do{value=Array.from(crypto.getRandomValues(new Uint8Array(6)),n=>alphabet[n%alphabet.length]).join('');}while([...data.students,...data.classes].some(item=>item.code===value));return value;}
function demoRequest(path:string,body:any):unknown{
  const data=demoData(),url=new URL(path,'http://preview'),p=url.pathname,q=url.searchParams;
  const save=()=>localStorage.setItem(demoKey,JSON.stringify(data));
  if(p==='/auth/google')return data.adults[0];
  if(p==='/auth/student'){
    const student=data.students.find(s=>s.code===normalizeCode(body.code));
    if(!student)throw new Error("That code didn't work. Check it and try again.");
    const {code:_,userId:__,...profile}=student;return profile;
  }
  if(p==='/me'){
    const adult=data.adults.find(a=>a.userId===body.userId)!;Object.assign(adult,body);save();return adult;
  }
  if(p==='/students'&&body){const student={...body,studentId:crypto.randomUUID(),code:code(data)};data.students.push(student);save();return student;}
  if(p==='/students')return data.students.filter(s=>s.userId===q.get('userId')).map(({code:_,...s})=>s);
  if(p.startsWith('/students/')&&p.endsWith('/code')){const student=data.students.find(s=>s.studentId===p.split('/')[2]);if(!student)throw new Error('Student not found.');return {code:student.code};}
  if(p.startsWith('/students/')&&p.endsWith('/reset-code')){
    const student=data.students.find(s=>s.studentId===p.split('/')[2]);if(!student)throw new Error('Student not found.');student.code=code(data);save();return {code:student.code};
  }
  if(p==='/classrooms/join'){
    const classroom=data.classes.find(c=>c.code===normalizeCode(body.classCode));if(!classroom)throw new Error("We couldn't find that class. Check the code with your teacher.");
    const exists=data.enrollments.some(e=>e.studentId===body.studentId&&e.classroomId===classroom.id);
    if(!exists)data.enrollments.push({studentId:body.studentId,classroomId:classroom.id});save();return {status:exists?'already_joined':'joined',classroomId:classroom.id,name:classroom.name};
  }
  if(p==='/classrooms'&&body){const classroom={id:crypto.randomUUID(),name:body.name,subject:body.subject,grade:body.grade,createdByUserId:body.userId,status:'active',code:code(data)};data.classes.push(classroom);save();return {...classroom,classroomId:classroom.id,classCode:classroom.code};}
  if(p==='/classrooms')return data.classes.filter(c=>q.has('userId')?c.createdByUserId===q.get('userId'):data.enrollments.some(e=>e.studentId===q.get('studentId')&&e.classroomId===c.id)).map(({code:_,...c})=>c);
  if(p.startsWith('/classrooms/')&&p.endsWith('/reset-code')){const classroom=data.classes.find(c=>c.id===p.split('/')[2])!;classroom.code=code(data);save();return {code:classroom.code};}
  if(p.startsWith('/classrooms/')&&p.endsWith('/students')){
    const classroomId=p.split('/')[2];
    if(body){if(!data.enrollments.some(e=>e.classroomId===classroomId&&e.studentId===body.studentId))data.enrollments.push({classroomId,studentId:body.studentId});save();return {status:'joined'};}
    return data.students.filter(s=>data.enrollments.some(e=>e.classroomId===classroomId&&e.studentId===s.studentId)).map(({code:_,...s})=>s);
  }
  if(p==='/concepts')return concepts;
  if(p==='/sessions')throw new Error('Preview lessons do not connect to a live tutor. Exit preview to start a real lesson.');
  throw new Error('This preview action is not available.');
}
