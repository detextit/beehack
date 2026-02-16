import { PoolClient } from "pg";
import { MILESTONE_BONUSES, MilestoneType } from "@/lib/points-config";

/**
 * Award a milestone bonus if not already awarded.
 * Must be called within an existing transaction (pass the client).
 */
export async function awardMilestoneIfNew(
  client: PoolClient,
  userId: string,
  milestone: MilestoneType,
  postId?: number | null
): Promise<{ awarded: boolean; points: number }> {
  // Check if already awarded
  const existing = await client.query(
    `SELECT 1 FROM user_milestones WHERE user_id = $1 AND milestone = $2`,
    [userId, milestone]
  );

  if (existing.rowCount && existing.rowCount > 0) {
    return { awarded: false, points: 0 };
  }

  const bonus = MILESTONE_BONUSES[milestone];

  // Award the milestone
  await client.query(
    `INSERT INTO user_milestones (user_id, milestone, points_awarded) VALUES ($1, $2, $3)`,
    [userId, milestone, bonus]
  );

  // Credit points
  await client.query(
    `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
    [bonus, userId]
  );

  // Get new balance for ledger
  const balResult = await client.query<{ total_points: number }>(
    `SELECT total_points FROM users WHERE id = $1`,
    [userId]
  );

  // Create ledger entry
  await client.query(
    `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
     VALUES ($1, $2, $3, 'milestone_bonus', $4, $5)`,
    [
      userId,
      postId ?? null,
      bonus,
      balResult.rows[0].total_points,
      JSON.stringify({ milestone }),
    ]
  );

  return { awarded: true, points: bonus };
}

/**
 * Check and award completion-related milestones.
 * Call after a task is completed by the assignee.
 * Must be called within an existing transaction.
 */
export async function checkCompletionMilestones(
  client: PoolClient,
  userId: string,
  postId: number
): Promise<{ milestonesAwarded: string[]; totalBonus: number }> {
  // Increment completion count
  await client.query(
    `UPDATE users SET tasks_completed_count = tasks_completed_count + 1 WHERE id = $1`,
    [userId]
  );

  const countResult = await client.query<{ tasks_completed_count: number }>(
    `SELECT tasks_completed_count FROM users WHERE id = $1`,
    [userId]
  );
  const count = countResult.rows[0].tasks_completed_count;

  const milestonesAwarded: string[] = [];
  let totalBonus = 0;

  // Check milestones based on count
  if (count === 1) {
    const result = await awardMilestoneIfNew(
      client,
      userId,
      "first_task_completed",
      postId
    );
    if (result.awarded) {
      milestonesAwarded.push("first_task_completed");
      totalBonus += result.points;
    }
  }
  if (count === 5) {
    const result = await awardMilestoneIfNew(
      client,
      userId,
      "five_completions",
      postId
    );
    if (result.awarded) {
      milestonesAwarded.push("five_completions");
      totalBonus += result.points;
    }
  }
  if (count === 10) {
    const result = await awardMilestoneIfNew(
      client,
      userId,
      "ten_completions",
      postId
    );
    if (result.awarded) {
      milestonesAwarded.push("ten_completions");
      totalBonus += result.points;
    }
  }

  return { milestonesAwarded, totalBonus };
}

/**
 * Award the first_task_posted milestone if applicable.
 * Call when a user creates their first task post.
 * Must be called within an existing transaction.
 */
export async function checkFirstPostMilestone(
  client: PoolClient,
  userId: string,
  postId: number
): Promise<{ awarded: boolean; points: number }> {
  // Check if user has any other posts
  const postsCount = await client.query<{ count: string }>(
    `SELECT COUNT(*)::text as count FROM posts WHERE author_id = $1`,
    [userId]
  );

  // If this is their first post (count will be 1 after the insert)
  if (Number(postsCount.rows[0].count) === 1) {
    return awardMilestoneIfNew(client, userId, "first_task_posted", postId);
  }

  return { awarded: false, points: 0 };
}
