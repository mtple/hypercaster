import fs from 'node:fs';
import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const DEFAULT_NODE_URL = 'https://haatz.quilibrium.com';

// Opt in to a self-signed HTTPS dev server with HTTPS=true.
const httpsEnabled = process.env.HTTPS === 'true';

/** Origin of the configured node, or null when it is a same-origin path. */
function nodeOrigin(env) {
  const raw = (env.VITE_HYPERSNAP_URL || DEFAULT_NODE_URL).trim();
  if (raw.startsWith('/')) {
    return null;
  }
  return new URL(raw).origin;
}

/**
 * The page may talk to itself and to the configured Hypersnap node, and to
 * nothing else. Images and media can come from anywhere over HTTPS because
 * they are whatever people put in their casts and profiles.
 */
function contentSecurityPolicy(env, { forHeader }) {
  const origin = nodeOrigin(env);
  const node = origin ? ` ${origin}` : '';
  // A plain-http node only happens in local development and tests.
  const localMedia = origin && origin.startsWith('http://') ? ` ${origin}` : '';
  const directives = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    'font-src https://fonts.gstatic.com',
    `img-src 'self' https: data: blob:${localMedia}`,
    `media-src 'self' https: blob:${localMedia}`,
    `connect-src 'self'${node}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  if (forHeader) {
    // Ignored inside a <meta> tag, so only sent as a real header.
    directives.push("frame-ancestors 'none'");
  }
  return directives.join('; ');
}

function hypercastSecurity(env) {
  let outDir = path.resolve(__dirname, 'dist');
  return {
    name: 'hypercast-security',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'meta',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: contentSecurityPolicy(env, { forHeader: false }),
            },
            injectTo: 'head-prepend',
          },
        ],
      };
    },
    // Static hosts that read a `_headers` file (Cloudflare Pages, Netlify)
    // send the same policy, plus the directives a meta tag cannot carry.
    closeBundle() {
      if (!fs.existsSync(outDir)) {
        return;
      }
      const lines = [
        '/*',
        `  Content-Security-Policy: ${contentSecurityPolicy(env, { forHeader: true })}`,
        '  X-Content-Type-Options: nosniff',
        '  Referrer-Policy: no-referrer',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
        '  Cross-Origin-Opener-Policy: same-origin',
        '',
        '/assets/*',
        '  Cache-Control: public, max-age=31536000, immutable',
        '',
        '/index.html',
        '  Cache-Control: no-cache',
        '',
      ];
      fs.writeFileSync(path.join(outDir, '_headers'), lines.join('\n'));
      // Single-page app: every unknown path serves the shell.
      fs.writeFileSync(path.join(outDir, '_redirects'), '/*  /index.html  200\n');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, 'VITE_');

  return {
    plugins: [
      react(),
      tailwindcss(),
      hypercastSecurity(env),
      ...(httpsEnabled ? [basicSsl()] : []),
    ],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
    server: {
      https: httpsEnabled,
    },
    build: {
      sourcemap: 'hidden',
      // Match browserslist config: chrome >= 111, edge >= 111, firefox >= 128, safari >= 16.4
      target: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
    },
  };
});
