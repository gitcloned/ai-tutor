import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
// Production should provide a stable 32-byte base64 key through CODE_ENCRYPTION_KEY.
// Local development keeps a generated key outside source control; retain it across restarts.
function loadKey():Buffer{
  if(process.env.CODE_ENCRYPTION_KEY){const key=Buffer.from(process.env.CODE_ENCRYPTION_KEY,'base64');if(key.length!==32)throw new Error('CODE_ENCRYPTION_KEY must be 32 bytes, base64 encoded');return key;}
  const dir=fileURLToPath(new URL('../.local/',import.meta.url)),file=dir+'code-key';
  mkdirSync(dir,{recursive:true,mode:0o700});
  try{writeFileSync(file,randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}
  const key=readFileSync(file);if(key.length!==32)throw new Error('Invalid local code encryption key');return key;
}
let cached:Buffer;
function key(){return cached??=loadKey();}
export function encryptCode(code:string){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key(),iv);const bytes=Buffer.concat([cipher.update(code,'utf8'),cipher.final()]);return [iv,cipher.getAuthTag(),bytes].map(x=>x.toString('base64')).join('.');}
export function decryptCode(value?:string|null){if(!value)return null;const [iv,tag,bytes]=value.split('.').map(x=>Buffer.from(x,'base64'));const cipher=createDecipheriv('aes-256-gcm',key(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(bytes),cipher.final()]).toString('utf8');}
