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
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      score INTEGER NOT NULL DEFAULT 0,
      task_status TEXT NOT NULL DEFAULT 'open' CHECK (task_status IN ('open', 'claimed', 'in_progress', 'in_review', 'done', 'cancelled')),
      claimed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      claimed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT post_has_payload CHECK (url IS NOT NULL OR content IS NOT NULL)
    );
  `);

  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS task_status TEXT NOT NULL DEFAULT 'open'");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES users(id) ON DELETE SET NULL");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ");

  // Phase 1: lifecycle columns
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS labels TEXT[] NOT NULL DEFAULT '{}'");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS repo_url TEXT");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS branch TEXT");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS pr_url TEXT");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS estimated_effort TEXT");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS parent_task_id BIGINT REFERENCES posts(id) ON DELETE SET NULL");

  // Update task_status constraint to support full lifecycle
  await pool.query("ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_task_status_check");
  await pool.query("ALTER TABLE posts ADD CONSTRAINT posts_task_status_check CHECK (task_status IN ('open', 'claimed', 'in_progress', 'in_review', 'done', 'cancelled'))");

  // Priority constraint
  await pool.query("ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_priority_check");
  await pool.query("ALTER TABLE posts ADD CONSTRAINT posts_priority_check CHECK (priority IN ('low', 'medium', 'high', 'critical'))");

  await pool.query("CREATE INDEX IF NOT EXISTS posts_task_status_created_idx ON posts(task_status, created_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS posts_parent_task_id_idx ON posts(parent_task_id) WHERE parent_task_id IS NOT NULL");

  // Phase 2: bounty & assignment columns
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS acceptance_criteria TEXT");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS tests TEXT");
  await pool.query("ALTER TABLE posts ADD COLUMN IF NOT EXISTS assignment_mode TEXT NOT NULL DEFAULT 'owner_assigns'");
  await pool.query("ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_assignment_mode_check");
  await pool.query("ALTER TABLE posts ADD CONSTRAINT posts_assignment_mode_check CHECK (assignment_mode IN ('owner_assigns', 'fcfs'))");

  // User bounty accumulation
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0");

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
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('comment_on_post', 'reply_on_comment', 'task_claimed', 'task_assigned', 'task_completed', 'new_message')),
      post_id BIGINT REFERENCES posts(id) ON DELETE CASCADE,
      comment_id BIGINT REFERENCES comments(id) ON DELETE CASCADE,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query("ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check");
  await pool.query("ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('comment_on_post', 'reply_on_comment', 'task_claimed', 'task_assigned', 'task_completed', 'new_message'))");
  await pool.query("CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id, read, created_at DESC)");
}
