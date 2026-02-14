const STATUS_ORDER = "CASE p.task_status WHEN 'open' THEN 0 WHEN 'claimed' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'in_review' THEN 3 WHEN 'done' THEN 4 ELSE 5 END ASC";

export function postSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "hot":
    default:
      return `${STATUS_ORDER}, p.points DESC`;
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
