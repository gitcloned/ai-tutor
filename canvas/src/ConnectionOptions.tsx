import {ArrowUpRight,Check,Clock3,Link,LoaderCircle,Volume2} from 'lucide-react';
import {defaultTutorUrl,SHARED_TUTOR_URL} from './tutorUrl';
import './connection.css';

export function ConnectionOptions({url,setUrl,recent,connected,connecting,error,connect,disconnect}:{url:string;setUrl:(url:string)=>void;recent:string[];connected:boolean;connecting:boolean;error:string;connect:(url:string)=>void;disconnect:()=>void}){
  const options=[...recent.map((value,i)=>({url:value,label:i===0?'Last working':'Recent tutor',recent:true})),{url:SHARED_TUTOR_URL,label:'Shared tutor',recent:false},...(defaultTutorUrl(window.location)?[{url:defaultTutorUrl(window.location),label:'Default tutor',recent:false}]:[])].filter((option,i,all)=>all.findIndex(other=>new URL(other.url).href===new URL(option.url).href)===i);
  return <>
    <span className="connection-emblem"><Link size={25}/></span><h2 id="sheet-title">Meet on the canvas.</h2><p className="connection-intro">Choose your tutor and pick up where you left off.</p>
    <div className="connection-choices" aria-label="Tutor connection options">{options.map(option=><button key={option.url} disabled={connecting} className="connection-choice" onClick={()=>{setUrl(option.url);connect(option.url);}}><span className="connection-choice-icon">{option.recent?<Clock3 size={19}/>:<Link size={19}/>}</span><span><strong>{option.label}</strong><small>{new URL(option.url).host}{new URL(option.url).pathname==='/'?'':new URL(option.url).pathname}</small></span><ArrowUpRight size={18}/></button>)}</div>
    <div className="connection-divider">Or enter an address</div>
    <form onSubmit={e=>{e.preventDefault();connect(url);}}><label htmlFor="ws-url">Tutor address</label><input id="ws-url" value={url} onChange={e=>setUrl(e.target.value)} placeholder="Paste an HTTPS or WebSocket address" spellCheck={false} autoCapitalize="none" autoCorrect="off" disabled={connecting} aria-describedby={error?'connection-error':undefined} aria-invalid={!!error}/>
      {error&&<p className="connection-error" id="connection-error" role="alert">{error}</p>}
      <button className="primary" type="submit" disabled={connecting||!url.trim()}>{connecting?<><LoaderCircle className="connection-spinner" size={18}/>Connecting…</>:<>{connected?'Reconnect':'Connect to tutor'}<ArrowUpRight size={17}/></>}</button>
    </form>
    <p className="connection-footnote">{connected?<Check size={16}/>:<Volume2 size={16}/>}<span>{connected?'Your tutor is connected. Your notebook stays on this device.':'Sound will be enabled when you connect.'}</span></p>
    {connecting?<button className="text-button" onClick={disconnect}>Cancel connection</button>:connected&&<button className="text-button" onClick={disconnect}>Disconnect and keep my notebook</button>}
  </>;
}
