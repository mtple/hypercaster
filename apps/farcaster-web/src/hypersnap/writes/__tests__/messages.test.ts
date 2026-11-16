import { blake3 } from '@noble/hashes/blake3.js';
import { describe, expect, it } from 'vitest';

import { checkMessage, decodeMessage } from '~/hypersnap/fixtures/protocol.mjs';
import { KEY_ADD_VECTOR as vector } from '~/hypersnap/writes/__tests__/keyAddVector';
import { signerFromSeed } from '~/hypersnap/writes/__tests__/testKeys';
import { createClock } from '~/hypersnap/writes/actions';
import {
  castAddData,
  castRemoveData,
  farcasterTime,
  followData,
  reactionData,
  signMessage,
} from '~/hypersnap/writes/messages';
import {
  bytesField,
  fromHex,
  packedField,
  stringField,
  toHex,
  uintField,
  varint,
} from '~/hypersnap/writes/proto';

const HASH = '0x5c326fef6adb081bed424f3a24a4530e352d4ea7';
const draft = (text: string) => ({
  text,
  mentions: [],
  mentionsPositions: [],
  embeds: [],
});

describe('protobuf writer', () => {
  it('writes varints, including ones past 32 and 53 bits', () => {
    expect(toHex(varint(0))).toBe('00');
    expect(toHex(varint(300))).toBe('ac02');
    expect(toHex(varint(4294967301n))).toBe('8580808010');
    expect(toHex(varint(18446744073709551615n))).toBe('ffffffffffffffffff01');
    expect(() => varint(-1)).toThrow(RangeError);
  });

  it('leaves default values off the wire', () => {
    expect(uintField(3, 0)).toHaveLength(0);
    expect(bytesField(2, new Uint8Array(0))).toHaveLength(0);
    expect(stringField(4, '')).toHaveLength(0);
    expect(packedField(2, [])).toHaveLength(0);
    expect(toHex(uintField(3, 1))).toBe('1801');
    expect(toHex(stringField(4, 'hé'))).toBe('220368c3a9');
    expect(toHex(packedField(9, [1, 2, 300]))).toBe('4a040102ac02');
  });

  it('converts hex both ways and rejects junk', () => {
    expect(toHex(fromHex('0x00ff10'))).toBe('00ff10');
    expect(() => fromHex('0xabc')).toThrow(RangeError);
    expect(() => fromHex('zz')).toThrow(RangeError);
  });
});

