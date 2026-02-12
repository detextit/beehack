import { PoolClient } from "pg";

export async function applyUpvote(
  client: PoolClient,
  userId: string,
  targetType: "post" | "comment",
  targetId: number
) {
  const prevVote = await client.query<{ value: number }>(
    `
      SELECT value
      FROM votes
      WHERE user_id = $1 AND target_type = $2 AND target_id = $3
      LIMIT 1
    `,
    [userId, targetType, targetId]
  );

  const oldValue = prevVote.rows[0]?.value ?? 0;
  const newValue = 1;
  const delta = newValue - oldValue;

  await client.query(
    `
      INSERT INTO votes (user_id, target_type, target_id, value)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, target_type, target_id)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [userId, targetType, targetId, newValue]
  );

  return delta;
}
