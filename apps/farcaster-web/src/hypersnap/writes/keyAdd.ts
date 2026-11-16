/**
 * Registering and revoking this browser's signing key.
 *
 * Hypersnap accepts a KEY_ADD message in place of an on-chain transaction:
 * the account's custody wallet signs two EIP-712 payloads approving the new
 * Ed25519 key, the key signs the message itself, and the node records the
 * key with the listed scopes. No gas, no contract call.
 */
import type { Fid } from '~/hypersnap/types';
import { WriteError } from '~/hypersnap/writes/errors';
import {
  BodyField,
  fidValue,
  messageData,
  type MessageSigner,
  MessageType,
  type SignedMessage,
  signMessage,
} from '~/hypersnap/writes/messages';
import {
  bytesField,
  concatBytes,
  fromHex,
  packedField,
  toHex,
  uintField,
} from '~/hypersnap/writes/proto';

const KEY_ADD_DOMAIN = {
  name: 'Farcaster KeyAdd',
  version: '1',
  chainId: 1,
} as const;

const EIP712_DOMAIN_TYPE = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
] as const;

const KEY_TYPE_ED25519 = 1;
const METADATA_TYPE_SIGNED_KEY_REQUEST = 1;
const KEY_REMOVE_BY_KEY_ITSELF = 2;

/** The longest idle period after which the node drops an unused key. */
const MAX_KEY_TTL_SECONDS = 90 * 24 * 60 * 60;
/** How long the wallet's approval stays valid, in seconds. */
const APPROVAL_WINDOW_SECONDS = 60 * 60;

/**
 * What a Hypercast key may sign: casts, reactions and follows, and their
 * removal. Not profile changes, verifications or other keys.
 */
const HYPERCAST_SCOPES: readonly number[] = [
  MessageType.castAdd,
  MessageType.castRemove,
  MessageType.reactionAdd,
  MessageType.reactionRemove,
  MessageType.linkAdd,
  MessageType.linkRemove,
];

type TypedData = {
  domain: typeof KEY_ADD_DOMAIN;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
};

/** Something that can sign EIP-712 data as the custody address. */
type CustodySigner = {
  address: string;
  /** Returns the 65-byte signature r || s || v. */
  signTypedData: (typedData: TypedData) => Promise<Uint8Array>;
};

type KeyAddParams = {
  fid: Fid;
  custody: CustodySigner;
  signer: MessageSigner;
  /** Must be greater than the account's last used key nonce. */
  nonce: number;
  /** Farcaster-epoch seconds; also the message timestamp. */
  timestamp: number;
  scopes?: readonly number[];
  ttlSeconds?: number;
  /** Farcaster-epoch seconds after which the approval is void. */
  deadline?: number;
};

