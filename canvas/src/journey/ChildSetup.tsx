import {useState,type FormEvent} from 'react';
import {ArrowLeft,ArrowRight} from 'lucide-react';
import TopicPicker from './TopicPicker';
import type {Assignment} from './learning';
export default function ChildSetup({busy,save}:{busy:boolean;save:(form:FormData,topics:Assignment[])=>void}){
  const [step,setStep]=useState(1),[name,setName]=useState(''),[grade,setGrade]=useState('Grade 7'),[age,setAge]=useState('');
  const [topics,setTopics]=useState<Assignment[]>([]),[ready,setReady]=useState(false);
  function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(step===1){setStep(2);return;}const form=new FormData();form.set('name',name.trim());form.set('grade',grade);form.set('age',age);save(form,topics);}
  return <form className="j-form j-child-setup" onSubmit={submit}>
    <p className="j-muted">Step {step} of 2 · {step===1?'About your child':'Choose topics'}</p>
    {step===1?<><label>Grade<select value={grade} onChange={e=>{setGrade(e.target.value);setTopics([]);setReady(false);}}>{['Not in school yet',...Array.from({length:12},(_,i)=>`Grade ${i+1}`),'Other'].map(g=><option key={g}>{g}</option>)}</select></label><label>What should we call your child?<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} autoComplete="off"/></label><label>Age (optional)<input type="number" min={3} max={25} value={age} onChange={e=>setAge(e.target.value)}/></label></>:<><button type="button" className="j-link" disabled={busy} onClick={()=>setStep(1)}><ArrowLeft size={16}/> {name} · {grade} · Edit details</button><TopicPicker grade={grade} value={topics} initialValue={ready?topics:undefined} onChange={setTopics} onReady={setReady}/></>}
    <button className="j-primary" disabled={busy||(step===2&&!ready)}>{busy?'Creating…':step===1?'Choose topics':'Create child profile'}<ArrowRight size={18}/></button>
  </form>;
}
