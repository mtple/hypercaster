import type { CastHash, Fid } from '~/hypersnap/types';

/** Hypersnap-native accounts are numbered from 2^32. */
const FIRST_NATIVE_FID = BigInt('4294967296');
const MAX_U64 = BigInt('18446744073709551615');

const DIGITS = /^\d{1,20}$/;
const HEX = /^[0-9a-f]+$/;

/**
 * Accepts the two encodings a node uses for FIDs (JSON number for legacy
 * accounts, decimal string for native ones) and returns a canonical decimal
 * string. Returns null for anything else, including 0, negatives, fractions
 * and numbers too large to have survived JSON.parse intact.
 */
function parseFid(value: unknown): Fid | null {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      return null;
    }
    return String(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!DIGITS.test(trimmed)) {
      return null;
    }
    const parsed = BigInt(trimmed);
    if (parsed <= BigInt(0) || parsed > MAX_U64) {
      return null;
    }
    return parsed.toString();
  }

  return null;
}

function isNativeFid(fid: Fid): boolean {
  return BigInt(fid) >= FIRST_NATIVE_FID;
}

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X')
    ? value.slice(2)
    : value;
}

/** A full 20-byte cast hash, canonicalised to lowercase with "0x". */
function normalizeHash(value: unknown): CastHash | null {
  if (typeof value !== 'string') {
    return null;
  }
  const hex = stripHexPrefix(value.trim()).toLowerCase();
  if (hex.length !== 40 || !HEX.test(hex)) {
    return null;
  }
  return `0x${hex}`;
}

/**
 * A leading fragment of a cast hash as used in "/:username/0x1234abcd"
 * permalinks. At least 4 bytes so a scan cannot match by accident.
 */
function normalizeHashPrefix(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const hex = stripHexPrefix(value.trim()).toLowerCase();
  if (hex.length < 8 || hex.length > 40 || !HEX.test(hex)) {
    return null;
  }
  return `0x${hex}`;
}

/** The 4-byte prefix used in share URLs. */
function shortHash(hash: CastHash): string {
  return hash.slice(0, 10);
}

export {
  FIRST_NATIVE_FID,
  isNativeFid,
  normalizeHash,
  normalizeHashPrefix,
  parseFid,
  shortHash,
  stripHexPrefix,
};
