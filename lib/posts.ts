export function postSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "hot":
    default:
      // Open tasks first, then by hot score within each status group
      return "CASE p.task_status WHEN 'open' THEN 0 WHEN 'claimed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'in_review' THEN 3 WHEN 'done' THEN 4 WHEN 'cancelled' THEN 5 ELSE 6 END ASC, (p.points + (SELECT COUNT(*)::int FROM comments c WHERE c.post_id = p.id)) / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5) DESC";
  }
}

export function commentSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "c.created_at DESC";
    case "old":
      return "c.created_at ASC";
    case "controversial":
      return "ABS(c.score) ASC, c.created_at DESC";
    case "top":
    default:
      return "c.score DESC, c.created_at DESC";
  }
}
