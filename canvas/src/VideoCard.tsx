import {createContext,useContext} from 'react';
import {EmbedShapeUtil,VideoShapeUtil,HTMLContainer,type TLEmbedShape,type TLVideoShape,useEditor} from 'tldraw';
import {Play} from 'lucide-react';
import {safeMedia} from './protocol';
import './videoCard.css';
export const VideoCardContext=createContext<{enabled:boolean;open:(url:string)=>void}>({enabled:false,open:()=>{}});
function Card({url,w,h}:{url:string;w:number;h:number}){
  const playback=useContext(VideoCardContext),media=safeMedia(url);
  const id=media?.kind==='youtube'?new URL(media.url).searchParams.get('v'):null;
  return <HTMLContainer style={{width:w,height:h,pointerEvents:'all'}}><button className="watch-again-card" disabled={!playback.enabled} onPointerDown={e=>e.stopPropagation()} onPointerUp={e=>e.stopPropagation()} onClick={()=>playback.open(url)} aria-label="Watch video again">
    {id&&<img src={`https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`} alt=""/>}<span className="watch-again-play"><Play size={28} fill="currentColor"/></span><span className="watch-again-label">Watch again</span>
  </button></HTMLContainer>;
}
export class LessonEmbedUtil extends EmbedShapeUtil{
  override component(shape:TLEmbedShape){return shape.meta.kind==='play'?<Card url={shape.props.url} w={shape.props.w} h={shape.props.h}/>:super.component(shape);}
}
function VideoCard({shape}:{shape:TLVideoShape}){const editor=useEditor();const asset=shape.props.assetId?editor.getAsset(shape.props.assetId):null;return <Card url={asset&&'src' in asset.props?asset.props.src??'':''} w={shape.props.w} h={shape.props.h}/>;}
export class LessonVideoUtil extends VideoShapeUtil{
  override component(shape:TLVideoShape){return shape.meta.kind==='play'?<VideoCard shape={shape}/>:super.component(shape);}
}
