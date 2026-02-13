import assert from "node:assert/strict";
import test from "node:test";

import { installQueryMock, loadDefaultModuleFrom, loadPool } from "../helpers/test-utils";

type SchemaModule = {
  initializeSchema: () => Promise<void>;
};

test("initializeSchema adds lifecycle columns to posts table", async (t) => {
  const pool = await loadPool(import.meta.url);
  const schema = await loadDefaultModuleFrom<SchemaModule>(
    import.meta.url,
    "../../lib/schema.ts"
  );

  const calls = installQueryMock(t, pool, () => ({ rows: [], rowCount: 0 }));

  await schema.initializeSchema();

  const sqlText = calls.map((call) => call.sql);

  // New lifecycle columns
  const expectedColumns = [
    "priority",
    "labels",
    "repo_url",
    "branch",
    "pr_url",
    "completed_at",
    "estimated_effort",
    "parent_task_id",
  ];

  for (const col of expectedColumns) {
    assert.equal(
      sqlText.some((sql) =>
        sql.includes(`ADD COLUMN IF NOT EXISTS ${col}`)
      ),
      true,
      `Missing ALTER TABLE for column: ${col}`
    );
  }
});

test("initializeSchema updates task_status constraint with all lifecycle states", async (t) => {
  const pool = await loadPool(import.meta.url);
  const schema = await loadDefaultModuleFrom<SchemaModule>(
    import.meta.url,
    "../../lib/schema.ts"
  );

  const calls = installQueryMock(t, pool, () => ({ rows: [], rowCount: 0 }));

  await schema.initializeSchema();

  const sqlText = calls.map((call) => call.sql);

  // Verify task_status constraint includes all lifecycle states
  const statusConstraint = sqlText.find(
    (sql) =>
      sql.includes("posts_task_status_check") &&
      sql.includes("ADD CONSTRAINT")
  );
  assert.ok(statusConstraint, "Missing posts_task_status_check ADD CONSTRAINT");
  assert.ok(statusConstraint.includes("in_progress"), "Missing in_progress status");
  assert.ok(statusConstraint.includes("in_review"), "Missing in_review status");
  assert.ok(statusConstraint.includes("cancelled"), "Missing cancelled status");
  assert.ok(statusConstraint.includes("open"), "Missing open status");
  assert.ok(statusConstraint.includes("claimed"), "Missing claimed status");
  assert.ok(statusConstraint.includes("done"), "Missing done status");

  // Verify old constraint is dropped before adding new one
  const dropIdx = sqlText.findIndex(
    (sql) =>
      sql.includes("DROP CONSTRAINT IF EXISTS posts_task_status_check")
  );
  const addIdx = sqlText.findIndex(
    (sql) =>
      sql.includes("ADD CONSTRAINT posts_task_status_check") &&
      sql.includes("in_progress")
  );
  assert.ok(dropIdx >= 0, "Missing DROP CONSTRAINT for task_status");
  assert.ok(addIdx > dropIdx, "ADD CONSTRAINT must come after DROP CONSTRAINT");
});

test("initializeSchema adds priority constraint", async (t) => {
  const pool = await loadPool(import.meta.url);
  const schema = await loadDefaultModuleFrom<SchemaModule>(
    import.meta.url,
    "../../lib/schema.ts"
  );

  const calls = installQueryMock(t, pool, () => ({ rows: [], rowCount: 0 }));

  await schema.initializeSchema();

  const sqlText = calls.map((call) => call.sql);

  const priorityConstraint = sqlText.find(
    (sql) =>
      sql.includes("posts_priority_check") &&
      sql.includes("ADD CONSTRAINT")
  );
  assert.ok(priorityConstraint, "Missing posts_priority_check constraint");
  assert.ok(priorityConstraint.includes("low"), "Missing low priority");
  assert.ok(priorityConstraint.includes("medium"), "Missing medium priority");
  assert.ok(priorityConstraint.includes("high"), "Missing high priority");
  assert.ok(priorityConstraint.includes("critical"), "Missing critical priority");
});

test("initializeSchema creates parent_task_id index", async (t) => {
  const pool = await loadPool(import.meta.url);
  const schema = await loadDefaultModuleFrom<SchemaModule>(
    import.meta.url,
    "../../lib/schema.ts"
  );

  const calls = installQueryMock(t, pool, () => ({ rows: [], rowCount: 0 }));

  await schema.initializeSchema();

  const sqlText = calls.map((call) => call.sql);

  assert.equal(
    sqlText.some((sql) =>
      sql.includes("CREATE INDEX IF NOT EXISTS posts_parent_task_id_idx")
    ),
    true,
    "Missing parent_task_id index"
  );
});
