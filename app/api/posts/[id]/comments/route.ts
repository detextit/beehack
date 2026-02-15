export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import { commentSortToSql } from "@/lib/posts";

type Params = {
  params: Promise<{ id: string }>;
};

type CreateCommentBody = {
  content?: string;
  parent_id?: string | number;
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

  const { id } = await ctx.params;
  const postId = parseId(id);
  if (!postId) {
    return error("Invalid post id.", 400);
  }

  let body: CreateCommentBody;
  try {
    body = await parseJson<CreateCommentBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const content = body.content?.trim();
  const parentId = parseId(body.parent_id ?? null);

  if (!content) {
    return error("`content` is required.", 400);
  }

  const postCheck = await pool.query<{ author_id: string }>(
    "SELECT author_id FROM posts WHERE id = $1 LIMIT 1",
    [postId]
  );
  if (!postCheck.rowCount) {
    return error("Post not found.", 404);
  }
  const postAuthorId = postCheck.rows[0].author_id;

  if (parentId) {
    const parent = await pool.query<{ post_id: string }>(
      "SELECT post_id FROM comments WHERE id = $1 LIMIT 1",
      [parentId]
    );
    if (!parent.rowCount || Number(parent.rows[0].post_id) !== postId) {
      return error("Invalid `parent_id` for this post.", 400);
    }
  }

  const result = await pool.query<{
    id: string;
    post_id: string;
    parent_id: string | null;
    content: string;
    score: number;
    created_at: string;
  }>(
    `
      INSERT INTO comments (post_id, author_id, parent_id, content)
      VALUES ($1, $2, $3, $4)
      RETURNING id, post_id, parent_id, content, score, created_at
    `,
    [postId, me.id, parentId, content]
  );

  const newCommentId = result.rows[0].id;

  if (parentId) {
    // Reply to a comment — notify the parent comment's author
    const parentComment = await pool.query<{ author_id: string }>(
      "SELECT author_id FROM comments WHERE id = $1 LIMIT 1",
      [parentId]
    );
    const parentAuthorId = parentComment.rows[0]?.author_id;
    if (parentAuthorId && parentAuthorId !== me.id) {
      await pool.query(
        `INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id)
         VALUES ($1, $2, 'reply_on_comment', $3, $4)`,
        [parentAuthorId, me.id, postId, newCommentId]
      );
    }
  } else {
    // Top-level comment — notify the post author
    if (postAuthorId !== me.id) {
      await pool.query(
        `INSERT INTO notifications (recipient_id, actor_id, type, post_id, comment_id)
         VALUES ($1, $2, 'comment_on_post', $3, $4)`,
        [postAuthorId, me.id, postId, newCommentId]
      );
    }
  }

  return json(result.rows[0], 201);
}

export async function GET(request: Request, ctx: Params) {
  await ensureDbReady();

  const { id } = await ctx.params;
  const postId = parseId(id);
  if (!postId) {
    return error("Invalid post id.", 400);
  }

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort");
  const orderBy = commentSortToSql(sort);

  // Check if user is authenticated (optional) for user_vote
  const me = await requireAuth(request);

  const result = await pool.query<{
    id: string;
    post_id: string;
    parent_id: string | null;
    content: string;
    score: number;
    created_at: string;
    author_handle: string;
    user_vote: number | null;
  }>(
    `SELECT
        c.id,
        c.post_id,
        c.parent_id,
        c.content,
        c.score,
        c.created_at,
        u.handle AS author_handle,
        cv.vote AS user_vote
      FROM comments c
      JOIN users u ON u.id = c.author_id
      LEFT JOIN comment_votes cv ON cv.comment_id = c.id AND cv.user_id = $1
      WHERE c.post_id = $2
      ORDER BY ${orderBy}`,
    [me?.id ?? null, postId]
  );

  return json({
    sort: sort ?? "top",
    items: result.rows.map((r) => ({ ...r, user_vote: r.user_vote ?? 0 })),
  });
}
