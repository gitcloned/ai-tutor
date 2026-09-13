export type Dimensions = [number,number,number];
export type Stage = {dimensions:Dimensions;count:number;duration:number};
export type Model = {id:string;version:1;title:string;renderer:'unit-cubes';unit:'cm';dimensions:Dimensions;actions:Record<string,Stage[]>};
export type Point3 = [number,number,number];

export function validateModel(value: unknown): Model {
  const m=value as Model;
  const dims=(d:unknown):d is Dimensions=>Array.isArray(d)&&d.length===3&&d.every(n=>Number.isInteger(n)&&n>0&&n<=12)&&d.reduce((a,b)=>a*b,1)<=144;
  if(!m||m.version!==1||m.renderer!=='unit-cubes'||m.unit!=='cm'||typeof m.title!=='string'||!dims(m.dimensions)||!m.actions||typeof m.actions!=='object') throw new Error('Unsupported 3D model package.');
  for(const stages of Object.values(m.actions)) {
    if(!Array.isArray(stages)||!stages.length||stages.length>10) throw new Error('Invalid model routine.');
    for(const s of stages) if(!dims(s.dimensions)||s.dimensions.reduce((a,b)=>a*b,1)!==m.dimensions.reduce((a,b)=>a*b,1)||!Number.isInteger(s.count)||s.count<0||s.count>s.dimensions.reduce((a,b)=>a*b,1)||!Number.isFinite(s.duration)||s.duration<0||s.duration>10000) throw new Error('Invalid model stage.');
  }
  return m;
}
export async function loadModel(id:string, signal:AbortSignal):Promise<Model> {
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('Invalid model ID.');
  const base=import.meta.env.VITE_MODEL_BASE_URL || '/api/models';
  const response=await fetch(`${base}/${id}/manifest.json`,{signal});
  if(!response.ok) throw new Error(`Could not load ${id}. Check the teaching resource server.`);
  const model=validateModel(await response.json());
  if(model.id!==id) throw new Error('Model ID does not match its package.');
  return model;
}
// Width × depth × height; cube identity is preserved when the layout changes.
export function cubePositions([w,d,h]:Dimensions):Point3[] {
  const points:Point3[]=[];
  for(let y=0;y<h;y++) for(let z=0;z<d;z++) for(let x=0;x<w;x++) points.push([x-w/2+.5,y+.5,z-d/2+.5]);
  return points;
}
export function interpolate(a:Point3,b:Point3,t:number):Point3 {return a.map((n,i)=>n+(b[i]-n)*t) as Point3;}
export function project([x,y,z]:Point3,yaw:number,pitch:number):Point3 {
  const xx=x*Math.cos(yaw)-z*Math.sin(yaw),zz=x*Math.sin(yaw)+z*Math.cos(yaw);
  return [xx,-y*Math.cos(pitch)+zz*Math.sin(pitch),y*Math.sin(pitch)+zz*Math.cos(pitch)];
}
