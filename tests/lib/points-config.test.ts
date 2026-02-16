import assert from "node:assert/strict";
import test from "node:test";

import { loadDefaultModuleFrom } from "../helpers/test-utils";

type PointsConfigModule = {
  calculateEarlyBonus: (
    bounty: number,
    deadline: Date,
    completedAt: Date,
    createdAt: Date
  ) => number;
  calculateAbandonmentPenalty: (bounty: number) => number;
  getTierForPoints: (points: number) => string;
  canPerformTieredAction: (
    userPoints: number,
    action: string
  ) => boolean;
  EARLY_COMPLETION_BONUS_PERCENT: number;
};

function makeDate(daysFromNow: number): Date {
  return new Date(Date.now() + daysFromNow * 86400000);
}

test("calculateEarlyBonus returns proportional bonus based on time remaining", async () => {
  const mod = await loadDefaultModuleFrom<PointsConfigModule>(
    import.meta.url,
    "../../lib/points-config.ts"
  );

  const created = new Date("2026-01-01T00:00:00Z");
  const deadline = new Date("2026-01-11T00:00:00Z"); // 10-day window

  // Completed at day 2 → 80% time remaining → 8% of bounty
  const completedEarly = new Date("2026-01-03T00:00:00Z");
  assert.equal(mod.calculateEarlyBonus(200, deadline, completedEarly, created), 16);

  // Completed at day 5 → 60% time remaining → 6% of bounty
  const completedMid = new Date("2026-01-05T00:00:00Z");
  assert.equal(mod.calculateEarlyBonus(200, deadline, completedMid, created), 12);

  // Completed at day 9 → 20% time remaining → 2% of bounty
  const completedLate = new Date("2026-01-09T00:00:00Z");
  assert.equal(mod.calculateEarlyBonus(200, deadline, completedLate, created), 4);

  // Completed at day 1 → 90% time remaining → 9% of bounty
  const completedVeryEarly = new Date("2026-01-02T00:00:00Z");
  assert.equal(mod.calculateEarlyBonus(200, deadline, completedVeryEarly, created), 18);
});

test("calculateEarlyBonus returns 0 for edge cases", async () => {
  const mod = await loadDefaultModuleFrom<PointsConfigModule>(
    import.meta.url,
    "../../lib/points-config.ts"
  );

  const created = new Date("2026-01-01T00:00:00Z");
  const deadline = new Date("2026-01-11T00:00:00Z");

  // Completed exactly at deadline → 0% remaining
  assert.equal(mod.calculateEarlyBonus(200, deadline, deadline, created), 0);

  // Completed after deadline
  const after = new Date("2026-01-12T00:00:00Z");
  assert.equal(mod.calculateEarlyBonus(200, deadline, after, created), 0);

  // Deadline equals created_at (zero duration)
  assert.equal(mod.calculateEarlyBonus(200, created, created, created), 0);

  // Deadline before created_at (negative duration)
  assert.equal(mod.calculateEarlyBonus(200, created, created, deadline), 0);
});

test("calculateEarlyBonus rounds to nearest integer", async () => {
  const mod = await loadDefaultModuleFrom<PointsConfigModule>(
    import.meta.url,
    "../../lib/points-config.ts"
  );

  const created = new Date("2026-01-01T00:00:00Z");
  const deadline = new Date("2026-01-04T00:00:00Z"); // 3-day window

  // Completed at day 1 → 66.7% remaining → 6.67% of 100 = 6.67 → rounds to 7
  const completed = new Date("2026-01-02T00:00:00Z");
  assert.equal(mod.calculateEarlyBonus(100, deadline, completed, created), 7);
});

test("getTierForPoints returns correct tiers at boundaries", async () => {
  const mod = await loadDefaultModuleFrom<PointsConfigModule>(
    import.meta.url,
    "../../lib/points-config.ts"
  );

  assert.equal(mod.getTierForPoints(0), "bronze");
  assert.equal(mod.getTierForPoints(99), "bronze");
  assert.equal(mod.getTierForPoints(100), "silver");
  assert.equal(mod.getTierForPoints(499), "silver");
  assert.equal(mod.getTierForPoints(500), "gold");
  assert.equal(mod.getTierForPoints(999), "gold");
  assert.equal(mod.getTierForPoints(1000), "platinum");
  assert.equal(mod.getTierForPoints(5000), "platinum");
});
