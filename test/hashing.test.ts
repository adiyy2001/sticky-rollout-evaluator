import { describe, expect, it } from "vitest";
import { BUCKET_SPACE, bucket, bucketInput, bucketOfText } from "../src/bucket.ts";
import { encodeUtf8, hashText } from "../src/murmur3.ts";
import { loadVectors, userKeys } from "./support.ts";

interface HashingVectors {
  hashes: { input: string; seed: number; hash: string }[];
  buckets: { input: string; hash: string; bucket: number }[];
}

const vectors = loadVectors<HashingVectors>("hashing");

function toHex(value: number): string {
  return value.toString(16).padStart(8, "0");
}

describe("murmur3", () => {
  it.each(vectors.hashes)("matches the reference value for $input with seed $seed", (vector) => {
    expect(toHex(hashText(vector.input, vector.seed))).toBe(vector.hash);
  });

  it("returns an unsigned 32 bit integer", () => {
    for (const key of userKeys(500, 7)) {
      const hash = hashText(key);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});

describe("utf8 encoding", () => {
  it("encodes multi byte characters", () => {
    expect(Array.from(encodeUtf8("é"))).toEqual([0xc3, 0xa9]);
    expect(Array.from(encodeUtf8("\u{1f600}"))).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });

  it("encodes a lone surrogate as the replacement character", () => {
    expect(Array.from(encodeUtf8("\ud800"))).toEqual([0xef, 0xbf, 0xbd]);
    expect(hashText("\ud800")).toBe(hashText("�"));
  });

  it("does not normalize or fold case", () => {
    expect(hashText("é")).not.toBe(hashText("é"));
    expect(hashText("User")).not.toBe(hashText("user"));
  });
});

describe("bucket", () => {
  it.each(vectors.buckets)("matches the vector for $input", (vector) => {
    expect(toHex(hashText(vector.input))).toBe(vector.hash);
    expect(bucketOfText(vector.input)).toBe(vector.bucket);
  });

  it("joins flag key, salt and context key with dots", () => {
    expect(bucketInput("checkout", "9f2c41", "user-1")).toBe("checkout.9f2c41.user-1");
    expect(bucket("checkout", "9f2c41", "user-1")).toBe(bucketOfText("checkout.9f2c41.user-1"));
  });

  it("stays inside the bucket space", () => {
    for (const key of userKeys(2000, 11)) {
      const value = bucket("checkout", "9f2c41", key);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(BUCKET_SPACE);
    }
  });

  it("gives the same bucket for a lone surrogate and the replacement character", () => {
    expect(bucket("checkout", "9f2c41", "a\ud800")).toBe(bucket("checkout", "9f2c41", "a�"));
  });
});
