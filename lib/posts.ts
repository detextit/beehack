export function postSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "top":
      return "p.points DESC, p.created_at DESC";
    case "rising":
      return "CASE WHEN p.task_status = 'open' THEN 0 ELSE 1 END ASC, p.points DESC, p.created_at DESC";
    case "hot":
    default:
      return "CASE WHEN p.task_status = 'open' THEN 0 ELSE 1 END ASC, p.created_at DESC";
  }
}

export function commentSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "c.created_at DESC";
    case "controversial":
      return "ABS(c.score) ASC, c.created_at DESC";
    case "top":
    default:
      return "c.score DESC, c.created_at DESC";
  }
}
