import { hashText } from "./murmur3.ts";

export const BUCKET_SPACE = 100_000;

export function bucketInput(flagKey: string, salt: string, contextKey: string): string {
  return `${flagKey}.${salt}.${contextKey}`;
}

export function bucketOfText(text: string): number {
  return hashText(text) % BUCKET_SPACE;
}

export function bucket(flagKey: string, salt: string, contextKey: string): number {
  return bucketOfText(bucketInput(flagKey, salt, contextKey));
}
