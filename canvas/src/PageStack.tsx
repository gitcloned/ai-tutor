import {createContext,useContext,useRef} from 'react';
import {AssetRecordType,BaseBoxShapeUtil,createShapeId,HTMLContainer,T,useEditor,type Editor,type TLAssetId,type TLShape} from 'tldraw';
import {pageUrl,type CameraPage} from './cameraPages';
import {resolvePlacement} from './layout';
import './camera.css';

declare module 'tldraw'{interface TLGlobalShapePropsMap{'page-stack':{w:number;h:number;assets:string[]}}}
export type PageStackShape=TLShape<'page-stack'>;
export const PageStackContext=createContext<(urls:string[])=>void>(()=>{});
function sources(editor:Editor,shape:PageStackShape){return shape.props.assets.flatMap(id=>{const asset=editor.getAsset(id as TLAssetId);return asset?.type==='image'&&asset.props.src?[asset.props.src]:[];});}
export class PageStackUtil extends BaseBoxShapeUtil<PageStackShape>{
  static override type='page-stack' as const;
  static override props={w:T.number,h:T.number,assets:T.arrayOf(T.string)};
  getDefaultProps(){return {w:260,h:310,assets:[]};}
  override canResize(){return false;}
  component(shape:PageStackShape){return <Stack shape={shape}/>;}
  getIndicatorPath(shape:PageStackShape){const path=new Path2D();path.rect(0,0,shape.props.w,shape.props.h);return path;}
  override toSvg(shape:PageStackShape){const urls=sources(this.editor,shape);return <g><rect width={shape.props.w} height={shape.props.h} rx={16} fill="#fffefa" stroke="#bdcdbb"/>{urls[0]&&<image href={urls[0]} x={18} y={18} width={shape.props.w-36} height={shape.props.h-70} preserveAspectRatio="xMidYMid meet"/>}<text x={20} y={shape.props.h-22} fontSize={16} fill="#416653">Your work · {urls.length} pages</text></g>;}
}
function Stack({shape}:{shape:PageStackShape}){
  const editor=useEditor(),open=useContext(PageStackContext),urls=sources(editor,shape),touch=useRef<{id:number;x:number;y:number}|null>(null);
  return <HTMLContainer style={{width:shape.props.w,height:shape.props.h,pointerEvents:'all'}}><button className="page-stack" aria-label={`Open your work, ${urls.length} pages`} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onTouchStart={e=>{e.stopPropagation();const t=e.touches[0];touch.current=e.touches.length===1?{id:t.identifier,x:t.clientX,y:t.clientY}:null;}}
    onTouchMove={e=>{const t=e.touches[0],start=touch.current;if(!start||e.touches.length!==1||Math.hypot(t.clientX-start.x,t.clientY-start.y)>10)touch.current=null;}}
    onTouchCancel={()=>{touch.current=null;}}
    onTouchEnd={e=>{e.stopPropagation();const start=touch.current;touch.current=null;const t=Array.from(e.changedTouches).find(t=>t.identifier===start?.id);if(start&&t&&e.touches.length===0&&Math.hypot(t.clientX-start.x,t.clientY-start.y)<=10){e.preventDefault();open(urls);}}} onClick={()=>open(urls)}><div className="page-stack-sheets">{urls.slice(0,3).reverse().map((url,i)=><img key={i} src={url} alt="" style={{transform:`translate(${(Math.min(3,urls.length)-1-i)*5}px,${-(Math.min(3,urls.length)-1-i)*5}px)`}}/>)}</div><strong>Your work · {urls.length} {urls.length===1?'page':'pages'}</strong><span>Tap to view</span></button></HTMLContainer>;
}

export function addPageStack(editor:Editor,pages:CameraPage[]){
  const assets=pages.map(page=>({id:AssetRecordType.createId(),type:'image' as const,typeName:'asset' as const,meta:{},props:{name:'Student page',src:pageUrl(page),w:page.width,h:page.height,mimeType:page.mimeType,isAnimated:false}}));
  const view=editor.getViewportPageBounds(),w=260,h=310;
  const obstacles=editor.getCurrentPageShapes().flatMap(s=>{const b=editor.getShapePageBounds(s.id);return b?[{x:b.x,y:b.y,w:b.w,h:b.h}]:[];});
  const position=resolvePlacement({},w,h,{x:view.x+Math.min(180,view.w*.2),y:view.y+80},obstacles);
  editor.run(()=>{
    editor.createAssets(assets);
    editor.createShape<PageStackShape>({id:createShapeId(),type:'page-stack',...position,props:{w,h,assets:assets.map(a=>a.id)},meta:{author:'student',submitted:true}});
  });
}
