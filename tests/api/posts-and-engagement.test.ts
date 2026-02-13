import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type ApiUser = {
  id: string;
  name: string;
  handle: string;
  description: string;
};

type PostsRoute = {
  POST: (request: Request) => Promise<Response>;
  GET: (request: Request) => Promise<Response>;
};

type CommentsRoute = {
  POST: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;
};

type ClaimRoute = {
  POST: (
    request: Request,
    ctx: { params: Promise<{ id: string }> }
  ) => Promise<Response>;
};

type FollowRoute = {
  POST: (
    request: Request,
    ctx: { params: Promise<{ name: string }> }
  ) => Promise<Response>;
};

type MessagesRoute = {
  POST: (request: Request) => Promise<Response>;
};

const AUTH_QUERY_FRAGMENT = "WHERE api_key_hash = $1";

const authUser: ApiUser = {
  id: "user-1",
  name: "Route Tester",
  handle: "route_tester",
  description: "fixture",
};

function authHeaders() {
  return {
    authorization: "Bearer test_api_key",
    "content-type": "application/json",
  };
}

test("POST /api/posts creates a task post for an authenticated user", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<PostsRoute>(
    import.meta.url,
    "../../app/api/posts/route.ts"
  );

  const createdPost = {
    id: "101",
    title: "Refactor auth middleware",
    url: "https://github.com/org/repo/issues/42",
    content: "Replace token parsing logic",
    points: 50,
    task_status: "open" as const,
    created_at: "2026-02-12T12:00:00.000Z",
    deadline: null,
    acceptance_criteria: null,
    tests: null,
    assignment_mode: "owner_assigns",
  };

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (
      sql.includes(
        "INSERT INTO posts (author_id, title, url, content, points"
      )
    ) {
      return { rows: [createdPost], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        title: "Refactor auth middleware",
        description: "Replace token parsing logic",
        url: "https://github.com/org/repo/issues/42",
        points: 50,
      }),
    })
  );

  const payload = (await response.json()) as {
    id: string;
    title: string;
    author_handle: string;
    claimed_by_handle: string | null;
    comment_count: number;
  };

  assert.equal(response.status, 201);
  assert.equal(payload.id, "101");
  assert.equal(payload.author_handle, authUser.handle);
  assert.equal(payload.claimed_by_handle, null);
  assert.equal(payload.comment_count, 0);
  assert.equal(
    calls.some((call) =>
      call.sql.includes(
        "INSERT INTO posts (author_id, title, url, content, points"
      )
    ),
    true
  );
});

test("GET /api/posts applies hot sort with time-decay formula and clamps limit to 100", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<PostsRoute>(
    import.meta.url,
    "../../app/api/posts/route.ts"
  );

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("FROM posts p")) {
      return {
        rows: [
          {
            id: "10",
            title: "First task",
            url: null,
            content: "first",
            points: 5,
            task_status: "open",
            claimed_by_handle: null,
            created_at: "2026-02-12T10:00:00.000Z",
            author_handle: "alice",
            comment_count: "2",
            deadline: null,
            acceptance_criteria: null,
            tests: null,
            assignment_mode: "fcfs",
          },
          {
            id: "11",
            title: "Second task",
            url: null,
            content: "second",
            points: 3,
            task_status: "claimed",
            claimed_by_handle: "bob",
            created_at: "2026-02-12T09:00:00.000Z",
            author_handle: "carol",
            comment_count: "0",
            deadline: null,
            acceptance_criteria: null,
            tests: null,
            assignment_mode: "owner_assigns",
          },
        ],
        rowCount: 2,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.GET(
    new Request("http://localhost/api/posts?sort=hot&limit=500", {
      headers: {
        authorization: "Bearer test_api_key",
      },
    })
  );

  const payload = (await response.json()) as {
    sort: string;
    limit: number;
    items: Array<{ id: string; comment_count: number }>;
  };

  const postsQuery = calls.find((call) => call.sql.includes("FROM posts p"));
  assert.ok(postsQuery);

  assert.equal(response.status, 200);
  assert.equal(payload.sort, "hot");
  assert.equal(payload.limit, 100);
  assert.equal(payload.items[0].comment_count, 2);
  assert.equal(
    postsQuery.sql.includes("POWER(EXTRACT(EPOCH FROM"),
    true,
    "hot sort uses time-decay formula"
  );
  assert.equal(postsQuery.sql.includes("LIMIT 100"), true);
});

test("POST /api/posts/:id/comments rejects parent_id from another post", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<CommentsRoute>(
    import.meta.url,
    "../../app/api/posts/[id]/comments/route.ts"
  );

  installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT author_id FROM posts WHERE id = $1 LIMIT 1")) {
      return { rows: [{ author_id: "post-author-1" }], rowCount: 1 };
    }

    if (sql.includes("SELECT post_id FROM comments WHERE id = $1 LIMIT 1")) {
      return { rows: [{ post_id: "999" }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/posts/12/comments", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        content: "I can help with this",
        parent_id: 77,
      }),
    }),
    { params: Promise.resolve({ id: "12" }) }
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 400);
  assert.match(payload.error, /Invalid `parent_id`/i);
});

test("POST /api/posts/:id/claim returns 409 when already claimed by another user", async (t) => {
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
            id: "88",
            author_id: "post-author-1",
            task_status: "claimed",
            claimed_by: "user-2",
            assignment_mode: "fcfs",
          },
        ],
        rowCount: 1,
      };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/posts/88/claim", {
      method: "POST",
      headers: {
        authorization: "Bearer test_api_key",
      },
    }),
    { params: Promise.resolve({ id: "88" }) }
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 409);
  assert.match(payload.error, /already claimed/i);
  assert.equal(
    calls.some((call) => call.sql.includes("UPDATE posts")),
    false
  );
});

test("POST /api/users/:name/follow maps DB self-follow errors to 400", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<FollowRoute>(
    import.meta.url,
    "../../app/api/users/[name]/follow/route.ts"
  );

  installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id FROM users WHERE handle = $1 LIMIT 1")) {
      return { rows: [{ id: authUser.id }], rowCount: 1 };
    }

    if (sql.includes("INSERT INTO follows")) {
      throw new Error("no_self_follow");
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/users/route_tester/follow", {
      method: "POST",
      headers: {
        authorization: "Bearer test_api_key",
      },
    }),
    { params: Promise.resolve({ name: "route_tester" }) }
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 400);
  assert.match(payload.error, /Cannot follow yourself/i);
});

test("POST /api/messages returns 404 when recipient handle does not exist", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<MessagesRoute>(
    import.meta.url,
    "../../app/api/messages/route.ts"
  );

  installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes(AUTH_QUERY_FRAGMENT)) {
      return { rows: [authUser], rowCount: 1 };
    }

    if (sql.includes("SELECT id FROM users WHERE handle = $1 LIMIT 1")) {
      return { rows: [], rowCount: 0 };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/messages", {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        to_handle: "missing_user",
        content: "Can you take this task?",
      }),
    })
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 404);
  assert.match(payload.error, /Recipient not found/i);
});
