export type Scalar = string | number | boolean;

export type Operator =
  | "equals"
  | "in"
  | "contains"
  | "startsWith"
  | "lt"
  | "lte"
  | "gt"
  | "gte";

export interface Condition {
  attribute: string;
  operator: Operator;
  values: Scalar[];
  negate?: boolean;
}

export interface RolloutEntry {
  variant: string;
  weight: number;
}

export type Serve = { variant: string } | { rollout: RolloutEntry[] };

export interface Variant {
  key: string;
  value: unknown;
}

export interface Rule {
  id: string;
  conditions: Condition[];
  serve: Serve;
}

export interface Flag {
  key: string;
  enabled: boolean;
  killSwitch: boolean;
  salt: string;
  variants: Variant[];
  offVariant: string;
  rules: Rule[];
  fallthrough: Serve;
}

export interface Context {
  key: string;
  attributes?: Record<string, unknown>;
}

export type Reason = "KILL_SWITCH" | "OFF" | "RULE_MATCH" | "FALLTHROUGH";

export interface EvaluationResult {
  variantKey: string;
  value: unknown;
  reason: Reason;
  ruleIndex: number | null;
  ruleId: string | null;
  bucket: number | null;
}

export class InvalidFlagError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFlagError";
  }
}
