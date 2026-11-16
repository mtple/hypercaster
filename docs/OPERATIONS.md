# Operations

Hypercast is a folder of static files. There is no server to run, no database,
no secret, and nothing that costs money beyond wherever the files are hosted.

## Build

```sh
pnpm install --frozen-lockfile --filter "farcaster-web..."
cd apps/farcaster-web
pnpm build
```

The output is `apps/farcaster-web/dist/`. Settings are fixed at build time (see
the [README](../README.md#configure-it)); changing the node means building
again.

The default build is read-only. Check before deploying:

```sh
grep -rl "submitMessage" dist/assets/*.js    # must print nothing
```

## Host

Any static host works. Two things are needed from it:

1. **Send `index.html` for unknown paths**, so that a link such as
   `/someone/0xabc…` loads the app. `dist/_redirects` does this on hosts that
   read that file (Cloudflare Pages, Netlify). Elsewhere, configure a
   single-page-app fallback.
2. **Send the security headers.** `dist/_headers` carries them for hosts that
   read that file. Elsewhere, copy the headers from that file into the host's
   own configuration.

The page also carries its Content-Security-Policy in a `<meta>` tag, so the
policy applies even on a host that sends no headers. Two protections can only be
sent as real headers, though: `frame-ancestors 'none'` (which stops other sites
framing the app) and `X-Content-Type-Options`.

Serve over HTTPS. Do not put the app on an origin shared with other
applications: browser storage, including a signing key in a write-enabled
build, is scoped to the origin.

Hosting, and a custom domain if wanted, are the only things here that can cost
money. Nothing in this repository provisions either.

## The security policy

Generated at build time for the configured node:

| Directive | Value | Why |
| --- | --- | --- |
| `default-src` | `'self'` | Nothing loads from elsewhere unless listed below. |
| `script-src` | `'self'` | No inline or third-party script. |
| `style-src` | `'self' 'unsafe-inline'` + Google Fonts | The upstream styling uses inline styles. |
| `font-src` | Google Fonts | Inter. |
| `img-src`, `media-src` | `'self' https: data: blob:` | Avatars and media in casts live on arbitrary hosts. |
| `connect-src` | `'self'` + the node | The only place the app may send requests. |
| `frame-src`, `object-src` | `'none'` | No embeds. |
| `base-uri`, `form-action` | `'self'` | |

Also sent: `Referrer-Policy: no-referrer`, `Permissions-Policy` denying camera,
microphone, geolocation and payment, and
`Cross-Origin-Opener-Policy: same-origin`.

If Inter should not be fetched from Google, remove the font link from
`index.html` and the two font entries from the policy in `vite.config.js`; the
app falls back to system fonts.

## Changing the node

Set `VITE_HYPERSNAP_URL` and rebuild. The node must:

- serve the Hypersnap HTTP API under `/v2/farcaster/` and `/v1/`;
- allow cross-origin GET requests (and, for a write-enabled build, POST with a
  `content-type` header) from the app's origin.

Run `VITE_HYPERSNAP_URL=… pnpm test:live` against a new node before pointing a
deployment at it. It makes GET requests only.

If a node does not allow cross-origin requests, put a reverse proxy on the app's
own origin and set `VITE_HYPERSNAP_URL` to its path, for example `/hs`. Limit
that proxy to GET for a read-only deployment.

## When something is wrong

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Every screen says the node could not be reached | Node down, or blocking the app's origin | Check the node directly: `curl https://<node>/v1/info`. The app recovers by itself when the node does; nothing is cached server-side. |
| "The node is limiting requests" | Rate limit | Wait. The app backs off and does not retry in a loop. |
| A deep link shows the host's 404 page | No single-page-app fallback | Configure it, or deploy `_redirects`. |
| Blank page, console mentions Content Security Policy | The node URL in the build differs from where the app is trying to connect, or a host injected a script | Rebuild with the right `VITE_HYPERSNAP_URL`; turn off host features that inject scripts. |
| Counts or feeds differ from another client | Expected | See [NETWORK_INTEROP.md](NETWORK_INTEROP.md). |
| Signed-in user is signed out with "key is no longer accepted" | The key was revoked elsewhere or lapsed | Sign in again. |

Settings → "Check node status" in the app shows whether the node answers and
its current block heights.

## Rolling back

Redeploy the previous `dist/`. There is no state to migrate. Data kept in
readers' browsers (theme, chosen account, bookmarks, and a signing key in a
write-enabled build) is versioned under the prefix `hypercast:v1:` and is
ignored if it does not have the expected shape.

Going from a write-enabled build back to a read-only one leaves any signing keys
in readers' browsers unused; the read-only build ignores them, and the node
drops them after 90 days idle. Tell users, if there are any, so they can sign
out first.

## Monitoring

The app sends no telemetry, so there is nothing built in. Watch the node's
`/v1/info` and the host's own request logs. If error reporting is ever added, it
needs an entry in `connect-src` and a line in the About page's privacy section.

## Updating from upstream

See [UPSTREAM_AUDIT.md](UPSTREAM_AUDIT.md) for the pinned commit and which
upstream files Hypercast depends on. After merging upstream changes, run the
full test suite: the browser tests read the built files and fail if an upstream
host or asset has found its way back in.
