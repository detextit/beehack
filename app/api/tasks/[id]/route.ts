export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import {
  canTransitionTaskStatus,
  isTaskPriority,
  isTaskStatus,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/tasks";
import { notifyQueenBee } from "@/lib/queenbee";

type Params = {
  params: Promise<{ id: string }>;
};

type TaskDetailsRow = {
  id: string;
  title: string;
  url: string | null;
  content: string | null;
  points: number;
  task_status: TaskStatus;
  priority: TaskPriority;
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
};

type UpdateTaskBody = {
  status?: unknown;
  priority?: unknown;
  labels?: unknown;
  repo_url?: unknown;
  branch?: unknown;
  pr_url?: unknown;
  estimated_effort?: unknown;
};

function parseTaskId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeNullableTextField(
  fieldName: string,
  value: unknown
): { ok: true; value: string | null | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value === null) {
    return { ok: true, value: null };
  }

  if (typeof value !== "string") {
    return { ok: false, message: `\`${fieldName}\` must be a string or null.` };
  }

  const trimmed = value.trim();
  return { ok: true, value: trimmed || null };
}

function normalizeLabelUpdate(
  value: unknown
): { ok: true; value: string[] | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value === null) {
    return { ok: true, value: [] };
  }

  if (!Array.isArray(value)) {
    return { ok: false, message: "`labels` must be an array of strings or null." };
  }

  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return { ok: false, message: "`labels` must contain only strings." };
    }

    const label = entry.trim().toLowerCase();
    if (!label) {
      continue;
    }

    normalized.push(label);
  }

  return { ok: true, value: Array.from(new Set(normalized)) };
}

function toTaskPayload(task: TaskDetailsRow) {
  return {
    ...task,
    labels: task.labels ?? [],
    comment_count: Number(task.comment_count),
  };
}

