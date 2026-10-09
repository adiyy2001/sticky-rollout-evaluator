import { InvalidFlagError, type RolloutEntry, type Serve } from "./types.ts";

export const TOTAL_WEIGHT = 100_000;

const WEIGHT_UNITS_PER_PERCENT = 1_000;

export function pickVariant(entries: readonly RolloutEntry[], bucket: number): string {
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (cumulative > bucket) {
      return entry.variant;
    }
  }
  throw new InvalidFlagError(`rollout weights do not cover bucket ${bucket}`);
}

export function percentageRollout(onVariant: string, offVariant: string, percent: number): Serve {
  const onWeight = Math.round(percent * WEIGHT_UNITS_PER_PERCENT);
  if (!Number.isFinite(percent) || onWeight < 0 || onWeight > TOTAL_WEIGHT) {
    throw new RangeError(`percent must be between 0 and 100, got ${percent}`);
  }
  return {
    rollout: [
      { variant: onVariant, weight: onWeight },
      { variant: offVariant, weight: TOTAL_WEIGHT - onWeight },
    ],
  };
}
