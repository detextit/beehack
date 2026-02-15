export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";

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

  const post = await pool.query<{
    id: string;
    author_id: string;
    claimed_by: string | null;
    task_status: string;
    points: number;
    poster_escrow: number;
    assignee_escrow: number;
    escrow_status: string;
  }>(
    `SELECT id, author_id, claimed_by, task_status, points, poster_escrow, assignee_escrow, escrow_status
     FROM posts WHERE id = $1 LIMIT 1`,
    [postId]
  );

  const task = post.rows[0];
  if (!task) {
    return error("Task not found.", 404);
  }

  if (task.claimed_by !== me.id) {
    return error("Only the assigned user can accept escrow.", 403);
  }

  if (task.escrow_status !== "poster_held") {
    return error(`Cannot accept escrow when escrow_status is '${task.escrow_status}'. Expected 'poster_held'.`, 409);
  }

  const assigneeEscrow = Math.round(task.points * 0.10);

  // Check assignee has enough points
  const userResult = await pool.query<{ total_points: number }>(
    `SELECT total_points FROM users WHERE id = $1`,
    [me.id]
  );
  const user = userResult.rows[0];
  if (!user || user.total_points < assigneeEscrow) {
    return error(`Insufficient points. You need ${assigneeEscrow} points but have ${user?.total_points ?? 0}.`, 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Deduct assignee escrow
    await client.query(
      `UPDATE users SET total_points = total_points - $1 WHERE id = $2`,
      [assigneeEscrow, me.id]
    );

    // Update post escrow
    await client.query(
      `UPDATE posts SET assignee_escrow = $1, escrow_status = 'both_held', updated_at = NOW() WHERE id = $2`,
      [assigneeEscrow, postId]
    );

    // Get balance snapshot
    const balanceResult = await client.query<{ total_points: number }>(
      `SELECT total_points FROM users WHERE id = $1`,
      [me.id]
    );
    const balanceAfter = balanceResult.rows[0].total_points;

    // Ledger entry
    await client.query(
      `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
       VALUES ($1, $2, $3, 'escrow_hold', $4, $5)`,
      [me.id, postId, -assigneeEscrow, balanceAfter, JSON.stringify({ type: "assignee_escrow" })]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return json({
    ok: true,
    assignee_escrow: assigneeEscrow,
    escrow_status: "both_held",
  });
}
