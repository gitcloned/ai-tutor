import type {TurnEvent} from '../../../engine.js';
import {BaseOutputModality} from './base.js';

/** Starts a worked question, or closes it with the reserved value "end". */
export class Question extends BaseOutputModality {
  readonly key='question';
  private buffer='';
  async *handle(chunk:string):AsyncGenerator<TurnEvent>{this.buffer+=chunk;}
  async *end(attrs:Record<string,string>):AsyncGenerator<TurnEvent>{
    const content=this.buffer.trim();this.buffer='';
    if(content)yield {type:'question',content,attrs};
  }
}
