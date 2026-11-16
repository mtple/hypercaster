/**
 * Test doubles for the two kinds of key the write path uses. Both are
 * built from fixed public test values; nothing here is a real credential.
 */
import { hashTypedData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import type { CustodySigner, TypedData } from '~/hypersnap/writes/keyAdd';
import type { MessageSigner } from '~/hypersnap/writes/messages';
import { concatBytes, fromHex } from '~/hypersnap/writes/proto';

// PKCS#8 wrapper for a raw 32-byte Ed25519 seed.
const PKCS8_ED25519_PREFIX = fromHex('302e020100300506032b657004220420');

const fromBase64Url = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value, 'base64url'));

/** An Ed25519 signer whose key comes from a fixed seed. */
async function signerFromSeed(seedHex: string): Promise<MessageSigner> {
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    concatBytes([
      PKCS8_ED25519_PREFIX,
      fromHex(seedHex),
    ]) as Uint8Array<ArrayBuffer>,
    { name: 'Ed25519' },
    true,
    ['sign'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', privateKey);
  return {
    publicKey: fromBase64Url(jwk.x as string),
    sign: async (payload) =>
      new Uint8Array(
        await crypto.subtle.sign(
          { name: 'Ed25519' },
          privateKey,
          payload as Uint8Array<ArrayBuffer>,
        ),
      ),
  };
}

type RecordedRequest = { primaryType: string; typedData: TypedData };

/**
 * Stands in for a browser wallet: signs typed data with a fixed test key,
 * after a JSON round trip, exactly as a wallet receives it.
 */
function testCustody(privateKey: `0x${string}`): CustodySigner & {
  requests: RecordedRequest[];
  digests: string[];
} {
  const account = privateKeyToAccount(privateKey);
  const requests: RecordedRequest[] = [];
  const digests: string[] = [];
  return {
    address: account.address.toLowerCase(),
    requests,
    digests,
    async signTypedData(typedData) {
      const received = JSON.parse(JSON.stringify(typedData)) as TypedData;
      requests.push({ primaryType: received.primaryType, typedData: received });
      const { EIP712Domain: _domain, ...types } = received.types;
      const payload = {
        domain: received.domain,
        types,
        primaryType: received.primaryType,
        message: received.message,
      } as Parameters<typeof hashTypedData>[0];
      digests.push(hashTypedData(payload));
      return fromHex(await account.signTypedData(payload));
    },
  };
}

export { signerFromSeed, testCustody };
