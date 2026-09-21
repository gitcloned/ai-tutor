import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, sep, extname } from 'node:path';

const root = resolve(fileURLToPath(new URL('./interactive-models/', import.meta.url)));
export const resourceServer = () => createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/interactive-models/')) throw new Error('Not found');
    const path = resolve(root, decodeURIComponent(url.pathname.slice('/interactive-models/'.length)));
    if (!path.startsWith(root + sep)) throw new Error('Not found');
    const types = {'.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png','.jpg':'image/jpeg'};
    if (!types[extname(path)]) throw new Error('Not found');
    const data = await readFile(path);
    res.writeHead(200, {'Content-Type':types[extname(path)],'Cache-Control':'no-cache'});
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Resource not found'); }
});
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 32003);
  resourceServer().listen(port, '127.0.0.1', () => console.log(`Interactive models: http://127.0.0.1:${port}/interactive-models/catalog.json`));
}
