"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, Filter, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RegisterDialog } from "@/components/beehack/register-dialog"

type TaskStatus = "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled"
type TaskPriority = "low" | "medium" | "high" | "critical"
type SortType = "hot" | "new" | "top" | "urgent"

type Task = {
  id: string
  title: string
  url: string | null
  content: string | null
  points: number
  task_status: TaskStatus
  priority: TaskPriority
  labels: string[]
  repo_url: string | null
  branch: string | null
  pr_url: string | null
  claimed_by_handle: string | null
  claimed_at: string | null
  completed_at: string | null
  estimated_effort: string | null
  created_at: string
  updated_at: string
  author_handle: string
  comment_count: number
}

const boardStatuses: Array<{
  id: Exclude<TaskStatus, "cancelled">
  title: string
  subtitle: string
}> = [
  { id: "open", title: "Open", subtitle: "Needs assignment" },
  { id: "claimed", title: "Claimed", subtitle: "Assigned and queued" },
  { id: "in_progress", title: "In Progress", subtitle: "Actively building" },
  { id: "in_review", title: "In Review", subtitle: "Waiting verification" },
  { id: "done", title: "Done", subtitle: "Completed work" },
]

const sortOptions: SortType[] = ["hot", "new", "top", "urgent"]

const transitionMap: Record<TaskStatus, TaskStatus[]> = {
  open: ["claimed"],
  claimed: ["in_progress", "cancelled"],
  in_progress: ["in_review", "cancelled"],
  in_review: ["done", "cancelled"],
  done: [],
  cancelled: [],
}

const statusClass: Record<TaskStatus, string> = {
  open: "border-emerald-200 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300",
  claimed: "border-amber-200 bg-amber-50/70 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300",
  in_progress: "border-sky-200 bg-sky-50/70 text-sky-800 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300",
  in_review: "border-indigo-200 bg-indigo-50/70 text-indigo-800 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300",
  done: "border-zinc-200 bg-zinc-50/80 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300",
  cancelled: "border-rose-200 bg-rose-50/70 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300",
}

const priorityClass: Record<TaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-200",
  medium: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
  critical: "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200",
}

function getStoredKey() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehack_api_key") ?? ""
}

function getStoredHandle() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehack_handle") ?? ""
}

function timeAgo(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value))
}

function parseLabelsFilter(raw: string) {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((label) => label.trim().toLowerCase())
        .filter(Boolean)
    )
  )
}

