import { bucket } from "./bucket.ts";
import { matchesCondition } from "./conditions.ts";
import { pickVariant } from "./rollout.ts";
import {
  InvalidFlagError,
  type Context,
  type EvaluationResult,
  type Flag,
  type Reason,
  type Serve,
} from "./types.ts";

function resultFor(
  flag: Flag,
  variantKey: string,
  reason: Reason,
  ruleIndex: number | null,
  ruleId: string | null,
  bucketValue: number | null,
): EvaluationResult {
  const variant = flag.variants.find((candidate) => candidate.key === variantKey);
  if (variant === undefined) {
    throw new InvalidFlagError(`unknown variant ${variantKey} in flag ${flag.key}`);
  }
  return { variantKey, value: variant.value, reason, ruleIndex, ruleId, bucket: bucketValue };
}

function serve(
  flag: Flag,
  target: Serve,
  context: Context,
  reason: Reason,
  ruleIndex: number | null,
  ruleId: string | null,
): EvaluationResult {
  if ("variant" in target) {
    return resultFor(flag, target.variant, reason, ruleIndex, ruleId, null);
  }
  const bucketValue = bucket(flag.key, flag.salt, context.key);
  const variantKey = pickVariant(target.rollout, bucketValue);
  return resultFor(flag, variantKey, reason, ruleIndex, ruleId, bucketValue);
}

export function evaluate(flag: Flag, context: Context): EvaluationResult {
  if (flag.killSwitch) {
    return resultFor(flag, flag.offVariant, "KILL_SWITCH", null, null, null);
  }
  if (!flag.enabled) {
    return resultFor(flag, flag.offVariant, "OFF", null, null, null);
  }
  const attributes = context.attributes ?? {};
  const ruleIndex = flag.rules.findIndex((rule) =>
    rule.conditions.every((condition) => matchesCondition(condition, attributes)),
  );
  if (ruleIndex >= 0) {
    const rule = flag.rules[ruleIndex];
    return serve(flag, rule.serve, context, "RULE_MATCH", ruleIndex, rule.id);
  }
  return serve(flag, flag.fallthrough, context, "FALLTHROUGH", null, null);
}
