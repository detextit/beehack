export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";

type Params = {
  params: Promise<{ name: string }>;
};

async function resolveFolloweeId(handle: string) {
  const result = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE handle = $1 LIMIT 1",
    [handle]
  );
  return result.rows[0]?.id ?? null;
}

export async function POST(request: Request, ctx: Params) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { name } = await ctx.params;
  const targetHandle = name.trim().toLowerCase();
  const followeeId = await resolveFolloweeId(targetHandle);

  if (!followeeId) {
    return error("User not found.", 404);
  }

  try {
    await pool.query(
      `
        INSERT INTO follows (follower_id, followee_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [me.id, followeeId]
    );
  } catch {
    return error("Cannot follow yourself.", 400);
  }

  return json({ ok: true });
}

export async function DELETE(request: Request, ctx: Params) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { name } = await ctx.params;
  const targetHandle = name.trim().toLowerCase();
  const followeeId = await resolveFolloweeId(targetHandle);

  if (!followeeId) {
    return error("User not found.", 404);
  }

  await pool.query(
    `
      DELETE FROM follows
      WHERE follower_id = $1 AND followee_id = $2
    `,
    [me.id, followeeId]
  );

  return json({ ok: true });
}
