export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";
import { postSortToSql } from "@/lib/posts";
import { notifyQueenBee } from "@/lib/queenbee";
import { canPerformTieredAction } from "@/lib/points-config";
import { checkFirstPostMilestone } from "@/lib/milestones";

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
  escrow?: boolean;
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

  const useEscrow = body.escrow === true;

  if (useEscrow) {
    // Escrow mode: deduct points from poster's balance and hold in escrow
    const balanceResult = await pool.query<{ total_points: number }>(
      `SELECT total_points FROM users WHERE id = $1`,
      [me.id]
    );
    const posterBalance = balanceResult.rows[0]?.total_points ?? 0;

    // Tier-gated: creating escrow tasks requires Silver tier
    if (!canPerformTieredAction(posterBalance, "create_escrow_task")) {
      return error("Creating escrow tasks requires Silver tier (100+ points).", 403);
    }

    if (posterBalance < points) {
      return error(`Insufficient points for escrow. You need ${points} but have ${posterBalance}.`, 400);
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE users SET total_points = total_points - $1 WHERE id = $2`,
        [points, me.id]
      );

      const result = await client.query<{
        id: string;
        title: string;
        url: string | null;
        content: string | null;
        points: number;
        task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
        created_at: string;
        deadline: string | null;
        acceptance_criteria: string | null;
        tests: string | null;
        assignment_mode: string;
        poster_escrow: number;
        escrow_status: string;
      }>(
        `
          INSERT INTO posts (author_id, title, url, content, points, deadline, acceptance_criteria, tests, assignment_mode, task_status, poster_escrow, escrow_status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'open', $5, 'poster_held')
          RETURNING id, title, url, content, points, task_status, created_at, deadline, acceptance_criteria, tests, assignment_mode, poster_escrow, escrow_status
        `,
        [me.id, title, url, content, points, deadline, acceptanceCriteria, tests, assignmentMode]
      );

      const post = result.rows[0];

      const newBalance = await client.query<{ total_points: number }>(
        `SELECT total_points FROM users WHERE id = $1`,
        [me.id]
      );

      await client.query(
        `INSERT INTO point_transactions (user_id, post_id, amount, reason, balance_after, meta)
         VALUES ($1, $2, $3, 'escrow_hold', $4, $5)`,
        [me.id, post.id, -points, newBalance.rows[0].total_points, JSON.stringify({ type: "poster_escrow" })]
      );

      // Check for first_task_posted milestone
      const milestoneResult = await checkFirstPostMilestone(client, me.id, Number(post.id));

      await client.query("COMMIT");

      await notifyQueenBee(me.id, "task_created", post.id);

      return json(
        {
          ...post,
          claimed_by_handle: null,
          author_handle: me.handle,
          comment_count: 0,
          milestone_awarded: milestoneResult.awarded ? "first_task_posted" : null,
          milestone_bonus: milestoneResult.points,
        },
        201
      );
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Non-escrow mode: no points deducted, standard task creation
  const client = await pool.connect();
  let milestoneAwarded: string | null = null;
  let milestoneBonus = 0;

  try {
    await client.query("BEGIN");

    const result = await client.query<{
      id: string;
      title: string;
      url: string | null;
      content: string | null;
      points: number;
      task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled";
      created_at: string;
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

    const post = result.rows[0];

    // Check for first_task_posted milestone
    const milestoneResult = await checkFirstPostMilestone(client, me.id, Number(post.id));
    if (milestoneResult.awarded) {
      milestoneAwarded = "first_task_posted";
      milestoneBonus = milestoneResult.points;
    }

    await client.query("COMMIT");

    await notifyQueenBee(me.id, "task_created", post.id);

    return json(
      {
        ...post,
        claimed_by_handle: null,
        author_handle: me.handle,
        comment_count: 0,
        milestone_awarded: milestoneAwarded,
        milestone_bonus: milestoneBonus,
      },
      201
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function GET(request: Request) {
  await ensureDbReady();

  const { searchParams } = new URL(request.url);
  const sort = searchParams.get("sort");
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 25) || 25, 1),
    100
  );

  type PostRow = {
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
  };

  // Handle "foryou" sort: followed users' posts first, then hot
  if (sort === "foryou") {
    const me = await requireAuth(request);

    // Require authentication for "foryou" sort
    if (!me) {
      return error("Authentication required for 'foryou' sort.", 401);
    }

    const followsResult = await pool.query<{ followee_id: string }>(
      `SELECT followee_id FROM follows WHERE follower_id = $1`,
      [me.id]
    );
    const followedIds = followsResult.rows.map((r: { followee_id: string }) => r.followee_id);

    // If following nobody, fall back to hot sort
    if (followedIds.length === 0) {
      const orderBy = postSortToSql("hot");
      const result = await pool.query<PostRow>(`
        SELECT
          p.id, p.title, p.url, p.content, p.points, p.task_status,
          claimant.handle AS claimed_by_handle, p.created_at,
          u.handle AS author_handle,
          (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id) AS comment_count,
          p.deadline, p.acceptance_criteria, p.tests, p.assignment_mode
        FROM posts p
        JOIN users u ON u.id = p.author_id
        LEFT JOIN users claimant ON claimant.id = p.claimed_by
        ORDER BY ${orderBy}
        LIMIT ${limit}
      `);

      return json({
        sort: "foryou",
        limit,
        items: result.rows.map((row) => ({
          ...row,
          comment_count: Number(row.comment_count),
        })),
      });
    }

    // Followed users' posts first, then remaining, sorted by status then points
    const result = await pool.query<PostRow>(
      `
        SELECT
          p.id, p.title, p.url, p.content, p.points, p.task_status,
          claimant.handle AS claimed_by_handle, p.created_at,
          u.handle AS author_handle,
          (SELECT COUNT(*)::text FROM comments c WHERE c.post_id = p.id) AS comment_count,
          p.deadline, p.acceptance_criteria, p.tests, p.assignment_mode
        FROM posts p
        JOIN users u ON u.id = p.author_id
        LEFT JOIN users claimant ON claimant.id = p.claimed_by
        ORDER BY
          CASE WHEN p.author_id = ANY($1) THEN 0 ELSE 1 END,
          CASE p.task_status WHEN 'open' THEN 0 WHEN 'claimed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'in_review' THEN 3 WHEN 'done' THEN 4 ELSE 5 END ASC,
          p.points DESC
        LIMIT $2
      `,
      [followedIds, limit]
    );

    return json({
      sort: "foryou",
      limit,
      items: result.rows.map((row) => ({
        ...row,
        comment_count: Number(row.comment_count),
      })),
    });
  }

  const orderBy = postSortToSql(sort);

  const result = await pool.query<PostRow>(`
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
