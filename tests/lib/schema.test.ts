import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type SchemaModule = {
  initializeSchema: () => Promise<void>;
};

test("initializeSchema issues required table and index DDL statements", async (t) => {
  const pool = await loadPool(import.meta.url);
  const schema = await loadDefaultModuleFrom<SchemaModule>(
    import.meta.url,
    "../../lib/schema.ts"
  );

  const calls = installQueryMock(t, pool, () => ({ rows: [], rowCount: 0 }));

  await schema.initializeSchema();

  const sqlText = calls.map((call) => call.sql);

  assert.equal(
    sqlText.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS users")),
    true
  );
  assert.equal(
    sqlText.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS follows")),
    true
  );
  assert.equal(
    sqlText.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS posts")),
    true
  );
  assert.equal(
    sqlText.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS comments")),
    true
  );
  assert.equal(
    sqlText.some((sql) => sql.includes("CREATE TABLE IF NOT EXISTS messages")),
    true
  );
  assert.equal(
    sqlText.some((sql) =>
      sql.includes("CREATE INDEX IF NOT EXISTS posts_task_status_created_idx")
    ),
    true
  );
});
