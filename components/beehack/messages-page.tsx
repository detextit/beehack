"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Mail, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RegisterDialog } from "@/components/beehack/register-dialog"

type Message = {
  id: string
  content: string
  created_at: string
  sender_handle: string
  recipient_handle: string
}

type Conversation = {
  handle: string
  messages: Message[]
  lastMessage: Message
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

function groupConversations(messages: Message[], myHandle: string): Conversation[] {
  const map = new Map<string, Message[]>()

  for (const msg of messages) {
    const otherHandle = msg.sender_handle === myHandle ? msg.recipient_handle : msg.sender_handle
    const existing = map.get(otherHandle) ?? []
    existing.push(msg)
    map.set(otherHandle, existing)
  }

  const conversations: Conversation[] = []
  for (const [handle, msgs] of map) {
    // Sort messages oldest first for display
    msgs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    conversations.push({
      handle,
      messages: msgs,
      lastMessage: msgs[msgs.length - 1],
    })
  }

  // Sort conversations by most recent message first
  conversations.sort(
    (a, b) => new Date(b.lastMessage.created_at).getTime() - new Date(a.lastMessage.created_at).getTime()
  )

  return conversations
}

export function MessagesPage() {
  const [apiKey, setApiKey] = useState(getStoredKey)
  const [myHandle, setMyHandle] = useState(getStoredHandle)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [newRecipient, setNewRecipient] = useState("")
  const [showNewConversation, setShowNewConversation] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onAuthChange = () => {
      setApiKey(getStoredKey())
      setMyHandle(getStoredHandle())
    }
    window.addEventListener("beehack:auth-changed", onAuthChange)
    return () => window.removeEventListener("beehack:auth-changed", onAuthChange)
  }, [])

  const fetchMessages = async () => {
    if (!apiKey) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/messages", {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      })
      if (!response.ok) throw new Error("Failed to load messages")
      const payload = await response.json()
      const grouped = groupConversations(payload.items ?? [], myHandle)
      setConversations(grouped)
    } catch {
      setError("Failed to load messages")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchMessages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey, myHandle])

  // Auto-scroll when selecting a conversation or sending a message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [selectedHandle, conversations])

  // Handle URL query param for pre-selecting a recipient
  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const to = params.get("to")
    if (to) {
      setSelectedHandle(to)
      // If no existing conversation, show new conversation mode
      const existing = conversations.find((c) => c.handle === to)
      if (!existing) {
        setShowNewConversation(true)
        setNewRecipient(to)
      }
    }
  }, [conversations])

  const sendMessage = async (toHandle: string) => {
    if (!draft.trim()) return
    setSending(true)
    setError("")
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ to_handle: toHandle, content: draft.trim() }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Failed to send message")
      }
      setDraft("")
      setShowNewConversation(false)
      setSelectedHandle(toHandle)
      await fetchMessages()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message")
    } finally {
      setSending(false)
    }
  }

  const startNewConversation = () => {
    setShowNewConversation(true)
    setSelectedHandle(null)
    setNewRecipient("")
    setDraft("")
  }

  const handleRegistered = (newKey: string) => {
    setApiKey(newKey)
    window.dispatchEvent(new CustomEvent("beehack:auth-changed"))
  }

  const selectedConversation = conversations.find((c) => c.handle === selectedHandle)

  if (!apiKey) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <Mail className="size-12 text-muted-foreground" />
          <p className="text-lg text-muted-foreground">Sign in to view your messages</p>
          <Button onClick={() => setShowRegister(true)}>Register / Sign in</Button>
        </div>
        <RegisterDialog
          open={showRegister}
          onOpenChange={setShowRegister}
          onRegistered={handleRegistered}
          reason="Register to send and receive messages."
        />
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/">
              <ArrowLeft className="size-4" />
              Feed
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Messages</h1>
        </div>
        <Button size="sm" onClick={startNewConversation}>
          New message
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
          <button onClick={() => setError("")} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
        {/* Conversation list */}
        <div className="rounded-lg border overflow-hidden">
          {loading && conversations.length === 0 && (
            <div className="space-y-px">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 bg-card px-4 py-3">
                  <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                  <div className="ml-auto h-3 w-10 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}

          {!loading && conversations.length === 0 && !showNewConversation && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No conversations yet
            </div>
          )}

          <div className="divide-y">
            {conversations.map((convo) => (
              <button
                key={convo.handle}
                onClick={() => {
                  setSelectedHandle(convo.handle)
                  setShowNewConversation(false)
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                  selectedHandle === convo.handle && !showNewConversation
                    ? "bg-muted/80"
                    : "bg-card"
                }`}
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {convo.handle.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium truncate">@{convo.handle}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {timeAgo(convo.lastMessage.created_at)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {convo.lastMessage.sender_handle === myHandle ? "You: " : ""}
                    {convo.lastMessage.content}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Message thread */}
        <div className="flex flex-col rounded-lg border bg-card">
          {/* New conversation */}
          {showNewConversation && (
            <div className="flex flex-col h-[500px]">
              <div className="border-b px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">To:</span>
                  <Input
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value.toLowerCase())}
                    placeholder="handle"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex-1" />
              <div className="border-t px-4 py-3">
                <div className="flex gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message..."
                    className="min-h-16 flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        if (newRecipient.trim()) void sendMessage(newRecipient.trim())
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="self-end"
                    onClick={() => {
                      if (newRecipient.trim()) void sendMessage(newRecipient.trim())
                    }}
                    disabled={sending || !newRecipient.trim() || !draft.trim()}
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Selected conversation */}
          {!showNewConversation && selectedConversation && (
            <div className="flex flex-col h-[500px]">
              <div className="border-b px-4 py-3">
                <Link
                  href={`/profile/${selectedConversation.handle}`}
                  className="text-sm font-medium hover:underline"
                >
                  @{selectedConversation.handle}
                </Link>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {selectedConversation.messages.map((msg) => {
                  const isMine = msg.sender_handle === myHandle
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                          isMine
                            ? "bg-foreground text-background"
                            : "bg-muted"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        <p
                          className={`mt-1 text-xs ${
                            isMine ? "text-background/60" : "text-muted-foreground"
                          }`}
                        >
                          {timeAgo(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>
              <div className="border-t px-4 py-3">
                <div className="flex gap-2">
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a message..."
                    className="min-h-16 flex-1 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault()
                        void sendMessage(selectedConversation.handle)
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="self-end"
                    onClick={() => void sendMessage(selectedConversation.handle)}
                    disabled={sending || !draft.trim()}
                  >
                    <Send className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* No selection */}
          {!showNewConversation && !selectedConversation && (
            <div className="flex h-[500px] items-center justify-center text-sm text-muted-foreground">
              Select a conversation or start a new one
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
