import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type TasksRoute = {
  GET: (request: Request) => Promise<Response>;
};

type TaskRoute = {
  PATCH: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;
};

type ApiUser = {
  id: string;
  name: string;
  handle: string;
  description: string;
};

const AUTH_QUERY_FRAGMENT = "WHERE api_key_hash = $1";

const authUser: ApiUser = {
  id: "user-7",
  name: "Task Tester",
  handle: "task_tester",
  description: "fixture",
};

test("GET /api/tasks applies status, labels, priority filters and urgent sorting", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<TasksRoute>(
    import.meta.url,
    "../../app/api/tasks/route.ts"
  );

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes("FROM posts p")) {
      return {
        rows: [
          {
            id: "21",
            title: "Build board",
            url: "https://github.com/detextit/beehack",
            content: "Implement task board",
            points: 100,
            task_status: "in_progress",
            priority: "high",
            labels: ["frontend", "board"],
            repo_url: null,
            branch: null,
            pr_url: null,
            claimed_by_handle: "task_tester",
            claimed_at: "2026-02-13T00:00:00.000Z",
            completed_at: null,
            estimated_effort: "4h",
            created_at: "2026-02-13T00:00:00.000Z",
            updated_at: "2026-02-13T02:00:00.000Z",
            author_handle: "owner",
            comment_count: "3",
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.GET(
    new Request(
      "http://localhost/api/tasks?sort=urgent&status=in_progress&priority=high&labels=frontend,api&limit=999"
    )
  );

  const payload = (await response.json()) as {
    sort: string;
    limit: number;
    filters: { labels: string[] };
    items: Array<{ id: string; comment_count: number }>;
  };

  const query = calls.find((call) => call.sql.includes("FROM posts p"));
  assert.ok(query);

  assert.equal(response.status, 200);
  assert.equal(payload.sort, "urgent");
  assert.equal(payload.limit, 100);
  assert.deepEqual(payload.filters.labels, ["frontend", "api"]);
  assert.equal(payload.items[0].id, "21");
  assert.equal(payload.items[0].comment_count, 3);
  assert.equal(query.sql.includes("p.task_status = $1"), true);
  assert.equal(query.sql.includes("p.priority = $2"), true);
  assert.equal(
    query.sql.includes("lower(label) = ANY($3::text[])"),
    true
  );
  assert.equal(
    query.sql.includes(
      "CASE p.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, p.created_at ASC"
    ),
    true
  );
  assert.equal(query.sql.includes("LIMIT 100"), true);
  assert.deepEqual(query.params, ["in_progress", "high", ["frontend", "api"]]);
});

test("PATCH /api/tasks/:id transitions claimed to in_progress for assignee", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<TaskRoute>(
    import.meta.url,
    "../../app/api/tasks/[id]/route.ts"
  );

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id, author_id, claimed_by, task_status")) {
      return {
        rows: [
          {
            id: "20",
            author_id: "owner-id",
            claimed_by: authUser.id,
            task_status: "claimed",
          },
        ],
        rowCount: 1,
      };
    }

    if (sql.includes("UPDATE posts")) {
      return { rows: [], rowCount: 1 };
    }

    if (sql.includes("FROM posts p") && sql.includes("WHERE p.id = $1")) {
      return {
        rows: [
          {
            id: "20",
            title: "Task filtering endpoint",
            url: "https://github.com/detextit/beehack",
            content: "Add status filters",
            points: 80,
            task_status: "in_progress",
            priority: "high",
            labels: ["api"],
            repo_url: null,
            branch: null,
            pr_url: null,
            claimed_by_handle: authUser.handle,
            claimed_at: "2026-02-13T00:00:00.000Z",
            completed_at: null,
            estimated_effort: null,
            created_at: "2026-02-13T00:00:00.000Z",
            updated_at: "2026-02-13T03:00:00.000Z",
            author_handle: "owner",
            comment_count: "0",
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.PATCH(
    new Request("http://localhost/api/tasks/20", {
      method: "PATCH",
      headers: {
        authorization: "Bearer test_api_key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "in_progress",
      }),
    }),
    { params: Promise.resolve({ id: "20" }) }
  );

  const payload = (await response.json()) as {
    ok: boolean;
    item: { task_status: string };
  };

  assert.equal(response.status, 200);
  assert.equal(payload.ok, true);
  assert.equal(payload.item.task_status, "in_progress");
  assert.equal(
    calls.some((call) => call.sql.includes("SET task_status = $2, updated_at = NOW()")),
    true
  );
});

test("PATCH /api/tasks/:id rejects invalid lifecycle transition", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<TaskRoute>(
    import.meta.url,
    "../../app/api/tasks/[id]/route.ts"
  );

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id, author_id, claimed_by, task_status")) {
      return {
        rows: [
          {
            id: "20",
            author_id: "owner-id",
            claimed_by: authUser.id,
            task_status: "claimed",
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.PATCH(
    new Request("http://localhost/api/tasks/20", {
      method: "PATCH",
      headers: {
        authorization: "Bearer test_api_key",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        status: "done",
      }),
    }),
    { params: Promise.resolve({ id: "20" }) }
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 409);
  assert.match(payload.error, /invalid status transition/i);
  assert.equal(
    calls.some((call) => call.sql.includes("UPDATE posts")),
    false
  );
});
