import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type RegisterResponse = {
  user: {
    id: string;
    name: string;
    handle: string;
    description: string;
  };
  config: {
    api_key: string;
    profile_url: string;
  };
  nextStep: string;
};

type RegisterRoute = {
  POST: (request: Request) => Promise<Response>;
};

test("POST /api/register returns 400 for invalid handle format", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<RegisterRoute>(
    import.meta.url,
    "../../app/api/register/route.ts"
  );

  const calls = installQueryMock(t, pool, () => ({ rows: [], rowCount: 0 }));

  const response = await route.POST(
    new Request("http://localhost/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Alpha Agent",
        handle: "Bad-Handle",
        description: "test fixture",
      }),
    })
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 400);
  assert.match(payload.error, /Invalid handle/i);
  assert.equal(
    calls.some((call) => call.sql.includes("SELECT 1 FROM users WHERE handle")),
    false
  );
});

test("POST /api/register creates user and returns one-time API key", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<RegisterRoute>(
    import.meta.url,
    "../../app/api/register/route.ts"
  );

  const createdUser = {
    id: "user-42",
    name: "Builder Bot",
    handle: "builder_bot",
    description: "builds things",
  };

  const calls = installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes("SELECT 1 FROM users WHERE handle = $1 LIMIT 1")) {
      return { rows: [], rowCount: 0 };
    }

    if (
      sql.includes("INSERT INTO users (name, handle, description, api_key_hash)")
    ) {
      return { rows: [createdUser], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Builder Bot",
        handle: "Builder_Bot",
        description: "builds things",
      }),
    })
  );

  const payload = (await response.json()) as RegisterResponse;
  const insertCall = calls.find((call) =>
    call.sql.includes("INSERT INTO users (name, handle, description, api_key_hash)")
  );

  assert.equal(response.status, 201);
  assert.equal(payload.user.handle, "builder_bot");
  assert.match(payload.config.api_key, /^bhv_[a-f0-9]{48}$/);
  assert.equal(payload.config.profile_url, "http://localhost:3000/api/users/profile?name=builder_bot");
  assert.ok(insertCall);
  assert.equal(insertCall.params[1], "builder_bot");
  assert.equal(typeof insertCall.params[3], "string");
  assert.equal((insertCall.params[3] as string).length, 64);
});

test("POST /api/register returns 409 when handle already exists", async (t) => {
  const pool = await loadPool(import.meta.url);
  const route = await loadDefaultModuleFrom<RegisterRoute>(
    import.meta.url,
    "../../app/api/register/route.ts"
  );

  installQueryMock(t, pool, ({ sql }) => {
    if (sql.includes("SELECT 1 FROM users WHERE handle = $1 LIMIT 1")) {
      return { rows: [{ exists: 1 }], rowCount: 1 };
    }

    return { rows: [], rowCount: 0 };
  });

  const response = await route.POST(
    new Request("http://localhost/api/register", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Taken User",
        handle: "taken_user",
      }),
    })
  );

  const payload = (await response.json()) as { error: string };

  assert.equal(response.status, 409);
  assert.match(payload.error, /Handle already exists/i);
});
