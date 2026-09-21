/** Ignore mathematical spacing/minus variants but keep offsets into the original text. */
export function annotationTarget(text:string,target:string):{start:number;end:number}|null{
  const normalize=(value:string)=>value.replace(/[−–]/g,'-').replace(/\s/g,'');
  const offsets:number[]=[],characters:string[]=[];
  for(let i=0;i<text.length;i++){if(/\s/.test(text[i]))continue;offsets.push(i);characters.push(normalize(text[i]));}
  const source=characters.join(''),needle=normalize(target);
  if(!needle)return null;
  let start=source.indexOf(needle);
  while(start>=0){
    const end=start+needle.length;
    // A target such as -3 must not silently select part of -30 or -3.5.
    if(!(/\d$/.test(needle)&&/[\d.]/.test(source[end]??'')))return {start:offsets[start],end:offsets[end-1]+1};
    start=source.indexOf(needle,start+1);
  }
  return null;
}
