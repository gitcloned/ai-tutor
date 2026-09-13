import { createShapeId, type Editor } from 'tldraw';
import { delay } from '../playback';
import { loadModel, validateModel } from './model';
import type { ModelShape } from './ModelShape';
import type { Block } from '../protocol';

export async function playModel(editor:Editor,block:Block,signal:AbortSignal,paused:()=>boolean,locate:(w:number,h:number)=>{x:number;y:number},focus:(id:ModelShape['id'])=>void) {
  let shape=editor.getCurrentPageShapes().find((s):s is ModelShape=>s.type==='model3d'&&s.props.modelId===block.content);
  if(block.attrs.action==='remove') {
    if(!signal.aborted&&shape)editor.deleteShape(shape.id);
    return;
  }
  const model=shape?validateModel(JSON.parse(shape.props.manifest)):await loadModel(block.content,signal);
  if(signal.aborted)return;
  const action=block.attrs.action;
  const stages=action?Object.hasOwn(model.actions,action)?model.actions[action]:null:[];
  if(!stages)throw new Error(`Unknown routine ${action} for ${model.id}.`);
  if(!shape) {
    const id=createShapeId();
    editor.createShape<ModelShape>({id,type:'model3d',...locate(560,420),meta:{author:'tutor',kind:'model3d'},props:{modelId:model.id,title:model.title,manifest:JSON.stringify(model),dimensions:JSON.stringify(model.dimensions),from:JSON.stringify(model.dimensions)}});
    shape=editor.getShape<ModelShape>(id)!;
  }
  const id=shape.id;focus(id);
  try {
    for(const stage of stages) {
      const initial=editor.getShape<ModelShape>(id);if(!initial)return;
      const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:stage.duration;
      const frames=Math.max(1,Math.ceil(duration/40));
      editor.updateShape<ModelShape>({id,type:'model3d',props:{busy:true,routine:action!,from:initial.props.dimensions,dimensions:JSON.stringify(stage.dimensions)}});
      for(let frame=1;frame<=frames;frame++) {
        if(signal.aborted||!editor.getShape(id))return;
        await delay(duration/frames,signal,paused);
        const t=frame/frames,ease=t*t*(3-2*t);
        editor.updateShape<ModelShape>({id,type:'model3d',props:{count:initial.props.count+(stage.count-initial.props.count)*ease,progress:ease}});
      }
    }
  } finally {if(editor.getShape(id))editor.updateShape<ModelShape>({id,type:'model3d',props:{busy:false}});}
}
