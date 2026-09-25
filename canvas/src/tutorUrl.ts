export const SHARED_TUTOR_URL=(()=>{
  const value=import.meta.env?.VITE_TUTOR_WS_URL;
  try{return value?normalizeTutorUrl(value,window.location.protocol):'';}catch{return '';}
})();
export function normalizeTutorUrl(value:string,protocol=window.location.protocol){
  const url=new URL(value.trim());
  if(url.protocol==='https:')url.protocol='wss:';
  if(url.protocol==='http:')url.protocol='ws:';
  if(!['ws:','wss:'].includes(url.protocol)||url.username||url.password||url.hash)throw new Error('Enter a valid tutor address, such as wss://your-tutor-server.');
  if(protocol==='https:'&&url.protocol!=='wss:')throw new Error('This secure canvas needs a wss:// tutor address. Paste your HTTPS tunnel address to use it securely.');
  return url.toString();
}
export function successfulTutors():string[]{
  try{
    const values=JSON.parse(localStorage.getItem('prodigy-successful-tutors')??'[]');
    return Array.isArray(values)?[...new Set(values.flatMap(value=>{try{return typeof value==='string'?[normalizeTutorUrl(value)]:[];}catch{return [];}}))].slice(0,4):[];
  }catch{return [];}
}
export function rememberTutor(url:string){
  try{localStorage.setItem('prodigy-successful-tutors',JSON.stringify([url,...successfulTutors().filter(item=>item!==url)].slice(0,4)));localStorage.setItem('prodigy-ws',url);}catch{/* A connected lesson still works when storage is unavailable. */}
}

export function defaultTutorUrl(location:Pick<Location,'protocol'|'hostname'>) {
  const configured=import.meta.env.VITE_TUTOR_WS_URL;
  if(configured){
    try{const url=new URL(configured);if(url.protocol==='wss:'||(location.protocol!=='https:'&&url.protocol==='ws:'))return configured;}catch{/* Keep the connection field editable if configuration is invalid. */}
  }
  // Static Hosting does not run a tutor on its own domain/port.
  if(import.meta.env.PROD)return '';
  return `${location.protocol==='https:'?'wss':'ws'}://${location.hostname}:32004`;
}

export function initialTutorUrl(location:Pick<Location,'protocol'|'hostname'>,saved:string|null) {
  const fallback=defaultTutorUrl(location);
  if(saved) {
    try {
      const parsed=new URL(saved);
      if(import.meta.env.PROD&&parsed.protocol==='wss:')return saved;
      // Keep a custom port/path for this host, but never reuse another host's
      // address (especially localhost when opening the canvas over the LAN).
      if(parsed.hostname===location.hostname&&parsed.protocol===new URL(fallback).protocol)return saved;
    } catch { /* Replace an invalid saved address with the site-derived default. */ }
  }
  return fallback;
}
