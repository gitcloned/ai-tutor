import {AssetRecordType,Box,createShapeId,getDisplayValues,renderPlaintextFromRichText,TextShapeUtil,toRichText,type Editor,type TLFrameShape,type TLShapeId,type TLTextShape} from 'tldraw';
import type {Block} from './protocol';
import {resolvePlacement,textStyle} from './layout';
import {renderHtmlFromRichTextForMeasurement} from 'tldraw';

const STEP_WIDTH=500,NOTE_X=640,NOTE_WIDTH=460,PADDING=32,GAP=44;

/** Saved shapes retain their original dimensions; upgrade older question rows once. */
export function upgradeQuestionLayout(editor:Editor){
  editor.run(()=>{
    const oldArrows=editor.store.allRecords().filter(r=>r.typeName==='shape').filter(r=>r.type==='arrow'&&r.meta.author==='tutor'&&r.meta.kind==='annotate');
    editor.deleteShapes(oldArrows.map(s=>s.id));
    const shapes=editor.store.allRecords().filter(r=>r.typeName==='shape');
    for(const frame of shapes){
      if(frame.type!=='frame'||frame.meta.kind!=='question')continue;
      const children=shapes.filter(s=>s.parentId===frame.id);
      if(frame.props.w>=1132)continue;
      const steps=children.filter(s=>typeof s.meta.questionStep==='number').sort((a,b)=>Number(a.meta.questionStep)-Number(b.meta.questionStep));
      let y=PADDING;
      for(const step of steps){
        const row=children.filter(s=>s.id===step.id||s.meta.stepId===step.id);
        const shift=y-step.y;
        for(const child of row){
          if(child.type==='text'&&child.meta.kind==='annotate')editor.updateShape({id:child.id,type:'text',y:child.y+shift,props:{w:NOTE_WIDTH}});
          else editor.updateShape({id:child.id,type:child.type,y:child.y+shift});
        }
        y=Math.max(...row.map(s=>{const updated=editor.getShape(s.id)!;return updated.y+editor.getShapeGeometry(updated).bounds.maxY;}))+GAP;
      }
      editor.updateShape({id:frame.id,type:'frame',props:{w:1132,h:steps.length?y-GAP+PADDING:frame.props.h}});
    }
  });
}
const union=(boxes:Box[])=>{
  const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
  return new Box(x,y,Math.max(...boxes.map(b=>b.maxX))-x,Math.max(...boxes.map(b=>b.maxY))-y);
};