describe('message builders', () => {
  it('counts time from the Farcaster epoch', () => {
    expect(farcasterTime(Date.parse('2021-01-01T00:00:00Z'))).toBe(0);
    expect(farcasterTime(Date.parse('2026-11-15T18:00:00Z'))).toBe(185_306_400);
  });

  it('builds a cast with mentions, a link, a quoted cast and a parent', () => {
    const data = castAddData('4294967301', 150_000_000, {
      text: 'hi  and ',
      mentions: ['1002', '4294967296'],
      mentionsPositions: [3, 8],
      embeds: [
        { url: 'https://example.com/a' },
        { cast: { fid: '1001', hash: HASH } },
      ],
      parent: { fid: '1008', hash: HASH },
    });
    // The envelope reader accepts bare MessageData in field 1.
    const decoded = decodeMessage(bytesField(1, data));
    expect(decoded).toMatchObject({
      kind: 'castAdd',
      fid: '4294967301',
      timestamp: 150_000_000,
      network: 1,
      body: {
        text: 'hi  and ',
        mentions: ['1002', '4294967296'],
        mentionsPositions: [3, 8],
        embeds: [
          { url: 'https://example.com/a' },
          { cast: { fid: '1001', hash: HASH.slice(2) } },
        ],
        parent: { fid: '1008', hash: HASH.slice(2) },
        parentUrl: null,
        castType: 0,
      },
    });
  });

  it('marks a cast over 320 bytes as long, counting bytes not characters', () => {
    const type = (text: string) =>
      decodeMessage(bytesField(1, castAddData('1', 1, draft(text)))).body
        .castType;
    expect(type('a'.repeat(320))).toBe(0);
    expect(type('a'.repeat(321))).toBe(1);
    expect(type('é'.repeat(161))).toBe(1);
  });

  it.each([
    ['is empty', draft('')],
    ['is over 1024 bytes', draft('é'.repeat(513))],
    [
      'has three links',
      {
        ...draft('x'),
        embeds: [1, 2, 3].map((n) => ({ url: `https://e.example/${n}` })),
      },
    ],
    [
      'has eleven mentions',
      {
        ...draft('x'),
        mentions: Array(11).fill('2'),
        mentionsPositions: Array(11).fill(0),
      },
    ],
    ['has a mention without a position', { ...draft('x'), mentions: ['2'] }],
    [
      'has a mention past the end',
      { ...draft('x'), mentions: ['2'], mentionsPositions: [5] },
    ],
    [
      'has mentions out of order',
      { ...draft('abc'), mentions: ['2', '3'], mentionsPositions: [2, 1] },
    ],
    [
      'is both a reply and a channel post',
      {
        ...draft('x'),
        parent: { fid: '2', hash: HASH },
        parentUrl: 'https://c.example/~/channel/a',
      },
    ],
    [
      'replies to a malformed hash',
      { ...draft('x'), parent: { fid: '2', hash: '0x1234' } },
    ],
  ])('refuses a cast that %s', (_name, bad) => {
    expect(() => castAddData('1', 1, bad)).toThrow(
      expect.objectContaining({ name: 'WriteError', kind: 'invalid' }),
    );
  });

  it('refuses an invalid account number or time', () => {
    expect(() => castAddData('0', 1, draft('x'))).toThrow(/account number/);
    expect(() => castAddData('abc', 1, draft('x'))).toThrow(/account number/);
    expect(() => castAddData('1', 0, draft('x'))).toThrow(/time/);
    expect(() => followData('7', 1, '7', false)).toThrow(/itself/);
  });

  it('builds reactions, follows and removals with the right types', () => {
    const target = { fid: '1008', hash: HASH };
    const read = (data: Uint8Array) => decodeMessage(bytesField(1, data));
    expect(read(reactionData('1', 5, 'like', target, false))).toMatchObject({
      kind: 'reactionAdd',
      body: { reaction: 1, target: { fid: '1008', hash: HASH.slice(2) } },
    });
    expect(read(reactionData('1', 5, 'recast', target, true))).toMatchObject({
      kind: 'reactionRemove',
      body: { reaction: 2 },
    });
    expect(read(followData('1', 5, '4294967301', false))).toMatchObject({
      kind: 'linkAdd',
      body: { linkType: 'follow', targetFid: '4294967301' },
    });
    expect(read(followData('1', 5, '2', true)).kind).toBe('linkRemove');
    expect(read(castRemoveData('1', 5, HASH))).toMatchObject({
      kind: 'castRemove',
      body: { targetHash: HASH.slice(2) },
    });
  });
});

describe('signing', () => {
  it('hashes with BLAKE3-160 and signs the hash with Ed25519', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    const data = castAddData('1234', 100_000_000, draft('signed'));
    const message = await signMessage(data, signer);

    expect(message.hash).toBe(`0x${toHex(blake3(data, { dkLen: 20 }))}`);
    const checked = await checkMessage(message.bytes);
    expect(checked).toMatchObject({ ok: true, message: { kind: 'castAdd' } });

    // Flip one bit of the text: the hash no longer matches.
    const tampered = Uint8Array.from(message.bytes);
    tampered[tampered.length - 1] ^= 1;
    expect(await checkMessage(tampered)).toMatchObject({ ok: false });
  });

  it('is deterministic: the same message twice is the same bytes', async () => {
    const signer = await signerFromSeed(vector.signerSeed);
    const data = castAddData('1234', 100_000_000, draft('again'));
    const [first, second] = await Promise.all([
      signMessage(data, signer),
      signMessage(data, signer),
    ]);
    expect(toHex(first.bytes)).toBe(toHex(second.bytes));
  });
});

describe('message clock', () => {
  it('never repeats a toggle timestamp and never runs far ahead', () => {
    let nowMs = Date.parse('2026-11-15T18:00:00Z');
    const clock = createClock(() => nowMs);
    const base = farcasterTime(nowMs);
    expect([
      clock.nextToggle(),
      clock.nextToggle(),
      clock.nextToggle(),
    ]).toEqual([base, base + 1, base + 2]);
    for (let i = 0; i < 1000; i += 1) {
      clock.nextToggle();
    }
    expect(clock.nextToggle()).toBe(base + 590);
    nowMs += 3_600_000;
    expect(clock.nextToggle()).toBe(base + 3600);
    expect(clock.now()).toBe(base + 3600);
  });
});
