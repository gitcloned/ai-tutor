import {blobInput,type MediaInput} from './studentWork';

export type CameraPage=MediaInput&{id:string;width:number;height:number};
export const pageUrl=(page:MediaInput)=>`data:${page.mimeType};base64,${page.data}`;

/** Keep each page readable independently; JPEG quality reduces upload bytes. */
export async function capturePage(video:HTMLVideoElement):Promise<CameraPage>{
  if(!video.videoWidth||!video.videoHeight)throw new Error('Wait for the camera to be ready.');
  const scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
  const canvas=document.createElement('canvas');
  canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);
  const context=canvas.getContext('2d');if(!context)throw new Error('Could not capture this page.');
  // CSS may mirror the selfie preview, but the actual handwriting is never mirrored.
  context.drawImage(video,0,0,canvas.width,canvas.height);
  const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Could not capture this page.')),'image/jpeg',.82));
  return {...await blobInput(blob),id:crypto.randomUUID(),width:canvas.width,height:canvas.height};
}
