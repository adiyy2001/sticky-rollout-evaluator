import { describe, expect, it } from "vitest";
import { evaluate } from "../src/evaluator.ts";
import { percentageRollout } from "../src/rollout.ts";
import type { Flag } from "../src/types.ts";
import { createRandom, userKeys } from "./support.ts";

function rolloutFlag(percent: number, salt = "9f2c41"): Flag {
  return {
    key: "checkout",
    enabled: true,
    killSwitch: false,
    salt,
    variants: [
      { key: "on", value: true },
      { key: "off", value: false },
    ],
    offVariant: "off",
    rules: [],
    fallthrough: percentageRollout("on", "off", percent),
  };
}

function membership(flag: Flag, keys: string[]): boolean[] {
  return keys.map((key) => evaluate(flag, { key }).variantKey === "on");
}

function keepsEveryone(narrow: boolean[], wide: boolean[]): boolean {
  return narrow.every((wasIn, index) => !wasIn || wide[index]);
}

describe("widening a rollout", () => {
  it("never removes a user along a ladder of percentages", () => {
    const keys = userKeys(5000, 1);
    const ladder = [0, 1, 5, 10, 25, 50, 75, 99.999, 100];
    let previous = membership(rolloutFlag(ladder[0]), keys);
    for (const percent of ladder.slice(1)) {
      const current = membership(rolloutFlag(percent), keys);
      expect(keepsEveryone(previous, current)).toBe(true);
      expect(current.filter(Boolean).length).toBeGreaterThanOrEqual(previous.filter(Boolean).length);
      previous = current;
    }
  });

  it("never removes a user for random pairs of percentages", () => {
    const random = createRandom(2024);
    const keys = userKeys(1000, 3);
    for (let trial = 0; trial < 40; trial++) {
      const first = Math.floor(random() * 100_001);
      const second = Math.floor(random() * 100_001);
      const narrow = membership(rolloutFlag(Math.min(first, second) / 1000), keys);
      const wide = membership(rolloutFlag(Math.max(first, second) / 1000), keys);
      expect(keepsEveryone(narrow, wide)).toBe(true);
    }
  });

  it("includes nobody at zero percent and everybody at one hundred percent", () => {
    const keys = userKeys(2000, 5);
    expect(membership(rolloutFlag(0), keys).some(Boolean)).toBe(false);
    expect(membership(rolloutFlag(100), keys).every(Boolean)).toBe(true);
  });
});

describe("stickiness", () => {
  it("gives the same answer on every call", () => {
    const flag = rolloutFlag(37);
    for (const key of userKeys(500, 9)) {
      expect(evaluate(flag, { key })).toEqual(evaluate(flag, { key }));
    }
  });

  it("does not depend on attributes", () => {
    const flag = rolloutFlag(37);
    for (const key of userKeys(300, 13)) {
      const plain = evaluate(flag, { key });
      const decorated = evaluate(flag, { key, attributes: { plan: "pro", age: 31 } });
      expect(decorated).toEqual(plain);
    }
  });
});

describe("distribution", () => {
  it("puts about a quarter of users into a 25 percent rollout", () => {
    const included = membership(rolloutFlag(25), userKeys(10_000, 17)).filter(Boolean).length;
    expect(included).toBeGreaterThan(2300);
    expect(included).toBeLessThan(2700);
  });

  it("reshuffles users when the salt changes", () => {
    const keys = userKeys(5000, 19);
    const first = membership(rolloutFlag(50, "aa11"), keys);
    const second = membership(rolloutFlag(50, "bb22"), keys);
    const moved = first.filter((wasIn, index) => wasIn !== second[index]).length;
    expect(moved).toBeGreaterThan(2200);
    expect(moved).toBeLessThan(2800);
  });
});
