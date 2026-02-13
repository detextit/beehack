export const TASK_STATUSES = [
  "open",
  "claimed",
  "in_progress",
  "in_review",
  "done",
  "cancelled",
] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type TaskSort = "hot" | "new" | "top" | "urgent";

const priorityRankSql =
  "CASE p.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END";

const lifecycleTransitions: Record<TaskStatus, TaskStatus[]> = {
  open: ["claimed"],
  claimed: ["in_progress", "cancelled"],
  in_progress: ["in_review", "cancelled"],
  in_review: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export function taskSortToSql(sort: string | null) {
  switch (sort) {
    case "new":
      return "p.created_at DESC";
    case "top":
      return "p.points DESC, p.created_at DESC";
    case "urgent":
      return `${priorityRankSql} DESC, p.created_at ASC`;
    case "hot":
    default:
      return `CASE WHEN p.task_status IN ('done', 'cancelled') THEN 1 ELSE 0 END ASC, ${priorityRankSql} DESC, GREATEST(p.updated_at, p.created_at) DESC`;
  }
}

export function isTaskStatus(value: string): value is TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus);
}

export function isTaskPriority(value: string): value is TaskPriority {
  return TASK_PRIORITIES.includes(value as TaskPriority);
}

export function canTransitionTaskStatus(from: TaskStatus, to: TaskStatus) {
  return lifecycleTransitions[from].includes(to);
}
