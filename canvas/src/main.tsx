import {lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import {readIdentity,preview,request,rememberIdentity,refreshIdentity,type Identity} from './journey/api';
const App=lazy(()=>import('./App'));
const Journey=lazy(()=>import('./journey/Journey'));
const root=createRoot(document.getElementById('root')!);
function redirect(path:string){const url=new URL(path,location.origin);if(preview)url.searchParams.set('preview','1');location.replace(url.href);}
async function boot(){
  const identity=readIdentity(),path=location.pathname.replace(/\/$/,'')||'/';
  if(!identity&&path!=='/login'){redirect('/login'+(location.search.includes('join=')?'?join='+new URLSearchParams(location.search).get('join'):''));return;}
  if(identity&&!preview){
    if(!identity.token){rememberIdentity(null);redirect('/login');return;}
    try{const profile=await request<any>('/me');refreshIdentity({...identity,...profile,type:profile.type==='student'?'student':'adult'} as Identity);}catch{root.render(<main style={{padding:32}}><p>We couldn’t verify your sign-in. Check your connection and try again.</p><button onClick={()=>location.reload()}>Try again</button><a href="/login" onClick={()=>rememberIdentity(null)}>Sign in again</a></main>);return;}
  }
  if(identity&&(path==='/'||path==='/login'||path==='/canvas')){redirect('/home');return;}
  let canvas=path==='/test-session';
  if(path.startsWith('/sessions/')){
    const id=decodeURIComponent(path.split('/')[2]||'');
    try{
      const lesson=await request<{sessionId:string;studentId:string;wsUrl:string}>('/sessions/'+encodeURIComponent(id),undefined,'agent');
      sessionStorage.setItem('prodigy-journey-lesson',JSON.stringify(lesson));canvas=true;
    }catch{redirect('/home');return;}
  }else if(!['/login','/home','/test-session'].includes(path)&&!/^\/(classes|students)\/[^/]+$/.test(path)){redirect(identity?'/home':'/login');return;}
  root.render(<Suspense fallback={<p style={{padding:32}}>Opening Prodigy…</p>}>{canvas?<App/>:<Journey/>}</Suspense>);
}
root.render(<p style={{padding:32}}>Opening Prodigy…</p>);void boot();
