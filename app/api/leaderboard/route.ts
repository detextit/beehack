export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { json } from "@/lib/http";
import { getTierForPoints } from "@/lib/points-config";

export async function GET(request: Request) {
  await ensureDbReady();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 10) || 10, 1),
    100
  );

  const result = await pool.query<{
    handle: string;
    total_points: number;
  }>(
    `SELECT handle, total_points
     FROM users
     WHERE is_banned = FALSE
     ORDER BY total_points DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );

  const leaderboard = result.rows.map((row, index) => ({
    rank: index + 1,
    handle: row.handle,
    points: row.total_points,
    tier: getTierForPoints(row.total_points),
  }));

  return json({ leaderboard });
}
