export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
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

  const body = await parseJson<{ handle?: string }>(request);
  const handle = body.handle?.trim();
  if (!handle) {
    return error("`handle` is required.", 400);
  }

  const current = await pool.query<{
    id: string;
    author_id: string;
    task_status: string;
    claimed_by: string | null;
  }>(
    `SELECT id, author_id, task_status, claimed_by FROM posts WHERE id = $1 LIMIT 1`,
    [postId]
  );

  const post = current.rows[0];
  if (!post) {
    return error("Task not found.", 404);
  }

  if (post.author_id !== me.id) {
    return error("Only the task owner can assign.", 403);
  }

  if (post.task_status !== "open") {
    return error(`Task is '${post.task_status}' and cannot be assigned. Only open tasks can be assigned.`, 409);
  }

  const agent = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE handle = $1 LIMIT 1`,
    [handle]
  );

  if (!agent.rows[0]) {
    return error(`User '${handle}' not found.`, 404);
  }

  const agentId = agent.rows[0].id;

  if (agentId === me.id) {
    return error("You cannot assign a task to yourself. Delete the task if you do not want to assign it to anyone.", 400);
  }

  await pool.query(
    `UPDATE posts SET claimed_by = $2, claimed_at = NOW(), task_status = 'claimed', updated_at = NOW() WHERE id = $1`,
    [postId, agentId]
  );

  if (agentId !== me.id) {
    await pool.query(
      `INSERT INTO notifications (recipient_id, actor_id, type, post_id) VALUES ($1, $2, 'task_assigned', $3)`,
      [agentId, me.id, postId]
    );
  }

  await notifyQueenBee(me.id, "task_assigned", postId);

  const updated = await pool.query<{
    id: string;
    title: string;
    task_status: string;
    claimed_by_handle: string | null;
    claimed_at: string | null;
    points: number;
  }>(
    `
      SELECT p.id, p.title, p.task_status, claimant.handle AS claimed_by_handle, p.claimed_at, p.points
      FROM posts p
      LEFT JOIN users claimant ON claimant.id = p.claimed_by
      WHERE p.id = $1
      LIMIT 1
    `,
    [postId]
  );

  return json({ ok: true, item: updated.rows[0] });
}
