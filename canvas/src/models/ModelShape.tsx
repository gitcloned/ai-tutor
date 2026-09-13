import { BaseBoxShapeUtil, HTMLContainer, T, type TLShape, useEditor } from 'tldraw';
import { useRef } from 'react';
import './model.css';
import { cubePositions, interpolate, project, type Dimensions, type Point3 } from './model';

type Props={w:number;h:number;modelId:string;title:string;manifest:string;from:string;dimensions:string;count:number;progress:number;yaw:number;pitch:number;busy:boolean;routine:string};
declare module 'tldraw' {interface TLGlobalShapePropsMap {model3d:Props}}
export type ModelShape=TLShape<'model3d'>;
export class ModelShapeUtil extends BaseBoxShapeUtil<ModelShape> {
  static override type='model3d' as const;
  static override props={w:T.number,h:T.number,modelId:T.string,title:T.string,manifest:T.string,from:T.string,dimensions:T.string,count:T.number,progress:T.number,yaw:T.number,pitch:T.number,busy:T.boolean,routine:T.string};
  getDefaultProps():Props {return {w:560,h:420,modelId:'',title:'Unit cubes',manifest:'',from:'[4,3,2]',dimensions:'[4,3,2]',count:0,progress:1,yaw:-.62,pitch:.48,busy:false,routine:''};}
  component(shape:ModelShape) {return <HTMLContainer style={{width:shape.props.w,height:shape.props.h}}><ModelView shape={shape}/></HTMLContainer>;}
  getIndicatorPath(shape:ModelShape) {const p=new Path2D();p.rect(0,0,shape.props.w,shape.props.h);return p;}
  override toSvg(shape:ModelShape) {return <g><rect width={shape.props.w} height={shape.props.h} fill="#fffef9" rx="16"/><CubeScene props={shape.props}/></g>;}
}

const faces=[ [0,1,3,2], [4,6,7,5], [0,4,5,1], [2,3,7,6], [0,2,6,4], [1,5,7,3] ];
const vertices:Point3[]=[[-.48,-.48,-.48],[.48,-.48,-.48],[-.48,.48,-.48],[.48,.48,-.48],[-.48,-.48,.48],[.48,-.48,.48],[-.48,.48,.48],[.48,.48,.48]];
const palette=['#b5ceb0','#729776','#91b08a','#c5d8b6','#7ea187','#a3c59e'];
export function CubeScene({props:p}:{props:Props}) {
  const dims=JSON.parse(p.dimensions) as Dimensions, old=JSON.parse(p.from) as Dimensions;
  const points=cubePositions(dims),previous=cubePositions(old);
  const scale=Math.min((p.w-120)/(Math.max(dims[0],old[0])+Math.max(dims[1],old[1])*.6),(p.h-140)/5);
  const screen=(v:Point3)=>{const [x,y,z]=project(v,p.yaw,p.pitch);return [p.w/2+x*scale,p.h*.65+y*scale,z];};
  const polys:{points:string;depth:number;color:string;opacity:number}[]=[];
  for(let i=0;i<Math.ceil(p.count);i++) {
    const center=interpolate(previous[i]??points[i],points[i],p.progress);
    const vs=vertices.map(v=>screen(v.map((n,j)=>n+center[j]) as Point3));
    faces.forEach((f,j)=>polys.push({points:f.map(k=>vs[k].slice(0,2).join(',')).join(' '),depth:f.reduce((a,k)=>a+vs[k][2],0)/4,color:palette[j],opacity:Math.min(1,p.count-i)}));
  }
  polys.sort((a,b)=>a.depth-b.depth);
  const [w,d,h]=dims;
  const corner=(x:number,y:number,z:number)=>screen([x-w/2,y,z-d/2]).slice(0,2).join(',');
  const outline=[[[0,0,0],[w,0,0]],[[0,0,0],[0,0,d]],[[w,0,0],[w,0,d]],[[0,0,d],[w,0,d]],[[0,h,0],[w,h,0]],[[0,h,0],[0,h,d]],[[w,h,0],[w,h,d]],[[0,h,d],[w,h,d]],[[0,0,0],[0,h,0]],[[w,0,0],[w,h,0]],[[0,0,d],[0,h,d]],[[w,0,d],[w,h,d]]];
  return <svg width={p.w} height={p.h} viewBox={`0 0 ${p.w} ${p.h}`} role="img" aria-label={`${dims.join(' by ')} centimetre cuboid, ${Math.floor(p.count)} unit cubes`}>
    <ellipse cx={p.w/2} cy={p.h*.72} rx={p.w*.3} ry="20" fill="#41583b" opacity=".06"/>
    {outline.map((e,i)=><polyline key={'outline'+i} points={e.map(v=>corner(v[0],v[1],v[2])).join(' ')} stroke="#80967b" strokeWidth="1" fill="none" strokeDasharray="4 5" opacity=".55"/>)}
    {polys.map((f,i)=><polygon key={i} points={f.points} fill={f.color} fillOpacity={f.opacity} stroke="#fffef9" strokeWidth=".8"/>)}
    <text x={p.w/2} y={p.h-63} textAnchor="middle" fill="#52694c" fontSize="17" fontFamily="sans-serif">{w} × {d} × {h} cm</text>
    <text x={p.w/2} y={p.h-38} textAnchor="middle" fill="#718368" fontSize="12" fontFamily="sans-serif">{Math.floor(p.count)} unit cubes · each cube is 1 cm³</text>
  </svg>;
}
function ModelView({shape}:{shape:ModelShape}) {
  const editor=useEditor(),drag=useRef<{x:number;y:number;yaw:number;pitch:number}|null>(null);
  const p=shape.props;
  return <div className="model-card" data-model={p.modelId} data-routine={p.routine} data-count={Math.floor(p.count)} data-busy={p.busy}>
    <div className="model-heading"><span>EXPLORE IN 3D</span><span>{p.busy?'Watch the cubes…':'Drag to turn'}</span></div>
    <div className="model-orbit" style={{pointerEvents:'all',touchAction:'none'}} onPointerDown={e=>{if(editor.getCurrentToolId()!=='select'||p.busy)return;e.stopPropagation();e.currentTarget.setPointerCapture(e.pointerId);drag.current={x:e.clientX,y:e.clientY,yaw:p.yaw,pitch:p.pitch};}}
      onPointerMove={e=>{if(!drag.current)return;e.stopPropagation();editor.updateShape<ModelShape>({id:shape.id,type:'model3d',props:{yaw:drag.current.yaw+(e.clientX-drag.current.x)*.01,pitch:Math.max(.15,Math.min(1.2,drag.current.pitch+(e.clientY-drag.current.y)*.006))}});}}
      onPointerUp={e=>{if(drag.current){e.stopPropagation();drag.current=null;}}} onPointerCancel={()=>{drag.current=null;}}>
      <CubeScene props={p}/>
    </div>
    <button className="model-reset-view" style={{pointerEvents:'all'}} aria-label="Reset 3D view" onPointerDown={e=>e.stopPropagation()} onClick={()=>editor.updateShape<ModelShape>({id:shape.id,type:'model3d',props:{yaw:-.62,pitch:.48}})}>Reset view</button>
  </div>;
}
