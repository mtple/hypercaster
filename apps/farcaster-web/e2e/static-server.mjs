// @ts-check
/**
 * Serves a built app from disk the way a static host does: real files as
 * they are, and index.html for every other path so client routes load.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/**
 * @param {string} root directory holding index.html
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveStatic(root) {
  const index = path.join(root, 'index.html');
  const server = http.createServer((request, response) => {
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    const candidate = path.join(root, path.normalize(decodeURIComponent(pathname)));
    const inside = candidate.startsWith(root + path.sep);
    const file = inside && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : index;
    response.writeHead(200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-store',
    });
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(undefined)));
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}
