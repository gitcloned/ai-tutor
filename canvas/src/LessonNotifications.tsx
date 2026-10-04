import {useEffect,useRef,useState} from 'react';
import {TriangleAlert,X} from 'lucide-react';
import './notifications.css';
type Action='connect'|'reply'|'retry'|'sound'|'tutor-retry';
export function LessonNotifications({warnings,clear,issue,dismiss,act}:{warnings:string[];clear:()=>void;issue:{text:string;action:Action}|null;dismiss:()=>void;act:(action:Action)=>void}){
  const [open,setOpen]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const quietIssue=issue?.action==='tutor-retry'?issue:null;
  const blockingIssue=quietIssue?null:issue;
  const warningCount=warnings.length+(quietIssue?1:0);
  useEffect(()=>{if(blockingIssue)dialog.current?.showModal();else dialog.current?.close();},[blockingIssue]);
  return <>
    {warningCount>0&&<aside className="lesson-warnings">
      {open&&<section className="warning-history" aria-label="Lesson warnings"><header><strong>Lesson warnings</strong><button aria-label="Close warnings" onClick={()=>setOpen(false)}><X size={16}/></button></header><p>You can keep learning. These details may help troubleshoot the lesson.</p>{quietIssue&&<div className="warning-recovery"><p>{quietIssue.text}</p><button onClick={()=>act('tutor-retry')}>Try tutor again</button><button onClick={dismiss}>Dismiss</button></div>}<ul>{warnings.slice().reverse().map(text=><li key={text}>{text}</li>)}</ul><button onClick={()=>{clear();if(quietIssue)dismiss();setOpen(false);}}>Clear warnings</button></section>}
      <button className="warning-toggle" aria-label={`Lesson warnings (${warningCount})`} aria-expanded={open} onClick={()=>setOpen(!open)}><TriangleAlert size={18}/><span>{warningCount}</span></button>
    </aside>}
    <dialog ref={dialog} className="lesson-issue" aria-labelledby="lesson-issue-title" onCancel={dismiss}>
      {blockingIssue&&issue&&<><h2 id="lesson-issue-title">{issue.action==='tutor-retry'?'Let’s try again':issue.action==='connect'?'Let’s reconnect':issue.action==='reply'?'Let’s try another way':issue.action==='sound'?'Let’s turn on sound':'Your work is still here'}</h2><p>{issue.text}</p><div><button onClick={dismiss}>Keep working on canvas</button><button className="primary" onClick={()=>act(issue.action)}>{issue.action==='tutor-retry'?'Try tutor again':issue.action==='connect'?'Reconnect to tutor':issue.action==='reply'?'Type a reply':issue.action==='sound'?'Enable sound':'Try sending again'}</button></div></>}
    </dialog>
  </>;
}
