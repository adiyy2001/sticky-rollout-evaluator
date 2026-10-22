# sticky-rollout-evaluator

A TypeScript feature flag evaluator whose percentage rollouts use MurmurHash3, so a given user always falls into the same bucket and any runtime using the same rules will return the same result.

## Requirements

Node 24 or newer.

## Install and run

```
npm install
npm test
```

There is no server and no build step. The evaluator is a set of pure functions in `src`, imported directly by the tests.

## How it works

- The bucket of a user is MurmurHash3 (x86, 32 bit, seed 0) of the UTF-8 bytes of `flagKey.salt.userKey`, read as an unsigned number, modulo 100000.
- Lone surrogates are encoded as U+FFFD. There is no Unicode normalization and no case folding.
- Rollout weights are integers in thousandths of a percent and always sum to 100000. The first variant whose cumulative weight is greater than the bucket is served.
- A boolean rollout lists the enabled variant first, so raising its percentage never removes a user who was already in.
- Evaluation order: kill switch, disabled flag, rules in order (all conditions must match, first match wins), fallthrough.
- A missing attribute, or one of a type the operator cannot use, never matches, even with `negate`.
- Operators: `equals`, `in`, `contains`, `startsWith`, `lt`, `lte`, `gt`, `gte`. A list attribute matches when any element matches.

## Conformance vectors

`spec/vectors/hashing.json` holds MurmurHash3 reference values and the buckets derived from them. `spec/vectors/evaluations.json` holds flags and expected results written by hand from the rules above. A runtime in another language is correct when it reproduces every vector. A test proves the vector runner reports a mismatch when a vector is corrupted.

## Project layout

- `src/murmur3.ts`: MurmurHash3 and UTF-8 encoding
- `src/bucket.ts`: bucket calculation
- `src/rollout.ts`: weighted variant selection and rollout helpers
- `src/conditions.ts`: attribute operators
- `src/evaluator.ts`: the evaluation function
- `src/validate.ts`: flag config validation
- `src/types.ts`: shared types and the error class
- `spec/vectors`: shared conformance vectors
- `test`: unit, conformance and property tests

## Tests

```
npm test
```

The property tests use a seeded random generator, so every run checks the same users.
