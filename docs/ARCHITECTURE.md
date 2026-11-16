# Architecture

Hypercast is a static single-page app. The browser loads it, then talks
directly to one Hypersnap node. There is no Hypercast server.

```
 browser
 ┌──────────────────────────────────────────────────────────────┐
 │  src/hypercast   screens, shell, components                  │
 │        │  uses hooks, never the network                      │
 │  src/hypersnap   hooks → api → decoders → transport (GET)    │
 │        │                                                     │
 │  src/hypersnap/writes   (only in a write-enabled build)      │
 │        messages → signing key → poster (POST)                │
 └────────┬─────────────────────────────────────────────────────┘
          │  HTTPS, no cookies, no referrer
          ▼
   one Hypersnap node  (VITE_HYPERSNAP_URL)
```

Both directories live in `apps/farcaster-web/src/`. Everything else under
`src/` is upstream code; the parts Hypercast uses are listed in
[UPSTREAM_AUDIT.md](UPSTREAM_AUDIT.md).

## The read layer: `src/hypersnap/`

| File | Job |
| --- | --- |
| `config.ts` | Reads the three build settings and validates the node URL. |
| `http.ts` | The transport. The only file that calls `fetch`. GET only, to paths under `/v2/farcaster/` and `/v1/`. |
| `json.ts` | Parses JSON without losing precision on large integers. |
| `normalize.ts` | Decoders: turn whatever the node sent into the app's own types, tolerating missing and extra fields. |
| `api.ts` | One method per thing the app needs (`getTrendingFeed`, `getConversation`, ...). |
| `hooks.ts` | React hooks over the API: caching, paging, de-duplication. Components use these and nothing lower. |
| `types.ts`, `ids.ts`, `media.ts`, `errors.ts` | View-model types, ID parsing, URL safety, the error type. |
| `session.ts`, `capabilities.ts`, `storage.ts`, `bookmarks.ts` | Who is being viewed, what the build allows, and the small amount of state kept in the browser. |
| `fixtures/` | A synthetic node for tests. Never part of the app. |

### Transport rules

Every request has `credentials: 'omit'`, `redirect: 'error'` and
`referrerPolicy: 'no-referrer'`, and carries no header other than `accept`.
Each attempt times out after 15 seconds. Network failures, timeouts, 429 and 5xx
responses are retried twice with jittered backoff; anything else is not.

Failures become a `HypersnapError` with a `kind` (`not_found`, `rate_limited`,
`server`, `network`, `timeout`, `malformed`, `bad_request`, `aborted`,
`blocked`). Screens choose their wording from the kind.

### Account numbers and hashes

Account numbers (FIDs) are decimal **strings** everywhere in the app. Accounts
registered on Hypersnap itself have numbers from 2^32 upward and the 64-bit
range does not fit a JavaScript number, so `json.ts` quotes any integer literal
outside the safe range before parsing, and nothing ever converts an FID to a
number.

Cast hashes are lowercase hex with a `0x` prefix inside the app. The node
returns them without the prefix and accepts either form.

### Caching

TanStack Query, with one cache per node URL. Queries are not retried by the
cache (the transport already did), do not refetch on window focus, are fresh for
30 seconds (longer for casts and channels) and are dropped five minutes after
last use. Lists stop paging when the node returns no cursor, an empty page, or a
cursor it has already returned.

Keys that depend on who is signed in include that account, so one account's
"liked" flags are never shown to another.

## The interface: `src/hypercast/`

| Path | Contents |
| --- | --- |
| `App.tsx`, `main.tsx` | Providers and the route table. |
| `layout/` | The three-column shell, navigation, right rail, mobile header. |
| `pages/` | One file per screen. |
| `components/` | Cast card, focused cast, embeds, profile header, lists, state views. |
| `write/` | The write controller interface, and its implementation for write-enabled builds. |
| `paths.ts`, `text.ts`, `format.ts`, `thread.ts`, `notifications.ts` | Pure helpers: URLs, text segmentation, number and time formatting, thread layout, notification grouping. |

### Routes

The paths match the upstream client's, so links carry over.

| Path | Screen |
| --- | --- |
| `/` | Home, trending |
| `/~/following` | Home, following feed of the chosen account |
| `/~/notifications` | Notifications of the chosen account |
| `/~/bookmarks` | Casts saved on this device |
| `/~/explore/channels`, `/~/explore/users` | Explore |
| `/~/search/recent`, `/users`, `/channels` | Search (`?q=`) |
| `/~/channel/:id`, `/~/channel/:id/members` | Channel |
| `/~/conversations/:hash` and `/reactions`, `/recasts`, `/quotes` | Cast and who reacted |
| `/~/profiles/:fid` and `/casts-and-replies`, `/likes`, `/followers`, `/following` | Profile by number |
| `/:username` and the same sub-paths | Profile by name |
| `/:username/:hash` and `/reactions`, `/recasts`, `/quotes` | Cast, by full hash or a prefix of 8 or more hex digits |
| `/~/settings`, `/~/about` | Settings, About |
| any other `/~/...` | "Not available in Hypercast" |

### Who the interface is acting for

The session is one of three things, and the wording on screen differs for each:

- **Guest.** Trending, search, profiles and channels work. The following feed
  and notifications ask for an account.
- **Viewing an account.** Anyone can pick any account and see its following
  feed and notifications, because both are public. This proves nothing and
  grants nothing, so the app labels it "public view", never sends that account
  as the viewer, and never shows its likes or follows as "yours".
- **Signed in.** Only in a write-enabled build, after the custody wallet has
  approved a signing key. Only then is the account sent as `viewer_fid`.

### Capabilities and the write controller

Components do not decide what is allowed. They read `useWrites()`, which
returns a controller with `capabilities` and the actions. The default
controller is read-only: every capability is false and every action does
nothing. A write-enabled build swaps in the real controller.

So a like button asks `capabilities.canLike`; if false and sign-in is not
possible, it renders with `aria-disabled` and a label that says why.

## The write layer: `src/hypersnap/writes/`

Included only when `VITE_ENABLE_WRITES=true`. See [WRITES.md](WRITES.md).

`App.tsx` compares the flag at build time. When it is not `true` the dynamic
import of the write controller is unreachable, and the bundler leaves the whole
module, including the only code that can make a POST request, out of the output.
A test reads the built files to confirm it.

## Boundaries that are enforced

ESLint rules scoped to `src/hypercast/**` and `src/hypersnap/**` forbid:

- importing the upstream client's service packages, wallet libraries or
  analytics;
- importing upstream modules that embed upstream-operated hosts;
- calling `fetch` anywhere but `http.ts`, and using `XMLHttpRequest`,
  `WebSocket`, `EventSource` or `sendBeacon` at all.

The production build adds a Content-Security-Policy that allows scripts only
from the app's own origin and connections only to the app and the configured
node. See [OPERATIONS.md](OPERATIONS.md).

## Tests

| Kind | Where | Runs against |
| --- | --- | --- |
| Unit | `src/**/__tests__` | The in-memory fixture node |
| Browser | `e2e/*.e2e.test.mjs` | Both production builds, in headless Chromium, against `e2e/mock-node.mjs` |
| Live (optional) | `src/hypersnap/__tests__/live.smoke.test.ts` | A real node, GET only |

The fixture node and the mock node are the same synthetic world. It reproduces
the response shapes and quirks seen on a real node (see
[NETWORK_INTEROP.md](NETWORK_INTEROP.md)), and it checks submitted messages the
way a node does: it recomputes the hash, verifies the signature, and recovers
the wallet signatures on a key registration.
