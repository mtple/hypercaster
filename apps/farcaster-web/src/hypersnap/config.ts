/**
 * Build-time configuration for the Hypersnap data layer.
 *
 * Three variables, read once:
 *   VITE_HYPERSNAP_URL   absolute http(s) origin of a Hypersnap node, or a
 *                        same-origin path such as "/hs" when a GET proxy is used
 *   VITE_APP_NAME        product name shown in the interface
 *   VITE_ENABLE_WRITES   "true" turns on sign-in and signed messages
 */

const DEFAULT_NODE_URL = 'https://haatz.quilibrium.com';
const DEFAULT_APP_NAME = 'Hypercast';

type HypersnapConfig = {
  /** Base the transport prefixes onto every request path. No trailing slash. */
  nodeUrl: string;
  /** Host shown to people so they know which node they are reading from. */
  nodeLabel: string;
  appName: string;
  writesEnabled: boolean;
};

type RawEnv = Record<string, string | boolean | undefined>;

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

function resolveNodeUrl(raw: string | undefined): string {
  const candidate = (raw ?? '').trim();
  if (candidate === '') {
    return DEFAULT_NODE_URL;
  }

  // Same-origin proxy path, e.g. "/hs".
  if (/^\/[A-Za-z0-9/_-]*$/.test(candidate)) {
    return stripTrailingSlashes(candidate);
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error(
      `VITE_HYPERSNAP_URL must be an absolute http(s) URL or a same-origin path, got "${candidate}"`,
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('VITE_HYPERSNAP_URL must use http or https');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('VITE_HYPERSNAP_URL must not contain credentials');
  }
  if (parsed.search !== '' || parsed.hash !== '') {
    throw new Error('VITE_HYPERSNAP_URL must not contain a query or fragment');
  }

  return stripTrailingSlashes(`${parsed.origin}${parsed.pathname}`);
}

function nodeLabelOf(nodeUrl: string): string {
  if (nodeUrl.startsWith('/')) {
    return 'this site';
  }
  return new URL(nodeUrl).host;
}

function createConfig(env: RawEnv): HypersnapConfig {
  const nodeUrl = resolveNodeUrl(
    typeof env.VITE_HYPERSNAP_URL === 'string'
      ? env.VITE_HYPERSNAP_URL
      : undefined,
  );
  const appName =
    typeof env.VITE_APP_NAME === 'string' && env.VITE_APP_NAME.trim() !== ''
      ? env.VITE_APP_NAME.trim()
      : DEFAULT_APP_NAME;

  return {
    nodeUrl,
    nodeLabel: nodeLabelOf(nodeUrl),
    appName,
    // Anything other than the exact string "true" leaves writes off.
    writesEnabled: env.VITE_ENABLE_WRITES === 'true',
  };
}

const config: HypersnapConfig = createConfig(import.meta.env as RawEnv);

export { config, createConfig, DEFAULT_APP_NAME, DEFAULT_NODE_URL };
export type { HypersnapConfig };
