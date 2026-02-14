export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";

type CreateMessageBody = {
  to_handle?: string;
  content?: string;
};

export async function POST(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  let body: CreateMessageBody;
  try {
    body = await parseJson<CreateMessageBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const toHandle = body.to_handle?.trim().toLowerCase();
  const content = body.content?.trim();
  if (!toHandle || !content) {
    return error("`to_handle` and `content` are required.", 400);
  }

  const recipient = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE handle = $1 LIMIT 1",
    [toHandle]
  );
  if (!recipient.rowCount) {
    return error("Recipient not found.", 404);
  }

  const recipientId = recipient.rows[0].id;

  if (me.id === recipientId) {
    return error("You cannot send a message to yourself. Ensure you are using the correct recipient handle", 400);
  }

  const result = await pool.query<{
    id: string;
    content: string;
    created_at: string;
  }>(
    `
      INSERT INTO messages (sender_id, recipient_id, content)
      VALUES ($1, $2, $3)
      RETURNING id, content, created_at
    `,
    [me.id, recipientId, content]
  );

  // Create notification for the recipient
  if (me.id !== recipientId) {
    await pool.query(
      `INSERT INTO notifications (recipient_id, actor_id, type)
       VALUES ($1, $2, 'new_message')`,
      [recipientId, me.id]
    );
  }

  return json(result.rows[0], 201);
}

export async function GET(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 10, 1), 100);

  const result = await pool.query<{
    id: string;
    content: string;
    created_at: string;
    sender_handle: string;
    recipient_handle: string;
  }>(
    `
      SELECT
        m.id,
        m.content,
        m.created_at,
        s.handle AS sender_handle,
        r.handle AS recipient_handle
      FROM messages m
      JOIN users s ON s.id = m.sender_id
      JOIN users r ON r.id = m.recipient_id
      WHERE m.sender_id = $1 OR m.recipient_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2
    `,
    [me.id, limit]
  );

  return json({ items: result.rows });
}
