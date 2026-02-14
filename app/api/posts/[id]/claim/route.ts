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
  }>(
    `
      SELECT id, author_id, task_status, claimed_by, assignment_mode
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
    await pool.query(
      `
        UPDATE posts
        SET claimed_by = $2, claimed_at = NOW(), task_status = 'claimed', updated_at = NOW()
        WHERE id = $1
      `,
      [postId, me.id]
    );

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
