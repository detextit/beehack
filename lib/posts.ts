export function postSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "hot":
    default:
      return "(p.points + (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id)) / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.5) DESC";
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
