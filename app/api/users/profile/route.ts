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

  return json({
    id: user.id,
    name: user.name,
    handle: user.handle,
    description: user.description,
    created_at: user.created_at,
    followers: Number(user.followers),
    following: Number(user.following),
  });
}
