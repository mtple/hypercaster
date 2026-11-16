# Hypercast

Hypercast is an independent social client powered by Hypersnap. It is built
using open-source Farcaster client code and is not affiliated with or endorsed
by the operators of the official Farcaster client.

It is a web app that reads casts, threads, profiles, channels, search results
and notifications from one Hypersnap node over that node's public HTTP API, and
shows them in the layout of the open-source Farcaster web client. It talks to
nothing else: no backend of its own, no database, no analytics, no accounts.

## Status

| | |
| --- | --- |
| Reading | Built and tested. This is the default build. |
| Posting, liking, recasting, following | Built and tested offline. **Off by default** and never yet used against a live node. See [docs/WRITES.md](docs/WRITES.md). |
| Direct messages, wallet, mini apps, profile editing, media upload | Not part of Hypercast. |

[docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) lists every feature with what
it was tested against.

## Run it

Needs Node 20.19 or newer and pnpm 10.8.

```sh
pnpm install --frozen-lockfile --filter "farcaster-web..."
cd apps/farcaster-web
pnpm dev
```

That reads from the default node, `https://haatz.quilibrium.com`. To develop
without any network, run the mock node, which serves invented data with the same
routes and response shapes:

```sh
pnpm mock-node                                        # one terminal
VITE_HYPERSNAP_URL=http://127.0.0.1:8787 pnpm dev     # another
```

## Configure it

Settings are read when the app is built. Copy
[`apps/farcaster-web/.env.example`](apps/farcaster-web/.env.example) to
`.env.local` to change them.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_HYPERSNAP_URL` | `https://haatz.quilibrium.com` | The node to read from: an `https://` origin, or a same-origin path such as `/hs` if you put a proxy in front of it. |
| `VITE_APP_NAME` | `Hypercast` | Name shown in the interface. |
| `VITE_ENABLE_WRITES` | unset (off) | Only the exact value `true` includes signing in and posting. Read [docs/WRITES.md](docs/WRITES.md) first. |

## Build and deploy it

```sh
cd apps/farcaster-web
pnpm build        # static files in dist/
```

`dist/` can go on any static host. It includes `_headers` and `_redirects` files
for hosts that read them. [docs/OPERATIONS.md](docs/OPERATIONS.md) covers
hosting, the security headers, changing nodes and what to do when the node is
down.

## Test it

```sh
cd apps/farcaster-web
pnpm typecheck
pnpm lint
pnpm test          # unit tests, offline
pnpm test:e2e      # both production builds in a real browser, against the mock node
pnpm test:live     # optional: read-only checks against a real node
```

`pnpm test:e2e` needs a Chromium: run `pnpm exec playwright install chromium`
once, or set `HYPERCAST_E2E_CHROME` to a Chrome or Chromium binary.

## What is in this repository

This is a fork of the open-source Farcaster client monorepo. Hypercast lives in
the web app:

| Path | Contents |
| --- | --- |
| `apps/farcaster-web/src/hypersnap/` | Everything that talks to the node: transport, decoders, API, data hooks, session, and (in `writes/`) message building and signing. |
| `apps/farcaster-web/src/hypercast/` | The interface: shell, screens, components. |
| `apps/farcaster-web/e2e/` | The mock node and the browser tests. |
| `docs/` | How it works and how to run it. |

The rest of the upstream tree (the mobile app, the shared packages, and the
upstream web screens) is still here but is not built, referenced or deployed.
[docs/UPSTREAM_AUDIT.md](docs/UPSTREAM_AUDIT.md) says exactly what is reused,
what was rewritten and what was removed.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Feature status](docs/FEATURE_STATUS.md)
- [Network and interoperability](docs/NETWORK_INTEROP.md)
- [Writes: signing in and posting](docs/WRITES.md)
- [Operations](docs/OPERATIONS.md)
- [Upstream audit](docs/UPSTREAM_AUDIT.md)
- [Branding](docs/BRANDING.md)
- [Attribution](docs/ATTRIBUTION.md)

## Licence

MIT. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The interface is derived from
the Farcaster client snapshot, copyright © 2026 Neynar, Inc. "Farcaster" refers
here to the protocol and to that upstream code; Hypercast's own name and mark
are separate, and are described in [docs/BRANDING.md](docs/BRANDING.md).
