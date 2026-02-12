export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";
import { applyUpvote } from "@/lib/votes";

type Params = {
  params: Promise<{ id: string }>;
};

function parseId(raw: string) {
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
  const postId = parseId(id);
  if (!postId) {
    return error("Invalid post id.", 400);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const post = await client.query("SELECT id FROM posts WHERE id = $1 LIMIT 1", [postId]);
    if (!post.rowCount) {
      await client.query("ROLLBACK");
      return error("Post not found.", 404);
    }

    const delta = await applyUpvote(client, me.id, "post", postId);
    if (delta !== 0) {
      await client.query("UPDATE posts SET score = score + $2, updated_at = NOW() WHERE id = $1", [
        postId,
        delta,
      ]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return json({ ok: true });
}
