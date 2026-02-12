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
  if (token) {
    const tokenHash = hashApiKey(token);
    const tokenResult = await pool.query<AuthUser>(
      `
        SELECT id, name, handle, description
        FROM users
        WHERE api_key_hash = $1
        LIMIT 1
      `,
      [tokenHash]
    );

    if (tokenResult.rows[0]) {
      return tokenResult.rows[0];
    }
  }

  return null;
}
