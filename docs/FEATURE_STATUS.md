# Feature status

What exists, and what it has been tested against. "Unit" means the in-memory
fixture node; "Browser" means a production build driven in headless Chromium
against the local mock node. Neither is a real network.

**Not verified against a live node.** The response shapes the app reads were
taken from a real node by hand (see [NETWORK_INTEROP.md](NETWORK_INTEROP.md)),
and `pnpm test:live` re-checks the read path against one, but the finished app
has not been run against a live node as part of its verification, and no write
has ever been sent to one.

## Reading (default build)

| Feature | Unit | Browser |
| --- | --- | --- |
| Trending feed, with paging | yes | yes |
| Following feed of a chosen account | yes | yes |
| Cast and conversation, with ancestors and nested replies | yes | yes |
| Cast permalinks by full hash, unprefixed hash and short prefix | yes | yes |
| Who liked, recast and quoted a cast | yes | partly (screens load) |
| Profile: casts, replies, likes, followers, following | yes | yes |
| Profiles for accounts with no username and for 64-bit account numbers | yes | yes |
| Channel feed and members | yes | yes |
| Search: casts, users, channels | yes | yes |
| Explore: channels and suggested users | yes | screens load |
| Notifications of a chosen account, grouped | yes | yes |
| Mentions, links, images, image carousels, quoted casts | yes | yes |
| Video (MP4, and HLS where the browser plays it natively) | decoding only | renders without error |
| Bookmarks, kept on the device | yes | yes |
| Light, dark and system theme | — | yes |
| Layout at 390, 768 and 1440 px without sideways scrolling | — | yes |
| Keyboard reachability of navigation and tabs | — | yes |
| Empty, loading, not-found, rate-limited and outage states | yes | outage and not-found |
| Hostile text and URLs rendered inertly | yes | yes |

## Writing (only with `VITE_ENABLE_WRITES=true`)

| Feature | Unit | Browser |
| --- | --- | --- |
| Sign in with the custody wallet (key registration) | yes, including the node's byte-level test vector | yes, with a stand-in wallet |
| Declined wallet request, wrong wallet, no wallet | yes | yes |
| Cast, with mentions and links | yes | yes |
| Reply; cast in a channel | yes | reply only |
| Like, unlike, recast | yes | like and unlike |
| Follow, unfollow | yes | follow |
| Delete own cast | yes | yes |
| Sign out, revoking the key | yes | yes |
| Key revoked elsewhere: action undone, signed out | yes | yes |
| Node busy: bounded retry; node refusal: reported, change undone | yes | — |

## Deliberately absent

Quote-casting from the interface, profile editing, media upload, account
creation, direct messages, wallet, mini apps and frames, link previews, channel
following and moderation, push notifications, marking notifications as read on
the network, muting and blocking.

## Known gaps

- Recast-by attribution in the following feed depends on what the node's feed
  returns; recasts are not labelled separately.
- A short-hash link is resolved by scanning the author's most recent casts and
  replies (up to 300 of each). An older one will not be found that way; the
  full-hash link always works, and it is the form Hypercast itself produces.
- Reaction lists stop at the node's cap of 100.
- HLS video plays only where the browser supports it natively; elsewhere the
  cast shows a link to the video.
