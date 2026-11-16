// @ts-check
/**
 * Test support: reads and checks Farcaster messages the way a node would,
 * so the fixture node can accept or refuse what the client submits.
 *
 * This is an independent reader written for the tests. It covers only the
 * message kinds the client can send, and it is never part of the app.
 */
import { blake3 } from '@noble/hashes/blake3.js';
import { recoverTypedDataAddress } from 'viem';

const MESSAGE_TYPES = {
  1: 'castAdd',
  2: 'castRemove',
  3: 'reactionAdd',
  4: 'reactionRemove',
  5: 'linkAdd',
  6: 'linkRemove',
  16: 'keyAdd',
  17: 'keyRemove',
};
const BODY_FIELDS = { castAdd: 5, castRemove: 6, reactionAdd: 7, reactionRemove: 7, linkAdd: 14, linkRemove: 14, keyAdd: 19, keyRemove: 20 };
const MAX_KEY_TTL_SECONDS = 90 * 24 * 60 * 60;
const KEY_ADD_DOMAIN = { name: 'Farcaster KeyAdd', version: '1', chainId: 1 };

const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
const text = (bytes) => new TextDecoder('utf-8', { fatal: true }).decode(bytes);

function readVarint(bytes, start) {
  let value = 0n;
  let shift = 0n;
  let index = start;
  for (;;) {
    if (index >= bytes.length || shift > 63n) {
      throw new Error('malformed varint');
    }
    const byte = bytes[index];
    index += 1;
    value |= BigInt(byte & 0x7f) << shift;
    if (byte < 0x80) {
      return [value, index];
    }
    shift += 7n;
  }
}

