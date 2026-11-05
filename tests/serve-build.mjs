import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { resolve, sep, extname } from 'node:path';
import { log } from 'node:console';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mount = '/game/wallbait/';
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};
createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(
      new URL(request.url ?? '/', 'http://127.0.0.1').pathname,
    );
    if (!path.startsWith(mount)) throw Error('outside mount');
    const target = resolve(root, path.slice(mount.length) || 'index.html');
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep))
      throw Error('outside root');
    const data = await readFile(target);
    response.writeHead(200, {
      'Content-Type': mime[extname(target)] ?? 'application/octet-stream',
    });
    response.end(data);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
}).listen(4174, '127.0.0.1', () =>
  log(`Static test: http://127.0.0.1:4174${mount}`),
);
