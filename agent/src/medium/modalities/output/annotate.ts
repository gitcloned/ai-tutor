import type {TurnEvent} from '../../../engine.js';
import {BaseOutputModality} from './base.js';

export class Annotate extends BaseOutputModality {
  readonly key='annotate';
  private buffer='';
  async *handle(chunk:string):AsyncGenerator<TurnEvent>{this.buffer+=chunk;}
  async *end(attrs:Record<string,string>):AsyncGenerator<TurnEvent>{
    const content=this.buffer.trim();this.buffer='';
    // A mark-only annotation is meaningful even with no body text.
    if(content||attrs.mark?.trim())yield {type:'annotate',content,attrs};
  }
}
