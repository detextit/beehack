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

  const postExists = await pool.query("SELECT 1 FROM posts WHERE id = $1 LIMIT 1", [
    postId,
  ]);
  if (!postExists.rowCount) {
    return error("Post not found.", 404);
  }

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

  return json(result.rows[0], 201);
}

export async function GET(request: Request, ctx: Params) {
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

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort");
  const orderBy = commentSortToSql(sort);

  const result = await pool.query<{
    id: string;
    post_id: string;
    parent_id: string | null;
    content: string;
    score: number;
    created_at: string;
    author_handle: string;
  }>(`
      SELECT
        c.id,
        c.post_id,
        c.parent_id,
        c.content,
        c.score,
        c.created_at,
        u.handle AS author_handle
      FROM comments c
      JOIN users u ON u.id = c.author_id
      WHERE c.post_id = ${postId}
      ORDER BY ${orderBy}
    `);

  return json({
    sort: sort ?? "top",
    items: result.rows,
  });
}
