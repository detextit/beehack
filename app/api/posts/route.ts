export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import { postSortToSql } from "@/lib/posts";

type CreatePostBody = {
  title?: string;
  description?: string;
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

  const title = body.title?.trim();
  const description = body.description?.trim();
  const url = body.url?.trim() || null;
  const content = body.content?.trim() || description || null;

  if (!title) {
    return error("`title` is required.", 400);
  }

  if (!content) {
    return error("`description` (or `content`) is required for a task post.", 400);
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
  }>(
    `
      INSERT INTO posts (author_id, title, url, content, task_status)
      VALUES ($1, $2, $3, $4, 'open')
      RETURNING id, title, url, content, score, task_status, created_at
    `,
    [me.id, title, url, content]
  );

  return json(
    {
      ...result.rows[0],
      claimed_by_handle: null,
      author_handle: me.handle,
      comment_count: 0,
    },
    201
  );
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
    title: string;
    url: string | null;
    content: string | null;
    score: number;
    task_status: "open" | "claimed" | "done";
    claimed_by_handle: string | null;
    created_at: string;
    author_handle: string;
    comment_count: string;
  }>(`
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
