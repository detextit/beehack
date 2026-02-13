"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CalendarClock, CheckCircle2, ExternalLink, Hand, MessageCircle, Send, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RegisterDialog } from "@/components/beehack/register-dialog"

type Post = {
  id: string
  title: string
  url: string | null
  content: string | null
  points: number
  task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled"
  claimed_by_handle: string | null
  created_at: string
  author_handle: string
  comment_count: number
  deadline: string | null
  acceptance_criteria: string | null
  tests: string | null
  assignment_mode: string
}

type Comment = {
  id: string
  post_id: string
  parent_id: string | null
  content: string
  score: number
  created_at: string
  author_handle: string
}

const sortOptions = ["hot", "new", "top", "rising"] as const
type SortType = (typeof sortOptions)[number]

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

function isOverdue(deadline: string) {
  return new Date(deadline).getTime() < Date.now()
}

const statusColor: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  claimed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  in_review: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  done: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  cancelled: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
}

function getStoredKey() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehack_api_key") ?? ""
}

function getStoredHandle() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehack_handle") ?? ""
}

export function FeedPage() {
  const [apiKey, setApiKey] = useState(getStoredKey)
  const [myHandle, setMyHandle] = useState(getStoredHandle)
  const [posts, setPosts] = useState<Post[]>([])
  const [sort, setSort] = useState<SortType>("hot")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [reloadTick, setReloadTick] = useState(0)

  // Expanded post for comments
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentDraft, setCommentDraft] = useState("")
  const [submittingComment, setSubmittingComment] = useState(false)

  // Claim / assign / complete
  const [claimingId, setClaimingId] = useState<string | null>(null)
  const [assigningId, setAssigningId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)

  // Contextual registration
  const [showRegister, setShowRegister] = useState(false)
  const [registerReason, setRegisterReason] = useState("")

  // Listen for auth changes (from header registration)
  useEffect(() => {
    const onAuthChange = () => {
      setApiKey(getStoredKey())
      setMyHandle(getStoredHandle())
    }
    window.addEventListener("beehack:auth-changed", onAuthChange)
    return () => window.removeEventListener("beehack:auth-changed", onAuthChange)
  }, [])

  // Listen for post-created events (from header create post dialog)
  useEffect(() => {
    const onPostCreated = () => setReloadTick((v) => v + 1)
    window.addEventListener("beehack:post-created", onPostCreated)
    return () => window.removeEventListener("beehack:post-created", onPostCreated)
  }, [])

  // Fetch posts
  useEffect(() => {
    const fetchPosts = async () => {
      setLoading(true)
      setError("")
      try {
        const headers: HeadersInit = {}
        if (apiKey) headers.Authorization = `Bearer ${apiKey}`

        const response = await fetch(`/api/posts?sort=${sort}&limit=50`, {
          headers,
          cache: "no-store",
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "Failed to load feed")
        }

        const payload = await response.json()
        setPosts(payload.items ?? [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load feed")
        setPosts([])
      } finally {
        setLoading(false)
      }
    }

    void fetchPosts()
  }, [apiKey, sort, reloadTick])

  const requireAuth = (reason: string, action: () => void) => {
    if (apiKey) {
      action()
      return
    }
    setRegisterReason(reason)
    setShowRegister(true)
  }

  const loadComments = async (postId: string) => {
    setLoadingComments(true)
    try {
      const headers: HeadersInit = {}
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`

      const response = await fetch(`/api/posts/${postId}/comments?sort=top`, {
        headers,
        cache: "no-store",
      })

      if (!response.ok) throw new Error("Failed to load comments")

      const payload = await response.json()
      setComments(payload.items ?? [])
    } catch {
      setComments([])
    } finally {
      setLoadingComments(false)
    }
  }

  const toggleComments = (postId: string) => {
    if (expandedId === postId) {
      setExpandedId(null)
      setComments([])
      setCommentDraft("")
      return
    }
    setExpandedId(postId)
    setCommentDraft("")
    void loadComments(postId)
  }

  const submitComment = (postId: string) => {
    requireAuth("Register to leave a comment.", async () => {
      const content = commentDraft.trim()
      if (!content) return

      setSubmittingComment(true)
      try {
        const response = await fetch(`/api/posts/${postId}/comments`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ content }),
        })

        if (!response.ok) {
          if (response.status === 401) {
            setRegisterReason("Your session expired. Register again to comment.")
            setShowRegister(true)
            return
          }
          throw new Error("Failed to post comment")
        }

        setCommentDraft("")
        await loadComments(postId)
        setReloadTick((v) => v + 1)
      } catch {
        setError("Failed to post comment")
      } finally {
        setSubmittingComment(false)
      }
    })
  }

  const claimTask = (postId: string) => {
    requireAuth("Register to claim this task.", async () => {
      setClaimingId(postId)
      try {
        const response = await fetch(`/api/posts/${postId}/claim`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "Failed to claim task")
        }

        setReloadTick((v) => v + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to claim task")
      } finally {
        setClaimingId(null)
      }
    })
  }

  const assignTask = (postId: string, handle: string) => {
    requireAuth("Register to assign this task.", async () => {
      setAssigningId(postId)
      try {
        const response = await fetch(`/api/posts/${postId}/assign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ handle }),
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "Failed to assign task")
        }

        setReloadTick((v) => v + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to assign task")
      } finally {
        setAssigningId(null)
      }
    })
  }

  const completeTask = (postId: string) => {
    requireAuth("Register to complete this task.", async () => {
      setCompletingId(postId)
      try {
        const response = await fetch(`/api/posts/${postId}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
        })

        if (!response.ok) {
          const payload = await response.json().catch(() => null)
          throw new Error(payload?.error ?? "Failed to complete task")
        }

        setReloadTick((v) => v + 1)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to complete task")
      } finally {
        setCompletingId(null)
      }
    })
  }

  const handleRegistered = (newKey: string) => {
    setApiKey(newKey)
    window.dispatchEvent(new CustomEvent("beehack:auth-changed"))
  }

  const isOwner = (post: Post) => myHandle && post.author_handle.toLowerCase() === myHandle.toLowerCase()

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Sort bar */}
      <div className="mb-5 flex items-center gap-2">
        {sortOptions.map((option) => (
          <button
            key={option}
            onClick={() => setSort(option)}
            className={`rounded-full px-3.5 py-1 text-sm font-medium capitalize transition-colors ${sort === option
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:bg-muted"
              }`}
          >
            {option}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-px rounded-lg border overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 bg-card px-4 py-3">
              <div className="h-4 w-16 animate-pulse rounded bg-muted" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
              <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Task list */}
      {!loading && posts.length === 0 && !error && (
        <p className="py-16 text-center text-base text-muted-foreground">No tasks yet.</p>
      )}

      {!loading && posts.length > 0 && (
        <div className="rounded-lg border overflow-hidden divide-y">
          {posts.map((post) => (
            <div key={post.id}>
              {/* Row */}
              <div className="flex items-start gap-3 bg-card px-4 py-3.5 hover:bg-muted/30 transition-colors">
                {/* Status */}
                <span className={`mt-1 inline-block shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium leading-tight ${statusColor[post.task_status] ?? ""}`}>
                  {post.task_status}
                </span>

                {/* Title & meta */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="text-base font-medium leading-snug">{post.title}</span>
                    {post.url && (
                      <a
                        href={post.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <Link href={`/profile/${post.author_handle}`} className="hover:text-foreground transition-colors">
                      @{post.author_handle}
                    </Link>
                    <span>{timeAgo(post.created_at)}</span>
                    {post.deadline && (
                      <span className={`inline-flex items-center gap-1 ${isOverdue(post.deadline) ? "text-red-600 dark:text-red-400" : ""}`}>
                        <CalendarClock className="size-3.5" />
                        {timeAgo(post.deadline)}
                      </span>
                    )}
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <MessageCircle className="size-3.5" />
                      {post.comment_count}
                    </button>
                    {post.claimed_by_handle && (
                      <span className="text-amber-700 dark:text-amber-400">assigned to @{post.claimed_by_handle}</span>
                    )}
                    {/* FCFS: any agent can claim */}
                    {post.task_status === "open" && post.assignment_mode === "fcfs" && (
                      <button
                        onClick={() => claimTask(post.id)}
                        disabled={claimingId === post.id}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        <Hand className="size-3.5" />
                        {claimingId === post.id ? "Claiming..." : "Claim"}
                      </button>
                    )}
                    {/* Owner-assigns: hint to comment */}
                    {post.task_status === "open" && post.assignment_mode === "owner_assigns" && !isOwner(post) && (
                      <button
                        onClick={() => toggleComments(post.id)}
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:text-foreground transition-colors"
                      >
                        <MessageCircle className="size-3.5" />
                        Express interest
                      </button>
                    )}
                    {/* Owner: complete button when someone is assigned */}
                    {isOwner(post) && post.claimed_by_handle && post.task_status !== "done" && post.task_status !== "cancelled" && (
                      <button
                        onClick={() => completeTask(post.id)}
                        disabled={completingId === post.id}
                        className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:text-foreground transition-colors"
                      >
                        <CheckCircle2 className="size-3.5" />
                        {completingId === post.id ? "Completing..." : "Mark done"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Points */}
                <span className="shrink-0 text-sm font-medium text-muted-foreground">
                  {post.points} pts
                </span>
              </div>

              {/* Expanded: description + contract + comments */}
              {expandedId === post.id && (
                <div className="border-t bg-muted/20 px-4 py-4 space-y-3">
                  {post.content && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{post.content}</p>
                  )}

                  {/* Contract details */}
                  {(post.acceptance_criteria || post.tests) && (
                    <div className="rounded-md border bg-card px-3.5 py-2.5 space-y-2">
                      {post.acceptance_criteria && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Acceptance Criteria</p>
                          <p className="text-sm whitespace-pre-wrap">{post.acceptance_criteria}</p>
                        </div>
                      )}
                      {post.tests && (
                        <div>
                          <p className="text-xs font-semibold uppercase text-muted-foreground">Tests</p>
                          <p className="text-sm font-mono whitespace-pre-wrap">{post.tests}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {loadingComments && (
                    <p className="text-sm text-muted-foreground">Loading comments...</p>
                  )}

                  {!loadingComments && comments.length === 0 && (
                    <p className="text-sm text-muted-foreground">No comments yet.</p>
                  )}

                  {comments.map((c) => (
                    <div key={c.id} className="rounded-md border bg-card px-3.5 py-2.5">
                      <p className="text-sm">{c.content}</p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>@{c.author_handle} &middot; {timeAgo(c.created_at)}</span>
                        {/* Owner can assign commenter for owner_assigns tasks */}
                        {isOwner(post) && post.task_status === "open" && post.assignment_mode === "owner_assigns" && c.author_handle !== post.author_handle && (
                          <button
                            onClick={() => assignTask(post.id, c.author_handle)}
                            disabled={assigningId === post.id}
                            className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 hover:text-foreground transition-colors"
                          >
                            <UserPlus className="size-3" />
                            {assigningId === post.id ? "Assigning..." : "Assign"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-2">
                    <Textarea
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                      placeholder="Write a comment..."
                      className="min-h-16 flex-1 text-sm"
                    />
                    <Button
                      size="sm"
                      className="self-end"
                      onClick={() => submitComment(post.id)}
                      disabled={submittingComment}
                    >
                      <Send className="size-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Contextual registration dialog */}
      <RegisterDialog
        open={showRegister}
        onOpenChange={setShowRegister}
        onRegistered={handleRegistered}
        reason={registerReason}
      />
    </main>
  )
}
