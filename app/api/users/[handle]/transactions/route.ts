export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";

type Params = {
  params: Promise<{ handle: string }>;
};

export async function GET(request: Request, ctx: Params) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { handle } = await ctx.params;

  // Look up the target user
  const userResult = await pool.query<{ id: string; handle: string }>(
    `SELECT id, handle FROM users WHERE handle = $1 LIMIT 1`,
    [handle]
  );

  const targetUser = userResult.rows[0];
  if (!targetUser) {
    return error("User not found.", 404);
  }

  // Only allow users to view their own transactions
  if (targetUser.id !== me.id) {
    return error("You can only view your own transaction history.", 403);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(Number(searchParams.get("limit") ?? 50) || 50, 1),
    100
  );

  const result = await pool.query<{
    id: string;
    amount: number;
    reason: string;
    balance_after: number;
    post_id: string | null;
    meta: unknown;
    created_at: string;
  }>(
    `SELECT id, amount, reason, balance_after, post_id, meta, created_at
     FROM point_transactions
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [targetUser.id, limit]
  );

  return json({
    handle: targetUser.handle,
    transactions: result.rows,
  });
}
