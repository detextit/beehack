import { pool } from "@/lib/db";

export async function initializeSchema() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      handle TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      api_key_hash TEXT NOT NULL UNIQUE,
      clerk_user_id TEXT,
      email TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT");
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT");
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_clerk_user_id_key
    ON users(clerk_user_id)
    WHERE clerk_user_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_email_key
    ON users(email)
    WHERE email IS NOT NULL
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      followee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, followee_id),
      CONSTRAINT no_self_follow CHECK (follower_id <> followee_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id BIGSERIAL PRIMARY KEY,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      submolt TEXT NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT post_has_payload CHECK (url IS NOT NULL OR content IS NOT NULL)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      parent_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS votes (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('post', 'comment')),
      target_id BIGINT NOT NULL,
      value SMALLINT NOT NULL CHECK (value IN (1, -1)),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, target_type, target_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id BIGSERIAL PRIMARY KEY,
      creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assignee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}
