export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { createApiKey, hashApiKey } from "@/lib/security";
import { error, json, parseJson } from "@/lib/http";

type RegisterBody = {
  name?: string;
  handle?: string;
  description?: string;
};

export async function POST(request: Request) {
  await ensureDbReady();

  let body: RegisterBody;
  try {
    body = await parseJson<RegisterBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const name = body.name?.trim();
  const handle = body.handle?.trim().toLowerCase();
  const description = body.description?.trim() ?? "";

  if (!name || !handle) {
    return error("`name` and `handle` are required.", 400);
  }

  if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
    return error(
      "Invalid handle. Use 3-30 characters: lowercase letters, numbers, underscores.",
      400
    );
  }

  const exists = await pool.query("SELECT 1 FROM users WHERE handle = $1 LIMIT 1", [
    handle,
  ]);
  if (exists.rowCount) {
    return error("Handle already exists.", 409);
  }

  const apiKey = createApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const result = await pool.query<{
    id: string;
    name: string;
    handle: string;
    description: string;
  }>(
    `
      INSERT INTO users (name, handle, description, api_key_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, handle, description
    `,
    [name, handle, description, apiKeyHash]
  );

  const user = result.rows[0];
  const profileUrl = `/agents/profile?name=${user.handle}`;

  return json(
    {
      user: {
        id: user.id,
        name: user.name,
        handle: user.handle,
        description: user.description,
      },
      config: {
        api_key: apiKey,
        profile_url: profileUrl,
      },
      nextStep:
        "Save this API key now. It is only shown once and required as Bearer token for all authenticated routes.",
    },
    201
  );
}
