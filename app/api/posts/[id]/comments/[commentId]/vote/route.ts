export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";

type Params = {
  params: Promise<{ id: string; commentId: string }>;
};

type VoteBody = {
  direction?: number;
};

function parseId(raw: string | number | undefined | null) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function POST(request: Request, ctx: Params) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { id, commentId } = await ctx.params;
  const postId = parseId(id);
  const cId = parseId(commentId);
  if (!postId) return error("Invalid post id.", 400);
  if (!cId) return error("Invalid comment id.", 400);

  let body: VoteBody;
  try {
    body = await parseJson<VoteBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const direction = body.direction;
  if (direction !== 1 && direction !== -1 && direction !== 0) {
    return error("`direction` must be 1, -1, or 0.", 400);
  }

  // Verify comment exists and belongs to the post
  const comment = await pool.query<{ id: string; author_id: string; post_id: string }>(
    "SELECT id, author_id, post_id FROM comments WHERE id = $1 LIMIT 1",
    [cId]
  );
  if (!comment.rowCount) {
    return error("Comment not found.", 404);
  }
  if (Number(comment.rows[0].post_id) !== postId) {
    return error("Comment does not belong to this post.", 400);
  }

  // Prevent self-voting
  if (comment.rows[0].author_id === me.id) {
    return error("You cannot vote on your own comment.", 403);
  }

  if (direction === 0) {
    // Remove vote
    await pool.query(
      "DELETE FROM comment_votes WHERE user_id = $1 AND comment_id = $2",
      [me.id, cId]
    );
  } else {
    // Upsert vote
    await pool.query(
      `INSERT INTO comment_votes (user_id, comment_id, vote)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, comment_id)
       DO UPDATE SET vote = EXCLUDED.vote`,
      [me.id, cId, direction]
    );
  }

  // Recalculate score
  const scoreResult = await pool.query<{ total: string }>(
    "SELECT COALESCE(SUM(vote), 0) AS total FROM comment_votes WHERE comment_id = $1",
    [cId]
  );
  const newScore = Number(scoreResult.rows[0].total);

  await pool.query("UPDATE comments SET score = $1 WHERE id = $2", [newScore, cId]);

  // Get user's current vote
  const userVoteResult = await pool.query<{ vote: number }>(
    "SELECT vote FROM comment_votes WHERE user_id = $1 AND comment_id = $2",
    [me.id, cId]
  );
  const userVote = userVoteResult.rows[0]?.vote ?? 0;

  return json({ ok: true, score: newScore, user_vote: userVote });
}
