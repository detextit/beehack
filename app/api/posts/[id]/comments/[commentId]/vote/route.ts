export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import { DAILY_VOTE_CAP, VOTE_POINTS } from "@/lib/points-config";

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

function getTodayUTC(): string {
  return new Date().toISOString().split("T")[0];
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
  const comment = await pool.query<{
    id: string;
    author_id: string;
    post_id: string;
  }>("SELECT id, author_id, post_id FROM comments WHERE id = $1 LIMIT 1", [
    cId,
  ]);
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

  const authorId = comment.rows[0].author_id;

  // Get the previous vote to calculate point delta
  const prevVoteResult = await pool.query<{ vote: number }>(
    "SELECT vote FROM comment_votes WHERE user_id = $1 AND comment_id = $2",
    [me.id, cId]
  );
  const prevVote = prevVoteResult.rows[0]?.vote ?? 0;

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

  // Recalculate comment score
  const scoreResult = await pool.query<{ total: string }>(
    "SELECT COALESCE(SUM(vote), 0) AS total FROM comment_votes WHERE comment_id = $1",
    [cId]
  );
  const newScore = Number(scoreResult.rows[0].total);

  await pool.query("UPDATE comments SET score = $1 WHERE id = $2", [
    newScore,
    cId,
  ]);

  // Calculate point change for author based on vote delta
  // prevVote: the old vote (0 if none, 1 or -1 if existed)
  // direction: the new vote (0 to remove, 1 or -1 to set)
  let pointDelta = 0;
  if (prevVote !== direction) {
    // Remove points for old vote, add points for new vote
    const prevPoints =
      prevVote === 1
        ? VOTE_POINTS.upvote
        : prevVote === -1
          ? VOTE_POINTS.downvote
          : 0;
    const newPoints =
      direction === 1
        ? VOTE_POINTS.upvote
        : direction === -1
          ? VOTE_POINTS.downvote
          : 0;
    pointDelta = newPoints - prevPoints;
  }

  let authorPointsChange = 0;

  if (pointDelta !== 0) {
    const today = getTodayUTC();

    // Use a transaction for point updates
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Get author's current state
      const authorState = await client.query<{
        total_points: number;
        vote_points_today: number;
        vote_points_reset_date: string;
      }>(
        `SELECT total_points, vote_points_today, vote_points_reset_date FROM users WHERE id = $1`,
        [authorId]
      );

      let dailyPointsEarned = authorState.rows[0].vote_points_today;
      const resetDate = authorState.rows[0].vote_points_reset_date;

      // Reset daily counter if it's a new day
      if (resetDate !== today) {
        dailyPointsEarned = 0;
      }

      // Apply daily cap only to positive point gains
      let effectivePointDelta = pointDelta;
      if (pointDelta > 0) {
        const remainingCap = Math.max(0, DAILY_VOTE_CAP - dailyPointsEarned);
        effectivePointDelta = Math.min(pointDelta, remainingCap);
      }
      // Negative points (from downvotes) are not capped

      if (effectivePointDelta !== 0) {
        // Update author's points (floor at 0 for negative changes)
        await client.query(
          `UPDATE users SET
            total_points = GREATEST(total_points + $1, 0),
            vote_points_today = CASE
              WHEN vote_points_reset_date = $3 THEN vote_points_today + GREATEST($1, 0)
              ELSE GREATEST($1, 0)
            END,
            vote_points_reset_date = $3
           WHERE id = $2`,
          [effectivePointDelta, authorId, today]
        );

        // Get new balance for ledger
        const newBal = await client.query<{ total_points: number }>(
          `SELECT total_points FROM users WHERE id = $1`,
          [authorId]
        );

        // Create ledger entry
        await client.query(
          `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
           VALUES ($1, $2, $3, 'vote_received', $4, $5)`,
          [
            authorId,
            postId,
            effectivePointDelta,
            newBal.rows[0].total_points,
            JSON.stringify({
              comment_id: cId,
              vote_direction: direction,
              prev_vote: prevVote,
            }),
          ]
        );

        authorPointsChange = effectivePointDelta;
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Get user's current vote
  const userVoteResult = await pool.query<{ vote: number }>(
    "SELECT vote FROM comment_votes WHERE user_id = $1 AND comment_id = $2",
    [me.id, cId]
  );
  const userVote = userVoteResult.rows[0]?.vote ?? 0;

  return json({
    ok: true,
    score: newScore,
    user_vote: userVote,
    author_points_change: authorPointsChange,
  });
}
