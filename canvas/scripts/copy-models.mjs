import {cp,mkdir} from 'node:fs/promises';

const destination=new URL('../dist/api/models/',import.meta.url);
await mkdir(destination,{recursive:true});
await cp(new URL('../../cms/packages/resources/interactive-models/',import.meta.url),destination,{recursive:true});
console.log('Included interactive model resources in the static build.');
