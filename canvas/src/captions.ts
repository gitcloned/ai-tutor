export function spokenPrefix(text:string,elapsed:number,duration:number) {
  const chars=Array.from(text);
  return chars.slice(0,Math.min(chars.length,Math.max(1,Math.ceil(chars.length*elapsed/Math.max(duration,.001))))).join('');
}
