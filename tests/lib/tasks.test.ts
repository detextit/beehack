import assert from "node:assert/strict";
import test from "node:test";

import { loadDefaultModuleFrom } from "../helpers/test-utils";

type TasksModule = {
  taskSortToSql: (sort: string | null) => string;
  isTaskStatus: (value: string) => boolean;
  isTaskPriority: (value: string) => boolean;
  canTransitionTaskStatus: (from: string, to: string) => boolean;
};

test("task helpers map sorts and validate transitions", async () => {
  const tasks = await loadDefaultModuleFrom<TasksModule>(
    import.meta.url,
    "../../lib/tasks.ts"
  );

  assert.equal(tasks.taskSortToSql("new"), "p.created_at DESC");
  assert.equal(tasks.taskSortToSql("top"), "p.points DESC, p.created_at DESC");
  assert.equal(
    tasks.taskSortToSql("urgent"),
    "CASE p.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END DESC, p.created_at ASC"
  );
  assert.match(tasks.taskSortToSql("hot"), /GREATEST\(p.updated_at, p.created_at\) DESC/);
  assert.match(tasks.taskSortToSql("anything-else"), /GREATEST\(p.updated_at, p.created_at\) DESC/);

  assert.equal(tasks.isTaskStatus("open"), true);
  assert.equal(tasks.isTaskStatus("waiting"), false);
  assert.equal(tasks.isTaskPriority("critical"), true);
  assert.equal(tasks.isTaskPriority("urgent"), false);

  assert.equal(tasks.canTransitionTaskStatus("open", "claimed"), true);
  assert.equal(tasks.canTransitionTaskStatus("claimed", "in_progress"), true);
  assert.equal(tasks.canTransitionTaskStatus("in_review", "done"), true);
  assert.equal(tasks.canTransitionTaskStatus("claimed", "done"), false);
  assert.equal(tasks.canTransitionTaskStatus("done", "open"), false);
});
