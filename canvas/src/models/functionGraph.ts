import type {Attrs} from '../protocol';

export type GraphConfig={equation:string;mode:'plot'|'ask'|'explore';targets:number[];xRange:[number,number];yRange:[number,number];snap:number};
export type GraphPoint={x:number;y:number;correct:boolean};
export type GraphAttempt=GraphPoint&{type:'graph-point';model:'function-graph';activityId:string;equation:string;complete:boolean;remaining:number[]};
type Fn=(x:number)=>number;

/** Small arithmetic grammar. Model output is never evaluated as JavaScript. */
export function compileEquation(equation:string):Fn {
  if(equation.length>200)throw new Error('Please use a shorter function.');
  const match=equation.replaceAll('−','-').replaceAll('×','*').match(/^\s*y\s*=\s*(.+)$/i);
  if(!match)throw new Error('Use a function written as y = ..., for example y = 2*x - 3.');
  const source=match[1].replace(/\s+/g,'');
  const raw=source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+\-*/^]/gi)??[];
  if(raw.join('')!==source||raw.length>100)throw new Error('Unsupported function expression.');
  const tokens:string[]=[];
  for(const token of raw){
    const last=tokens.at(-1);
    if(last&&(/^(?:\d|\.)/.test(last)||['x','pi','e',')'].includes(last))&&(/^[a-z(]/i.test(token)))tokens.push('*');
    tokens.push(token.toLowerCase());
  }
  let index=0;
  const functions:Record<string,Fn>={sin:Math.sin,cos:Math.cos,abs:Math.abs,sqrt:Math.sqrt};
  function expression(min=0):Fn{
    const token=tokens[index++];let left:Fn;
    if(token==='+'||token==='-'){const child=expression(3);left=x=>token==='-'?-child(x):child(x);}
    else if(token==='('){left=expression();if(tokens[index++]!==')')throw new Error('Unclosed parentheses in function.');}
    else if(token==='x')left=x=>x;
    else if(token==='pi'||token==='e')left=()=>token==='pi'?Math.PI:Math.E;
    else if(token&&/^(?:\d|\.)/.test(token)){const n=Number(token);left=()=>n;}
    else if(token&&Object.hasOwn(functions,token)){
      if(tokens[index++]!=='(')throw new Error('Function calls need parentheses.');
      const argument=expression();if(tokens[index++]!==')')throw new Error('Unclosed function call.');
      left=x=>functions[token](argument(x));
    }else throw new Error('Use x, numbers, arithmetic, sin, cos, abs or sqrt.');
    while(index<tokens.length){
      const op=tokens[index],precedence=op==='+'||op==='-'?1:op==='*'||op==='/'?2:op==='^'?4:0;
      if(!precedence||precedence<min)break;
      index++;const right=expression(op==='^'?precedence:precedence+1),previous=left;
      left=x=>{const a=previous(x),b=right(x);return op==='+'?a+b:op==='-'?a-b:op==='*'?a*b:op==='/'?a/b:Math.pow(a,b);};
    }
    return left;
  }
  const fn=expression();if(index!==tokens.length)throw new Error('Unsupported function expression.');return fn;
}

const numbers=(value:string)=>value.split(',').map(s=>s.trim()?Number(s):NaN);
const close=(a:number,b:number)=>Math.abs(a-b)<1e-7;
export const snapped=(n:number,step:number)=>Number((Math.round(n/step)*step).toPrecision(12));
export function graphConfig(attrs:Attrs,previous?:GraphConfig):GraphConfig{
  const equation=attrs.equation??previous?.equation??'y = 2*x - 3';
  const fn=compileEquation(equation);
  const action=attrs.action??previous?.mode??'plot';
  const mode=action==='reset'?previous?.mode??'ask':action;
  if(!['plot','ask','explore'].includes(mode))throw new Error(`Unknown graph action: ${action}`);
  const targets=attrs.targets!==undefined?[...new Set(numbers(attrs.targets))]:previous?.targets??[];
  if(targets.length>20||targets.some(x=>!Number.isFinite(x)||Math.abs(x)>10000||!Number.isFinite(fn(x))))throw new Error('Targets must be up to 20 finite x-values in the function domain.');
  const snap=attrs.snap!==undefined?Number(attrs.snap):previous?.snap??1;
  if(!Number.isFinite(snap)||snap<.01||snap>10)throw new Error('Graph snap must be between 0.01 and 10.');
  if(mode==='ask'&&targets.some(x=>!close(snapped(x,snap),x)||!close(snapped(fn(x),snap),fn(x))))throw new Error('Choose a snap size that lets the student reach every target coordinate.');
  const range=(key:'x-range'|'y-range',old:[number,number]|undefined,values:number[]):[number,number]=>{
    const r=attrs[key]?numbers(attrs[key]):old??[Math.min(-5,...values.map(n=>Math.floor(n)-2)),Math.max(7,...values.map(n=>Math.ceil(n)+2))];
    if(r.length!==2||r.some(n=>!Number.isFinite(n)||Math.abs(n)>10000)||r[1]-r[0]<1||r[1]-r[0]>200)throw new Error('Graph ranges must be increasing, between 1 and 200 units wide.');
    if(mode==='ask'&&values.some(n=>n<=r[0]||n>=r[1]))throw new Error('Expand the graph range to include all target points.');
    return r as [number,number];
  };
  return {equation,mode:mode as GraphConfig['mode'],targets,snap,
    xRange:range('x-range',previous?.xRange,targets),yRange:range('y-range',previous?.yRange,targets.map(fn))};
}

export function assessPoint(config:GraphConfig,points:GraphPoint[],x:number,y:number){
  const expected=compileEquation(config.equation)(x);
  const correct=Number.isFinite(expected)&&close(y,expected)&&(!config.targets.length||config.targets.some(t=>close(t,x)));
  const solved=[...points.filter(p=>p.correct).map(p=>p.x),...(correct?[x]:[])];
  const remaining=config.targets.filter(t=>!solved.some(s=>close(t,s)));
  return {correct,remaining,complete:config.targets.length>0&&remaining.length===0};
}
