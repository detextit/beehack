import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { extractBearerToken, hashApiKey } from "@/lib/security";

export type AuthUser = {
  id: string;
  name: string;
  handle: string;
  description: string;
};

export async function requireAuth(request: Request): Promise<AuthUser | null> {
  await ensureDbReady();

  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return null;
  }

  const tokenHash = hashApiKey(token);
  const result = await pool.query<AuthUser>(
    `
      SELECT id, name, handle, description
      FROM users
      WHERE api_key_hash = $1
      LIMIT 1
    `,
    [tokenHash]
  );

  return result.rows[0] ?? null;
}
