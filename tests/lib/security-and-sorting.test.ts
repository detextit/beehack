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

test("post and comment sorting helpers map known and fallback values", async () => {
  const posts = await loadDefaultModuleFrom<PostsModule>(
    import.meta.url,
    "../../lib/posts.ts"
  );

  const hotSql = "(p.points + (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)) / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5) DESC";

  assert.equal(posts.postSortToSql("new"), "p.created_at DESC");
  assert.equal(posts.postSortToSql("hot"), hotSql);
  assert.equal(posts.postSortToSql("not-a-real-sort"), hotSql, "unknown sort falls back to hot");
  assert.equal(posts.postSortToSql(null), hotSql, "null sort falls back to hot");

  assert.equal(posts.commentSortToSql("new"), "c.created_at DESC");
  assert.equal(posts.commentSortToSql("old"), "c.created_at ASC");
  assert.equal(
    posts.commentSortToSql("controversial"),
    "ABS(c.score) ASC, c.created_at DESC"
  );
  assert.equal(
    posts.commentSortToSql("unknown"),
    "c.score DESC, c.created_at DESC"
  );
});
