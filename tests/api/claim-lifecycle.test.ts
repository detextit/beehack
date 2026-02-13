import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type ApiUser = {
  id: string;
  name: string;
  handle: string;
  description: string;
};

type ClaimRoute = {
  POST: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;
};

const AUTH_QUERY_FRAGMENT = "WHERE api_key_hash = $1";

const authUser: ApiUser = {
  id: "user-1",
  name: "Claimer",
  handle: "claimer",
  description: "fixture",
};

test("POST /api/posts/:id/claim rejects cancelled tasks", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<ClaimRoute>(
    import.meta.url,
    "../../app/api/posts/[id]/claim/route.ts"
  );

  installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id, author_id, task_status, claimed_by")) {
      return {
        rows: [
          {
            id: "50",
            author_id: "post-author-1",
            task_status: "cancelled",
            claimed_by: null,
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/posts/50/claim", {
      method: "POST",
      headers: { authorization: "Bearer test_api_key" },
    }),
    { params: Promise.resolve({ id: "50" }) }
  );

  const payload = (await response.json()) as { error: string };
  assert.equal(response.status, 409);
  assert.match(payload.error, /cancelled/i);
});

test("POST /api/posts/:id/claim rejects done tasks", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<ClaimRoute>(
    import.meta.url,
    "../../app/api/posts/[id]/claim/route.ts"
  );

  installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id, author_id, task_status, claimed_by")) {
      return {
        rows: [
          {
            id: "51",
            author_id: "post-author-1",
            task_status: "done",
            claimed_by: "user-2",
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/posts/51/claim", {
      method: "POST",
      headers: { authorization: "Bearer test_api_key" },
    }),
    { params: Promise.resolve({ id: "51" }) }
  );

  const payload = (await response.json()) as { error: string };
  assert.equal(response.status, 409);
  assert.match(payload.error, /done/i);
});

test("POST /api/posts/:id/claim succeeds for open tasks", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<ClaimRoute>(
    import.meta.url,
    "../../app/api/posts/[id]/claim/route.ts"
  );

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id, author_id, task_status, claimed_by")) {
      return {
        rows: [
          {
            id: "52",
            author_id: "post-author-1",
            task_status: "open",
            claimed_by: null,
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes("UPDATE posts")) {
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("INSERT INTO notifications")) {
      return { rows: [], rowCount: 1 };
    }

    // Final SELECT for response
    if (sql.includes("p.id") && sql.includes("claimant.handle")) {
      return {
        rows: [
          {
            id: "52",
            title: "Test task",
            task_status: "claimed",
            claimed_by_handle: authUser.handle,
            claimed_at: "2026-02-12T12:00:00.000Z",
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/posts/52/claim", {
      method: "POST",
      headers: { authorization: "Bearer test_api_key" },
    }),
    { params: Promise.resolve({ id: "52" }) }
  );

  const payload = (await response.json()) as {
    ok: boolean;
    item: { id: string; task_status: string; claimed_by_handle: string };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.item.task_status, "claimed");
  assert.equal(payload.item.claimed_by_handle, authUser.handle);

  // Verify UPDATE was issued
  assert.equal(
    calls.some((call) => call.sql.includes("UPDATE posts")),
    true
  );

  // Verify notification was created (different author)
  assert.equal(
    calls.some((call) => call.sql.includes("INSERT INTO notifications")),
    true
  );
});
