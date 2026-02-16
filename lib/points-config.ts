// Points System Configuration
// See /public/resources/points.md for documentation

// Daily vote cap - maximum points earnable from votes per day
export const DAILY_VOTE_CAP = 50;

// Point values for receiving votes on comments
export const VOTE_POINTS = {
  upvote: 2,
  downvote: -1,
} as const;

// Privilege tier thresholds (minimum total_points required)
export const PRIVILEGE_TIERS = {
  bronze: 0,
  silver: 100,
  gold: 500,
  platinum: 1000,
} as const;

export type PrivilegeTier = keyof typeof PRIVILEGE_TIERS;

// Actions that require minimum tier
export const TIER_REQUIREMENTS = {
  create_escrow_task: "silver" as PrivilegeTier,
} as const;

// Milestone bonus amounts (awarded once per user)
export const MILESTONE_BONUSES = {
  first_task_completed: 10,
  first_task_posted: 5,
  five_completions: 25,
  ten_completions: 50,
} as const;

export type MilestoneType = keyof typeof MILESTONE_BONUSES;

// Early completion bonus (percentage of bounty)
export const EARLY_COMPLETION_BONUS_PERCENT = 10;

// Abandonment penalty (percentage of bounty)
export const ABANDONMENT_PENALTY_PERCENT = 10;

/**
 * Get the privilege tier for a given point total
 */
export function getTierForPoints(points: number): PrivilegeTier {
  if (points >= PRIVILEGE_TIERS.platinum) return "platinum";
  if (points >= PRIVILEGE_TIERS.gold) return "gold";
  if (points >= PRIVILEGE_TIERS.silver) return "silver";
  return "bronze";
}

/**
 * Check if a user can perform a tier-gated action
 */
export function canPerformTieredAction(
  userPoints: number,
  action: keyof typeof TIER_REQUIREMENTS
): boolean {
  const requiredTier = TIER_REQUIREMENTS[action];
  const userTier = getTierForPoints(userPoints);
  const tierOrder: PrivilegeTier[] = ["bronze", "silver", "gold", "platinum"];
  return tierOrder.indexOf(userTier) >= tierOrder.indexOf(requiredTier);
}

/**
 * Calculate early completion bonus amount proportional to time remaining.
 * Bonus = bounty * MAX_BONUS_PERCENT * (timeRemaining / totalDuration).
 * A task completed with 80% of the time remaining gets 80% of the max bonus.
 */
export function calculateEarlyBonus(
  bounty: number,
  deadline: Date,
  completedAt: Date,
  createdAt: Date
): number {
  const totalDuration = deadline.getTime() - createdAt.getTime();
  if (totalDuration <= 0) return 0;
  const timeRemaining = deadline.getTime() - completedAt.getTime();
  if (timeRemaining <= 0) return 0;
  const proportion = timeRemaining / totalDuration;
  return Math.round((bounty * EARLY_COMPLETION_BONUS_PERCENT * proportion) / 100);
}

/**
 * Calculate abandonment penalty amount
 */
export function calculateAbandonmentPenalty(bounty: number): number {
  return Math.round((bounty * ABANDONMENT_PENALTY_PERCENT) / 100);
}
