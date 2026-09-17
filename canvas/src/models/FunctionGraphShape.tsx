import {BaseBoxShapeUtil,HTMLContainer,T,createShapeId,useEditor,type Editor,type TLShape,type TLShapeId} from 'tldraw';
import {createContext,useContext,useEffect,useMemo,useRef,useState} from 'react';
import type {Board} from 'jsxgraph';
import type {Block} from '../protocol';
import {assessPoint,compileEquation,graphConfig,snapped,type GraphAttempt,type GraphConfig,type GraphPoint} from './functionGraph';
import './functionGraph.css';

type Props={w:number;h:number;activityId:string;config:string;points:string};
declare module 'tldraw'{interface TLGlobalShapePropsMap{'function-graph':Props}}
export type FunctionGraphShape=TLShape<'function-graph'>;
export const GraphActivityContext=createContext<{enabled:boolean;submit:(attempt:GraphAttempt)=>boolean}>({enabled:false,submit:()=>false});
export class FunctionGraphShapeUtil extends BaseBoxShapeUtil<FunctionGraphShape>{
  static override type='function-graph' as const;
  static override props={w:T.number,h:T.number,activityId:T.string,config:T.string,points:T.string};
  getDefaultProps():Props{return {w:560,h:660,activityId:'function-graph',config:JSON.stringify(graphConfig({})),points:'[]'};}
  component(shape:FunctionGraphShape){return <HTMLContainer style={{width:shape.props.w,height:shape.props.h}}><FunctionGraphView shape={shape}/></HTMLContainer>;}
  getIndicatorPath(shape:FunctionGraphShape){const p=new Path2D();p.rect(0,0,shape.props.w,shape.props.h);return p;}
  override canResize(){return false;}
  override toSvg(shape:FunctionGraphShape){
    const c:GraphConfig=JSON.parse(shape.props.config),points:GraphPoint[]=JSON.parse(shape.props.points),f=compileEquation(c.equation);
    const sx=(x:number)=>30+(x-c.xRange[0])/(c.xRange[1]-c.xRange[0])*(shape.props.w-60);
    const sy=(y:number)=>75+(c.yRange[1]-y)/(c.yRange[1]-c.yRange[0])*(shape.props.h-140);
    let path='',connected=false;
    for(let i=0;i<=400;i++){const x=c.xRange[0]+i/400*(c.xRange[1]-c.xRange[0]),y=f(x);if(!Number.isFinite(y)||y<c.yRange[0]||y>c.yRange[1]){connected=false;continue;}path+=`${connected?'L':'M'}${sx(x)},${sy(y)} `;connected=true;}
    return <g><rect width={shape.props.w} height={shape.props.h} rx={18} fill="#fffef9"/><text x={30} y={40} fill="#416653" fontSize={22}>{c.equation}</text>
      <path d={`M30,${sy(0)}H${shape.props.w-30} M${sx(0)},75V${shape.props.h-65}`} stroke="#849181"/>
      {c.mode!=='ask'&&<path d={path} stroke="#416653" strokeWidth={3} fill="none"/>}
      {points.map((p,i)=><g key={i}><circle cx={sx(p.x)} cy={sy(p.y)} r={5} fill={p.correct?'#416653':'#b26b51'}/><text x={sx(p.x)+9} y={sy(p.y)-9} fontSize={13}>{`(${p.x}, ${p.y})`}</text></g>)}
    </g>;
  }
}

export function renderFunctionGraph(editor:Editor,block:Block,locate:(w:number,h:number)=>{x:number;y:number},focus:(id:TLShapeId)=>void){
  if(block.content!=='function-graph')throw new Error(`Unknown activity: ${block.content}`);
  const activityId=block.attrs.id??'function-graph';
  const shape=editor.getCurrentPageShapes().find((s):s is FunctionGraphShape=>s.type==='function-graph'&&s.props.activityId===activityId);
  if(block.attrs.action==='remove'){if(shape)editor.deleteShape(shape.id);return;}
  const previous=shape?JSON.parse(shape.props.config) as GraphConfig:undefined;
  const changedEquation=block.attrs.equation!==undefined&&block.attrs.equation!==previous?.equation;
  const config=graphConfig(block.attrs,changedEquation?undefined:previous);
  const reset=changedEquation||block.attrs.action==='reset'||(block.attrs.targets!==undefined&&JSON.stringify(config.targets)!==JSON.stringify(previous?.targets));
  const id=shape?.id??createShapeId();
  if(shape)editor.updateShape<FunctionGraphShape>({id,type:'function-graph',props:{config:JSON.stringify(config),...(reset?{points:'[]'}:{})}});
  else editor.createShape<FunctionGraphShape>({id,type:'function-graph',...locate(560,660),meta:{author:'tutor',kind:'model'},props:{activityId,config:JSON.stringify(config)}});
  editor.setCurrentTool('select');focus(id);
}

