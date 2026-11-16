// @ts-check
/**
 * A local stand-in for a Hypersnap node, serving the synthetic fixture
 * world over HTTP with the same routes, shapes and CORS behaviour.
 *
 *   node e2e/mock-node.mjs            # listens on 127.0.0.1:8787
 *   VITE_HYPERSNAP_URL=http://127.0.0.1:8787 pnpm dev
 *
 * Used by the end-to-end tests and for developing offline. It has no
 * connection to any real network: everything it serves is invented.
 */
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createWorld } from '../src/hypersnap/fixtures/world.mjs';

const DEFAULT_PORT = 8787;

const PALETTE = ['#7C65C1', '#2F855A', '#C2410C', '#0E7490', '#9D174D', '#4D7C0F', '#1D4ED8', '#B45309'];

function seedOf(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function avatarSvg(name) {
  const color = PALETTE[seedOf(name) % PALETTE.length];
  const initial = (name.match(/[a-z0-9]/i)?.[0] ?? '?').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="${color}"/><text x="48" y="62" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="700" text-anchor="middle" fill="#fff">${initial}</text></svg>`;
}

const IMAGE_SIZES = { coast: [1200, 800], 'walk-1': [800, 1000], 'walk-2': [1000, 800] };

function imageSvg(name) {
  const seed = seedOf(name);
  const [width, height] = IMAGE_SIZES[name] ?? [1200, 800];
  const sky = PALETTE[seed % PALETTE.length];
  const ground = PALETTE[(seed >> 3) % PALETTE.length];
  const sun = PALETTE[(seed >> 6) % PALETTE.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${sky}" opacity="0.35"/><circle cx="${width * 0.72}" cy="${height * 0.3}" r="${height * 0.14}" fill="${sun}"/><path d="M0 ${height * 0.62} Q ${width * 0.3} ${height * 0.48} ${width * 0.55} ${height * 0.63} T ${width} ${height * 0.58} V ${height} H 0 Z" fill="${ground}"/><path d="M0 ${height * 0.78} Q ${width * 0.4} ${height * 0.68} ${width} ${height * 0.8} V ${height} H 0 Z" fill="#101010" opacity="0.35"/></svg>`;
}

// Two seconds of a generated test pattern; see e2e/fixtures.
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const VIDEO_FILES = {
  mp4: { file: 'clip.mp4', type: 'video/mp4' },
  m3u8: { file: 'hls/master.m3u8', type: 'application/vnd.apple.mpegurl' },
  ts: { file: 'hls/seg0.ts', type: 'video/mp2t' },
};

const CORS = {
  'access-control-allow-origin': '*',
  'cache-control': 'no-store',
};

/**
 * @param {{ port?: number, host?: string }} [options]
 */
export async function startMockNode(options = {}) {
  const host = options.host ?? '127.0.0.1';
  let world;
  let baseUrl = '';
  /** @type {'ok' | 'down' | 'error' | 'rate-limited' | 'slow'} */
  let mode = 'ok';
  /** @type {{ method: string, path: string }[]} */
  const requests = [];
  /** @type {{ path: string, bytes: Uint8Array }[]} */
  const submissions = [];
  /** Paths the browser sent a CORS preflight for. */
  const preflights = [];
  /** Replaces the node's own answer to a submitted message. For tests. */
  let submitResponder = null;

  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const method = request.method ?? 'GET';

    const send = (status, body, headers = {}) => {
      const payload = typeof body === 'string' ? body : JSON.stringify(body);
      response.writeHead(status, { ...CORS, ...headers });
      response.end(payload);
    };

    if (method === 'OPTIONS') {
      preflights.push(url.pathname);
      response.writeHead(204, {
        ...CORS,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': request.headers['access-control-request-headers'] ?? 'content-type',
        'access-control-max-age': '86400',
      });
      response.end();
      return;
    }

    // Test-only: start again from the original synthetic world.
    if (url.pathname === '/__control/reset') {
      world = createWorld({ mediaBase: `${baseUrl}/media`, now: Date.now() });
      mode = 'ok';
      requests.length = 0;
      submissions.length = 0;
      send(200, { reset: true });
      return;
    }

    // Test-only: what has been submitted so far, as hex.
    if (url.pathname === '/__control/submissions') {
      send(200, submissions.map((submission) => Buffer.from(submission.bytes).toString('hex')), { 'content-type': 'application/json' });
      return;
    }

    // Test-only: drop an account's signing keys, as a revocation elsewhere would.
    if (url.pathname === '/__control/revoke') {
      world.revokeSigners(url.searchParams.get('fid') ?? '');
      send(200, { revoked: true });
      return;
    }

    // Test-only switch for simulating outages.
    if (url.pathname === '/__control/mode') {
      mode = /** @type {typeof mode} */ (url.searchParams.get('value') ?? 'ok');
      send(200, { mode });
      return;
    }

    if (url.pathname.startsWith('/media/')) {
      const [, , kind, file = ''] = url.pathname.split('/');
      const name = decodeURIComponent(file).replace(/\.svg$/, '');
      if (kind === 'avatar') {
        send(200, avatarSvg(name), { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' });
      } else if (kind === 'image') {
        send(200, imageSvg(name), { 'content-type': 'image/svg+xml', 'cache-control': 'max-age=3600' });
      } else if (kind === 'video') {
        const match = VIDEO_FILES[url.pathname.split('.').pop() ?? ''];
        if (match) {
          const bytes = fs.readFileSync(FIXTURES + match.file);
          response.writeHead(200, {
            ...CORS,
            'content-type': match.type,
            'content-length': bytes.length,
            'cache-control': 'max-age=3600',
          });
          response.end(bytes);
        } else {
          send(404, 'Not Found', { 'content-type': 'text/plain' });
        }
      } else {
        send(404, 'Not Found', { 'content-type': 'text/plain' });
      }
      return;
    }

    requests.push({ method, path: url.pathname });

    if (mode === 'down') {
      request.socket.destroy();
      return;
    }
    if (mode === 'error') {
      send(503, { message: 'node is unavailable' }, { 'content-type': 'application/json' });
      return;
    }
    if (mode === 'rate-limited') {
      send(429, { message: 'too many requests' }, { 'content-type': 'application/json' });
      return;
    }

    if (method === 'POST' && (url.pathname === '/v1/submitMessage' || url.pathname === '/v1/validateMessage')) {
      const chunks = [];
      request.on('data', (chunk) => chunks.push(chunk));
      request.on('end', () => {
        const bytes = new Uint8Array(Buffer.concat(chunks));
        submissions.push({ path: url.pathname, bytes });
        // The world checks the hash and signatures as a node would, and
        // applies the message unless it was only sent for validation.
        Promise.resolve(
          submitResponder
            ? submitResponder({ path: url.pathname, bytes })
            : world.submit(bytes, { validateOnly: url.pathname === '/v1/validateMessage' }),
        ).then(
          (result) => send(result.status, result.body, { 'content-type': 'application/json' }),
          (error) => send(500, { details: String(error) }, { 'content-type': 'application/json' }),
        );
      });
      return;
    }

    if (method !== 'GET') {
      send(501, { message: 'Not implemented' }, { 'content-type': 'application/json' });
      return;
    }

    const answer = () => {
      const result = world.handle(url.pathname, url.searchParams);
      if (result.text !== undefined) {
        send(result.status, result.text, { 'content-type': 'text/plain' });
      } else {
        send(result.status, result.body, { 'content-type': 'application/json' });
      }
    };
    if (mode === 'slow') {
      setTimeout(answer, 1500);
    } else {
      answer();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? DEFAULT_PORT, host, () => resolve(undefined));
  });
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  const url = `http://${host}:${address.port}`;
  baseUrl = url;
  world = createWorld({ mediaBase: `${url}/media`, now: Date.now() });

  return {
    url,
    /** The current world; replaced by a reset. */
    get world() {
      return world;
    },
    requests,
    submissions,
    preflights,
    setMode(next) {
      mode = next;
    },
    setSubmitResponder(next) {
      submitResponder = next;
    },
    close: () => new Promise((resolve) => server.close(() => resolve(undefined))),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const node = await startMockNode({ port: Number(process.env.MOCK_NODE_PORT) || DEFAULT_PORT });
   
  console.log(`Mock Hypersnap node (synthetic data) listening on ${node.url}`);
}
