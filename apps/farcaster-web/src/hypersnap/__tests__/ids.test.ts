import {
  isNativeFid,
  normalizeHash,
  normalizeHashPrefix,
  parseFid,
  shortHash,
} from '~/hypersnap/ids';

describe('parseFid', () => {
  it('accepts legacy numeric FIDs', () => {
    expect(parseFid(3)).toBe('3');
    expect(parseFid(1052964)).toBe('1052964');
  });

  it('accepts native FIDs sent as strings, without losing precision', () => {
    expect(parseFid('4294967296')).toBe('4294967296');
    expect(parseFid('9007199254740993')).toBe('9007199254740993');
    expect(parseFid('18446744073709551615')).toBe('18446744073709551615');
  });

  it('canonicalises leading zeros', () => {
    expect(parseFid('0042')).toBe('42');
  });

  it('rejects a number too large to have survived JSON parsing', () => {
    // 2^53 + 2 is representable, but the node could equally have sent +1 or +3.
    expect(parseFid(9007199254740994)).toBeNull();
  });

  it('rejects zero, negatives, fractions, overflow and junk', () => {
    for (const bad of [
      0,
      -1,
      1.5,
      NaN,
      '0',
      '-3',
      '1.5',
      'abc',
      '',
      '18446744073709551616',
      null,
      undefined,
      {},
    ]) {
      expect(parseFid(bad)).toBeNull();
    }
  });

  it('trims surrounding whitespace', () => {
    expect(parseFid(' 3 ')).toBe('3');
  });
});

describe('isNativeFid', () => {
  it('splits at 2^32', () => {
    expect(isNativeFid('4294967295')).toBe(false);
    expect(isNativeFid('4294967296')).toBe(true);
    expect(isNativeFid('9007199254740993')).toBe(true);
  });
});

describe('cast hashes', () => {
  const bare = '6BE259D14C6D7730B06BFFB6D2C4FC90ED6934FB';

  it('normalises to lowercase with 0x, from either form', () => {
    expect(normalizeHash(bare)).toBe(`0x${bare.toLowerCase()}`);
    expect(normalizeHash(`0x${bare}`)).toBe(`0x${bare.toLowerCase()}`);
  });

  it('rejects anything that is not exactly 20 bytes of hex', () => {
    expect(normalizeHash('0x6be259d1')).toBeNull();
    expect(normalizeHash(`${bare}00`)).toBeNull();
    expect(normalizeHash('zz'.repeat(20))).toBeNull();
    expect(normalizeHash(42)).toBeNull();
  });

  it('accepts share-link prefixes of 4 to 20 bytes', () => {
    expect(normalizeHashPrefix('0x6BE259D1')).toBe('0x6be259d1');
    expect(normalizeHashPrefix('6be259')).toBeNull();
    expect(normalizeHashPrefix('0xnothex!!')).toBeNull();
  });

  it('shortens to the 4-byte share form', () => {
    expect(shortHash(`0x${bare.toLowerCase()}`)).toBe('0x6be259d1');
  });
});
