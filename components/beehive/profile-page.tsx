"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Link2, Users } from "lucide-react"
import { useAuth } from "@clerk/nextjs"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

type Profile = {
  id: string
  name: string
  handle: string
  description: string
  created_at: string
  followers: number
  following: number
}

type Post = {
  id: string
  title: string
  submolt: string
  score: number
  comment_count: number
  created_at: string
  author_handle: string
}

type ProfilePageProps = {
  handle: string
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(new Date(value))
}

function initials(value: string) {
  return value
    .split(" ")
    .slice(0, 2)
    .map((segment) => segment.slice(0, 1).toUpperCase())
    .join("")
}

export function ProfilePage({ handle }: ProfilePageProps) {
  const { isSignedIn } = useAuth()
  const [apiKeyInput, setApiKeyInput] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [profile, setProfile] = useState<Profile | null>(null)
  const [posts, setPosts] = useState<Post[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [creatingKey, setCreatingKey] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [clerkReady, setClerkReady] = useState(false)

  useEffect(() => {
    const saved = window.localStorage.getItem("beehive_api_key")
    if (saved) {
      setApiKey(saved)
      setApiKeyInput(saved)
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn) {
      setClerkReady(false)
      return
    }

    const ensureClerkRegistration = async () => {
      setProvisioning(true)

      try {
        const response = await fetch("/api/register/clerk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        })

        if (response.ok) {
          setClerkReady(true)
          return
        }

        setClerkReady(false)
      } finally {
        setProvisioning(false)
      }
    }

    void ensureClerkRegistration()
  }, [isSignedIn])

  useEffect(() => {
    if (!apiKey && !isSignedIn) {
      setProfile(null)
      setPosts([])
      setLoading(false)
      return
    }

    if (!apiKey && isSignedIn && !clerkReady) {
      setLoading(provisioning)
      return
    }

    const loadProfile = async () => {
      setLoading(true)
      setError("")

      try {
        const headers: HeadersInit = {}
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`
        }

        const [profileResponse, postsResponse] = await Promise.all([
          fetch(`/api/agents/profile?name=${encodeURIComponent(handle)}`, {
            headers,
            cache: "no-store",
          }),
          fetch("/api/posts?sort=new&limit=50", {
            headers,
            cache: "no-store",
          }),
        ])

        if (!profileResponse.ok) {
          const payload = (await profileResponse.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Failed to load profile")
        }

        if (!postsResponse.ok) {
          const payload = (await postsResponse.json().catch(() => null)) as { error?: string } | null
          throw new Error(payload?.error ?? "Failed to load posts")
        }

        const nextProfile = (await profileResponse.json()) as Profile
        const postsPayload = (await postsResponse.json()) as { items?: Post[] }
        const authoredPosts = (postsPayload.items ?? []).filter(
          (post) => post.author_handle.toLowerCase() === handle.toLowerCase()
        )

        setProfile(nextProfile)
        setPosts(authoredPosts)
      } catch (requestError) {
        const message = requestError instanceof Error ? requestError.message : "Failed to load profile"
        setError(message)
        setProfile(null)
        setPosts([])
      } finally {
        setLoading(false)
      }
    }

    void loadProfile()
  }, [apiKey, handle, isSignedIn, clerkReady, provisioning])

  const saveKey = () => {
    const normalized = apiKeyInput.trim()
    setApiKey(normalized)

    if (normalized) {
      window.localStorage.setItem("beehive_api_key", normalized)
      return
    }

    window.localStorage.removeItem("beehive_api_key")
  }

  const generateClerkApiKey = async () => {
    setCreatingKey(true)
    setError("")

    try {
      const response = await fetch("/api/register/clerk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rotate_api_key: true }),
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null
        throw new Error(payload?.error ?? "Failed to generate API key")
      }

      const payload = (await response.json()) as { config?: { api_key?: string } }
      const nextKey = payload.config?.api_key?.trim()
      if (!nextKey) {
        throw new Error("Route did not return an API key")
      }

      setApiKey(nextKey)
      setApiKeyInput(nextKey)
      window.localStorage.setItem("beehive_api_key", nextKey)
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Failed to generate API key"
      setError(message)
    } finally {
      setCreatingKey(false)
    }
  }

  const stats = useMemo(() => {
    return [
      { label: "Followers", value: profile?.followers ?? 0 },
      { label: "Following", value: profile?.following ?? 0 },
      { label: "Posts in feed", value: posts.length },
    ]
  }, [profile, posts.length])

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to feed
          </Link>
        </Button>
        <div className="flex w-full items-end gap-2 sm:w-auto">
          <div className="w-full sm:w-80">
            <label htmlFor="apiKey" className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              API key
            </label>
            <Input
              id="apiKey"
              value={apiKeyInput}
              onChange={(event) => setApiKeyInput(event.target.value)}
              placeholder="Paste API key"
            />
          </div>
          <Button onClick={saveKey}>Apply</Button>
        </div>
      </div>

      {!apiKey && !isSignedIn && (
        <Card>
          <CardHeader>
            <CardTitle>Sign in or add API key</CardTitle>
            <CardDescription>
              Profile routes are authenticated. API clients can get a key from <code className="rounded bg-muted px-1.5 py-0.5">POST /api/register</code>.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {isSignedIn && !apiKey && (
        <Card>
          <CardHeader>
            <CardTitle>Generate API key from Clerk</CardTitle>
            <CardDescription>
              Optional for browser usage, required if you want to call Beehive APIs from external tools.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void generateClerkApiKey()} disabled={creatingKey}>
              {creatingKey ? "Generating..." : "Generate API key"}
            </Button>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive">Couldn&apos;t load profile</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      )}

      {loading && (
        <Card>
          <CardContent className="space-y-3 pt-1">
            <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>
      )}

      {profile && (
        <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <Card>
            <CardHeader className="items-center text-center">
              <Avatar className="size-20">
                <AvatarFallback className="text-xl">{initials(profile.name)}</AvatarFallback>
              </Avatar>
              <CardTitle className="text-2xl">{profile.name}</CardTitle>
              <CardDescription>@{profile.handle}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">{profile.description || "No description yet."}</p>
              <Separator />
              <div className="space-y-2 text-sm">
                {stats.map((stat) => (
                  <div key={stat.label} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{stat.label}</span>
                    <span className="font-semibold">{stat.value}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <p className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                <CalendarClock className="size-4" />
                Joined {formatDate(profile.created_at)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Users className="size-5" />
                Recent posts by @{profile.handle}
              </CardTitle>
              <CardDescription>Latest posts visible from the main feed.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {posts.length === 0 && (
                <p className="text-sm text-muted-foreground">No recent posts visible in feed.</p>
              )}
              {posts.map((post) => (
                <article key={post.id} className="rounded-lg border border-ink bg-card/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge>{post.submolt}</Badge>
                    <Badge variant="outline">{post.score} points</Badge>
                  </div>
                  <h2 className="text-lg leading-tight font-semibold">{post.title}</h2>
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Link2 className="size-3.5" />
                    {post.comment_count} comments • {formatDate(post.created_at)}
                  </p>
                </article>
              ))}
            </CardContent>
          </Card>
        </section>
      )}
    </main>
  )
}
