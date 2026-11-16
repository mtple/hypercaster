// @ts-check
/**
 * What actually ships. These read the two production builds from disk.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { env } from './helpers.mjs';

function filesUnder(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...filesUnder(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const relative = (root) => filesUnder(root).map((file) => path.relative(root, file)).sort();
const shipped = (root) => filesUnder(root).filter((file) => !file.endsWith('.map'));
const textOf = (root) =>
  shipped(root)
    .filter((file) => /\.(js|css|html|json|txt|svg)$/.test(file) || path.basename(file).startsWith('_'))
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

/** Services of the upstream client, and trackers, that must never be contacted. */
const BANNED = [
  /farcaster\.xyz/i,
  /warpcast\.com/i,
  /wrpcd\.net/i,
  /neynar\.com/i,
  /api\.neynar/i,
  /merkle-manufactory/i,
  /cloudinary/i,
  /privy\.io/i,
  /posthog/i,
  /statsig/i,
  /sentry\.io/i,
  /datadoghq/i,
  /walletconnect/i,
  /google-analytics|googletagmanager/i,
  /ahrefs/i,
];

describe('the read-only build', () => {
  it('names no upstream service, tracker or wallet provider anywhere', () => {
    const text = textOf(env().readOnlyDir);
    for (const pattern of BANNED) {
      expect(text.match(pattern)?.[0] ?? null, String(pattern)).toBeNull();
    }
  });

  it('contains no code that could submit anything or talk to a wallet', () => {
    const text = textOf(env().readOnlyDir);
    for (const pattern of [/submitMessage/, /validateMessage/, /eth_signTypedData/, /eth_requestAccounts/, /Farcaster KeyAdd/, /octet-stream/, /method:\s*["']POST["']/, /sendBeacon/, /new WebSocket/, /XMLHttpRequest/]) {
      expect(text.match(pattern)?.[0] ?? null, String(pattern)).toBeNull();
    }
    expect(relative(env().readOnlyDir).some((file) => /WriteProvider/.test(file))).toBe(false);
  });

  it('ships the Hypercast identity and none of the upstream site files', () => {
    const files = relative(env().readOnlyDir);
    for (const expected of ['index.html', 'favicon.ico', 'favicon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'og-image.png', 'manifest.json', 'robots.txt', 'default-avatar.svg', 'brand/hypercast-logo.svg', 'brand/hypercast-icon.svg', '_headers', '_redirects']) {
      expect(files, expected).toContain(expected);
    }
    expect(files.filter((file) => /\.well-known|sitemap|SeasonMix|\.woff2?$|\.ttf$|\.otf$/i.test(file))).toEqual([]);
    expect(files.filter((file) => /farcaster|warpcast/i.test(file))).toEqual([]);

    const manifest = JSON.parse(fs.readFileSync(path.join(env().readOnlyDir, 'manifest.json'), 'utf8'));
    expect(manifest.name).toBe('Hypercast');
    expect(manifest).not.toHaveProperty('protocol_handlers');
    expect(manifest).not.toHaveProperty('share_target');
    expect(manifest).not.toHaveProperty('related_applications');
  });

  it('locks the page down: no inline script, and a policy that allows only the app and the node', () => {
    const html = fs.readFileSync(path.join(env().readOnlyDir, 'index.html'), 'utf8');
    expect(html).toContain('<title>Hypercast</title>');
    // Every script tag loads a file from the app itself.
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    expect(scripts.length).toBeGreaterThan(0);
    for (const [, attributes, body] of scripts) {
      expect(attributes).toMatch(/\bsrc="\/[^"/]/);
      expect(body.trim()).toBe('');
    }
    expect(html).not.toMatch(/\son[a-z]+=/i);

    const policy = (html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)?.[1] ?? '').replaceAll('&#39;', "'");
    const directive = (name) => policy.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? '';
    expect(directive('default-src')).toBe("default-src 'self'");
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('connect-src')).toBe(`connect-src 'self' ${env().nodeUrl}`);
    expect(directive('frame-src')).toBe("frame-src 'none'");
    expect(directive('object-src')).toBe("object-src 'none'");
    expect(directive('base-uri')).toBe("base-uri 'self'");
    expect(directive('form-action')).toBe("form-action 'self'");

    const headers = fs.readFileSync(path.join(env().readOnlyDir, '_headers'), 'utf8');
    expect(headers).toContain("frame-ancestors 'none'");
    expect(headers).toContain('X-Content-Type-Options: nosniff');
    expect(headers).toContain('Referrer-Policy: no-referrer');
    expect(fs.readFileSync(path.join(env().readOnlyDir, '_redirects'), 'utf8')).toMatch(/^\/\*\s+\/index\.html\s+200/m);
  });
});

describe('the write-enabled build', () => {
  it('keeps everything that signs or submits in one lazily loaded file', () => {
    const root = env().writesDir;
    const scripts = shipped(root).filter((file) => file.endsWith('.js') && file.includes(`${path.sep}assets${path.sep}`));
    const withWrites = scripts.filter((file) => /submitMessage|eth_signTypedData/.test(fs.readFileSync(file, 'utf8')));
    expect(withWrites.map((file) => path.basename(file).replace(/-.*$/, ''))).toEqual(['WriteProvider']);
  });

  it('still names no upstream service or tracker, and asks a wallet for two things only', () => {
    const text = textOf(env().writesDir);
    for (const pattern of BANNED) {
      expect(text.match(pattern)?.[0] ?? null, String(pattern)).toBeNull();
    }
    const methods = new Set([...text.matchAll(/["'`]((?:eth|wallet|personal)_[a-zA-Z0-9_]+)["'`]/g)].map((match) => match[1]));
    expect([...methods].sort()).toEqual(['eth_requestAccounts', 'eth_signTypedData_v4']);
  });
});
