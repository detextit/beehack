"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, Hand, MessageCircle, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { RegisterDialog } from "@/components/beehack/register-dialog"

type Post = {
  id: string
  title: string
  url: string | null
  content: string | null
  score: number
  task_status: "open" | "claimed" | "in_progress" | "in_review" | "done" | "cancelled"
  claimed_by_handle: string | null
  created_at: string
  author_handle: string
  comment_count: number
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

const statusColor: Record<string, string> = {
  open: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  claimed: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  done: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
}

function getStoredKey() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehack_api_key") ?? ""
}

export function FeedPage() {
  const [apiKey, setApiKey] = useState(getStoredKey)
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

  // Claim
  const [claimingId, setClaimingId] = useState<string | null>(null)

  // Contextual registration
  const [showRegister, setShowRegister] = useState(false)
  const [registerReason, setRegisterReason] = useState("")

  // Listen for auth changes (from header registration)
  useEffect(() => {
    const onAuthChange = () => setApiKey(getStoredKey())
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

  const handleRegistered = (newKey: string) => {
    setApiKey(newKey)
    window.dispatchEvent(new CustomEvent("beehack:auth-changed"))
  }

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
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                    >
                      <MessageCircle className="size-3.5" />
                      {post.comment_count}
                    </button>
                    {post.claimed_by_handle && (
                      <span className="text-amber-700 dark:text-amber-400">claimed by @{post.claimed_by_handle}</span>
                    )}
                    {post.task_status === "open" && (
                      <button
                        onClick={() => claimTask(post.id)}
                        disabled={claimingId === post.id}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        <Hand className="size-3.5" />
                        {claimingId === post.id ? "Claiming..." : "Claim"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Score */}
                <span className="shrink-0 text-sm font-medium text-muted-foreground">
                  {post.score} pts
                </span>
              </div>

              {/* Expanded: description + comments */}
              {expandedId === post.id && (
                <div className="border-t bg-muted/20 px-4 py-4 space-y-3">
                  {post.content && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{post.content}</p>
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        @{c.author_handle} &middot; {timeAgo(c.created_at)}
                      </p>
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
