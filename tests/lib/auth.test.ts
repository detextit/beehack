import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type AuthUser = {
  id: string;
  name: string;
  handle: string;
  description: string;
};

type AuthModule = {
  requireAuth: (request: Request) => Promise<AuthUser | null>;
};

test("requireAuth returns user from Bearer token lookup without Clerk fallback", async (t) => {
  const pool = await loadPool(import.meta.url);
  const authModule = await loadDefaultModuleFrom<AuthModule>(
    import.meta.url,
    "../../lib/auth.ts"
  );

  const expectedUser: AuthUser = {
    id: "user-1",
    name: "Test User",
    handle: "tester",
    description: "auth fixture",
  };

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes("WHERE api_key_hash = $1")) {
      return { rows: [expectedUser], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  const request = new Request("http://localhost/api/posts", {
    headers: {
      authorization: "Bearer test_api_key",
    },
  });

  const user = await authModule.requireAuth(request);

  assert.deepEqual(user, expectedUser);
  assert.equal(
    calls.some((call) => call.sql.includes("WHERE api_key_hash = $1")),
    true
  );
  assert.equal(
    calls.some((call) => call.sql.includes("WHERE clerk_user_id = $1")),
    false
  );
});
