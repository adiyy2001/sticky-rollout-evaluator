import { TOTAL_WEIGHT } from "./rollout.ts";
import { InvalidFlagError, type Flag, type Serve } from "./types.ts";

const SLUG = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const HEX_SALT = /^[a-f0-9]{1,64}$/;

function repeated(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const repeats = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      repeats.add(value);
    }
    seen.add(value);
  }
  return [...repeats];
}

function serveProblems(serve: Serve, variantKeys: ReadonlySet<string>, location: string): string[] {
  if ("variant" in serve) {
    return variantKeys.has(serve.variant)
      ? []
      : [`${location} serves unknown variant ${serve.variant}`];
  }
  const entries = serve.rollout;
  if (entries.length === 0) {
    return [`${location} rollout is empty`];
  }
  const problems: string[] = [];
  for (const entry of entries) {
    if (!variantKeys.has(entry.variant)) {
      problems.push(`${location} rollout uses unknown variant ${entry.variant}`);
    }
    if (!Number.isInteger(entry.weight) || entry.weight < 0 || entry.weight > TOTAL_WEIGHT) {
      problems.push(`${location} rollout has an invalid weight for ${entry.variant}`);
    }
  }
  for (const variant of repeated(entries.map((entry) => entry.variant))) {
    problems.push(`${location} rollout repeats variant ${variant}`);
  }
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (total !== TOTAL_WEIGHT) {
    problems.push(`${location} rollout weights sum to ${total}, expected ${TOTAL_WEIGHT}`);
  }
  return problems;
}

export function findProblems(flag: Flag): string[] {
  const problems: string[] = [];
  if (!SLUG.test(flag.key)) {
    problems.push(`key ${flag.key} is not a slug`);
  }
  if (!HEX_SALT.test(flag.salt)) {
    problems.push("salt must be 1 to 64 lowercase hex characters");
  }
  const variantKeys = flag.variants.map((variant) => variant.key);
  if (variantKeys.length === 0) {
    problems.push("variants must not be empty");
  }
  for (const key of variantKeys.filter((candidate) => !SLUG.test(candidate))) {
    problems.push(`variant key ${key} is not a slug`);
  }
  for (const key of repeated(variantKeys)) {
    problems.push(`variant key ${key} is repeated`);
  }
  const knownVariants = new Set(variantKeys);
  if (!knownVariants.has(flag.offVariant)) {
    problems.push(`offVariant ${flag.offVariant} is not a variant`);
  }
  for (const id of repeated(flag.rules.map((rule) => rule.id))) {
    problems.push(`rule id ${id} is repeated`);
  }
  flag.rules.forEach((rule, index) => {
    const location = `rule ${index}`;
    if (rule.id === "") {
      problems.push(`${location} has an empty id`);
    }
    if (rule.conditions.some((condition) => condition.values.length === 0)) {
      problems.push(`${location} has a condition without values`);
    }
    problems.push(...serveProblems(rule.serve, knownVariants, location));
  });
  problems.push(...serveProblems(flag.fallthrough, knownVariants, "fallthrough"));
  return problems;
}

export function validateFlag(flag: Flag): void {
  const problems = findProblems(flag);
  if (problems.length > 0) {
    throw new InvalidFlagError(problems.join("; "));
  }
}
