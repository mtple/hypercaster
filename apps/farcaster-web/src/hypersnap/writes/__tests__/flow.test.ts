/**
 * The whole write path against the fixture node, which checks each message
 * the way a node does: it recomputes the hash, verifies the Ed25519
 * signature, recovers both wallet signatures on a key add, and refuses
 * messages from keys it has not been told about.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createFakeNode } from '~/hypersnap/fixtures/fakeNode';
import { decodeMessage } from '~/hypersnap/fixtures/protocol.mjs';
import { KEY_ADD_VECTOR as vector } from '~/hypersnap/writes/__tests__/keyAddVector';
import { testCustody } from '~/hypersnap/writes/__tests__/testKeys';
import {
  type AccountDeps,
  findAccounts,
  loadSigner,
  signIn,
  signOut,
} from '~/hypersnap/writes/account';
import {
  type ActionDeps,
  createClock,
  removeCast,
  sendCast,
  setFollow,
  setReaction,
} from '~/hypersnap/writes/actions';
import { memoryKeyStore } from '~/hypersnap/writes/signer';

const ADA = '1001';
const NOW = Date.parse('2026-11-15T18:00:00.000Z');

function setup() {
  const node = createFakeNode({ writesEnabled: true });
  const keyStore = memoryKeyStore();
  const deps: AccountDeps = {
    api: node.api,
    poster: node.poster,
    keyStore,
    now: () => NOW,
    submitOptions: { sleep: async () => undefined },
  };
  const custody = testCustody(vector.custodyPrivateKey);
  return { node, keyStore, deps, custody };
}

async function signedIn() {
  const context = setup();
  const [user] = await findAccounts(context.deps, context.custody.address);
  const account = await signIn(context.deps, {
    user,
    custody: context.custody,
  });
  const actions: ActionDeps = {
    poster: context.node.poster,
    fid: account.fid,
    signer: await loadSigner(context.deps, account),
    clock: createClock(() => NOW),
    submitOptions: { sleep: async () => undefined },
  };
  return { ...context, account, actions };
}

describe('signing in', () => {
  it('finds the account a wallet owns', async () => {
    const { deps, custody } = setup();
    const accounts = await findAccounts(deps, custody.address);
    expect(accounts.map((user) => user.username)).toEqual(['ada']);
  });

  it('says so when the wallet owns no account on this node', async () => {
    const { deps } = setup();
    await expect(
      findAccounts(deps, '0x00000000000000000000000000000000000000ff'),
    ).rejects.toMatchObject({ kind: 'no_account' });
  });

  it('registers a new key that the node then accepts', async () => {
    const { node, keyStore, deps, custody } = setup();
    const [user] = await findAccounts(deps, custody.address);
    const account = await signIn(deps, { user, custody });

    expect(account).toMatchObject({
      fid: ADA,
      username: 'ada',
      signedInAt: NOW,
    });
    expect(node.world.signersOf(ADA)).toEqual([account.signerPublicKey]);
    expect(await node.api.isSignerActive(ADA, account.signerPublicKey)).toBe(
      true,
    );
    expect(await node.api.getKeyNonce(ADA)).toBe(Math.floor(NOW / 1000));
    expect(await keyStore.load(ADA)).not.toBeNull();

    // One submission, as raw bytes, and only two wallet prompts.
    expect(node.submissions).toHaveLength(1);
    expect(node.submissions[0]).toMatchObject({
      path: '/v1/submitMessage',
      contentType: 'application/octet-stream',
    });
    expect(custody.requests).toHaveLength(2);
    const sent = decodeMessage(node.submissions[0].bytes);
    expect(sent.kind).toBe('keyAdd');
    expect(sent.body.scopes).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps no key when the node refuses the registration', async () => {
    const { node, keyStore, deps, custody } = setup();
    const [user] = await findAccounts(deps, custody.address);
    // A wallet that does not own the account signs instead.
    const stranger = testCustody(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    );
    await expect(
      signIn(deps, {
        user,
        custody: { ...stranger, address: custody.address },
      }),
    ).rejects.toMatchObject({ kind: 'refused' });
    expect(await keyStore.load(ADA)).toBeNull();
    expect(node.world.signersOf(ADA)).toEqual([]);
  });

  it('will not start if the wallet is not the account’s custody address', async () => {
    const { node, deps } = setup();
    const ben = await node.api.getUserByFid('1002');
    const custody = testCustody(vector.custodyPrivateKey);
    await expect(signIn(deps, { user: ben, custody })).rejects.toMatchObject({
      kind: 'no_account',
    });
    expect(custody.requests).toHaveLength(0);
    expect(node.submissions).toHaveLength(0);
  });

  it('uses a nonce above the last one, even if the clock is behind it', async () => {
    const { node, deps, custody } = setup();
    const [user] = await findAccounts(deps, custody.address);
    await signIn(deps, { user, custody });
    await signIn({ ...deps, now: () => NOW - 60_000 }, { user, custody });
    expect(await node.api.getKeyNonce(ADA)).toBe(Math.floor(NOW / 1000) + 1);
    expect(node.world.signersOf(ADA)).toHaveLength(2);
  });
});

describe('acting as a signed-in account', () => {
  let context: Awaited<ReturnType<typeof signedIn>>;
  beforeEach(async () => {
    context = await signedIn();
  });

  it('publishes a cast that then reads back from the node', async () => {
    const { node, actions } = context;
    const hash = await sendCast(actions, {
      text: 'Hello from the write path, ',
      mentions: ['1002'],
      mentionsPositions: [27],
      embeds: [{ url: 'https://example.com/post' }],
    });

    const cast = await node.api.getCast(hash);
    expect(cast.author.fid).toBe(ADA);
    expect(cast.text).toBe('Hello from the write path, @ben');
    expect(cast.embeds).toEqual([
      expect.objectContaining({
        kind: 'link',
        url: 'https://example.com/post',
      }),
    ]);
    expect(cast.timestampMs).toBe(NOW);
  });

  it('publishes a reply under its parent and a cast in a channel', async () => {
    const { node, actions } = context;
    const parent = node.world.casts.gm;
    const reply = await sendCast(actions, {
      text: 'gm!',
      mentions: [],
      mentionsPositions: [],
      embeds: [],
      parent: { fid: String(parent.author.fid), hash: `0x${parent.hash}` },
    });
    const thread = await node.api.getConversation(`0x${parent.hash}`);
    expect(thread.replies.map((node_) => node_.cast.hash)).toContain(reply);

    const inChannel = await sendCast(actions, {
      text: 'Channel post',
      mentions: [],
      mentionsPositions: [],
      embeds: [],
      parentUrl: 'https://channels.example/~/channel/photo',
    });
    expect((await node.api.getCast(inChannel)).channelId).toBe('photo');
  });

  it('likes and unlikes, and the node’s counts follow', async () => {
    const { node, actions } = context;
    const target = { fid: '1008', hash: `0x${node.world.casts.gm.hash}` };
    const read = () => node.api.getCast(target.hash, { viewerFid: ADA });
    const before = (await read()).likesCount;

    await setReaction(actions, 'like', target, true);
    expect(await read()).toMatchObject({
      likesCount: before + 1,
      viewerContext: { liked: true },
    });
    await setReaction(actions, 'like', target, false);
    expect(await read()).toMatchObject({
      likesCount: before,
      viewerContext: { liked: false },
    });

    // Sent in the same second, yet each is later than the one before.
    const stamps = node.submissions
      .slice(1)
      .map((s) => decodeMessage(s.bytes).timestamp);
    expect(stamps[1]).toBe(stamps[0] + 1);
  });

  it('recasts, follows and unfollows', async () => {
    const { node, actions } = context;
    const target = { fid: '1008', hash: `0x${node.world.casts.gm.hash}` };
    await setReaction(actions, 'recast', target, true);
    expect(
      (await node.api.getCast(target.hash, { viewerFid: ADA })).viewerContext,
    ).toMatchObject({ recasted: true });

    const hana = () => node.api.getUserByFid('1008', { viewerFid: ADA });
    const followers = (await hana()).followerCount;
    await setFollow(actions, '1008', true);
    expect(await hana()).toMatchObject({
      followerCount: followers + 1,
      viewerContext: { following: true },
    });
    await setFollow(actions, '1008', false);
    expect((await hana()).followerCount).toBe(followers);
  });

  it('deletes its own cast', async () => {
    const { node, actions } = context;
    const hash = await sendCast(actions, {
      text: 'Short-lived',
      mentions: [],
      mentionsPositions: [],
      embeds: [],
    });
    await removeCast(actions, hash);
    await expect(node.api.getCast(hash)).rejects.toMatchObject({
      kind: 'not_found',
    });
  });

  it('reports a refusal from the node and changes nothing', async () => {
    const { node, actions } = context;
    node.setOverride((path) =>
      path === '/v1/submitMessage'
        ? { status: 400, body: { details: 'message is too old' } }
        : null,
    );
    await expect(setFollow(actions, '1008', true)).rejects.toMatchObject({
      kind: 'refused',
      message: expect.stringContaining('too old'),
    });
  });

  it('is refused once signed out, because the key was revoked', async () => {
    const { node, deps, account, actions, keyStore } = context;
    expect(await signOut(deps, account)).toEqual({ revoked: true });
    expect(node.world.signersOf(ADA)).toEqual([]);
    expect(await keyStore.load(ADA)).toBeNull();
    await expect(loadSigner(deps, account)).rejects.toMatchObject({
      kind: 'signed_out',
    });
    // Even someone who kept a copy of the key gets nowhere.
    await expect(setFollow(actions, '1008', true)).rejects.toMatchObject({
      kind: 'refused',
    });
  });

  it('still signs out locally when the node cannot be reached', async () => {
    const { node, deps, account, keyStore } = context;
    node.setOverride((path) =>
      path === '/v1/submitMessage' ? 'network-error' : null,
    );
    expect(await signOut(deps, account)).toEqual({ revoked: false });
    expect(await keyStore.load(ADA)).toBeNull();
  });
});

describe('a read-only build', () => {
  it('cannot submit anything, whatever is asked of it', async () => {
    const node = createFakeNode({ writesEnabled: false });
    const custody = testCustody(vector.custodyPrivateKey);
    const deps: AccountDeps = {
      api: node.api,
      poster: node.poster,
      keyStore: memoryKeyStore(),
      now: () => NOW,
    };
    const [user] = await findAccounts(deps, custody.address);
    await expect(signIn(deps, { user, custody })).rejects.toMatchObject({
      kind: 'blocked',
    });
    expect(node.requests.every((request) => request.method === 'GET')).toBe(
      true,
    );
    expect(node.world.signersOf(ADA)).toEqual([]);
  });
});
