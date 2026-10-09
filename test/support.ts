import { readFileSync } from "node:fs";
import { evaluate } from "../src/evaluator.ts";
import type { Context, Flag } from "../src/types.ts";

export interface ExpectedResult {
  variantKey: string;
  value: unknown;
  reason: string;
  ruleIndex: number | null;
  ruleId: string | null;
  bucketed: boolean;
}

export interface EvaluationCase {
  name: string;
  flag: string;
  context: Context;
  expected: ExpectedResult;
}

export interface EvaluationVectors {
  specVersion: number;
  flags: Record<string, Flag>;
  cases: EvaluationCase[];
}

export function loadVectors<T>(name: string): T {
  const path = new URL(`../spec/vectors/${name}.json`, import.meta.url);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function differences(flags: Record<string, Flag>, testCase: EvaluationCase): string[] {
  const actual = evaluate(flags[testCase.flag], testCase.context);
  const expected = testCase.expected;
  const checks: [string, unknown, unknown][] = [
    ["variantKey", expected.variantKey, actual.variantKey],
    ["value", expected.value, actual.value],
    ["reason", expected.reason, actual.reason],
    ["ruleIndex", expected.ruleIndex, actual.ruleIndex],
    ["ruleId", expected.ruleId, actual.ruleId],
    ["bucketed", expected.bucketed, actual.bucket !== null],
  ];
  return checks
    .filter(([, wanted, got]) => JSON.stringify(wanted) !== JSON.stringify(got))
    .map(
      ([field, wanted, got]) =>
        `${testCase.name}: ${field} expected ${JSON.stringify(wanted)} got ${JSON.stringify(got)}`,
    );
}

export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function userKeys(count: number, seed: number): string[] {
  const random = createRandom(seed);
  return Array.from({ length: count }, (_, index) => {
    const suffix = Math.floor(random() * 0xffffffff).toString(16);
    return `user-${index}-${suffix}`;
  });
}
