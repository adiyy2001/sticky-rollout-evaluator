import { describe, expect, it } from "vitest";
import { bucket } from "../src/bucket.ts";
import { matchesCondition } from "../src/conditions.ts";
import { evaluate } from "../src/evaluator.ts";
import { percentageRollout, pickVariant } from "../src/rollout.ts";
import { InvalidFlagError, type Condition, type Flag, type Operator, type Scalar } from "../src/types.ts";
import { findProblems, validateFlag } from "../src/validate.ts";

function makeFlag(overrides: Partial<Flag> = {}): Flag {
  return {
    key: "demo",
    enabled: true,
    killSwitch: false,
    salt: "abc123",
    variants: [
      { key: "on", value: true },
      { key: "off", value: false },
    ],
    offVariant: "off",
    rules: [],
    fallthrough: { variant: "off" },
    ...overrides,
  };
}

function condition(
  operator: Operator,
  attribute: string,
  values: Scalar[],
  negate = false,
): Condition {
  return { attribute, operator, values, negate };
}

interface MatchCase {
  name: string;
  condition: Condition;
  attributes: Record<string, unknown>;
  expected: boolean;
}

const matchCases: MatchCase[] = [
  { name: "contains finds a substring", condition: condition("contains", "path", ["beta"]), attributes: { path: "/a/beta/b" }, expected: true },
  { name: "contains accepts the empty string", condition: condition("contains", "path", [""]), attributes: { path: "x" }, expected: true },
  { name: "contains is case sensitive", condition: condition("contains", "path", ["BETA"]), attributes: { path: "/beta" }, expected: false },
  { name: "startsWith matches a prefix", condition: condition("startsWith", "path", ["/beta"]), attributes: { path: "/beta/x" }, expected: true },
  { name: "startsWith rejects an inner match", condition: condition("startsWith", "path", ["beta"]), attributes: { path: "/beta" }, expected: false },
  { name: "lt is strict", condition: condition("lt", "age", [18]), attributes: { age: 18 }, expected: false },
  { name: "lte is inclusive", condition: condition("lte", "age", [18]), attributes: { age: 18 }, expected: true },
  { name: "gt is strict", condition: condition("gt", "age", [18]), attributes: { age: 18 }, expected: false },
  { name: "gte is inclusive", condition: condition("gte", "age", [18]), attributes: { age: 18 }, expected: true },
  { name: "equals is strict about type for text against number", condition: condition("equals", "tier", [5]), attributes: { tier: "5" }, expected: false },
  { name: "equals is strict about type for number against text", condition: condition("equals", "tier", ["5"]), attributes: { tier: 5 }, expected: false },
  { name: "negative zero equals zero", condition: condition("equals", "tier", [0]), attributes: { tier: -0 }, expected: true },
  { name: "booleans compare by value", condition: condition("equals", "beta", [true]), attributes: { beta: true }, expected: true },
  { name: "a text boolean is not a boolean", condition: condition("equals", "beta", [true]), attributes: { beta: "true" }, expected: false },
  { name: "in accepts any listed value", condition: condition("in", "plan", ["pro", "team"]), attributes: { plan: "team" }, expected: true },
  { name: "negate flips a present attribute", condition: condition("in", "plan", ["pro"], true), attributes: { plan: "free" }, expected: true },
  { name: "negate ignores a missing attribute", condition: condition("in", "plan", ["pro"], true), attributes: {}, expected: false },
  { name: "negate ignores an attribute of an unusable type", condition: condition("lt", "age", [18], true), attributes: { age: "5" }, expected: false },
  { name: "null counts as missing", condition: condition("in", "plan", ["pro"], true), attributes: { plan: null }, expected: false },
  { name: "an object value counts as missing", condition: condition("in", "plan", ["pro"], true), attributes: { plan: { name: "pro" } }, expected: false },
  { name: "a list holding an object counts as missing", condition: condition("in", "roles", ["a"]), attributes: { roles: ["a", { nested: 1 }] }, expected: false },
  { name: "inherited property names count as missing", condition: condition("in", "constructor", ["x"], true), attributes: {}, expected: false },
  { name: "a list matches when one element matches", condition: condition("gt", "scores", [10]), attributes: { scores: [3, 11] }, expected: true },
];

describe("conditions", () => {
  it.each(matchCases)("$name", (testCase) => {
    expect(matchesCondition(testCase.condition, testCase.attributes)).toBe(testCase.expected);
  });
});

