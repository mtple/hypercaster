// @ts-check
/**
 * The write-enabled build in a real browser, against the mock node.
 *
 * The mock node checks every submitted message the way a node does: it
 * recomputes the hash, verifies the Ed25519 signature, recovers both wallet
 * signatures on a key registration and compares them with the account's
 * custody address. The "wallet" here is a stand-in that signs with the
 * first account of the public "test test ... junk" developer mnemonic.
 */
import { privateKeyToAccount } from 'viem/accounts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { decodeMessage } from '../src/hypersnap/fixtures/protocol.mjs';
import { env, launch, openPage, resetNode } from './helpers.mjs';

const TEST_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const STRANGER_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const GM_HASH = '6e0e5cee01728db622651ec98fc5b44d46085862';

/** @type {import('playwright').Browser} */
let browser;
beforeAll(async () => {
  browser = await launch();
});
afterAll(async () => {
  await browser?.close();
});
beforeEach(resetNode);

const app = (pathname = '/') => env().writesUrl + pathname;
const node = (pathname) => fetch(env().nodeUrl + pathname).then((response) => response.json());
const gmCast = async (viewer = '') => (await node(`/v2/farcaster/cast?identifier=${GM_HASH}&type=hash${viewer}`)).cast;

/**
 * Opens the app with a stand-in wallet. Returns the calls the page made to
 * it, so tests can check the wallet was asked for nothing but signatures.
 */
async function openWithWallet({ key = TEST_KEY, reject = false } = {}) {
  const session = await openPage(browser);
  const account = privateKeyToAccount(/** @type {`0x${string}`} */ (key));
  /** @type {{ method: string, primaryType?: string }[]} */
  const walletCalls = [];
  await session.context.exposeFunction('__testWallet', async (method, params) => {
    if (method === 'eth_requestAccounts') {
      walletCalls.push({ method });
      return { result: [account.address] };
    }
    if (method === 'eth_signTypedData_v4') {
      const typed = JSON.parse(params[1]);
      walletCalls.push({ method, primaryType: typed.primaryType });
      if (reject) {
        return { error: { code: 4001, message: 'User rejected the request.' } };
      }
      const types = { ...typed.types };
      delete types.EIP712Domain;
      return { result: await account.signTypedData({ domain: typed.domain, types, primaryType: typed.primaryType, message: typed.message }) };
    }
    walletCalls.push({ method });
    return { error: { code: 4200, message: 'Unsupported method' } };
  });
  await session.context.addInitScript(() => {
    window.ethereum = {
      request: async ({ method, params }) => {
        const answer = await window.__testWallet(method, params);
        if (answer.error) {
          throw Object.assign(new Error(answer.error.message), { code: answer.error.code });
        }
        return answer.result;
      },
    };
  });
  return { ...session, walletCalls };
}

async function signIn(page) {
  await page.goto(app());
  await page.getByRole('button', { name: 'Sign in' }).first().click();
  await page.getByRole('button', { name: 'Connect wallet' }).click();
  await page.getByRole('button', { name: /Ada Okafor/ }).click();
  await expect.poll(() => page.getByText('Signed in as').count(), { timeout: 20_000 }).toBeGreaterThan(0);
}

const posts = (session) => session.requests.filter((request) => request.method === 'POST');

describe('signing in', () => {
  it('registers a key the node accepts, asking the wallet for two signatures and nothing else', async () => {
    const session = await openWithWallet();
    const { page, walletCalls, problems } = session;
    await signIn(page);

    expect(walletCalls).toEqual([
      { method: 'eth_requestAccounts' },
      { method: 'eth_signTypedData_v4', primaryType: 'SignedKeyRequest' },
      { method: 'eth_signTypedData_v4', primaryType: 'KeyAdd' },
    ]);
    expect(posts(session).map((request) => new URL(request.url).pathname)).toEqual(['/v1/submitMessage']);
    expect((await node('/v1/signersByFid?fid=1001')).signers).toHaveLength(1);

    // The private key is not readable by the page: it is not in any storage
    // a script can read, and the stored handle refuses to be exported.
    const exposure = await page.evaluate(async () => {
      const stored = JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + document.cookie;
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open('hypercast');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise((resolve) => {
        const request = database.transaction('signing-keys').objectStore('signing-keys').get('1001');
        request.onsuccess = () => resolve(request.result);
      });
      let exported = 'refused';
      try {
        await window.crypto.subtle.exportKey('pkcs8', record.privateKey);
        exported = 'exported';
      } catch {
        // expected
      }
      return { stored, extractable: record.privateKey.extractable, exported };
    });
    expect(exposure.extractable).toBe(false);
    expect(exposure.exported).toBe('refused');
    expect(exposure.stored).not.toMatch(/privateKey|seed|mnemonic/i);
    expect(problems).toEqual([]);

    // Still signed in after a reload, with no further wallet prompt.
    await page.reload();
    await expect.poll(() => page.getByText('Signed in as').count()).toBeGreaterThan(0);
    expect(walletCalls).toHaveLength(3);
    await session.context.close();
  });

  it('does nothing if the wallet request is declined', async () => {
    const session = await openWithWallet({ reject: true });
    const { page } = session;
    await page.goto(app());
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await page.getByRole('button', { name: /Ada Okafor/ }).click();
    await expect.poll(() => page.getByText('You declined the request in your wallet').count()).toBe(1);
    expect(posts(session)).toHaveLength(0);
    expect((await node('/v1/signersByFid?fid=1001')).signers).toHaveLength(0);
    expect(await page.getByText('Signed in as').count()).toBe(0);
    await session.context.close();
  });

  it('turns away a wallet that owns no account here', async () => {
    const session = await openWithWallet({ key: STRANGER_KEY });
    const { page } = session;
    await page.goto(app());
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await page.getByRole('button', { name: 'Connect wallet' }).click();
    await expect.poll(() => page.getByText(/not the custody address of any account/).count()).toBe(1);
    expect(posts(session)).toHaveLength(0);
    await session.context.close();
  });

  it('explains what to do when there is no wallet', async () => {
    const { page, context } = await openPage(browser);
    await page.goto(app());
    await page.getByRole('button', { name: 'Sign in' }).first().click();
    await expect.poll(() => page.getByText('No browser wallet was found.', { exact: false }).count()).toBe(1);
    expect(await page.getByRole('button', { name: 'Connect wallet' }).count()).toBe(0);
    await context.close();
  });
});

