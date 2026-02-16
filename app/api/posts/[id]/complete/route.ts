export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { calculateEarlyBonus } from "@/lib/points-config";
import { checkCompletionMilestones } from "@/lib/milestones";

type Params = {
  params: Promise<{ id: string }>;
};

function parsePostId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, ctx: Params) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { id } = await ctx.params;
  const postId = parsePostId(id);
  if (!postId) {
    return error("Invalid post id.", 400);
  }

  const current = await pool.query<{
    id: string;
    author_id: string;
    task_status: string;
    claimed_by: string | null;
    points: number;
    escrow_status: string;
    poster_escrow: number;
    assignee_escrow: number;
    deadline: string | null;
  }>(
    `SELECT id, author_id, task_status, claimed_by, points, escrow_status, poster_escrow, assignee_escrow, deadline FROM posts WHERE id = $1 LIMIT 1`,
    [postId]
  );

  const post = current.rows[0];
  if (!post) {
    return error("Task not found.", 404);
  }

  if (post.author_id !== me.id) {
    return error("Only the task owner can mark it complete.", 403);
  }

  if (post.task_status === "done") {
    return error("Task is already done.", 409);
  }

  if (post.task_status === "cancelled") {
    return error("Task is cancelled and cannot be completed.", 409);
  }

  if (!post.claimed_by) {
    return error(
      "Task has no assignee. Assign someone before marking complete.",
      400
    );
  }

  // For escrow tasks, only queenbee can settle
  if (post.escrow_status !== "none") {
    return error(
      "This task uses escrow. Only @queenbee can settle it via POST /api/posts/:id/settle.",
      400
    );
  }

  // Check poster has sufficient points to pay the bounty
  const posterBalance = await pool.query<{ total_points: number }>(
    `SELECT total_points FROM users WHERE id = $1`,
    [post.author_id]
  );
  const balance = posterBalance.rows[0]?.total_points ?? 0;
  if (balance < post.points) {
    return error(
      `Poster has insufficient points. Needs ${post.points} but has ${balance}.`,
      400
    );
  }

  // Check for early completion bonus
  const now = new Date();
  const isEarly = post.deadline !== null && now < new Date(post.deadline);
  const earlyBonus = isEarly ? calculateEarlyBonus(post.points) : 0;

  // Transfer bounty: deduct from poster, credit to worker
  const client = await pool.connect();
  let milestonesAwarded: string[] = [];
  let milestoneBonus = 0;

  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE posts SET task_status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [postId]
    );

    await client.query(
      `UPDATE users SET total_points = total_points - $1 WHERE id = $2`,
      [post.points, post.author_id]
    );

    await client.query(
      `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
      [post.points, post.claimed_by]
    );

    // Ledger entries for bounty
    const posterBal = await client.query<{ total_points: number }>(
      `SELECT total_points FROM users WHERE id = $1`,
      [post.author_id]
    );
    const workerBal = await client.query<{ total_points: number }>(
      `SELECT total_points FROM users WHERE id = $1`,
      [post.claimed_by]
    );

    await client.query(
      `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
       VALUES ($1, $2, $3, 'bounty_payout', $4, $5)`,
      [
        post.author_id,
        postId,
        -post.points,
        posterBal.rows[0].total_points,
        JSON.stringify({ type: "bounty_transfer" }),
      ]
    );

    await client.query(
      `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
       VALUES ($1, $2, $3, 'bounty_payout', $4, $5)`,
      [
        post.claimed_by,
        postId,
        post.points,
        workerBal.rows[0].total_points,
        JSON.stringify({ type: "bounty_transfer" }),
      ]
    );

    // Award early completion bonus if applicable
    if (earlyBonus > 0) {
      await client.query(
        `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
        [earlyBonus, post.claimed_by]
      );

      const bonusBal = await client.query<{ total_points: number }>(
        `SELECT total_points FROM users WHERE id = $1`,
        [post.claimed_by]
      );

      await client.query(
        `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
         VALUES ($1, $2, $3, 'early_completion_bonus', $4, $5)`,
        [
          post.claimed_by,
          postId,
          earlyBonus,
          bonusBal.rows[0].total_points,
          JSON.stringify({
            deadline: post.deadline,
            completed_at: now.toISOString(),
          }),
        ]
      );
    }

    // Check and award completion milestones
    const milestoneResult = await checkCompletionMilestones(
      client,
      post.claimed_by,
      postId
    );
    milestonesAwarded = milestoneResult.milestonesAwarded;
    milestoneBonus = milestoneResult.totalBonus;

    if (post.claimed_by !== me.id) {
      await client.query(
        `INSERT INTO notifications (recipient_id, actor_id, type, post_id) VALUES ($1, $2, 'task_completed', $3)`,
        [post.claimed_by, me.id, postId]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const updated = await pool.query<{
    id: string;
    title: string;
    task_status: string;
    claimed_by_handle: string | null;
    completed_at: string | null;
    points: number;
  }>(
    `
      SELECT p.id, p.title, p.task_status, claimant.handle AS claimed_by_handle, p.completed_at, p.points
      FROM posts p
      LEFT JOIN users claimant ON claimant.id = p.claimed_by
      WHERE p.id = $1
      LIMIT 1
    `,
    [postId]
  );

  return json({
    ok: true,
    item: updated.rows[0],
    points_awarded: post.points,
    early_bonus: earlyBonus,
    milestones_awarded: milestonesAwarded,
    milestone_bonus: milestoneBonus,
  });
}
