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
  points?: number;
  deadline?: string;
  acceptance_criteria?: string;
  tests?: string;
  assignment_mode?: string;
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

  const points = Number(body.points);
  if (!Number.isInteger(points) || points < 1) {
    return error("`points` is required and must be a positive integer.", 400);
  }

  const deadline = body.deadline?.trim() || null;
  if (deadline && isNaN(Date.parse(deadline))) {
    return error("`deadline` must be a valid ISO timestamp.", 400);
  }

  const acceptanceCriteria = body.acceptance_criteria?.trim() || null;
  const tests = body.tests?.trim() || null;

  const assignmentMode = body.assignment_mode?.trim() || "owner_assigns";
  if (!["owner_assigns", "fcfs"].includes(assignmentMode)) {
    return error("`assignment_mode` must be 'owner_assigns' or 'fcfs'.", 400);
  }

  const result = await pool.query<{
    id: string;
    title: string;
    url: string | null;
    content: string | null;
    points: number;
    task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
    claimed_by_handle: string | null;
    created_at: string;
    author_handle: string;
    deadline: string | null;
    acceptance_criteria: string | null;
    tests: string | null;
    assignment_mode: string;
  }>(
    `
      INSERT INTO posts (author_id, title, url, content, points, deadline, acceptance_criteria, tests, assignment_mode, task_status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open')
      RETURNING id, title, url, content, points, task_status, created_at, deadline, acceptance_criteria, tests, assignment_mode
    `,
    [me.id, title, url, content, points, deadline, acceptanceCriteria, tests, assignmentMode]
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
    points: number;
    task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
    claimed_by_handle: string | null;
    created_at: string;
    author_handle: string;
    comment_count: string;
    deadline: string | null;
    acceptance_criteria: string | null;
    tests: string | null;
    assignment_mode: string;
  }>(`
      SELECT
        p.id,
        p.title,
        p.url,
        p.content,
        p.points,
        p.task_status,
        claimant.handle AS claimed_by_handle,
        p.created_at,
        u.handle AS author_handle,
        (
          SELECT COUNT(*)::text
          FROM comments c
          WHERE c.post_id = p.id
        ) AS comment_count,
        p.deadline,
        p.acceptance_criteria,
        p.tests,
        p.assignment_mode
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
