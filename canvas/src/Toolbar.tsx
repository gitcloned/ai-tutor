import { track, useEditor, DefaultColorStyle } from 'tldraw';
import { MousePointer2, Pencil, Eraser, Type, Square, Hand, Undo2, Redo2 } from 'lucide-react';
export const Toolbar=track(function Toolbar(){
  const editor=useEditor(); const active=editor.getCurrentToolId();const ink=editor.getStyleForNextShape(DefaultColorStyle);
  const tools=[['select','Select (V)',MousePointer2],['draw','Pencil (D)',Pencil],['eraser','Eraser (E)',Eraser],['text','Text (T)',Type],['geo','Shape (R)',Square],['hand','Move canvas (H)',Hand]] as const;
  return <nav className="toolbar" aria-label="Drawing tools">
    {tools.map(([id,label,Icon])=><button key={id} title={label} aria-label={label} aria-pressed={active===id} className={active===id?'selected':''} onClick={()=>editor.setCurrentTool(id)}><Icon size={20}/></button>)}
    <span className="tool-divider"/>
    {[['black','#283a32'],['blue','#356aca'],['green','#50826a'],['orange','#cf8047']] .map(([color,hex])=><button className={`swatch ${ink===color?'ink-selected':''}`} aria-pressed={ink===color} key={color} aria-label={`${color} ink`} title={`${color} ink`} onClick={()=>{editor.setStyleForNextShapes(DefaultColorStyle,color as 'black');editor.setStyleForSelectedShapes(DefaultColorStyle,color as 'black');}}><span style={{background:hex}}/></button>)}
    <span className="tool-divider"/>
    <button title="Undo" aria-label="Undo" onClick={()=>editor.undo()}><Undo2 size={18}/></button>
    <button title="Redo" aria-label="Redo" onClick={()=>editor.redo()}><Redo2 size={18}/></button>
  </nav>;
});