/** Native frame and child shapes preserve a complete worked example in the notebook. */
export class Questions {
  private lastWritten:TLShapeId|null=null;
  constructor(private editor:Editor){}
  get active(){return this.editor.getCurrentPageShapes().find((s):s is TLFrameShape=>s.type==='frame'&&s.meta.questionActive===true);}
  private steps(frame:TLFrameShape){return this.editor.getCurrentPageShapes().filter((s):s is TLTextShape=>s.type==='text'&&s.parentId===frame.id&&typeof s.meta.questionStep==='number').sort((a,b)=>Number(a.meta.questionStep)-Number(b.meta.questionStep));}
  start(content:string){
    const key=content.trim();if(!key)return;
    const active=this.active;
    if(key!=='end'&&active?.meta.questionId===key)return active.id;
    if(active)this.editor.updateShape({id:active.id,type:'frame',meta:{...active.meta,questionActive:false}});
    this.lastWritten=null;
    if(key==='end')return;
    const shapes=this.editor.getCurrentPageShapes();
    const model=shapes.find(s=>s.type==='model3d'||s.type==='function-graph');
    const bounds=shapes.filter(s=>s.type!=='model3d'&&s.type!=='function-graph').map(s=>this.editor.getShapePageBounds(s.id)).filter((b):b is Box=>!!b);
    const x=model?model.x+model.props.w+40:140,y=bounds.length?Math.max(...bounds.map(b=>b.maxY))+80:100;
    const id=createShapeId();
    this.editor.createShape({id,type:'frame',x,y,meta:{author:'tutor',kind:'question',questionId:key,questionActive:true},props:{w:1132,h:140,name:'Question',color:'green'}});
    return id;
  }
  beginStep(){
    const frame=this.active;if(!frame)return null;
    const children=this.editor.getCurrentPageShapes().filter(s=>s.parentId===frame.id);
    const bottom=children.length?Math.max(...children.map(s=>s.y+this.editor.getShapeGeometry(s).bounds.maxY)):0;
    const order=this.steps(frame).length;
    return {parentId:frame.id,x:PADDING,y:children.length?bottom+GAP:PADDING,w:STEP_WIDTH,meta:{author:'tutor',kind:'write',questionId:frame.meta.questionId,questionStep:order}};
  }
  written(id:TLShapeId){this.lastWritten=id;this.resize(id);}
  placeStep(id:TLShapeId,text:string){
    const step=this.editor.getShape<TLTextShape>(id);if(!step)return;
    const frame=this.editor.getShape(step.parentId as TLShapeId);if(frame?.type!=='frame')return;
    // Measure the completed text before typing, including every wrapped line.
    const dv=getDisplayValues(this.editor.getShapeUtil(step) as TextShapeUtil,step);
    const measured=this.editor.textMeasure.measureHtml(renderHtmlFromRichTextForMeasurement(this.editor,toRichText(text)),{...dv,padding:'0px',maxWidth:Math.max(16,Math.floor(step.props.w))});
    const bounds={w:step.props.w*step.props.scale,h:Math.max(dv.fontSize,measured.h)*step.props.scale};
    const obstacles=this.editor.getCurrentPageShapes()
      // Containers have no ink of their own. Their descendants are checked below.
      .filter(s=>s.id!==id&&s.type!=='frame'&&s.type!=='group')
      .flatMap(s=>{
        const box=this.editor.getShapePageBounds(s.id);if(!box)return [];
        // Student strokes may belong to the page or another group. Compare all
        // bounds in this question's coordinates, regardless of their parent.
        const points=[{x:box.x,y:box.y},{x:box.maxX,y:box.y},{x:box.x,y:box.maxY},{x:box.maxX,y:box.maxY}].map(p=>this.editor.getPointInShapeSpace(frame,p));
        const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
        return [{x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y,student:s.meta.author!=='tutor'&&s.type!=='model3d'}];
      });
    // Student answers are a continuous work area, including blank gaps between
    // strokes. Continue below all student work in this question's horizontal
    // area, rather than inserting a tutor step into the first available gap.
    const answerBottom=Math.max(step.y-GAP,...obstacles
      .filter(b=>b.student&&b.x<frame.props.w&&b.x+b.w>0&&b.y+b.h>0)
      .map(b=>b.y+b.h));
    const point=resolvePlacement({},Math.max(step.props.w,bounds.w),bounds.h,{x:step.x,y:Math.max(step.y,answerBottom+GAP)},obstacles);
    if(point.y!==step.y)this.editor.updateShape({id,type:'text',y:point.y});
  }
  resize(id:TLShapeId){
    const shape=this.editor.getShape(id);if(!shape)return;
    const frame=this.editor.getShape(shape.parentId as TLShapeId);if(frame?.type!=='frame'||!frame.meta.questionId)return;
    const children=this.editor.getCurrentPageShapes().filter(s=>s.parentId===frame.id);
    const bottom=Math.max(PADDING,...children.map(s=>s.y+this.editor.getShapeGeometry(s).bounds.maxY));
    this.editor.updateShape({id:frame.id,type:'frame',props:{h:bottom+PADDING}});
  }
  private latest(){
    const frame=this.active;
    if(frame)return this.steps(frame).at(-1);
    const shape=this.lastWritten&&this.editor.getCurrentPageShapeIds().has(this.lastWritten)?this.editor.getShape(this.lastWritten):undefined;
    return shape?.type==='text'?shape:undefined;
  }
  private targets(step:TLTextShape,target?:string):Box[]{
    const text=renderPlaintextFromRichText(this.editor,step.props.richText);
    const dv=getDisplayValues(this.editor.getShapeUtil(step) as TextShapeUtil,step);
    const spans=this.editor.textMeasure.measureTextSpans(text,{...dv,width:step.props.w,height:10000,padding:0,overflow:'wrap',textAlign:'start'});
    const measured=spans.map(s=>s.text).join('');
    const start=target?measured.indexOf(target):0,end=target?start+target.length:measured.length;
    if(start<0)throw new Error(`Annotation target “${target}” was not found in the latest step.`);
    let offset=0;
    const boxes:Box[]=[];
    for(const span of spans){
      const a=offset,b=offset+span.text.length;offset=b;
      if(b<=start||a>=end)continue;
      // Measure partial words too, so targeting "x" in "2x" marks only x.
      const width=(value:string)=>this.editor.textMeasure.measureTextSpans(value,{...dv,width:10000,height:10000,padding:0,overflow:'wrap',textAlign:'start'}).reduce((n,s)=>n+s.box.w,0);
      const left=width(span.text.slice(0,Math.max(0,start-a)));
      const selected=width(span.text.slice(Math.max(0,start-a),Math.min(span.text.length,end-a)));
      boxes.push(new Box(step.x+span.box.x+left,step.y+span.box.y,Math.max(selected,1),span.box.h));
    }
    if(!boxes.length)return [new Box(step.x,step.y,step.props.w,this.editor.getShapeGeometry(step).bounds.h)];
    const lines:Box[][]=[];
    for(const box of boxes){const row=lines.find(row=>Math.abs(row[0].y-box.y)<2);if(row)row.push(box);else lines.push([box]);}
    return lines.map(union);
  }
  annotate(block:Block){
    const step=this.latest();if(!step)throw new Error('Write a step before annotating it.');
    const requestedMark=block.attrs.mark?.trim(),mark=requestedMark==='arrow'?undefined:requestedMark,note=block.content.trim();
    if(mark&&!['circle','underline'].includes(mark))throw new Error(`Unknown annotation mark: ${mark}`);
    if(!mark&&!note)return step.id;
    const targets=mark?this.targets(step,block.attrs.target?.trim()||undefined):[];
    const meta={author:'tutor',kind:'annotate',stepId:step.id,questionId:step.meta.questionId??'',mark:mark??'',target:block.attrs.target??''};
    const previous=this.editor.getCurrentPageShapes().filter(s=>s.meta.stepId===step.id&&s.type==='text');
    const noteY=previous.length?Math.max(...previous.map(s=>s.y+this.editor.getShapeGeometry(s).bounds.h))+24:step.y;
    const noteX=step.x+NOTE_X-PADDING;
    if(note)this.editor.createShape({id:createShapeId(),type:'text',parentId:step.parentId,x:noteX,y:noteY,meta,props:{richText:toRichText(note),...textStyle('ask'),autoSize:false,w:NOTE_WIDTH}});
    if(mark){
      for(const box of targets){
        const w=box.w+16,h=box.h+16;
        const path=mark==='circle'?`<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2-2}" ry="${h/2-2}"/>`:`<path d="M 4 ${h-5} Q ${w/2} ${h-2} ${w-4} ${h-5}"/>`;
        const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#416653" stroke-width="2.5" stroke-linecap="round">${path}</g></svg>`;
        const assetId=AssetRecordType.createId();
        this.editor.createAssets([{id:assetId,typeName:'asset',type:'image',meta:{},props:{name:`${mark} annotation`,src:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,w,h,mimeType:'image/svg+xml',isAnimated:false}}]);
        this.editor.createShape({id:createShapeId(),type:'image',parentId:step.parentId,x:box.x-8,y:box.y-8,meta,props:{assetId,w,h}});
      }
    }
    this.resize(step.id);return step.id;
  }
  rowBounds(id:TLShapeId){
    const shape=this.editor.getShape(id);if(!shape||typeof shape.meta.questionStep!=='number')return null;
    const shapes=this.editor.getCurrentPageShapes().filter(s=>s.id===id||s.meta.stepId===id);
    const boxes=shapes.map(s=>this.editor.getShapePageBounds(s.id)).filter((b):b is Box=>!!b);
    return boxes.length?union(boxes):null;
  }
}
