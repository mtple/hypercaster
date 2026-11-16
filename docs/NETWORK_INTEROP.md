# Network and interoperability

What Hypercast assumes about the node it reads from, where those assumptions
came from, and what a reader should and should not conclude from what they see.

## One node, as it is

Hypercast shows what one Hypersnap node returns. It does not merge in data from
anywhere else and has no fallback source. If the node does not have something,
the app says "not found on this node" and means only that.

Hypersnap and Snapchain share history and message formats but are separate
networks. Messages can be carried between them by a relay, and a relay can be
behind, paused, or decline a message. Accounts registered on Hypersnap itself
exist only there. So:

- counts, feeds and search results can differ from other clients;
- something missing here may exist elsewhere, and the reverse;
- a cast accepted by this node is not thereby known to have reached any other
  network. The app never claims it has.

## Where the response shapes came from

The decoders were written against responses from the default node,
`https://haatz.quilibrium.com`, fetched with GET requests on 15 November 2026.
The test fixture reproduces those shapes. Nodes change, so treat the list below
as "true when observed", and run `pnpm test:live` to re-check.

| Behaviour observed | How the app handles it |
| --- | --- |
| Cross-origin GET is allowed (`access-control-allow-origin: *`) | The browser calls the node directly. No proxy is needed. |
| Cast hashes are returned without `0x`; lookups accept either form | Normalised to `0x` + lowercase inside the app. |
| A cast can be looked up by full hash only (not by URL, not by a short prefix) | Cast links use the full hash. A short-hash link is resolved by looking through that author's recent casts and replies. |
| Account numbers at or above 2^32 are JSON strings; smaller ones are numbers | Both become decimal strings; large integer literals are parsed without loss. |
| An unknown account number returns 200 with a placeholder user (empty custody address and registration time) | Detected and reported as "not found". |
| Username lookup is case-sensitive, and ENS names do not resolve | Names are lower-cased before lookup, as the node stores them. |
| Mentions are removed from cast text; positions are UTF-8 byte offsets | Put back when rendering, by byte offset. |
| Embeds are a URL or a reference to another cast, with no preview metadata | Images and video are recognised from the URL; other links show as a link card with no fetched preview; quoted casts are fetched from the node. |
| Users have no banner image | The profile header draws a plain band. |
| A channel record has an id, name, URL and member count only | No channel image or description is shown. |
| The channel list includes token and chain identifiers | Shown, but only ordinary channel ids are linked as channels. |
| Lists end with `next: {}`; page size is capped at 100 | Treated as the end; the app asks for 25 at a time. |
| Reactions on a cast are capped at 100 and not paged | Shown as far as the node gives them. |
| Notifications are one row per actor | Grouped in the app: likes and recasts by cast, follows together. |
| Conversation replies are nested under the cast | Read in that shape, and in the flatter documented one. |
| Errors: `{message}` under `/v2`, `{error, error_detail}` under `/v1`, plain text for unknown routes | All three are read for a reason to show. |
| `viewer_fid` adds "liked", "recasted", "following" flags | Sent only for a signed-in account. |

## What is not available from a node

These parts of the upstream client depend on its own services, so Hypercast
does not have them: direct messages, wallet, mini apps and frames, link
previews, image and video hosting, channel moderation, account creation,
profile editing, push notifications, and a ranked "for you" feed. "Trending"
here is whatever the node's trending route returns.

## Privacy consequences

The node operator sees the requests a reader makes, as any website does. Images,
video and links inside casts load from wherever their authors hosted them, so
those hosts see a request too. Hypercast adds nothing of its own: no analytics,
no cookies, no referrer.
