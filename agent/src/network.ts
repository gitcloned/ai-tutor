/** Service context without request bodies, credentials or query strings. */
export function serviceError(service:string,error:unknown):Error {
  const e=error as {message?:string;cause?:{code?:string;message?:string}};
  return new Error(`${service}: ${e?.message??'request failed'}${e?.cause?` (${e.cause.code??e.cause.message??'network error'})`:''}`,{cause:error});
}
export function transient(error:unknown):boolean{
  const e=error as {status?:number;code?:number|string;name?:string;message?:string};
  return [429,502,503,504].includes(Number(e?.status??e?.code))||e?.name==='TimeoutError'||e?.message==='fetch failed'||/ECONNRESET|ETIMEDOUT|EAI_AGAIN/.test(String(e?.code));
}
/** Only use before delivery begins; never replay partially consumed streams. */
export async function requestBeforeOutput<T>(service:string,request:()=>Promise<T>,sleep=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms))):Promise<T>{
  for(let attempt=0;;attempt++){
    try{return await request();}catch(error){
      if(attempt>=2||!transient(error))throw serviceError(service,error);
      await sleep(500*2**attempt);
    }
  }
}
