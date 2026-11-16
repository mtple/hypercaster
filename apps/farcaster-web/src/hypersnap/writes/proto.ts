/**
 * A protobuf writer just large enough for Farcaster messages: unsigned
 * varints, length-delimited bytes, strings, nested messages and packed
 * repeated integers. There is no reader; the node does the decoding.
 */

const EMPTY = new Uint8Array(0);
const WIRE_VARINT = 0;
const WIRE_LENGTH_DELIMITED = 2;

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const chunk of chunks) {
    length += chunk.length;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function varint(value: number | bigint): Uint8Array {
  let rest = BigInt(value);
  if (rest < 0n) {
    throw new RangeError('Only unsigned integers can be encoded');
  }
  const out: number[] = [];
  while (rest >= 0x80n) {
    out.push(Number(rest & 0x7fn) | 0x80);
    rest >>= 7n;
  }
  out.push(Number(rest));
  return Uint8Array.from(out);
}

const tag = (field: number, wireType: number): Uint8Array =>
  varint((field << 3) | wireType);

/** An integer field. Zero is the default and is left off the wire. */
function uintField(field: number, value: number | bigint): Uint8Array {
  return BigInt(value) === 0n
    ? EMPTY
    : concatBytes([tag(field, WIRE_VARINT), varint(value)]);
}

/** A bytes field. Empty is the default and is left off the wire. */
function bytesField(field: number, value: Uint8Array): Uint8Array {
  return value.length === 0
    ? EMPTY
    : concatBytes([
        tag(field, WIRE_LENGTH_DELIMITED),
        varint(value.length),
        value,
      ]);
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

function stringField(field: number, value: string): Uint8Array {
  return bytesField(field, utf8(value));
}

/** A nested message. Written even when empty, because presence matters. */
function messageField(field: number, value: Uint8Array): Uint8Array {
  return concatBytes([
    tag(field, WIRE_LENGTH_DELIMITED),
    varint(value.length),
    value,
  ]);
}

/** A packed repeated integer field. An empty list is left off the wire. */
function packedField(
  field: number,
  values: readonly (number | bigint)[],
): Uint8Array {
  return values.length === 0
    ? EMPTY
    : messageField(field, concatBytes(values.map(varint)));
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

function fromHex(hex: string): Uint8Array {
  const clean =
    hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new RangeError('Not a hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export {
  bytesField,
  concatBytes,
  fromHex,
  messageField,
  packedField,
  stringField,
  toHex,
  uintField,
  utf8,
  varint,
};