/** Splits a protobuf record into its fields, keeping repeats in order. */
function readFields(bytes) {
  /** @type {Map<number, (bigint | Uint8Array)[]>} */
  const fields = new Map();
  let index = 0;
  while (index < bytes.length) {
    const [key, afterKey] = readVarint(bytes, index);
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    let value;
    if (wire === 0) {
      [value, index] = readVarint(bytes, afterKey);
    } else if (wire === 2) {
      const [length, afterLength] = readVarint(bytes, afterKey);
      const end = afterLength + Number(length);
      if (end > bytes.length) {
        throw new Error('truncated field');
      }
      value = bytes.subarray(afterLength, end);
      index = end;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
    fields.set(field, [...(fields.get(field) ?? []), value]);
  }
  return fields;
}

const one = (fields, field) => fields.get(field)?.at(-1);
const number = (fields, field) => Number(one(fields, field) ?? 0n);
const bytesOf = (fields, field) => {
  const value = one(fields, field);
  return value instanceof Uint8Array ? value : new Uint8Array(0);
};
function packed(fields, field) {
  const out = [];
  for (const value of fields.get(field) ?? []) {
    if (value instanceof Uint8Array) {
      let index = 0;
      while (index < value.length) {
        let item;
        [item, index] = readVarint(value, index);
        out.push(item);
      }
    } else {
      out.push(value);
    }
  }
  return out;
}

function readCastId(bytes) {
  const fields = readFields(bytes);
  return { fid: String(one(fields, 1) ?? 0n), hash: hex(bytesOf(fields, 2)) };
}

function readBody(kind, bytes) {
  const fields = readFields(bytes);
  switch (kind) {
    case 'castAdd':
      return {
        mentions: packed(fields, 2).map(String),
        parent: fields.has(3) ? readCastId(bytesOf(fields, 3)) : null,
        text: text(bytesOf(fields, 4)),
        mentionsPositions: packed(fields, 5).map(Number),
        embeds: (fields.get(6) ?? []).map((embed) => {
          const parts = readFields(/** @type {Uint8Array} */ (embed));
          return parts.has(1) ? { url: text(bytesOf(parts, 1)) } : { cast: readCastId(bytesOf(parts, 2)) };
        }),
        parentUrl: fields.has(7) ? text(bytesOf(fields, 7)) : null,
        castType: number(fields, 8),
      };
    case 'castRemove':
      return { targetHash: hex(bytesOf(fields, 1)) };
    case 'reactionAdd':
    case 'reactionRemove':
      return { reaction: number(fields, 1), target: readCastId(bytesOf(fields, 2)) };
    case 'linkAdd':
    case 'linkRemove':
      return { linkType: text(bytesOf(fields, 1)), targetFid: String(one(fields, 3) ?? 0n) };
    case 'keyAdd':
      return {
        key: bytesOf(fields, 1),
        keyType: number(fields, 2),
        custodySignature: bytesOf(fields, 3),
        deadline: number(fields, 4),
        nonce: number(fields, 5),
        metadata: bytesOf(fields, 6),
        metadataType: number(fields, 7),
        scopes: packed(fields, 9).map(Number),
        ttl: number(fields, 10),
      };
    case 'keyRemove':
      return { key: bytesOf(fields, 1), signatureType: number(fields, 3), deadline: number(fields, 4), nonce: number(fields, 5) };
    default:
      throw new Error('unknown body');
  }
}

/** Decodes a message envelope without judging it. */
export function decodeMessage(bytes) {
  const envelope = readFields(bytes);
  const dataBytes = envelope.has(7) ? bytesOf(envelope, 7) : bytesOf(envelope, 1);
  const data = readFields(dataBytes);
  const kind = MESSAGE_TYPES[number(data, 1)];
  if (!kind) {
    throw new Error(`unsupported message type ${number(data, 1)}`);
  }
  const bodyField = BODY_FIELDS[kind];
  if (!data.has(bodyField)) {
    throw new Error('message body missing');
  }
  return {
    kind,
    fid: String(one(data, 2) ?? 0n),
    timestamp: number(data, 3),
    network: number(data, 4),
    body: readBody(kind, bytesOf(data, bodyField)),
    hash: hex(bytesOf(envelope, 2)),
    hashScheme: number(envelope, 3),
    signature: bytesOf(envelope, 4),
    signatureScheme: number(envelope, 5),
    signer: bytesOf(envelope, 6),
    dataBytes,
    dataField: bytesOf(envelope, 1),
  };
}

const wordAt = (bytes, offset) => BigInt(`0x${hex(bytes.subarray(offset, offset + 32)) || '0'}`);

/** abi.decode of (uint256 requestFid, address requestSigner, bytes signature, uint256 deadline). */
function readSignedKeyRequestMetadata(bytes) {
  const tuple = Number(wordAt(bytes, 0));
  const signatureOffset = tuple + Number(wordAt(bytes, tuple + 64));
  const signatureLength = Number(wordAt(bytes, signatureOffset));
  return {
    requestFid: wordAt(bytes, tuple),
    requestSigner: `0x${hex(bytes.subarray(tuple + 32 + 12, tuple + 64))}`,
    deadline: wordAt(bytes, tuple + 96),
    signature: bytes.subarray(signatureOffset + 32, signatureOffset + 32 + signatureLength),
  };
}

async function checkKeyAdd(message) {
  const { body } = message;
  if (hex(body.key) !== hex(message.signer)) {
    return 'key add must be signed by the key being added';
  }
  if (body.keyType !== 1 || body.metadataType !== 1) {
    return 'unsupported key or metadata type';
  }
  if (body.scopes.length === 0 || body.scopes.length > 16 || body.scopes.some((scope) => !MESSAGE_TYPES[scope] && ![7, 8, 11, 12, 13, 14, 15].includes(scope))) {
    return 'invalid scopes';
  }
  if (body.ttl <= 0 || body.ttl > MAX_KEY_TTL_SECONDS) {
    return 'invalid ttl';
  }
  if (body.deadline < message.timestamp) {
    return 'deadline passed';
  }
  const key = `0x${hex(body.key)}`;
  const metadata = readSignedKeyRequestMetadata(body.metadata);
  if (metadata.deadline < BigInt(message.timestamp)) {
    return 'key request deadline passed';
  }
  const requestSigner = await recoverTypedDataAddress({
    domain: KEY_ADD_DOMAIN,
    types: {
      SignedKeyRequest: [
        { name: 'requestFid', type: 'uint256' },
        { name: 'key', type: 'bytes' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'SignedKeyRequest',
    message: { requestFid: metadata.requestFid, key, deadline: metadata.deadline },
    signature: `0x${hex(metadata.signature)}`,
  });
  if (requestSigner.toLowerCase() !== metadata.requestSigner.toLowerCase()) {
    return 'invalid signed key request';
  }
  const custody = await recoverTypedDataAddress({
    domain: KEY_ADD_DOMAIN,
    types: {
      KeyAdd: [
        { name: 'fid', type: 'uint256' },
        { name: 'key', type: 'bytes' },
        { name: 'keyType', type: 'uint32' },
        { name: 'scopes', type: 'uint32[]' },
        { name: 'ttl', type: 'uint32' },
        { name: 'nonce', type: 'uint32' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'KeyAdd',
    message: { fid: BigInt(message.fid), key, keyType: body.keyType, scopes: body.scopes, ttl: body.ttl, nonce: body.nonce, deadline: BigInt(body.deadline) },
    signature: `0x${hex(body.custodySignature)}`,
  });
  message.custodyAddress = custody.toLowerCase();
  message.requestFid = String(metadata.requestFid);
  return null;
}

/**
 * Decodes a submitted message and checks what can be checked without any
 * state: hash, signature, and for a key add, both wallet signatures.
 * Returns { ok: true, message } or { ok: false, reason }.
 */
export async function checkMessage(bytes) {
  let message;
  try {
    message = decodeMessage(bytes);
  } catch (error) {
    return { ok: false, reason: `could not decode message: ${/** @type {Error} */ (error).message}` };
  }
  if (message.network !== 1 || message.hashScheme !== 1 || message.signatureScheme !== 1) {
    return { ok: false, reason: 'unsupported network or scheme' };
  }
  if (message.dataField.length > 0 && hex(message.dataField) !== hex(message.dataBytes)) {
    return { ok: false, reason: 'data and data_bytes differ' };
  }
  if (hex(blake3(message.dataBytes, { dkLen: 20 })) !== message.hash) {
    return { ok: false, reason: 'invalid hash' };
  }
  if (message.signer.length !== 32 || message.signature.length !== 64) {
    return { ok: false, reason: 'invalid signature' };
  }
  const key = await crypto.subtle.importKey('raw', message.signer, { name: 'Ed25519' }, false, ['verify']);
  const hashBytes = Uint8Array.from(message.hash.match(/../g).map((pair) => Number.parseInt(pair, 16)));
  if (!(await crypto.subtle.verify({ name: 'Ed25519' }, key, message.signature, hashBytes))) {
    return { ok: false, reason: 'invalid signature' };
  }
  if (message.kind === 'keyAdd') {
    const problem = await checkKeyAdd(message);
    if (problem) {
      return { ok: false, reason: problem };
    }
  }
  if (message.kind === 'keyRemove' && (message.body.signatureType !== 2 || hex(message.body.key) !== hex(message.signer))) {
    return { ok: false, reason: 'only self-revocation is supported here' };
  }
  return { ok: true, message: { ...message, signerHex: hex(message.signer) } };
}
