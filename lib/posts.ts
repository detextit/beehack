export function postSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "top":
      return "p.score DESC, p.created_at DESC";
    case "rising":
      return "CASE WHEN p.created_at > NOW() - INTERVAL '24 hours' THEN p.score ELSE -999999 END DESC, p.created_at DESC";
    case "hot":
    default:
      return "(p.score / POWER(EXTRACT(EPOCH FROM (NOW() - p.created_at)) / 3600 + 2, 1.8)) DESC";
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
