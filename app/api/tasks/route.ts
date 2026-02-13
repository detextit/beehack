export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { error, json } from "@/lib/http";
import { isTaskPriority, isTaskStatus, taskSortToSql } from "@/lib/tasks";

function parseLabelFilter(raw: string | null) {
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export async function GET(request: Request) {
  await ensureDbReady();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const priority = searchParams.get("priority");
  const labels = parseLabelFilter(searchParams.get("labels"));
  const sort = searchParams.get("sort");

  if (status && !isTaskStatus(status)) {
    return error(
      "`status` must be one of: open, claimed, in_progress, in_review, done, cancelled.",
      400
    );
  }

  if (priority && !isTaskPriority(priority)) {
    return error("`priority` must be one of: low, medium, high, critical.", 400);
  }

  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 25) || 25, 1),
    100
  );

  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    params.push(status);
    where.push(`p.task_status = $${params.length}`);
  }

  if (priority) {
    params.push(priority);
    where.push(`p.priority = $${params.length}`);
  }

  if (labels.length > 0) {
    params.push(labels);
    where.push(
      `EXISTS (SELECT 1 FROM unnest(p.labels) AS label WHERE lower(label) = ANY($${params.length}::text[]))`
    );
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = taskSortToSql(sort);

  const result = await pool.query<{
    id: string;
    title: string;
    url: string | null;
    content: string | null;
    points: number;
    task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
    priority: "low" | "medium" | "high" | "critical";
    labels: string[];
    repo_url: string | null;
    branch: string | null;
    pr_url: string | null;
    claimed_by_handle: string | null;
    claimed_at: string | null;
    completed_at: string | null;
    estimated_effort: string | null;
    created_at: string;
    updated_at: string;
    author_handle: string;
    comment_count: string;
  }>(
    `
      SELECT
        p.id,
        p.title,
        p.url,
        p.content,
        p.points,
        p.task_status,
        p.priority,
        p.labels,
        p.repo_url,
        p.branch,
        p.pr_url,
        claimant.handle AS claimed_by_handle,
        p.claimed_at,
        p.completed_at,
        p.estimated_effort,
        p.created_at,
        p.updated_at,
        author.handle AS author_handle,
        (
          SELECT COUNT(*)::text
          FROM comments c
          WHERE c.post_id = p.id
        ) AS comment_count
      FROM posts p
      JOIN users author ON author.id = p.author_id
      LEFT JOIN users claimant ON claimant.id = p.claimed_by
      ${whereClause}
      ORDER BY ${orderBy}
      LIMIT ${limit}
    `,
    params
  );

  const normalizedSort =
    sort === "new" || sort === "top" || sort === "urgent" || sort === "hot"
      ? sort
      : "hot";

  return json({
    sort: normalizedSort,
    limit,
    filters: {
      status: status ?? null,
      priority: priority ?? null,
      labels,
    },
    items: result.rows.map((row) => ({
      ...row,
      labels: row.labels ?? [],
      comment_count: Number(row.comment_count),
    })),
  });
}
