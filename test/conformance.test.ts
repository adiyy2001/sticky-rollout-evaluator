import { describe, expect, it } from "vitest";
import { validateFlag } from "../src/validate.ts";
import { differences, loadVectors, type EvaluationVectors } from "./support.ts";

const vectors = loadVectors<EvaluationVectors>("evaluations");

describe("evaluation vectors", () => {
  it("declares spec version 1 and enough cases", () => {
    expect(vectors.specVersion).toBe(1);
    expect(vectors.cases.length).toBeGreaterThanOrEqual(25);
  });

  it("uses valid flags and unique case names", () => {
    for (const flag of Object.values(vectors.flags)) {
      expect(() => validateFlag(flag)).not.toThrow();
    }
    const names = vectors.cases.map((testCase) => testCase.name);
    expect(new Set(names).size).toBe(names.length);
    for (const testCase of vectors.cases) {
      expect(vectors.flags[testCase.flag]).toBeDefined();
    }
  });

  it.each(vectors.cases)("$name", (testCase) => {
    expect(differences(vectors.flags, testCase)).toEqual([]);
  });
});

describe("vector runner", () => {
  it("reports a mismatch when a vector is corrupted", () => {
    const original = vectors.cases[0];
    const corrupted = {
      ...original,
      expected: { ...original.expected, variantKey: "off", value: false },
    };
    expect(differences(vectors.flags, original)).toEqual([]);
    expect(differences(vectors.flags, corrupted)).toHaveLength(2);
  });

  it("reports a mismatch when the bucketed expectation is wrong", () => {
    const original = vectors.cases[1];
    const corrupted = { ...original, expected: { ...original.expected, bucketed: false } };
    expect(differences(vectors.flags, corrupted)).toHaveLength(1);
  });
});