describe("evaluate", () => {
  const onRule = (id: string, ...conditions: Condition[]) => ({
    id,
    conditions,
    serve: { variant: "on" },
  });

  it("lets the kill switch win and never computes a bucket", () => {
    const flag = makeFlag({ killSwitch: true, fallthrough: percentageRollout("on", "off", 100) });
    expect(evaluate(flag, { key: "u" })).toEqual({
      variantKey: "off",
      value: false,
      reason: "KILL_SWITCH",
      ruleIndex: null,
      ruleId: null,
      bucket: null,
    });
  });

  it("serves the off variant when the flag is disabled", () => {
    const flag = makeFlag({ enabled: false, rules: [onRule("all")] });
    const result = evaluate(flag, { key: "u" });
    expect(result.reason).toBe("OFF");
    expect(result.variantKey).toBe("off");
  });

  it("reports the index and id of the first matching rule", () => {
    const flag = makeFlag({
      rules: [
        onRule("never", condition("equals", "plan", ["enterprise"])),
        onRule("pro", condition("equals", "plan", ["pro"])),
        onRule("anything"),
      ],
    });
    const result = evaluate(flag, { key: "u", attributes: { plan: "pro" } });
    expect(result.reason).toBe("RULE_MATCH");
    expect(result.ruleIndex).toBe(1);
    expect(result.ruleId).toBe("pro");
  });

  it("requires every condition of a rule to match", () => {
    const flag = makeFlag({
      rules: [onRule("both", condition("equals", "plan", ["pro"]), condition("gte", "age", [18]))],
    });
    expect(evaluate(flag, { key: "u", attributes: { plan: "pro", age: 17 } }).reason).toBe("FALLTHROUGH");
    expect(evaluate(flag, { key: "u", attributes: { plan: "pro", age: 18 } }).reason).toBe("RULE_MATCH");
  });

  it("reports the bucket used by a rollout", () => {
    const flag = makeFlag({ fallthrough: percentageRollout("on", "off", 50) });
    const result = evaluate(flag, { key: "user-1" });
    expect(result.bucket).toBe(bucket("demo", "abc123", "user-1"));
    expect(result.variantKey).toBe(result.bucket! < 50_000 ? "on" : "off");
  });

  it("throws when a served variant does not exist", () => {
    const flag = makeFlag({ fallthrough: { variant: "missing" } });
    expect(() => evaluate(flag, { key: "u" })).toThrow(InvalidFlagError);
  });
});

describe("rollout", () => {
  const entries = [
    { variant: "on", weight: 25_000 },
    { variant: "off", weight: 75_000 },
  ];

  it("switches variant exactly at the cumulative weight", () => {
    expect(pickVariant(entries, 0)).toBe("on");
    expect(pickVariant(entries, 24_999)).toBe("on");
    expect(pickVariant(entries, 25_000)).toBe("off");
    expect(pickVariant(entries, 99_999)).toBe("off");
  });

  it("throws when the weights do not cover the bucket", () => {
    expect(() => pickVariant([{ variant: "on", weight: 10 }], 10)).toThrow(InvalidFlagError);
  });

  it("turns a percentage into thousandths of a percent", () => {
    expect(percentageRollout("on", "off", 25)).toEqual({ rollout: entries });
    expect(percentageRollout("on", "off", 0.001)).toEqual({
      rollout: [
        { variant: "on", weight: 1 },
        { variant: "off", weight: 99_999 },
      ],
    });
  });

  it("rejects percentages outside zero to one hundred", () => {
    expect(() => percentageRollout("on", "off", 100.5)).toThrow(RangeError);
    expect(() => percentageRollout("on", "off", -1)).toThrow(RangeError);
    expect(() => percentageRollout("on", "off", Number.NaN)).toThrow(RangeError);
  });
});

describe("validation", () => {
  it("accepts a well formed flag", () => {
    const flag = makeFlag({ fallthrough: percentageRollout("on", "off", 30) });
    expect(findProblems(flag)).toEqual([]);
    expect(() => validateFlag(flag)).not.toThrow();
  });

  it("rejects weights that do not sum to 100000", () => {
    const flag = makeFlag({
      fallthrough: { rollout: [{ variant: "on", weight: 40_000 }, { variant: "off", weight: 40_000 }] },
    });
    expect(findProblems(flag).join("\n")).toContain("weights sum to 80000");
    expect(() => validateFlag(flag)).toThrow(InvalidFlagError);
  });

  it("rejects an unknown off variant, a bad salt and repeated variants", () => {
    const flag = makeFlag({
      offVariant: "gone",
      salt: "XYZ",
      variants: [
        { key: "on", value: true },
        { key: "on", value: false },
      ],
    });
    const text = findProblems(flag).join("\n");
    expect(text).toContain("offVariant gone");
    expect(text).toContain("salt");
    expect(text).toContain("variant key on is repeated");
  });

  it("rejects repeated rule ids and conditions without values", () => {
    const rule = { id: "same", conditions: [condition("in", "plan", [])], serve: { variant: "on" } };
    const text = findProblems(makeFlag({ rules: [rule, rule] })).join("\n");
    expect(text).toContain("rule id same is repeated");
    expect(text).toContain("condition without values");
  });
});
