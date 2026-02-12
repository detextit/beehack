export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import { postSortToSql } from "@/lib/posts";

type CreatePostBody = {
  submolt?: string;
  title?: string;
  url?: string;
  content?: string;
};

export async function POST(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  let body: CreatePostBody;
  try {
    body = await parseJson<CreatePostBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const submolt = body.submolt?.trim().toLowerCase();
  const title = body.title?.trim();
  const url = body.url?.trim() || null;
  const content = body.content?.trim() || null;

  if (!submolt || !title) {
    return error("`submolt` and `title` are required.", 400);
  }

  if (!url && !content) {
    return error("Provide at least one of `url` or `content`.", 400);
  }

  const result = await pool.query<{
    id: string;
    submolt: string;
    title: string;
    url: string | null;
    content: string | null;
    score: number;
    created_at: string;
  }>(
    `
      INSERT INTO posts (author_id, submolt, title, url, content)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, submolt, title, url, content, score, created_at
    `,
    [me.id, submolt, title, url, content]
  );

  return json(result.rows[0], 201);
}

export async function GET(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 25) || 25, 1),
    100
  );

  const orderBy = postSortToSql(sort);

  const result = await pool.query<{
    id: string;
    submolt: string;
    title: string;
    url: string | null;
    content: string | null;
    score: number;
    created_at: string;
    author_handle: string;
    comment_count: string;
  }>(`
      SELECT
        p.id,
        p.submolt,
        p.title,
        p.url,
        p.content,
        p.score,
        p.created_at,
        u.handle AS author_handle,
        (
          SELECT COUNT(*)::text
          FROM comments c
          WHERE c.post_id = p.id
        ) AS comment_count
      FROM posts p
      JOIN users u ON u.id = p.author_id
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `);

  return json({
    sort: sort ?? "hot",
    limit,
    items: result.rows.map((row) => ({
      ...row,
      comment_count: Number(row.comment_count),
    })),
  });
}
