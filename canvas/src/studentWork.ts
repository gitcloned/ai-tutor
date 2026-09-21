import {renderPlaintextFromRichText,type Editor,type TLShape} from 'tldraw';
import type {GraphAttempt} from './models/functionGraph';
import type {ChoiceAttempt} from './mcq';

export type MediaInput={data:string;mimeType:string};
export type StudentInput={text?:string;audio?:MediaInput;images?:MediaInput[];activity?:GraphAttempt|ChoiceAttempt};
export const fingerprint=(shape:TLShape)=>JSON.stringify({type:shape.type,props:shape.props});
export const isStudentWork=(shape:TLShape)=>shape.meta.author!=='tutor'&&shape.type!=='model3d'&&shape.type!=='group';

/** Baselines track content, not camera movements or repositioning. */
export class StudentWork {
  private sent=new Map<string,string>();
  constructor(private editor:Editor) {
    for(const shape of editor.store.allRecords())if(shape.typeName==='shape')this.sent.set(shape.id,fingerprint(shape));
  }
  async prepare() {
    const shapes=this.editor.getCurrentPageShapes().filter(s=>isStudentWork(s)&&this.sent.get(s.id)!==fingerprint(s));
    const versions=shapes.map(s=>[s.id,fingerprint(s)] as const);
    const text=shapes.filter(s=>s.type==='text').map(s=>renderPlaintextFromRichText(this.editor,s.props.richText)).filter(Boolean).join('\n');
    const drawings=shapes.filter(s=>s.type!=='text');
    const images:MediaInput[]=[];
    if(drawings.length) {
      const bounds=drawings.map(s=>this.editor.getShapePageBounds(s.id)).filter(b=>!!b);
      const width=Math.max(...bounds.map(b=>b.maxX))-Math.min(...bounds.map(b=>b.x))+48;
      const height=Math.max(...bounds.map(b=>b.maxY))-Math.min(...bounds.map(b=>b.y))+48;
      const result=await this.editor.toImageDataUrl(drawings.map(s=>s.id),{format:'jpeg',quality:.8,background:true,padding:24,scale:Math.min(1,1280/Math.max(width,height)),pixelRatio:1});
      images.push({data:result.url.slice(result.url.indexOf(',')+1),mimeType:'image/jpeg'});
    }
    return {text,images,commit:()=>{for(const [id,version] of versions)this.sent.set(id,version);}};
  }
}

export function blobInput(blob:Blob):Promise<MediaInput> {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read the recording.'));
    reader.onload=()=>resolve({data:String(reader.result).split(',')[1],mimeType:blob.type});
    reader.readAsDataURL(blob);
  });
}
