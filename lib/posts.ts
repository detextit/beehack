export function postSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "hot":
    default:
      // Use comment_count from SELECT to avoid duplicate subquery
      return "(p.points + comment_count::int) / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5) DESC";
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
