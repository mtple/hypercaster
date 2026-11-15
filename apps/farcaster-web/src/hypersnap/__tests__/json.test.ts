import { parseJsonLossless, quoteUnsafeIntegers } from '~/hypersnap/json';

describe('parseJsonLossless', () => {
  it('parses ordinary JSON exactly like JSON.parse', () => {
    const text = '{"fid":3,"name":"dwr","n":[1,2.5,-3,1e3],"t":true,"x":null}';
    expect(parseJsonLossless(text)).toEqual(JSON.parse(text));
  });

  it('keeps an integer above 2^53 exact instead of rounding it', () => {
    // JSON.parse alone turns ...993 into ...992.
    expect(
      (JSON.parse('{"fid":9007199254740993}') as { fid: number }).fid,
    ).toBe(9007199254740992);
    expect(parseJsonLossless('{"fid":9007199254740993}')).toEqual({
      fid: '9007199254740993',
    });
  });

  it('leaves safe 16-digit integers as numbers', () => {
    expect(parseJsonLossless('{"n":9007199254740991}')).toEqual({
      n: 9007199254740991,
    });
  });

  it('handles the largest u64 and negative values', () => {
    expect(
      parseJsonLossless('[18446744073709551615,-9007199254740993]'),
    ).toEqual(['18446744073709551615', '-9007199254740993']);
  });

  it('does not touch digits inside strings, including escaped quotes', () => {
    const text =
      '{"cursor":"12345678901234567890","note":"say \\"12345678901234567890\\" twice","fid":12345678901234567890}';
    expect(parseJsonLossless(text)).toEqual({
      cursor: '12345678901234567890',
      note: 'say "12345678901234567890" twice',
      fid: '12345678901234567890',
    });
  });

  it('does not quote long floats or exponents', () => {
    expect(
      quoteUnsafeIntegers('[12345678901234567.5,1234567890123456789e2]'),
    ).toBe('[12345678901234567.5,1234567890123456789e2]');
  });

  it('still throws on invalid JSON', () => {
    expect(() => parseJsonLossless('{"fid":')).toThrow();
    expect(() => parseJsonLossless('Not Found')).toThrow();
  });
});
