import assert from "node:assert/strict";
import test from "node:test";

import { loadDefaultModuleFrom } from "../helpers/test-utils";

type SecurityModule = {
  createApiKey: () => string;
  hashApiKey: (apiKey: string) => string;
  extractBearerToken: (authHeader: string | null) => string | null;
};

type PostsModule = {
  postSortToSql: (sort: string | null) => string;
  commentSortToSql: (sort: string | null) => string;
};

test("security helpers generate and parse API keys correctly", async () => {
  const security = await loadDefaultModuleFrom<SecurityModule>(
    import.meta.url,
    "../../lib/security.ts"
  );

  const apiKey = security.createApiKey();
  assert.match(apiKey, /^bhv_[a-f0-9]{48}$/);

  const hash = security.hashApiKey(apiKey);
  assert.equal(hash.length, 64);
  assert.equal(hash, security.hashApiKey(apiKey));
  assert.notEqual(hash, security.hashApiKey(`${apiKey}_different`));

  assert.equal(
    security.extractBearerToken("Bearer secret_token"),
    "secret_token"
  );
  assert.equal(security.extractBearerToken("Basic abc123"), null);
  assert.equal(security.extractBearerToken(null), null);
});

test("postSortToSql: 'new' sorts by created_at descending without status ordering", async () => {
  const posts = await loadDefaultModuleFrom<PostsModule>(
    import.meta.url,
    "../../lib/posts.ts"
  );

  const sql = posts.postSortToSql("new");
  assert.ok(sql.includes("p.created_at DESC"), "should sort by created_at descending");
  assert.ok(!sql.includes("CASE p.task_status"), "should not include status ordering");
});

test("postSortToSql: 'hot' sorts by status then points", async () => {
  const posts = await loadDefaultModuleFrom<PostsModule>(
    import.meta.url,
    "../../lib/posts.ts"
  );

  const sql = posts.postSortToSql("hot");

  // Status ordering comes first
  assert.ok(sql.includes("CASE p.task_status"), "should include status ordering");
  assert.ok(sql.includes("p.points DESC"), "should sort by points descending");
  assert.ok(
    sql.indexOf("CASE p.task_status") < sql.indexOf("p.points DESC"),
    "status ordering should come before points"
  );

  // Verify status priority: open < claimed < in_progress < in_review < done
  const openIdx = sql.indexOf("'open'");
  const claimedIdx = sql.indexOf("'claimed'");
  const inProgressIdx = sql.indexOf("'in_progress'");
  const inReviewIdx = sql.indexOf("'in_review'");
  const doneIdx = sql.indexOf("'done'");
  assert.ok(openIdx < claimedIdx, "open should come before claimed");
  assert.ok(claimedIdx < inProgressIdx, "claimed should come before in_progress");
  assert.ok(inProgressIdx < inReviewIdx, "in_progress should come before in_review");
  assert.ok(inReviewIdx < doneIdx, "in_review should come before done");
});

test("postSortToSql: unknown and null sorts fall back to hot", async () => {
  const posts = await loadDefaultModuleFrom<PostsModule>(
    import.meta.url,
    "../../lib/posts.ts"
  );

  const hotSql = posts.postSortToSql("hot");
  assert.equal(posts.postSortToSql("not-a-real-sort"), hotSql, "unknown sort falls back to hot");
  assert.equal(posts.postSortToSql(null), hotSql, "null sort falls back to hot");
});

test("commentSortToSql: maps known sorts and falls back to top", async () => {
  const posts = await loadDefaultModuleFrom<PostsModule>(
    import.meta.url,
    "../../lib/posts.ts"
  );

  const newSql = posts.commentSortToSql("new");
  assert.ok(newSql.includes("c.created_at DESC"), "'new' sorts by created_at descending");

  const oldSql = posts.commentSortToSql("old");
  assert.ok(oldSql.includes("c.created_at ASC"), "'old' sorts by created_at ascending");

  const controversialSql = posts.commentSortToSql("controversial");
  assert.ok(controversialSql.includes("ABS(c.score)"), "'controversial' uses absolute score");

  const topSql = posts.commentSortToSql("top");
  assert.ok(topSql.includes("c.score DESC"), "'top' sorts by score descending");

  assert.equal(
    posts.commentSortToSql("unknown"),
    topSql,
    "unknown sort falls back to top"
  );
});
