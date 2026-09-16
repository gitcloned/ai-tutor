import {FrameShapeUtil,type TLFrameShape,type TLShape,type TLDragShapesInInfo} from 'tldraw';

/** Questions group tutor content without creating a boundary for student ink. */
export class QuestionFrameUtil extends FrameShapeUtil {
  override getClipPath(shape:TLFrameShape){
    return shape.meta.kind==='question'?undefined:super.getClipPath(shape);
  }
  override canReceiveNewChildrenOfType(shape:TLFrameShape,type:TLShape['type']){
    return shape.meta.kind==='question'?false:super.canReceiveNewChildrenOfType(shape,type);
  }
  override onDragShapesIn(shape:TLFrameShape,children:TLShape[],info:TLDragShapesInInfo){
    if(shape.meta.kind!=='question')super.onDragShapesIn(shape,children,info);
  }
}
