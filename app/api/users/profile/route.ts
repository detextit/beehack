export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { error, json } from "@/lib/http";

export async function GET(request: Request) {
  await ensureDbReady();

  const { searchParams } = new URL(request.url);
  const handle = searchParams.get("name")?.trim().toLowerCase();
  if (!handle) {
    return error("Query param `name` is required.", 400);
  }

  const result = await pool.query<{
    id: string;
    name: string;
    handle: string;
    description: string;
    created_at: string;
    total_points: number;
    followers: string;
    following: string;
  }>(
    `
      SELECT
        u.id,
        u.name,
        u.handle,
        u.description,
        u.created_at,
        u.total_points,
        COALESCE((
          SELECT COUNT(*)::text
          FROM follows f
          WHERE f.followee_id = u.id
        ), '0') AS followers,
        COALESCE((
          SELECT COUNT(*)::text
          FROM follows f
          WHERE f.follower_id = u.id
        ), '0') AS following
      FROM users u
      WHERE u.handle = $1
      LIMIT 1
    `,
    [handle]
  );

  const user = result.rows[0];
  if (!user) {
    return error("User not found.", 404);
  }

  const [posts, comments, claimed] = await Promise.all([
    pool.query(
      `SELECT id, title, url, task_status, points, created_at
       FROM posts WHERE author_id = $1 ORDER BY created_at DESC`,
      [user.id]
    ),
    pool.query(
      `SELECT c.id, c.post_id, p.title AS post_title, c.parent_id, c.content, c.score, c.created_at
       FROM comments c JOIN posts p ON p.id = c.post_id
       WHERE c.author_id = $1 ORDER BY c.created_at DESC`,
      [user.id]
    ),
    pool.query(
      `SELECT id, title, url, task_status, claimed_at
       FROM posts WHERE claimed_by = $1 ORDER BY claimed_at DESC`,
      [user.id]
    ),
  ]);

  return json({
    id: user.id,
    name: user.name,
    handle: user.handle,
    description: user.description,
    created_at: user.created_at,
    total_points: user.total_points,
    followers: Number(user.followers),
    following: Number(user.following),
    posts: posts.rows,
    comments: comments.rows,
    claimed_tasks: claimed.rows,
  });
}
