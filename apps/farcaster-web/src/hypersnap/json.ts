/**
 * JSON.parse rounds integers above 2^53 - 1 before any decoder can look at
 * them. Hypersnap-native FIDs start at 2^32 and are unbounded u64 values, so
 * a node that ever emits one as a bare number would be silently corrupted.
 *
 * parseJsonLossless quotes every out-of-range integer literal before parsing,
 * so such values reach the decoders as exact decimal strings instead.
 */

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const LONG_DIGIT_RUN = /\d{16,}/;

const isDigit = (code: number) => code >= 48 && code <= 57;

function quoteUnsafeIntegers(text: string): string {
  let out = '';
  let copiedUpTo = 0;
  let i = 0;
  const length = text.length;

  while (i < length) {
    const code = text.charCodeAt(i);

    // Skip string literals wholesale, honouring escapes.
    if (code === 34 /* " */) {
      i += 1;
      while (i < length) {
        const inner = text.charCodeAt(i);
        if (inner === 92 /* \ */) {
          i += 2;
          continue;
        }
        if (inner === 34) {
          break;
        }
        i += 1;
      }
      i += 1;
      continue;
    }

    if (isDigit(code) || (code === 45 /* - */ && isDigit(text.charCodeAt(i + 1)))) {
      const start = i;
      i += 1;
      while (i < length && isDigit(text.charCodeAt(i))) {
        i += 1;
      }
      const next = text.charCodeAt(i);
      const isInteger =
        next !== 46 /* . */ && next !== 101 /* e */ && next !== 69; /* E */

      if (!isInteger) {
        // Consume the rest of the float so its digits are not re-scanned.
        while (
          i < length &&
          (isDigit(text.charCodeAt(i)) ||
            text[i] === '.' ||
            text[i] === 'e' ||
            text[i] === 'E' ||
            text[i] === '+' ||
            text[i] === '-')
        ) {
          i += 1;
        }
        continue;
      }

      const literal = text.slice(start, i);
      const digits = literal.startsWith('-') ? literal.length - 1 : literal.length;
      if (digits >= 16) {
        const value = BigInt(literal);
        if (value > MAX_SAFE || value < -MAX_SAFE) {
          out += `${text.slice(copiedUpTo, start)}"${literal}"`;
          copiedUpTo = i;
        }
      }
      continue;
    }

    i += 1;
  }

  if (copiedUpTo === 0) {
    return text;
  }
  return out + text.slice(copiedUpTo);
}

function parseJsonLossless(text: string): unknown {
  if (!LONG_DIGIT_RUN.test(text)) {
    return JSON.parse(text);
  }
  return JSON.parse(quoteUnsafeIntegers(text));
}

export { parseJsonLossless, quoteUnsafeIntegers };
