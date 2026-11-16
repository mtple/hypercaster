# Hypercast web app

The Hypercast client. Start with the [repository README](../../README.md).

```sh
pnpm dev          # develop against the configured node
pnpm mock-node    # a local node with invented data, on 127.0.0.1:8787
pnpm build        # production build in dist/
pnpm test         # unit tests
pnpm test:e2e     # browser tests against the mock node
```

Hypercast's own code is in `src/hypersnap/` (the node, data and signing) and
`src/hypercast/` (the interface). Everything else under `src/` is upstream code;
only the parts listed in [docs/UPSTREAM_AUDIT.md](../../docs/UPSTREAM_AUDIT.md)
are used.
