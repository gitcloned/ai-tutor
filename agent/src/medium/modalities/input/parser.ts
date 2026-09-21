import type { BaseMedium }         from '../../base.js';
import type { AudioInputModality } from './audio.js';
import type { ImageInputModality } from './image.js';
import type { TextInputModality }  from './text.js';
import type { StudentInput, ProcessedInput } from './types.js';

/**
 * InputParser — normalises multimodal student input into a single text + images pair.
 *
 * Mirrors OutputParser on the input side:
 *   OutputParser(medium) — LLM token stream → typed output events
 *   InputParser(medium)  — StudentInput     → ProcessedInput { text, images? }
 *
 * Processing order: text → audio (STT) → images (placeholder injection).
 * All parts are joined into one text string for the agent's history.
 */
export class InputParser {
  constructor(private readonly medium: BaseMedium) {}

  async parse(input: StudentInput): Promise<ProcessedInput> {
    const { inputModalities } = this.medium;
    const parts: string[] = [];
    const images = [];

    if (input.activity) {
      const a = input.activity;
      if(a.type==='choice-selected'){
        if(typeof a.questionId!=='string'||!a.questionId.trim()||a.questionId.length>200||
          typeof a.choice!=='string'||!/^[a-z]$/.test(a.choice)||
          typeof a.text!=='string'||!a.text.trim()||a.text.length>500||
          (a.correct!==undefined&&typeof a.correct!=='boolean'))throw new Error('Invalid choice-selected activity input.');
        parts.push(`Student multiple-choice answer (client-reported result; evaluate against the question): ${JSON.stringify({type:a.type,questionId:a.questionId,choice:a.choice,text:a.text,...(a.correct!==undefined?{correct:a.correct}:{})})}`);
      }else{
        if (a.type !== 'graph-point' || a.model !== 'function-graph' ||
          typeof a.activityId !== 'string' || a.activityId.length > 200 ||
          typeof a.equation !== 'string' || a.equation.length > 200 ||
          !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
          typeof a.correct !== 'boolean' || typeof a.complete !== 'boolean' ||
          !Array.isArray(a.remaining) || a.remaining.length > 20 || !a.remaining.every(Number.isFinite)) {
          throw new Error('Invalid graph-point activity input.');
        }
        parts.push(`Student graph activity (client-reported result): ${JSON.stringify({
          type:a.type,model:a.model,activityId:a.activityId,equation:a.equation,
          x:a.x,y:a.y,correct:a.correct,complete:a.complete,remaining:a.remaining,
        })}`);
      }
    }

    if (input.text?.trim()) {
      const mod = inputModalities.get('text') as TextInputModality | undefined;
      parts.push(mod ? mod.process(input.text) : input.text);
    }

    if (input.audio) {
      const mod = inputModalities.get('audio') as AudioInputModality | undefined;
      if (mod) {
        const transcription = await mod.process(input.audio);
        if (transcription) parts.push(transcription);
      }
    }

    if (input.images?.length) {
      const mod = inputModalities.get('image') as ImageInputModality | undefined;
      for (const img of input.images) {
        if (mod) {
          const { placeholder, image } = mod.process(img);
          parts.push(placeholder);
          images.push(image);
        } else {
          images.push(img);
        }
      }
    }

    return {
      text: parts.filter(Boolean).join(' '),
      ...(images.length    ? { images }                  : {}),
      ...(input.audio      ? { audioBlob: input.audio }  : {}),
    };
  }
}
