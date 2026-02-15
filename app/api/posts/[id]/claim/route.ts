export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { notifyQueenBee } from "@/lib/queenbee";

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
    task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
    claimed_by: string | null;
    assignment_mode: string;
    points: number;
    escrow_status: string;
  }>(
    `
      SELECT id, author_id, task_status, claimed_by, assignment_mode, points, escrow_status
      FROM posts
      WHERE id = $1
      LIMIT 1
    `,
    [postId]
  );

  const post = current.rows[0];
  if (!post) {
    return error("Task not found.", 404);
  }

  if (post.author_id === me.id) {
    return error("You cannot claim your own task. If you do not want to post it for others, delete the task.", 403);
  }

  if (post.assignment_mode === "owner_assigns") {
    return error("This task requires owner assignment. Express interest via comments.", 403);
  }

  if (post.task_status === "done" || post.task_status === "cancelled") {
    return error(`Task is ${post.task_status} and cannot be claimed.`, 409);
  }

  if (post.claimed_by && post.claimed_by !== me.id) {
    return error("Task already claimed by another user.", 409);
  }

  if (!post.claimed_by) {
    // For escrow tasks, auto-deduct 10% from claimant
    if (post.escrow_status === "poster_held") {
      const assigneeEscrow = Math.round(post.points * 0.10);
      const balResult = await pool.query<{ total_points: number }>(
        `SELECT total_points FROM users WHERE id = $1`, [me.id]
      );
      const balance = balResult.rows[0]?.total_points ?? 0;
      if (balance < assigneeEscrow) {
        return error(`Insufficient points for escrow deposit. You need ${assigneeEscrow} but have ${balance}.`, 400);
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE users SET total_points = total_points - $1 WHERE id = $2`,
          [assigneeEscrow, me.id]
        );
        await client.query(
          `UPDATE posts SET claimed_by = $2, claimed_at = NOW(), task_status = 'claimed',
           assignee_escrow = $3, escrow_status = 'both_held', updated_at = NOW()
           WHERE id = $1`,
          [postId, me.id, assigneeEscrow]
        );
        const newBal = await client.query<{ total_points: number }>(
          `SELECT total_points FROM users WHERE id = $1`, [me.id]
        );
        await client.query(
          `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
           VALUES ($1, $2, $3, 'escrow_hold', $4, $5)`,
          [me.id, postId, -assigneeEscrow, newBal.rows[0].total_points, JSON.stringify({ type: "assignee_escrow" })]
        );
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    } else {
      await pool.query(
        `UPDATE posts SET claimed_by = $2, claimed_at = NOW(), task_status = 'claimed', updated_at = NOW()
         WHERE id = $1`,
        [postId, me.id]
      );
    }

    if (post.author_id !== me.id) {
      await pool.query(
        `INSERT INTO notifications (recipient_id, actor_id, type, post_id)
         VALUES ($1, $2, 'task_claimed', $3)`,
        [post.author_id, me.id, postId]
      );
    }

    await notifyQueenBee(me.id, "task_claimed", postId);
  }

  const updated = await pool.query<{
    id: string;
    title: string;
    task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
    claimed_by_handle: string | null;
    claimed_at: string | null;
  }>(
    `
      SELECT
        p.id,
        p.title,
        p.task_status,
        claimant.handle AS claimed_by_handle,
        p.claimed_at
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
  });
}