async function selectTask(taskId: number) {
  const result = await pool.query<TaskDetailsRow>(
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
      WHERE p.id = $1
      LIMIT 1
    `,
    [taskId]
  );

  return result.rows[0] ?? null;
}

export async function GET(_request: Request, ctx: Params) {
  await ensureDbReady();

  const { id } = await ctx.params;
  const taskId = parseTaskId(id);
  if (!taskId) {
    return error("Invalid task id.", 400);
  }

  const task = await selectTask(taskId);
  if (!task) {
    return error("Task not found.", 404);
  }

  return json(toTaskPayload(task));
}

export async function PATCH(request: Request, ctx: Params) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { id } = await ctx.params;
  const taskId = parseTaskId(id);
  if (!taskId) {
    return error("Invalid task id.", 400);
  }

  let body: UpdateTaskBody;
  try {
    body = await parseJson<UpdateTaskBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const normalizedRepoUrl = normalizeNullableTextField("repo_url", body.repo_url);
  if (!normalizedRepoUrl.ok) {
    return error(normalizedRepoUrl.message, 400);
  }

  const normalizedBranch = normalizeNullableTextField("branch", body.branch);
  if (!normalizedBranch.ok) {
    return error(normalizedBranch.message, 400);
  }

  const normalizedPrUrl = normalizeNullableTextField("pr_url", body.pr_url);
  if (!normalizedPrUrl.ok) {
    return error(normalizedPrUrl.message, 400);
  }

  const normalizedEffort = normalizeNullableTextField(
    "estimated_effort",
    body.estimated_effort
  );
  if (!normalizedEffort.ok) {
    return error(normalizedEffort.message, 400);
  }

  const normalizedLabels = normalizeLabelUpdate(body.labels);
  if (!normalizedLabels.ok) {
    return error(normalizedLabels.message, 400);
  }

  let requestedStatus: TaskStatus | undefined;
  if (body.status !== undefined) {
    if (typeof body.status !== "string") {
      return error("`status` must be a string.", 400);
    }

    const status = body.status.trim();
    if (!isTaskStatus(status)) {
      return error(
        "`status` must be one of: open, claimed, in_progress, in_review, done, cancelled.",
        400
      );
    }

    requestedStatus = status;
  }

  let requestedPriority: TaskPriority | undefined;
  if (body.priority !== undefined) {
    if (typeof body.priority !== "string") {
      return error("`priority` must be a string.", 400);
    }

    const priority = body.priority.trim();
    if (!isTaskPriority(priority)) {
      return error("`priority` must be one of: low, medium, high, critical.", 400);
    }

    requestedPriority = priority;
  }

  const currentResult = await pool.query<{
    id: string;
    author_id: string;
    claimed_by: string | null;
    task_status: TaskStatus;
    poster_escrow: number;
    assignee_escrow: number;
    escrow_status: string;
  }>(
    `
      SELECT id, author_id, claimed_by, task_status, poster_escrow, assignee_escrow, escrow_status
      FROM posts
      WHERE id = $1
      LIMIT 1
    `,
    [taskId]
  );

  const current = currentResult.rows[0];
  if (!current) {
    return error("Task not found.", 404);
  }

  if (current.author_id !== me.id && current.claimed_by !== me.id) {
    return error("Only the task owner or assignee can update this task.", 403);
  }

  const updates: string[] = [];
  const params: unknown[] = [taskId];
  const assignToSelfOnClaim =
    requestedStatus === "claimed" && !current.claimed_by;
  const statusChanged =
    requestedStatus !== undefined && requestedStatus !== current.task_status;

  if (statusChanged) {
    if (!canTransitionTaskStatus(current.task_status, requestedStatus!)) {
      return error(
        `Invalid status transition from '${current.task_status}' to '${requestedStatus}'.`,
        409
      );
    }

    if (
      (requestedStatus === "in_progress" ||
        requestedStatus === "in_review" ||
        requestedStatus === "done") &&
      !current.claimed_by
    ) {
      return error("Task must be assigned before moving past 'claimed'.", 400);
    }

    if (requestedStatus === "claimed" && current.claimed_by && current.claimed_by !== me.id) {
      return error("Task is already assigned to another user.", 409);
    }

    params.push(requestedStatus);
    updates.push(`task_status = $${params.length}`);
  }

  if (assignToSelfOnClaim) {
    params.push(me.id);
    updates.push(`claimed_by = $${params.length}`);
    updates.push("claimed_at = NOW()");
  }

  if (requestedPriority !== undefined) {
    params.push(requestedPriority);
    updates.push(`priority = $${params.length}`);
  }

  if (normalizedLabels.value !== undefined) {
    params.push(normalizedLabels.value);
    updates.push(`labels = $${params.length}::text[]`);
  }

  if (normalizedRepoUrl.value !== undefined) {
    params.push(normalizedRepoUrl.value);
    updates.push(`repo_url = $${params.length}`);
  }

  if (normalizedBranch.value !== undefined) {
    params.push(normalizedBranch.value);
    updates.push(`branch = $${params.length}`);
  }

  if (normalizedPrUrl.value !== undefined) {
    params.push(normalizedPrUrl.value);
    updates.push(`pr_url = $${params.length}`);
  }

  if (normalizedEffort.value !== undefined) {
    params.push(normalizedEffort.value);
    updates.push(`estimated_effort = $${params.length}`);
  }

  if (requestedStatus === "done") {
    updates.push("completed_at = NOW()");
  }

  if (updates.length > 0) {
    await pool.query(
      `
        UPDATE posts
        SET ${updates.join(", ")}, updated_at = NOW()
        WHERE id = $1
      `,
      params
    );
  }

  // Handle escrow refunds on cancellation
  if (requestedStatus === "cancelled" && (current.escrow_status === "poster_held" || current.escrow_status === "both_held")) {
    // Poster cannot cancel after worker has accepted escrow
    if (current.escrow_status === "both_held" && me.id === current.author_id) {
      return error("Cannot cancel after assignee has accepted escrow. Only the assignee can abandon.", 403);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (current.escrow_status === "poster_held") {
        // Only poster had escrow, return it
        await client.query(
          `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
          [current.poster_escrow, current.author_id]
        );
        const bal = await client.query<{ total_points: number }>(
          `SELECT total_points FROM users WHERE id = $1`, [current.author_id]
        );
        await client.query(
          `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
           VALUES ($1, $2, $3, 'refund', $4, $5)`,
          [current.author_id, taskId, current.poster_escrow, bal.rows[0].total_points, JSON.stringify({ type: "cancellation_refund" })]
        );
      } else if (current.escrow_status === "both_held") {
        // Only reachable by assignee (poster blocked above)
        // Assignee abandons: poster gets bounty back + assignee's forfeited escrow
        await client.query(
          `UPDATE users SET total_points = total_points + $1 WHERE id = $2`,
          [current.poster_escrow + current.assignee_escrow, current.author_id]
        );
        const posterBal = await client.query<{ total_points: number }>(
          `SELECT total_points FROM users WHERE id = $1`, [current.author_id]
        );
        await client.query(
          `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
           VALUES ($1, $2, $3, 'refund', $4, $5)`,
          [current.author_id, taskId, current.poster_escrow, posterBal.rows[0].total_points - current.assignee_escrow, JSON.stringify({ type: "cancellation_refund" })]
        );
        await client.query(
          `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
           VALUES ($1, $2, $3, 'escrow_forfeit', $4, $5)`,
          [current.author_id, taskId, current.assignee_escrow, posterBal.rows[0].total_points, JSON.stringify({ type: "assignee_abandonment" })]
        );
      }

      await client.query(
        `UPDATE posts SET escrow_status = 'refunded', updated_at = NOW() WHERE id = $1`,
        [taskId]
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  if (requestedStatus === "in_review") {
    await notifyQueenBee(me.id, "task_in_review", taskId);
  } else if (requestedStatus === "cancelled") {
    await notifyQueenBee(me.id, "task_cancelled", taskId);
  }

  const updatedTask = await selectTask(taskId);
  if (!updatedTask) {
    return error("Task not found.", 404);
  }

  return json({
    ok: true,
    item: toTaskPayload(updatedTask),
  });
}
