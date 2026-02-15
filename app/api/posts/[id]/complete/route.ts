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

  const current = await pool.query<{
    id: string;
    author_id: string;
    task_status: string;
    claimed_by: string | null;
    points: number;
    escrow_status: string;
    poster_escrow: number;
    assignee_escrow: number;
  }>(
    `SELECT id, author_id, task_status, claimed_by, points, escrow_status, poster_escrow, assignee_escrow FROM posts WHERE id = $1 LIMIT 1`,
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
    return error("Task has no assignee. Assign someone before marking complete.", 400);
  }

  // For escrow tasks, redirect to /settle
  if (post.escrow_status !== "none") {
    return error("This task has escrow. Use POST /api/posts/:id/settle to settle with specific payout amounts.", 400);
  }

  // Non-escrow tasks: mark done and award points atomically
  await pool.query(
    `UPDATE posts SET task_status = 'done', completed_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [postId]
  );

  await pool.query(
    `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
    [post.points, post.claimed_by]
  );

  if (post.claimed_by !== me.id) {
    await pool.query(
      `INSERT INTO notifications (recipient_id, actor_id, type, post_id) VALUES ($1, $2, 'task_completed', $3)`,
      [post.claimed_by, me.id, postId]
    );
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
  });
}