export function TaskBoardPage() {
  const [apiKey, setApiKey] = useState(getStoredKey)
  const [myHandle, setMyHandle] = useState(getStoredHandle)
  const [tasks, setTasks] = useState<Task[]>([])
  const [sort, setSort] = useState<SortType>("hot")
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all")
  const [labelsFilter, setLabelsFilter] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadTick, setReloadTick] = useState(0)
  const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null)
  const [showRegister, setShowRegister] = useState(false)
  const [registerReason, setRegisterReason] = useState("")

  const parsedLabels = useMemo(() => parseLabelsFilter(labelsFilter), [labelsFilter])

  useEffect(() => {
    const onAuthChange = () => {
      setApiKey(getStoredKey())
      setMyHandle(getStoredHandle())
    }
    window.addEventListener("beehack:auth-changed", onAuthChange)
    return () => window.removeEventListener("beehack:auth-changed", onAuthChange)
  }, [])

  useEffect(() => {
    const fetchTasks = async () => {
      setLoading(true)
      setError("")

      const params = new URLSearchParams({
        sort,
        limit: "100",
      })

      if (statusFilter !== "all") {
        params.set("status", statusFilter)
      }

      if (priorityFilter !== "all") {
        params.set("priority", priorityFilter)
      }

      if (parsedLabels.length > 0) {
        params.set("labels", parsedLabels.join(","))
      }

      try {
        const headers: HeadersInit = {}
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`

        const response = await fetch(`/api/tasks?${params.toString()}`, {
          headers,
          cache: "no-store",
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "Failed to load tasks")
        }

        const payload = await response.json()
        setTasks(payload.items ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tasks")
        setTasks([])
      } finally {
        setLoading(false)
      }
    }

    void fetchTasks()
  }, [apiKey, sort, statusFilter, priorityFilter, parsedLabels, reloadTick])

  const tasksByStatus = useMemo(() => {
    const grouped: Record<Exclude<TaskStatus, "cancelled">, Task[]> = {
      open: [],
      claimed: [],
      in_progress: [],
      in_review: [],
      done: [],
    }

    for (const task of tasks) {
      if (task.task_status === "cancelled") continue
      grouped[task.task_status].push(task)
    }

    return grouped
  }, [tasks])

  const cancelledCount = useMemo(
    () => tasks.filter((task) => task.task_status === "cancelled").length,
    [tasks]
  )

  const canEditTask = (task: Task) => {
    if (!myHandle) return false
    const me = myHandle.toLowerCase()
    return task.author_handle.toLowerCase() === me || task.claimed_by_handle?.toLowerCase() === me
  }

  const requireAuth = (reason: string, action: () => void) => {
    if (apiKey) {
      action()
      return
    }

    setRegisterReason(reason)
    setShowRegister(true)
  }

  const updateTaskStatus = (task: Task, nextStatus: TaskStatus) => {
    requireAuth("Register to update task status.", async () => {
      setUpdatingTaskId(task.id)
      setError("")

      try {
        const response = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ status: nextStatus }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "Failed to update task")
        }

        setReloadTick((value) => value + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update task")
      } finally {
        setUpdatingTaskId(null)
      }
    })
  }

  const clearFilters = () => {
    setStatusFilter("all")
    setPriorityFilter("all")
    setLabelsFilter("")
  }

  const handleRegistered = (newKey: string) => {
    setApiKey(newKey)
    window.dispatchEvent(new CustomEvent("beehack:auth-changed"))
  }

  return (
    <main className="mx-auto w-full max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-2xl border border-ink bg-[linear-gradient(140deg,rgba(2,132,199,0.08),rgba(234,179,8,0.08)_45%,rgba(30,64,175,0.12))] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Task Board</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Lifecycle view with status columns and filterable priorities/labels.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setReloadTick((value) => value + 1)}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_220px_1fr_auto]">
          <div className="space-y-1">
            <label htmlFor="labels-filter" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Labels
            </label>
            <Input
              id="labels-filter"
              value={labelsFilter}
              onChange={(event) => setLabelsFilter(event.target.value)}
              placeholder="api, frontend, bugfix"
              className="bg-background/70"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="status-filter" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | TaskStatus)}
              className="flex h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              <option value="all">All statuses</option>
              <option value="open">Open</option>
              <option value="claimed">Claimed</option>
              <option value="in_progress">In progress</option>
              <option value="in_review">In review</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="priority-filter" className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
              Priority
            </label>
            <select
              id="priority-filter"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as "all" | TaskPriority)}
              className="flex h-9 w-full rounded-md border border-input bg-background/70 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
            >
              <option value="all">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Sort</p>
            <div className="flex flex-wrap gap-2">
              {sortOptions.map((option) => (
                <Button
                  key={option}
                  variant={sort === option ? "default" : "outline"}
                  size="sm"
                  className="rounded-full capitalize"
                  onClick={() => setSort(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-end">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <Filter className="size-4" />
              Clear
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError("")} className="ml-2 underline">
            dismiss
          </Button>
        </div>
      )}

      {loading && (
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {[1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="rounded-xl border bg-card p-4">
              <div className="h-4 w-20 animate-pulse rounded bg-muted" />
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((cardIndex) => (
                  <div key={`${index}-${cardIndex}`} className="rounded-lg border bg-muted/30 p-3">
                    <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-muted" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tasks.length === 0 && !error && (
        <p className="py-16 text-center text-base text-muted-foreground">No tasks match the current filters.</p>
      )}

      {!loading && tasks.length > 0 && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>{tasks.length} matching task(s)</span>
            {cancelledCount > 0 && <span>{cancelledCount} cancelled task(s) hidden from board columns</span>}
            {parsedLabels.length > 0 && (
              <span>labels: {parsedLabels.map((label) => `#${label}`).join(", ")}</span>
            )}
          </div>

          <div className="mt-4 overflow-x-auto pb-2">
            <div className="grid min-w-[1100px] gap-4 xl:grid-cols-5">
              {boardStatuses.map((column) => (
                <section key={column.id} className="flex min-h-[520px] flex-col rounded-xl border bg-card">
                  <header className="border-b px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold uppercase tracking-[0.08em]">{column.title}</h2>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {tasksByStatus[column.id].length}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{column.subtitle}</p>
                  </header>

                  <div className="flex-1 space-y-3 p-3">
                    {tasksByStatus[column.id].length === 0 && (
                      <div className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                        No tasks in this column
                      </div>
                    )}

                    {tasksByStatus[column.id].map((task) => (
                      <article key={task.id} className="rounded-lg border bg-background/60 p-3 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</h3>
                          {task.url && (
                            <a
                              href={task.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusClass[task.task_status]}`}>
                            {task.task_status}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] ${priorityClass[task.priority]}`}>
                            {task.priority}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {task.points} pts
                          </span>
                        </div>

                        {task.labels.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {task.labels.map((label) => (
                              <span
                                key={`${task.id}-${label}`}
                                className="rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                              >
                                #{label}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                          <div className="flex items-center justify-between gap-2">
                            <Link href={`/profile/${task.author_handle}`} className="hover:text-foreground">
                              @{task.author_handle}
                            </Link>
                            <span>{timeAgo(task.updated_at)}</span>
                          </div>
                          {task.claimed_by_handle && (
                            <p className="mt-1">assignee: @{task.claimed_by_handle}</p>
                          )}
                          <p className="mt-1">{task.comment_count} comment(s)</p>
                        </div>

                        {canEditTask(task) && transitionMap[task.task_status].length > 0 && (
                          <div className="mt-3 border-t pt-2">
                            <p className="mb-1 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                              Move to
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {transitionMap[task.task_status].map((nextStatus) => (
                                <Button
                                  key={`${task.id}-${nextStatus}`}
                                  variant="outline"
                                  size="sm"
                                  className="h-auto px-2 py-1 text-[11px] capitalize"
                                  onClick={() => updateTaskStatus(task, nextStatus)}
                                  disabled={updatingTaskId === task.id}
                                >
                                  {updatingTaskId === task.id ? "Updating..." : nextStatus}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      <RegisterDialog
        open={showRegister}
        onOpenChange={setShowRegister}
        onRegistered={handleRegistered}
        reason={registerReason}
      />
    </main>
  )
}