describe('acting while signed in', () => {
  it('likes and unlikes a cast, and the node agrees after a reload', async () => {
    const session = await openWithWallet();
    const { page } = session;
    await signIn(page);
    const before = (await gmCast()).reactions.likes_count;

    const gm = page.locator('article', { hasText: 'hana' }).first();
    await gm.getByRole('button', { name: 'Like', exact: true }).click();
    await expect.poll(() => gm.getByRole('button', { name: 'Unlike', exact: true }).count()).toBe(1);
    await expect.poll(async () => (await gmCast()).reactions.likes_count).toBe(before + 1);

    await page.reload();
    const again = page.locator('article', { hasText: 'hana' }).first();
    await expect.poll(() => again.getByRole('button', { name: 'Unlike', exact: true }).count()).toBe(1);
    await again.getByRole('button', { name: 'Unlike', exact: true }).click();
    await expect.poll(async () => (await gmCast()).reactions.likes_count).toBe(before);
    await session.context.close();
  });

  it('casts with a mention and a link, replies, follows, deletes, and signs out', async () => {
    const session = await openWithWallet();
    const { page, problems } = session;
    page.on('dialog', (dialog) => void dialog.accept());
    await signIn(page);

    // A new cast.
    await page.getByRole('button', { name: 'Cast', exact: true }).first().click();
    await page.getByLabel('Your cast').fill('Posting from the browser test. cc @ben https://example.com/notes');
    await page.getByRole('button', { name: 'Cast', exact: true }).last().click();
    await expect.poll(() => page.getByText(/^Sent to /).count()).toBe(1);
    const mine = async () => (await node('/v2/farcaster/feed/user/casts?fid=1001&limit=5')).casts;
    await expect.poll(async () => (await mine())[0].text).toBe('Posting from the browser test. cc  https://example.com/notes');
    const [posted] = await mine();
    expect(posted.mentioned_profiles.map((user) => user.username)).toEqual(['ben']);
    expect(posted.embeds).toEqual([{ url: 'https://example.com/notes' }]);

    // A reply, from the conversation page.
    await page.goto(app(`/~/conversations/0x${GM_HASH}`));
    await page.getByRole('button', { name: 'Reply', exact: true }).first().click();
    await page.getByLabel('Your reply').fill('gm from the test');
    await page.getByRole('button', { name: 'Reply', exact: true }).last().click();
    await expect.poll(() => page.locator('article', { hasText: 'gm from the test' }).count(), { timeout: 15_000 }).toBeGreaterThan(0);

    // Follow from a profile.
    await page.goto(app('/hana'));
    const hana = async () => (await node('/v2/farcaster/user/bulk?fids=1008')).users[0];
    const followers = (await hana()).follower_count;
    const profile = page.locator('main');
    await profile.getByRole('button', { name: 'Follow', exact: true }).first().click();
    await expect.poll(() => profile.getByRole('button', { name: 'Following', exact: true }).count()).toBe(1);
    await expect.poll(async () => (await hana()).follower_count).toBe(followers + 1);

    // Delete the cast made above.
    await page.goto(app(`/~/conversations/0x${posted.hash}`));
    await page.getByRole('button', { name: 'Delete cast' }).first().click();
    await expect.poll(async () => (await mine()).some((cast) => cast.hash === posted.hash)).toBe(false);

    // Every submission was a well-formed message of the expected kind.
    const sent = await node('/__control/submissions');
    expect(sent.map((hex) => decodeMessage(Uint8Array.from(Buffer.from(hex, 'hex'))).kind)).toEqual(['keyAdd', 'castAdd', 'castAdd', 'linkAdd', 'castRemove']);

    // Sign out revokes the key at the node.
    await page.goto(app('/~/settings'));
    await page.getByRole('button', { name: 'Sign out' }).first().click();
    await expect.poll(async () => (await page.getByRole('status').allTextContents()).join(' | '), { timeout: 10_000 }).toMatch(/Signed out\. This browser’s key was revoked/);
    await expect.poll(async () => (await node('/v1/signersByFid?fid=1001')).signers.length).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem('hypercast:v1:account'))).toBeNull();
    expect(problems).toEqual([]);
    await session.context.close();
  });

  it('undoes a like the node refuses, and signs out when the key is no longer accepted', async () => {
    const session = await openWithWallet();
    const { page } = session;
    await signIn(page);
    // Revoke the key behind the app's back, as another device could.
    await node('/__control/revoke?fid=1001');
    const gm = page.locator('article', { hasText: 'hana' }).first();
    await gm.getByRole('button', { name: 'Like', exact: true }).click();
    await expect.poll(() => page.getByRole('alert').filter({ hasText: 'signed out' }).count()).toBeGreaterThan(0);
    await expect.poll(() => page.getByText('Signed in as').count()).toBe(0);
    expect((await gmCast('&viewer_fid=1001')).viewer_context.liked).toBe(false);
    await session.context.close();
  });
});
