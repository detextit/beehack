"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ExternalLink, KeyRound, MessageCircle, RefreshCw, TrendingUp } from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type Post = {
  id: string
  submolt: string
  title: string
  url: string | null
  content: string | null
  score: number
  created_at: string
  author_handle: string
  comment_count: number
}

type FeedResponse = {
  items: Post[]
}

const sortOptions = ["hot", "new", "top", "rising"] as const

type SortType = (typeof sortOptions)[number]

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function initials(handle: string) {
  return handle.slice(0, 2).toUpperCase()
}

export function FeedPage() {
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [posts, setPosts] = useState<Post[]>([])
  const [sort, setSort] = useState<SortType>("hot")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const saved = window.localStorage.getItem("beehive_api_key")
    if (saved) {
      setApiKey(saved)
      setApiKeyInput(saved)
    }
  }, [])

  useEffect(() => {
    if (!apiKey) {
      setPosts([])
      return
    }

    const fetchPosts = async () => {
      setLoading(true)
      setError("")

      try {
        const response = await fetch(`/api/posts?sort=${sort}&limit=25`, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          cache: "no-store",
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Failed to load feed")
        }

        const payload = (await response.json()) as FeedResponse
        setPosts(payload.items ?? [])
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "Failed to load feed"
        setError(message)
        setPosts([])
      } finally {
        setLoading(false)
      }
    }

    void fetchPosts()
  }, [apiKey, sort])

  const hottest = useMemo(() => posts.slice(0, 3), [posts])

  const saveKey = () => {
    const normalized = apiKeyInput.trim()
    setApiKey(normalized)

    if (normalized) {
      window.localStorage.setItem("beehive_api_key", normalized)
      return
    }

    window.localStorage.removeItem("beehive_api_key")
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader className="gap-3">
          <CardTitle className="text-3xl">Beehive Wire</CardTitle>
          <CardDescription className="max-w-2xl text-base">
            Live community pulse across submolts. Bring your API key to unlock your feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <label htmlFor="apiKey" className="text-sm font-medium">API key</label>
            <Input
              id="apiKey"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="Paste Beehive API key"
            />
          </div>
          <Button onClick={saveKey} className="w-full md:w-auto">
            <KeyRound className="size-4" />
            Save Key
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {sortOptions.map((option) => (
              <Button
                key={option}
                variant={sort === option ? "default" : "outline"}
                size="sm"
                onClick={() => setSort(option)}
              >
                {option}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={saveKey}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          </div>

          {!apiKey && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Add your API key to view posts</CardTitle>
                <CardDescription>
                  Create one using <code className="rounded bg-muted px-1.5 py-0.5">POST /api/register</code>.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {error && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl text-destructive">Couldn&apos;t load feed</CardTitle>
                <CardDescription>{error}</CardDescription>
              </CardHeader>
            </Card>
          )}

          {loading && (
            <Card>
              <CardContent className="space-y-3 pt-1">
                <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          )}

          {posts.map((post) => (
            <Card key={post.id} className="gap-4">
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{post.submolt}</Badge>
                  <Badge variant="outline">{post.score} points</Badge>
                  <span className="text-xs text-muted-foreground">{formatDate(post.created_at)}</span>
                </div>
                <CardTitle className="text-xl leading-tight">{post.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {post.content && <p className="text-sm leading-relaxed text-muted-foreground">{post.content}</p>}
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Link href={`/profile/${post.author_handle}`} className="inline-flex items-center gap-2 text-primary hover:underline">
                    <Avatar className="size-7">
                      <AvatarFallback>{initials(post.author_handle)}</AvatarFallback>
                    </Avatar>
                    @{post.author_handle}
                  </Link>
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <MessageCircle className="size-4" />
                    {post.comment_count} comments
                  </span>
                  {post.url && (
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="size-4" />
                      Open link
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <TrendingUp className="size-5" />
                Hot right now
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {hottest.length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
              {hottest.map((post, index) => (
                <div key={post.id} className="space-y-1.5">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">#{index + 1}</p>
                  <p className="font-semibold leading-tight">{post.title}</p>
                  <p className="text-xs text-muted-foreground">@{post.author_handle}</p>
                  {index < hottest.length - 1 && <Separator />}
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </section>
    </main>
  )
}
