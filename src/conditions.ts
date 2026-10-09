import type { Condition, Operator, Scalar } from "./types.ts";

function isScalar(value: unknown): value is Scalar {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function scalarsOf(raw: unknown): Scalar[] {
  if (Array.isArray(raw)) {
    return raw.every(isScalar) ? raw : [];
  }
  return isScalar(raw) ? [raw] : [];
}

function isApplicable(operator: Operator, element: Scalar): boolean {
  switch (operator) {
    case "equals":
    case "in":
      return true;
    case "contains":
    case "startsWith":
      return typeof element === "string";
    default:
      return typeof element === "number";
  }
}

function satisfies(operator: Operator, element: Scalar, value: Scalar): boolean {
  if (operator === "equals" || operator === "in") {
    return element === value;
  }
  if (typeof element === "string" && typeof value === "string") {
    return operator === "contains" ? element.includes(value) : element.startsWith(value);
  }
  if (typeof element === "number" && typeof value === "number") {
    switch (operator) {
      case "lt":
        return element < value;
      case "lte":
        return element <= value;
      case "gt":
        return element > value;
      case "gte":
        return element >= value;
    }
  }
  return false;
}

export function matchesCondition(
  condition: Condition,
  attributes: Record<string, unknown>,
): boolean {
  const raw = Object.hasOwn(attributes, condition.attribute)
    ? attributes[condition.attribute]
    : undefined;
  const elements = scalarsOf(raw).filter((element) => isApplicable(condition.operator, element));
  if (elements.length === 0) {
    return false;
  }
  const hit = elements.some((element) =>
    condition.values.some((value) => satisfies(condition.operator, element, value)),
  );
  return hit !== (condition.negate === true);
}