function signedKeyRequestTypedData(
  fid: Fid,
  key: Uint8Array,
  deadline: number,
): TypedData {
  return {
    domain: KEY_ADD_DOMAIN,
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
      SignedKeyRequest: [
        { name: 'requestFid', type: 'uint256' },
        { name: 'key', type: 'bytes' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'SignedKeyRequest',
    message: {
      // Decimal strings: account numbers can exceed what a JSON number holds.
      requestFid: fidValue(fid).toString(),
      key: `0x${toHex(key)}`,
      deadline: String(deadline),
    },
  };
}

function keyAddTypedData(params: {
  fid: Fid;
  key: Uint8Array;
  scopes: readonly number[];
  ttlSeconds: number;
  nonce: number;
  deadline: number;
}): TypedData {
  return {
    domain: KEY_ADD_DOMAIN,
    types: {
      EIP712Domain: EIP712_DOMAIN_TYPE,
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
    message: {
      fid: fidValue(params.fid).toString(),
      key: `0x${toHex(params.key)}`,
      keyType: KEY_TYPE_ED25519,
      scopes: [...params.scopes],
      ttl: params.ttlSeconds,
      nonce: params.nonce,
      deadline: String(params.deadline),
    },
  };
}

function word(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 256n) {
    throw new RangeError('Value does not fit in 32 bytes');
  }
  return fromHex(value.toString(16).padStart(64, '0'));
}

function addressValue(address: string): bigint {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new WriteError('invalid', 'That is not an Ethereum address');
  }
  return BigInt(address);
}

function normalizeSignature(signature: Uint8Array): Uint8Array {
  if (signature.length !== 65) {
    throw new WriteError(
      'unsupported',
      'The wallet returned a signature this node cannot check. Smart-contract wallets are not supported.',
    );
  }
  const out = Uint8Array.from(signature);
  // Some wallets report the recovery id as 0 or 1 instead of 27 or 28.
  if (out[64] < 27) {
    out[64] += 27;
  }
  return out;
}

/**
 * ABI encoding of the single tuple
 * (uint256 requestFid, address requestSigner, bytes signature, uint256 deadline).
 */
function signedKeyRequestMetadata(
  fid: Fid,
  requestSigner: string,
  signature: Uint8Array,
  deadline: number,
): Uint8Array {
  const padding = new Uint8Array((32 - (signature.length % 32)) % 32);
  return concatBytes([
    word(32n), // where the tuple starts
    word(fidValue(fid)),
    word(addressValue(requestSigner)),
    word(128n), // where the signature starts, within the tuple
    word(BigInt(deadline)),
    word(BigInt(signature.length)),
    signature,
    padding,
  ]);
}

/**
 * Builds the KEY_ADD message. The wallet is asked to sign twice: once as
 * the "requesting app" (the account itself, since Hypercast has no app
 * account of its own) and once as the account's custody address.
 */
async function buildKeyAdd(params: KeyAddParams): Promise<SignedMessage> {
  const scopes = params.scopes ?? HYPERCAST_SCOPES;
  const ttlSeconds = params.ttlSeconds ?? MAX_KEY_TTL_SECONDS;
  const deadline =
    params.deadline ?? params.timestamp + APPROVAL_WINDOW_SECONDS;
  const key = params.signer.publicKey;

  if (key.length !== 32) {
    throw new WriteError('invalid', 'The signing key is not an Ed25519 key');
  }
  if (scopes.length === 0 || scopes.length > 16) {
    throw new WriteError('invalid', 'A key needs between 1 and 16 scopes');
  }
  if (ttlSeconds <= 0 || ttlSeconds > MAX_KEY_TTL_SECONDS) {
    throw new WriteError('invalid', 'The key lifetime is out of range');
  }
  if (
    !Number.isInteger(params.nonce) ||
    params.nonce <= 0 ||
    params.nonce > 0xffffffff
  ) {
    throw new WriteError('invalid', 'The key nonce is out of range');
  }

  const requestSignature = normalizeSignature(
    await params.custody.signTypedData(
      signedKeyRequestTypedData(params.fid, key, deadline),
    ),
  );
  const custodySignature = normalizeSignature(
    await params.custody.signTypedData(
      keyAddTypedData({
        fid: params.fid,
        key,
        scopes,
        ttlSeconds,
        nonce: params.nonce,
        deadline,
      }),
    ),
  );

  const body = concatBytes([
    bytesField(1, key),
    uintField(2, KEY_TYPE_ED25519),
    bytesField(3, custodySignature),
    uintField(4, deadline),
    uintField(5, params.nonce),
    bytesField(
      6,
      signedKeyRequestMetadata(
        params.fid,
        params.custody.address,
        requestSignature,
        deadline,
      ),
    ),
    uintField(7, METADATA_TYPE_SIGNED_KEY_REQUEST),
    packedField(9, scopes),
    uintField(10, ttlSeconds),
  ]);

  return signMessage(
    messageData(
      MessageType.keyAdd,
      params.fid,
      params.timestamp,
      BodyField.keyAdd,
      body,
    ),
    params.signer,
  );
}

/**
 * A KEY_REMOVE signed by the key being removed. It needs no wallet, so
 * signing out can revoke this browser's key on its own.
 */
async function buildKeyRemove(params: {
  fid: Fid;
  signer: MessageSigner;
  nonce: number;
  timestamp: number;
}): Promise<SignedMessage> {
  const body = concatBytes([
    bytesField(1, params.signer.publicKey),
    uintField(3, KEY_REMOVE_BY_KEY_ITSELF),
    uintField(4, params.timestamp + APPROVAL_WINDOW_SECONDS),
    uintField(5, params.nonce),
  ]);
  return signMessage(
    messageData(
      MessageType.keyRemove,
      params.fid,
      params.timestamp,
      BodyField.keyRemove,
      body,
    ),
    params.signer,
  );
}

export {
  buildKeyAdd,
  buildKeyRemove,
  HYPERCAST_SCOPES,
  keyAddTypedData,
  MAX_KEY_TTL_SECONDS,
  signedKeyRequestTypedData,
};
export type { CustodySigner, KeyAddParams, TypedData };
