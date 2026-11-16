import { describe, expect, it } from 'vitest';

import { KEY_ADD_VECTOR as vector } from '~/hypersnap/writes/__tests__/keyAddVector';
import {
  signerFromSeed,
  testCustody,
} from '~/hypersnap/writes/__tests__/testKeys';
import { WriteError } from '~/hypersnap/writes/errors';
import {
  buildKeyAdd,
  buildKeyRemove,
  HYPERCAST_SCOPES,
  MAX_KEY_TTL_SECONDS,
} from '~/hypersnap/writes/keyAdd';
import { toHex } from '~/hypersnap/writes/proto';

describe('KEY_ADD', () => {
  it('reproduces the node’s interoperability vector byte for byte', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    expect(toHex(signer.publicKey)).toBe(vector.signerPublicKey);

    const custody = testCustody(vector.custodyPrivateKey);
    expect(custody.address).toBe(vector.custodyAddress);

    const message = await buildKeyAdd({
      fid: vector.fid,
      custody,
      signer,
      nonce: vector.nonce,
      timestamp: vector.timestamp,
      deadline: vector.deadline,
      ttlSeconds: vector.ttlSeconds,
      scopes: vector.scopes,
    });

    expect(toHex(message.dataBytes)).toBe(vector.dataBytes);
    expect(toHex(message.bytes)).toBe(vector.envelope);
    // The second thing the wallet signs is the KeyAdd payload itself.
    expect(custody.requests.map((request) => request.primaryType)).toEqual([
      'SignedKeyRequest',
      'KeyAdd',
    ]);
    expect(custody.digests[1]).toBe(`0x${vector.keyAddDigest}`);
  });

  it('asks the wallet for typed data only, with large account numbers as strings', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    const custody = testCustody(vector.custodyPrivateKey);
    await buildKeyAdd({
      fid: '4294967301',
      custody,
      signer,
      nonce: 1_800_000_000,
      timestamp: 150_000_000,
    });

    const [request, keyAdd] = custody.requests;
    expect(request.typedData.domain).toEqual({
      name: 'Farcaster KeyAdd',
      version: '1',
      chainId: 1,
    });
    expect(request.typedData.message.requestFid).toBe('4294967301');
    expect(keyAdd.typedData.message).toMatchObject({
      fid: '4294967301',
      keyType: 1,
      scopes: [...HYPERCAST_SCOPES],
      ttl: MAX_KEY_TTL_SECONDS,
      nonce: 1_800_000_000,
      // One hour after the message time, on the same clock.
      deadline: String(150_000_000 + 3600),
    });
  });

  it('limits a Hypercast key to casts, reactions and follows', () => {
    expect([...HYPERCAST_SCOPES]).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('accepts a wallet that reports the recovery id as 0 or 1', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    const reference = testCustody(vector.custodyPrivateKey);
    const lowV = testCustody(vector.custodyPrivateKey);
    const sign = lowV.signTypedData.bind(lowV);
    lowV.signTypedData = async (typedData) => {
      const signature = await sign(typedData);
      signature[64] -= 27;
      return signature;
    };
    const params = {
      fid: vector.fid,
      signer,
      nonce: vector.nonce,
      timestamp: vector.timestamp,
    };
    const expected = await buildKeyAdd({ ...params, custody: reference });
    const actual = await buildKeyAdd({ ...params, custody: lowV });
    expect(toHex(actual.bytes)).toBe(toHex(expected.bytes));
  });

  it('refuses signatures that are not 65 bytes, such as contract-wallet ones', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    const custody = testCustody(vector.custodyPrivateKey);
    custody.signTypedData = async () => new Uint8Array(130);
    await expect(
      buildKeyAdd({
        fid: vector.fid,
        custody,
        signer,
        nonce: vector.nonce,
        timestamp: vector.timestamp,
      }),
    ).rejects.toMatchObject({ kind: 'unsupported' });
  });

  it.each([
    ['no scopes', { scopes: [] }],
    [
      'too many scopes',
      { scopes: Array.from({ length: 17 }, (_, i) => i + 1) },
    ],
    ['a lifetime over ninety days', { ttlSeconds: MAX_KEY_TTL_SECONDS + 1 }],
    ['a zero nonce', { nonce: 0 }],
    ['a nonce beyond 32 bits', { nonce: 2 ** 32 }],
  ])('rejects %s before asking the wallet', async (_name, override) => {
    const signer = await signerFromSeed(vector.signerSeed);
    const custody = testCustody(vector.custodyPrivateKey);
    await expect(
      buildKeyAdd({
        fid: vector.fid,
        custody,
        signer,
        nonce: vector.nonce,
        timestamp: vector.timestamp,
        ...override,
      }),
    ).rejects.toBeInstanceOf(WriteError);
    expect(custody.requests).toHaveLength(0);
  });
});

describe('KEY_REMOVE', () => {
  it('is signed by the key being removed and needs no wallet', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    const message = await buildKeyRemove({
      fid: vector.fid,
      signer,
      nonce: 1_700_000_100,
      timestamp: vector.timestamp,
    });
    const data = toHex(message.dataBytes);
    // type 17, fid 1234, the same timestamp and network as the add.
    expect(data.startsWith('081110d2091880c2d72f2001a201')).toBe(true);
    // key (field 1), signature_type 2 (field 3).
    expect(data).toContain(`0a20${vector.signerPublicKey}1802`);
    expect(message.hash).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
