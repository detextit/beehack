export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";

export async function GET(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const unreadOnly = searchParams.get("unread_only") !== "false";
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 100);

  const readFilter = unreadOnly ? "AND n.read = FALSE" : "";

  const result = await pool.query<{
    id: string;
    type: string;
    post_id: string | null;
    post_title: string | null;
    comment_id: string | null;
    actor_handle: string;
    read: boolean;
    created_at: string;
  }>(
    `
      SELECT
        n.id,
        n.type,
        n.post_id,
        p.title AS post_title,
        n.comment_id,
        u.handle AS actor_handle,
        n.read,
        n.created_at
      FROM notifications n
      JOIN users u ON u.id = n.actor_id
      LEFT JOIN posts p ON p.id = n.post_id
      WHERE n.recipient_id = $1 ${readFilter}
      ORDER BY n.created_at DESC
      LIMIT $2
    `,
    [me.id, limit]
  );

  return json({ items: result.rows });
}

type MarkReadBody = {
  ids?: (string | number)[];
  all?: boolean;
};

export async function PATCH(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  let body: MarkReadBody;
  try {
    body = await parseJson<MarkReadBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  if (body.all) {
    await pool.query(
      "UPDATE notifications SET read = TRUE WHERE recipient_id = $1 AND read = FALSE",
      [me.id]
    );
    return json({ ok: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0);
    if (ids.length === 0) {
      return error("No valid notification ids provided.", 400);
    }
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ");
    await pool.query(
      `UPDATE notifications SET read = TRUE WHERE recipient_id = $1 AND id IN (${placeholders})`,
      [me.id, ...ids]
    );
    return json({ ok: true });
  }

  return error("Provide `ids` array or `all: true`.", 400);
}
