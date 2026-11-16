// @ts-check
/**
 * Before the end-to-end tests: start the mock node, build the app twice
 * against it (read-only, and with writes on), and serve both builds.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMockNode } from './mock-node.mjs';
import { serveStatic } from './static-server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, '..');
const outRoot = path.join(here, '.tmp');

function build(outDir, env) {
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], {
    cwd: appRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

/** @param {import('vitest/node').TestProject} project */
export default async function setup(project) {
  const node = await startMockNode({ port: 0 });
  fs.rmSync(outRoot, { recursive: true, force: true });

  const readOnlyDir = path.join(outRoot, 'read-only');
  const writesDir = path.join(outRoot, 'writes');
  build(readOnlyDir, { VITE_HYPERSNAP_URL: node.url, VITE_ENABLE_WRITES: 'false' });
  build(writesDir, { VITE_HYPERSNAP_URL: node.url, VITE_ENABLE_WRITES: 'true' });

  const readOnly = await serveStatic(readOnlyDir);
  const writes = await serveStatic(writesDir);

  project.provide('e2e', {
    nodeUrl: node.url,
    readOnlyUrl: readOnly.url,
    writesUrl: writes.url,
    readOnlyDir,
    writesDir,
  });

  return async () => {
    await Promise.all([readOnly.close(), writes.close(), node.close()]);
  };
}
