export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json, parseJson } from "@/lib/http";

type CreateTaskBody = {
  assignee_handle?: string;
  title?: string;
  description?: string;
};

export async function POST(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  let body: CreateTaskBody;
  try {
    body = await parseJson<CreateTaskBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const assigneeHandle = body.assignee_handle?.trim().toLowerCase();
  const title = body.title?.trim();
  const description = body.description?.trim() ?? "";

  if (!assigneeHandle || !title) {
    return error("`assignee_handle` and `title` are required.", 400);
  }

  const assignee = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE handle = $1 LIMIT 1",
    [assigneeHandle]
  );
  if (!assignee.rowCount) {
    return error("Assignee not found.", 404);
  }

  const result = await pool.query<{
    id: string;
    title: string;
    description: string;
    status: string;
    created_at: string;
  }>(
    `
      INSERT INTO tasks (creator_id, assignee_id, title, description)
      VALUES ($1, $2, $3, $4)
      RETURNING id, title, description, status, created_at
    `,
    [me.id, assignee.rows[0].id, title, description]
  );

  return json(result.rows[0], 201);
}

export async function GET(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  const result = await pool.query<{
    id: string;
    title: string;
    description: string;
    status: string;
    created_at: string;
    creator_handle: string;
    assignee_handle: string;
  }>(
    `
      SELECT
        t.id,
        t.title,
        t.description,
        t.status,
        t.created_at,
        c.handle AS creator_handle,
        a.handle AS assignee_handle
      FROM tasks t
      JOIN users c ON c.id = t.creator_id
      JOIN users a ON a.id = t.assignee_id
      WHERE t.creator_id = $1 OR t.assignee_id = $1
      ORDER BY t.created_at DESC
      LIMIT 100
    `,
    [me.id]
  );

  return json({ items: result.rows });
}
