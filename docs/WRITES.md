# Writes: signing in and posting

Hypercast can sign in and post, but that part is **off by default** and has
**never been used against a live node**. This page explains how it works, what
has and has not been verified, and what to do before turning it on.

## Turning it on

Build with exactly `VITE_ENABLE_WRITES=true`. Any other value, or none, gives
the read-only build, which does not contain the write code at all.

Do not turn it on for a public deployment until the checklist at the end of this
page has been worked through with an account you can afford to make mistakes
with.

## What it can do

Sign in, cast, reply, like, recast, follow, delete your own cast, and sign out.
Each action is one signed message sent to the node's `/v1/submitMessage` route.

It cannot edit a profile, upload media, register an account, quote-cast from
the interface, or do anything that costs money. Nothing in it sends a
transaction.

## Signing in

A Farcaster account is controlled by its custody address, an Ethereum address.
Day-to-day messages are not signed by that address but by a separate Ed25519
signing key that the custody address has approved.

Hypersnap accepts that approval as an ordinary message (`KEY_ADD`) instead of
an on-chain transaction, so signing in costs nothing:

1. The wallet is asked for its address (`eth_requestAccounts`).
2. The node is asked which accounts have that custody address.
3. The browser creates a new Ed25519 key pair.
4. The wallet is asked to sign two pieces of typed data
   (`eth_signTypedData_v4`), both under the domain `Farcaster KeyAdd`: a
   request for the key, and the approval of the key with what it may do.
5. The message carrying both signatures is signed by the new key and sent to
   the node.
6. Only if the node accepts it is the key kept.

Those are the only two things Hypercast ever asks a wallet to do. It never asks
for a transaction, a chain switch or a free-form signature, and never sees a
private key or recovery phrase. A test reads the built files and fails if any
other wallet method appears in them.

The wallet must be the one that holds the custody address itself. Smart-contract
wallets and wallets that only hold a *verified* address will not work.

### What the key may do

The key is registered with a list of permitted message kinds: add and remove
casts, reactions and follows. It cannot change the profile, add verifications or
manage other keys. The node drops a key that goes unused for 90 days.

### Where the key lives

The private half is created by the browser as a **non-extractable** key and
stored in IndexedDB. Scripts on the page can ask it to sign; they cannot read
it, export it or send it anywhere, and neither can Hypercast. A browser test
confirms the stored key refuses to be exported.

This protects the key from being copied. It does not stop a malicious script
running on the page from *using* it while the page is open, which is why the
build has a strict Content-Security-Policy and no third-party scripts.

Clearing the site's data deletes the key. The account is unaffected: sign in
again to make a new one.

### Signing out

Signing out sends a `KEY_REMOVE` signed by the key itself, which needs no
wallet, then deletes the key. If the node cannot be reached the key is still
deleted locally, and the interface says that it could not be revoked.

## How an action is sent

A message is a small binary record: kind, account number, timestamp, network,
and a body. It is hashed with BLAKE3 (first 20 bytes), the hash is signed with
the Ed25519 key, and the lot is sent as raw bytes.

The interface shows the change at once but marks it pending. When the node
accepts the message the mark is cleared; if the node refuses it, the change is
undone and the reason is shown. Nothing is reported as sent unless the node said
so.

- If the node says it is busy, the same bytes are sent again, up to three times.
  A message is identified by its hash, so it cannot be applied twice.
- If the connection drops, nothing is retried automatically, because whether the
  message arrived is unknown. The interface says so.
- If the node says the key is not valid (revoked elsewhere, or lapsed), the app
  signs out and says why.

A like followed quickly by an unlike gets a later timestamp than the like, since
on a tie the removal wins.

## What has been verified

Offline, with no real network or wallet involved:

- **Key registration matches the node byte for byte.** The Hypersnap node's
  source includes a compatibility test with fixed inputs and the exact bytes it
  accepts. Given the same inputs, Hypercast's builder produces identical bytes,
  an identical typed-data digest, and identical signatures.
- **Every message kind passes an independent checker.** The test node decodes
  each submitted message with a separate reader, recomputes the hash, verifies
  the Ed25519 signature and, for a key registration, recovers both wallet
  signatures and compares them with the account's custody address.
- **The whole flow works in a real browser** against that test node: sign in,
  cast with a mention and a link, reply, like, unlike, follow, delete, sign out,
  a declined wallet prompt, a wallet that owns no account, a missing wallet, and
  a key revoked from elsewhere.

## What has not been verified

- **No message has ever been sent to a live node.** Field layouts for casts,
  reactions and follows follow the published message schema and agree with
  another open-source client, but only key registration has a byte-level vector
  from the node itself.
- **No real wallet has been used.** The tests use a stand-in that implements
  `eth_requestAccounts` and `eth_signTypedData_v4`. Real wallets differ in
  small ways (address casing, how they report the signature's last byte); the
  known differences are handled, others may exist.
- **Whether a cast accepted by a Hypersnap node reaches any other network** is
  outside what this client can know or promise.
- The node's behaviour for an account with many existing keys, for rate limits
  on submission, and for clock skew is known only from reading its source.

## Before turning writes on

1. Use an account whose posts and follow list you would not mind being wrong.
2. The node has a `/v1/validateMessage` route that checks a message without
   recording it. Hypercast can post to it but has no interface for it. Checking
   one message of each kind that way first is the safest first step.
3. Sign in on a development build pointed at the real node, and confirm in a
   second client that the key appears and is listed with the expected
   permissions.
4. Cast, reply, like, unlike, follow, unfollow, delete. Confirm each from the
   node's own API, not from Hypercast's interface.
5. Sign out and confirm the key is gone.
6. Only then build with the flag for a deployment, and say plainly in public
   that writes are new.

## Where the code is

| File (under `apps/farcaster-web/src/`) | Job |
| --- | --- |
| `hypersnap/writes/proto.ts` | A small protobuf writer. |
| `hypersnap/writes/messages.ts` | Builds each kind of message, hashes and signs. |
| `hypersnap/writes/keyAdd.ts` | Key registration and revocation. |
| `hypersnap/writes/signer.ts` | The browser's key and its storage. |
| `hypersnap/writes/wallet.ts` | The two wallet requests. |
| `hypersnap/writes/poster.ts` | The only code that can POST, and only to two routes. |
| `hypersnap/writes/submit.ts` | Sending, the busy retry, error wording. |
| `hypersnap/writes/account.ts`, `actions.ts` | Sign in and out; the actions. |
| `hypersnap/writes/castText.ts` | Turns typed text into text, mentions and links. |
| `hypercast/write/` | The controller, sign-in dialog and composer. |
