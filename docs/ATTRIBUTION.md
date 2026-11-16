# Attribution

## Upstream code

Hypercast is derived from the Farcaster client snapshot,
`https://github.com/farcasterxyz/client`, at commit
`73a39bd8af1f22325af8e32c84b24228fad45906`.

> Copyright (c) 2026 Neynar, Inc.

It is used under the MIT License, whose full text is in [LICENSE](../LICENSE)
and which continues to cover this repository. [UPSTREAM_AUDIT.md](UPSTREAM_AUDIT.md)
lists which upstream files are used unchanged, which were rewritten, and which
were removed.

Hypercast's own additions are offered under the same licence.

## Third-party packages in the built app

All were already dependencies of the upstream project. Versions are the ones
the lockfile pins.

| Package | Version | Licence | Used for |
| --- | --- | --- | --- |
| react, react-dom, scheduler | 19.0.0 / 0.25.0 | MIT | Interface |
| react-router, react-router-dom, @remix-run/router | 6.30.6 / 1.23.4 | MIT | Routing |
| @tanstack/react-query, @tanstack/query-core | 5.59.11 / 5.59.10 | MIT | Data cache |
| classnames | 2.3.2 | MIT | Class names |
| linkify-it, uc.micro | 5.0.2 / 2.1.0 | MIT | Finding links in text |
| lodash | 4.18.1 | MIT | Used by upstream components |
| lucide-react | 0.487.0 | ISC | Icons |
| @primer/octicons-react | 19.8.0 | MIT | Icons |
| react-intersection-observer | 9.5.2 | MIT | Infinite scrolling |
| react-remove-scroll-bar, react-style-singleton, get-nonce | 2.3.8 / 2.2.3 / 1.0.1 | MIT | Scroll locking in dialogs |
| @noble/hashes | 2.2.0 | MIT | BLAKE3. Write-enabled builds only. |

The tests additionally use Vitest, Playwright and viem. They are not part of
the built app.

## Fonts

Inter, copyright 2016 The Inter Project Authors, SIL Open Font License 1.1. The
app loads it from Google Fonts at run time. The wordmark's letter shapes are
outlines of Inter Bold.

## Protocol references

Two open-source projects were read to learn how a Hypersnap node expects
messages to be encoded. No code from either is included.

- **The Hypersnap node** (GPL-3.0). Its HTTP routes, validation rules and
  message schema were read as documentation of the wire format. One of its
  compatibility tests publishes fixed inputs and the exact bytes the node
  accepts for them; those bytes are used as a test vector in
  `src/hypersnap/writes/__tests__/keyAddVector.ts`, to prove that Hypercast's
  independently written encoder produces the same output.
- **Quilcast** (MIT, copyright © 2026 Nikita Kolmogorov), another client for the
  same network. Its handling of timestamps, nonces and busy-node retries
  informed the same behaviours here, and its message field layout was used as
  a cross-check.

## Test data

Every person, cast and channel in the test fixtures is invented. The video
clips under `e2e/fixtures/` are a generated test pattern. The wallet used in
tests is the first account of the widely published "test test … junk" developer
mnemonic; it is not a real credential and has never held anything.

## Names

"Farcaster" is used to refer to the protocol and to the upstream code.
Hypercast is not affiliated with or endorsed by the operators of the official
Farcaster client. See [BRANDING.md](BRANDING.md).
