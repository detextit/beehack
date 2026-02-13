export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";

type Params = {
  params: Promise<{ id: string }>;
};

function parsePostId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(request: Request, ctx: Params) {
  await ensureDbReady();

  const { id } = await ctx.params;
  const postId = parsePostId(id);
  if (!postId) {
    return error("Invalid post id.", 400);
  }

  const result = await pool.query<{
    id: string;
    title: string;
    url: string | null;
    content: string | null;
    score: number;
    task_status: "open" | "claimed" | "done";
    claimed_by_handle: string | null;
    created_at: string;
    author_handle: string;
    comment_count: string;
  }>(
    `
      SELECT
        p.id,
        p.title,
        p.url,
        p.content,
        p.score,
        p.task_status,
        claimant.handle AS claimed_by_handle,
        p.created_at,
        u.handle AS author_handle,
        (
          SELECT COUNT(*)::text
          FROM comments c
          WHERE c.post_id = p.id
        ) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.author_id
      LEFT JOIN users claimant ON claimant.id = p.claimed_by
      WHERE p.id = $1
      LIMIT 1
    `,
    [postId]
  );

  const post = result.rows[0];
  if (!post) {
    return error("Post not found.", 404);
  }

  return json({
    ...post,
    comment_count: Number(post.comment_count),
  });
}

export async function DELETE(request: Request, ctx: Params) {
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

  const result = await pool.query(
    `
      DELETE FROM posts
      WHERE id = $1 AND author_id = $2
    `,
    [postId, me.id]
  );

  if (!result.rowCount) {
    return error("Post not found or not owned by authenticated user.", 404);
  }

  return json({ ok: true });
}

export async function PATCH(request: Request, ctx: Params) {
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

  const body = await parseJson<{
    title?: string;
    description?: string;
    content?: string;
    url?: string;
  }>(request);

  // Fetch current post (author-gated)
  const current = await pool.query<{
    title: string;
    url: string | null;
    content: string | null;
  }>(
    `SELECT title, url, content FROM posts WHERE id = $1 AND author_id = $2`,
    [postId, me.id]
  );

  if (!current.rows[0]) {
    return error("Post not found or not owned by authenticated user.", 404);
  }

  const prev = current.rows[0];
  const nextTitle = body.title?.trim() ?? prev.title;
  const nextContent = body.content?.trim() ?? body.description?.trim() ?? prev.content;
  const nextUrl = body.url?.trim() ?? prev.url;

  if (!nextTitle) {
    return error("Title cannot be empty.", 400);
  }

  if (!nextContent && !nextUrl) {
    return error("Post must have content or a URL.", 400);
  }

  const result = await pool.query<{
    id: string;
    title: string;
    url: string | null;
    content: string | null;
    score: number;
    task_status: "open" | "claimed" | "done";
    claimed_by_handle: string | null;
    created_at: string;
    updated_at: string;
    author_handle: string;
    comment_count: string;
  }>(
    `
      UPDATE posts p
      SET title = $3, content = $4, url = $5, updated_at = NOW()
      WHERE p.id = $1 AND p.author_id = $2
      RETURNING
        p.id,
        p.title,
        p.url,
        p.content,
        p.score,
        p.task_status,
        (SELECT handle FROM users WHERE id = p.claimed_by) AS claimed_by_handle,
        p.created_at,
        p.updated_at,
        (SELECT handle FROM users WHERE id = p.author_id) AS author_handle,
        (SELECT COUNT(*)::text FROM comments c WHERE c.post_id = p.id) AS comment_count
    `,
    [postId, me.id, nextTitle, nextContent, nextUrl]
  );

  const post = result.rows[0]!;
  return json({
    ...post,
    comment_count: Number(post.comment_count),
  });
}
