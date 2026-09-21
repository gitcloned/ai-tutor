import type {Attrs} from './protocol';
export type ChoiceAttempt={type:'choice-selected';questionId:string;choice:string;text:string;correct?:boolean};
export type McqConfig={stem:string;choices:{key:string;text:string}[];answer:string};
export function mcqConfig(attrs:Attrs):McqConfig|null{
  const choices=Object.entries(attrs).filter(([key])=>/^choice-[a-z]$/.test(key)).sort(([a],[b])=>a.localeCompare(b)).map(([key,text])=>({key:key.slice(7),text:text.trim()}));
  if(!choices.length&&!attrs.stem)return null;
  const stem=attrs.stem?.trim(),answer=attrs.answer?.trim().toLowerCase()??'';
  if(!stem||stem.length>2000||choices.length<2||choices.length>8||choices.some(c=>!c.text||c.text.length>500))throw new Error('An MCQ needs a stem and 2–8 non-empty choices.');
  if(answer&&!choices.some(c=>c.key===answer))throw new Error('The MCQ answer must name one of its choices.');
  return {stem,choices,answer};
}
