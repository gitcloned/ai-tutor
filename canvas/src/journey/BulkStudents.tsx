import {useState} from 'react';
import {request,type Student} from './api';
export function parseNames(text:string){
  const rows:string[][]=[];let row:string[]=[],field='',quoted=false;
  for(let i=0;i<=text.length;i++){
    const c=text[i]??'\n';
    if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(field.trim());field='';if(c==='\n'){rows.push(row);row=[];}}
    else if(c!=='\r')field+=c;
  }
  if(quoted)throw new Error('A quote in the CSV is not closed. Please check the file.');
  if(rows[0]?.[0]?.toLowerCase()==='name')rows.shift();
  const names=rows.map(r=>r[0]).filter(Boolean);
  if(names.length>50)throw new Error('Please add up to 50 students at a time.');
  if(names.some(n=>n.length>80))throw new Error('Please keep each name under 80 characters.');
  return names;
}
export default function BulkStudents({userId,classroomId,grade,onChange}:{userId:string;classroomId:string;grade:string;onChange:()=>void}){
  const [text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [results,setResults]=useState<(Student&{code:string;enrolled:boolean})[]>([]);
  async function add(){
    setError('');let names:string[];try{names=parseNames(text);if(!names.length)throw new Error('Add at least one student name.');}catch(e){setError((e as Error).message);return;}
    setBusy(true);
    try{
      for(let i=0;i<names.length;i++){
        const student=await request<Student&{code:string}>('/students',{userId,name:names[i],grade});
        setText(names.slice(i+1).join('\n'));
        let enrolled=false;
        try{await request(`/classrooms/${classroomId}/students`,{studentId:student.studentId});enrolled=true;}
        finally{setResults(old=>[...old,{...student,enrolled}]);onChange();}
      }
    }catch(e){setError((e as Error).message+' Created profiles are saved below. Remaining names can be retried.');}
    finally{setBusy(false);}
  }
  return <section className="j-bulk"><h3>Add several students</h3><p>One name per line, or upload a CSV with names in the first column. They’ll use {grade}.</p><label>Student names<textarea rows={5} value={text} disabled={busy} onChange={e=>setText(e.target.value)} placeholder={'Aarav Sharma\nIra Patel\nAnaya Singh'}/></label><label className="j-csv">Upload CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;if(file.size>100000){setError('Please use a CSV smaller than 100 KB.');return;}try{setText(parseNames(await file.text()).join('\n'));setError('');}catch(e){setError((e as Error).message);}}}/></label><button type="button" className="j-secondary" disabled={busy||!text.trim()} onClick={()=>void add()}>{busy?'Adding students…':'Add students'}</button>{error&&<p role="alert">{error}</p>}{results.length>0&&<><h3>Created profiles</h3><p>Codes remain available from each student’s profile.</p><table><thead><tr><th>Name</th><th>Access code</th><th>Class</th></tr></thead><tbody>{results.map(s=><tr key={s.studentId}><td>{s.name}</td><td><code>{s.code}</code></td><td>{s.enrolled?'Added':<button onClick={async()=>{try{await request(`/classrooms/${classroomId}/students`,{studentId:s.studentId});setResults(old=>old.map(r=>r.studentId===s.studentId?{...r,enrolled:true}:r));onChange();}catch(e){setError((e as Error).message);}}}>Retry enrollment</button>}</td></tr>)}</tbody></table></>}</section>;
}
