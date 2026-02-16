export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import { checkCompletionMilestones } from "@/lib/milestones";

type Params = {
  params: Promise<{ id: string }>;
};

type SettleBody = {
  assignee_payout?: number;
  poster_refund?: number;
  assignee_escrow_return?: number;
  assignee_escrow_penalty?: number;
  reason?: string;
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

  let body: SettleBody;
  try {
    body = await parseJson<SettleBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const assigneePayout = Number(body.assignee_payout);
  const posterRefund = Number(body.poster_refund);
  const assigneeEscrowReturn = Number(body.assignee_escrow_return);
  const assigneeEscrowPenalty = Number(body.assignee_escrow_penalty);
  const reason = body.reason?.trim() || "Settlement";

  if (
    !Number.isInteger(assigneePayout) || assigneePayout < 0 ||
    !Number.isInteger(posterRefund) || posterRefund < 0 ||
    !Number.isInteger(assigneeEscrowReturn) || assigneeEscrowReturn < 0 ||
    !Number.isInteger(assigneeEscrowPenalty) || assigneeEscrowPenalty < 0
  ) {
    return error("All settlement amounts must be non-negative integers.", 400);
  }

  const post = await pool.query<{
    id: string;
    author_id: string;
    task_status: string;
    claimed_by: string | null;
    points: number;
    poster_escrow: number;
    assignee_escrow: number;
    escrow_status: string;
  }>(
    `SELECT id, author_id, task_status, claimed_by, points, poster_escrow, assignee_escrow, escrow_status
     FROM posts WHERE id = $1 LIMIT 1`,
    [postId]
  );

  const task = post.rows[0];
  if (!task) {
    return error("Task not found.", 404);
  }

  // Auth: only queenbee can settle escrow tasks
  if (me.handle !== "queenbee") {
    return error("Only @queenbee can settle escrow tasks.", 403);
  }

  if (task.task_status === "done") {
    return error("Task is already done.", 409);
  }

  if (task.task_status === "cancelled") {
    return error("Task is cancelled and cannot be settled.", 409);
  }

  if (!task.claimed_by) {
    return error("Task has no assignee. Cannot settle.", 400);
  }

  if (task.escrow_status === "settled" || task.escrow_status === "refunded") {
    return error(`Escrow already ${task.escrow_status}.`, 409);
  }

  // Validate conservation of poster escrow
  if (assigneePayout + posterRefund !== task.poster_escrow) {
    return error(
      `assignee_payout (${assigneePayout}) + poster_refund (${posterRefund}) must equal poster_escrow (${task.poster_escrow}).`,
      400
    );
  }

  // Validate conservation of assignee escrow
  if (assigneeEscrowReturn + assigneeEscrowPenalty !== task.assignee_escrow) {
    return error(
      `assignee_escrow_return (${assigneeEscrowReturn}) + assignee_escrow_penalty (${assigneeEscrowPenalty}) must equal assignee_escrow (${task.assignee_escrow}).`,
      400
    );
  }

  const client = await pool.connect();
  let milestonesAwarded: string[] = [];
  let milestoneBonus = 0;

  try {
    await client.query("BEGIN");

    // Credit assignee: payout + their escrow return
    const assigneeTotal = assigneePayout + assigneeEscrowReturn;
    if (assigneeTotal > 0) {
      await client.query(
        `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
        [assigneeTotal, task.claimed_by]
      );
    }

    // Refund poster: their portion + assignee penalty
    const posterTotal = posterRefund + assigneeEscrowPenalty;
    if (posterTotal > 0) {
      await client.query(
        `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
        [posterTotal, task.author_id]
      );
    }

    // Mark task done
    await client.query(
      `UPDATE posts SET task_status = 'done', completed_at = NOW(), escrow_status = 'settled', updated_at = NOW() WHERE id = $1`,
      [postId]
    );

    // Get balance snapshots for ledger entries
    const assigneeBalance = await client.query<{ total_points: number }>(
      `SELECT total_points FROM users WHERE id = $1`,
      [task.claimed_by]
    );
    const posterBalance = await client.query<{ total_points: number }>(
      `SELECT total_points FROM users WHERE id = $1`,
      [task.author_id]
    );

    const assigneePoints = assigneeBalance.rows[0].total_points;
    const posterPoints = posterBalance.rows[0].total_points;

    // Ledger entries
    if (assigneePayout > 0) {
      await client.query(
        `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
         VALUES ($1, $2, $3, 'bounty_payout', $4, $5)`,
        [task.claimed_by, postId, assigneePayout, assigneePoints - assigneeEscrowReturn, JSON.stringify({ reason })]
      );
    }

    if (assigneeEscrowReturn > 0) {
      await client.query(
        `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
         VALUES ($1, $2, $3, 'escrow_release', $4, $5)`,
        [task.claimed_by, postId, assigneeEscrowReturn, assigneePoints, JSON.stringify({ reason })]
      );
    }

    if (posterRefund > 0) {
      await client.query(
        `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
         VALUES ($1, $2, $3, 'refund', $4, $5)`,
        [task.author_id, postId, posterRefund, posterPoints - assigneeEscrowPenalty, JSON.stringify({ reason })]
      );
    }

    if (assigneeEscrowPenalty > 0) {
      await client.query(
        `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
         VALUES ($1, $2, $3, 'escrow_forfeit', $4, $5)`,
        [task.author_id, postId, assigneeEscrowPenalty, posterPoints, JSON.stringify({ reason })]
      );
    }

    // Notify assignee
    if (task.claimed_by !== me.id) {
      await client.query(
        `INSERT INTO notifications (recipient_id, actor_id, type, post_id) VALUES ($1, $2, 'task_completed', $3)`,
        [task.claimed_by, me.id, postId]
      );
    }

    // Check and award completion milestones (only if assignee received meaningful payout)
    if (assigneePayout > 0) {
      const milestoneResult = await checkCompletionMilestones(
        client,
        task.claimed_by,
        postId
      );
      milestonesAwarded = milestoneResult.milestonesAwarded;
      milestoneBonus = milestoneResult.totalBonus;
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // Fetch handles for response
  const handles = await pool.query<{ id: string; handle: string }>(
    `SELECT id, handle FROM users WHERE id = ANY($1)`,
    [[task.author_id, task.claimed_by]]
  );
  const handleMap = Object.fromEntries(handles.rows.map((r) => [r.id, r.handle]));

  return json({
    ok: true,
    settlement: {
      assignee_handle: handleMap[task.claimed_by],
      assignee_received: assigneePayout + assigneeEscrowReturn,
      poster_handle: handleMap[task.author_id],
      poster_received: posterRefund + assigneeEscrowPenalty,
      task_status: "done",
      escrow_status: "settled",
      reason,
    },
    milestones_awarded: milestonesAwarded,
    milestone_bonus: milestoneBonus,
  });
}