function FunctionGraphView({shape}:{shape:FunctionGraphShape}){
  const editor=useEditor(),activity=useContext(GraphActivityContext);
  const host=useRef<HTMLDivElement>(null),board=useRef<Board|null>(null);
  const config=useMemo(()=>JSON.parse(shape.props.config) as GraphConfig,[shape.props.config]);
  const points=useMemo(()=>JSON.parse(shape.props.points) as GraphPoint[],[shape.props.points]);
  const fn=useMemo(()=>compileEquation(config.equation),[config.equation]);
  const [cursor,setCursor]=useState<{x:number;y:number}|null>(null),[feedback,setFeedback]=useState(''),[error,setError]=useState('');
  const [bounds,setBounds]=useState([config.xRange[0],config.yRange[1],config.xRange[1],config.yRange[0]]);
  const [ready,setReady]=useState(false);
  const remaining=config.targets.filter(x=>!points.some(p=>p.correct&&Math.abs(p.x-x)<1e-7));
  const complete=config.targets.length>0&&!remaining.length;
  useEffect(()=>{
    let cancelled=false;let dispose:(()=>void)|undefined;
    setReady(false);setCursor(null);setFeedback('');setError('');
    import('jsxgraph').then(({default:JXG})=>{
      if(cancelled||!host.current)return;
      const b=JXG.JSXGraph.initBoard(host.current,{boundingbox:[config.xRange[0],config.yRange[1],config.xRange[1],config.yRange[0]],
        axis:true,grid:true,keepaspectratio:true,showCopyright:false,showNavigation:false,registerEvents:false,resize:{enabled:false,throttle:10},
        pan:{enabled:false},defaultAxes:{x:{name:'x',withLabel:true,label:{position:'rt',offset:[-12,16]}},y:{name:'y',withLabel:true,label:{position:'rt',offset:[12,-12]}}}});
      board.current=b;dispose=()=>{board.current=null;JXG.JSXGraph.freeBoard(b);};
      if(config.mode!=='ask')b.create('functiongraph',[fn],{strokeColor:'#416653',strokeWidth:3,fixed:true,highlight:false});
      setBounds(b.getBoundingBox());setReady(true);
    }).catch(e=>{if(!cancelled)setError(`Could not load the graph: ${e.message}`);});
    return()=>{cancelled=true;dispose?.();};
  },[config,fn]);
  const [left,top,right,bottom]=bounds;
  const sx=(x:number)=>(x-left)/(right-left)*1000,sy=(y:number)=>(top-y)/(top-bottom)*1000;
  function choose(clientX:number,clientY:number,el:SVGSVGElement){
    const rect=el.getBoundingClientRect();
    const x=snapped(left+(clientX-rect.left)/rect.width*(right-left),config.snap);
    const y=config.mode==='ask'?snapped(top-(clientY-rect.top)/rect.height*(top-bottom),config.snap):fn(x);
    const point=Number.isFinite(y)&&x>=left&&x<=right&&y>=bottom&&y<=top?{x,y:Number(y.toPrecision(12))}:null;
    setCursor(point);return point;
  }
  function commit(point:{x:number;y:number}|null){
    if(!point||config.mode!=='ask'||!activity.enabled||complete)return;
    if(points.some(p=>p.correct&&Math.abs(p.x-point.x)<1e-7)){setFeedback('You have already plotted that x-value. Try another.');return;}
    const result=assessPoint(config,points,point.x,point.y);
    const attempt:GraphAttempt={type:'graph-point',model:'function-graph',activityId:shape.props.activityId,equation:config.equation,...point,...result};
    if(!activity.submit(attempt)){setFeedback('Wait for your tutor, then try this point again.');return;}
    editor.updateShape<FunctionGraphShape>({id:shape.id,type:'function-graph',props:{points:JSON.stringify([...points.slice(-99),{...point,correct:result.correct}])}});
    setFeedback(result.correct?(result.complete?'All points plotted. Well done!':'That point fits. Well done!'):
      config.targets.length&&!config.targets.some(x=>Math.abs(x-point.x)<1e-7)?'Use one of the requested x-values shown below.':
      'Not quite. Substitute your x-value into the equation and try again.');
  }
  return <div className="function-graph" data-model="function-graph" data-mode={config.mode} data-ready={ready} data-points={points.length} data-complete={complete}
    onPointerDown={e=>e.stopPropagation()} onPointerMove={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()}>
    <header><span>{config.mode==='ask'?'YOUR TURN TO PLOT':'EXPLORE THE FUNCTION'}</span><strong>{config.equation.replaceAll('*',' × ')}</strong></header>
    <div className="graph-readout" aria-live="polite">{cursor?`(${cursor.x}, ${cursor.y})`:'Move across the grid to explore'}</div>
    <div className="graph-square"><div ref={host} className="graph-board"/>
      {ready&&<svg className="graph-interaction" data-bounds={JSON.stringify(bounds)} viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" aria-label="Function graph. Arrow keys move the crosshair; Enter plots a point." tabIndex={0}
        onPointerDown={e=>{e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);choose(e.clientX,e.clientY,e.currentTarget);}}
        onPointerMove={e=>choose(e.clientX,e.clientY,e.currentTarget)}
        onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId)){e.currentTarget.releasePointerCapture(e.pointerId);commit(choose(e.clientX,e.clientY,e.currentTarget));}}}
        onPointerCancel={()=>setCursor(null)}
        onKeyDown={e=>{
          e.stopPropagation();if(e.key==='Enter'||e.key===' '){e.preventDefault();commit(cursor);return;}
          if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();
          const old=cursor??{x:0,y:0},x=snapped(Math.min(right,Math.max(left,old.x+(e.key==='ArrowRight'?config.snap:e.key==='ArrowLeft'?-config.snap:0))),config.snap);
          const y=config.mode==='ask'?snapped(Math.min(top,Math.max(bottom,old.y+(e.key==='ArrowUp'?config.snap:e.key==='ArrowDown'?-config.snap:0))),config.snap):fn(x);
          if(Number.isFinite(y))setCursor({x,y});
        }}>
        {points.map((p,i)=><g key={i} data-result={p.correct?'correct':'incorrect'}><circle cx={sx(p.x)} cy={sy(p.y)} r={10} fill={p.correct?'#416653':'#b26b51'} stroke="#fffef9" strokeWidth={3}/><text x={sx(p.x)+18} y={sy(p.y)-18} fontSize={24} fill={p.correct?'#416653':'#96573f'}>{`(${p.x}, ${p.y})`}</text></g>)}
        {cursor&&<g className="graph-crosshair"><path d={`M${sx(cursor.x)},0V1000 M0,${sy(cursor.y)}H1000`} stroke="#6c8d74" strokeWidth={2} strokeDasharray="7 7"/>
          <circle cx={sx(cursor.x)} cy={sy(cursor.y)} r={9} fill="#416653"/>
          <text x={Math.min(920,Math.max(20,sx(cursor.x)+12))} y={Math.min(970,Math.max(30,sy(0)+30))} fontSize={26} fill="#416653">{cursor.x}</text>
          <text x={Math.min(900,Math.max(10,sx(0)+12))} y={Math.min(980,Math.max(30,sy(cursor.y)-12))} fontSize={26} fill="#416653">{cursor.y}</text>
        </g>}
      </svg>}
    </div>
    <footer>{config.mode==='ask'&&config.targets.length>0&&<div className="graph-targets">{config.targets.map(x=><span key={x} className={remaining.includes(x)?'':'solved'}>{remaining.includes(x)?'':'✓ '}x = {x}</span>)}</div>}
      <p role="status">{error||feedback||(config.mode==='ask'?(activity.enabled?'Tap to plot · Drag to aim · Points snap to the grid':'Your tutor is explaining. You can explore the grid.'): 'Move or touch to trace the curve and read its coordinates.')}</p>
    </footer>
  </div>;
}
