const C1 = 0xcc9e2d51;
const C2 = 0x1b873593;

const textEncoder = new TextEncoder();

function rotateLeft(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

function mixBlock(block: number): number {
  const scaled = Math.imul(block, C1);
  return Math.imul(rotateLeft(scaled, 15), C2);
}

function finalMix(input: number): number {
  let hash = input;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash;
}

export function murmur3(data: Uint8Array, seed = 0): number {
  const blockEnd = data.length - (data.length % 4);
  let hash = seed | 0;
  for (let index = 0; index < blockEnd; index += 4) {
    const block =
      data[index] |
      (data[index + 1] << 8) |
      (data[index + 2] << 16) |
      (data[index + 3] << 24);
    hash ^= mixBlock(block);
    hash = rotateLeft(hash, 13);
    hash = (Math.imul(hash, 5) + 0xe6546b64) | 0;
  }
  const remaining = data.length - blockEnd;
  if (remaining > 0) {
    let tail = 0;
    for (let offset = remaining - 1; offset >= 0; offset--) {
      tail = (tail << 8) | data[blockEnd + offset];
    }
    hash ^= mixBlock(tail);
  }
  return finalMix(hash ^ data.length) >>> 0;
}

export function encodeUtf8(text: string): Uint8Array {
  return textEncoder.encode(text);
}

export function hashText(text: string, seed = 0): number {
  return murmur3(encodeUtf8(text), seed);
}
