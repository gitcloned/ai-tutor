import {useValue,PageRecordType,type Editor} from 'tldraw';
import {ChevronRight,Trash2,X} from 'lucide-react';
import './notebook.css';

export function Notebook({editor,close,connected}:{editor:Editor;close:()=>void;connected:boolean}) {
  const pages=useValue('pages',()=>editor.getPages(),[editor]);
  const current=useValue('page',()=>editor.getCurrentPageId(),[editor]);
  function remove(id:typeof current) {
    editor.markHistoryStoppingPoint('delete-notebook-page');
    if(editor.getPages().length===1)editor.createPage({id:PageRecordType.createId(),name:'Your canvas'});
    editor.deletePage(id);
    editor.markHistoryStoppingPoint('after-delete-notebook-page');
  }
  return <aside className="notebook panel">
    <div className="panel-heading"><div><span className="eyebrow">Saved on this device</span><h2>Your notebook</h2></div><button aria-label="Close notebook" onClick={close}><X size={20}/></button></div>
    <p className="panel-intro">Your lessons and drawings, saved in this browser.</p>
    <div className="page-list">{pages.map((page,index)=><div className={`notebook-row ${current===page.id?'current':''}`} key={page.id}>
      <button className="notebook-open" onClick={()=>{editor.setCurrentPage(page.id);editor.zoomToFit({animation:{duration:250}});close();}}><span className="page-number">{String(index+1).padStart(2,'0')}</span><span>{page.name}<small>{current===page.id?'Open now':'Return to this page'}</small></span><ChevronRight size={16}/></button>
      <button className="notebook-delete" aria-label={`Delete ${page.name}`} title={connected?'Disconnect the tutor to delete a page':'Delete page — Undo restores it'} disabled={connected} onClick={()=>remove(page.id)}><Trash2 size={16}/></button>
    </div>)}</div>
    <p className="footnote">Saved in this browser. Use Undo to restore a deleted page. Export a page to keep a copy elsewhere.</p>
  </aside>;
}
