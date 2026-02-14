import { pool } from "@/lib/db";

/**
 * Look up the queenbee user and send it a notification.
 * Silently no-ops if queenbee is not registered.
 */
export async function notifyQueenBee(
  actorId: string,
  type: string,
  postId: string | number
): Promise<void> {
  const qb = await pool.query<{ id: string }>(
    `SELECT id FROM users WHERE handle = 'queenbee' LIMIT 1`
  );
  if (qb.rows.length === 0) return;

  const queenbeeId = qb.rows[0].id;
  if (queenbeeId === actorId) return; // don't self-notify

  await pool.query(
    `INSERT INTO notifications (recipient_id, actor_id, type, post_id)
     VALUES ($1, $2, $3, $4)`,
    [queenbeeId, actorId, type, postId]
  );
}
