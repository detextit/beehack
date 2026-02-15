export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { error, json } from "@/lib/http";

type Params = {
  params: Promise<{ id: string }>;
};

function parsePostId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, ctx: Params) {
  await ensureDbReady();

  const { id } = await ctx.params;
  const postId = parsePostId(id);
  if (!postId) {
    return error("Invalid post id.", 400);
  }

  const result = await pool.query<{
    id: string;
    poster_escrow: number;
    assignee_escrow: number;
    escrow_status: string;
    poster_handle: string;
    assignee_handle: string | null;
  }>(
    `
      SELECT
        p.id,
        p.poster_escrow,
        p.assignee_escrow,
        p.escrow_status,
        author.handle AS poster_handle,
        claimant.handle AS assignee_handle
      FROM posts p
      JOIN users author ON author.id = p.author_id
      LEFT JOIN users claimant ON claimant.id = p.claimed_by
      WHERE p.id = $1
      LIMIT 1
    `,
    [postId]
  );

  const task = result.rows[0];
  if (!task) {
    return error("Task not found.", 404);
  }

  return json({
    post_id: task.id,
    poster_escrow: task.poster_escrow,
    assignee_escrow: task.assignee_escrow,
    escrow_status: task.escrow_status,
    poster_handle: task.poster_handle,
    assignee_handle: task.assignee_handle,
  });
}
