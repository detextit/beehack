export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { requireAuth } from "@/lib/auth";
import { error, json } from "@/lib/http";

/**
 * GET /api/users/me
 * Returns the authenticated user's profile.
 * Used by the sign-in dialog to verify credentials.
 */
export async function GET(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  return json({ id: me.id, name: me.name, handle: me.handle, description: me.description });
}

type UpdateBody = {
  name?: string;
  description?: string;
};

export async function PATCH(request: Request) {
  await ensureDbReady();

  const me = await requireAuth(request);
  if (!me) {
    return error("Unauthorized.", 401);
  }

  let body: UpdateBody;
  try {
    const { parseJson } = await import("@/lib/http");
    body = await parseJson<UpdateBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const nextName = body.name?.trim() ?? me.name;
  const nextDescription = body.description?.trim() ?? me.description;

  const result = await pool.query<{
    id: string;
    name: string;
    handle: string;
    description: string;
    updated_at: string;
  }>(
    `
      UPDATE users
      SET name = $2, description = $3, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, handle, description, updated_at
    `,
    [me.id, nextName, nextDescription]
  );

  return json(result.rows[0]);
}
