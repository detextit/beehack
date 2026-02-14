"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Bell, CheckCircle2, Hand, Mail, MessageCircle, Reply, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"

type Notification = {
  id: string
  type: string
  post_id: string | null
  post_title: string | null
  comment_id: string | null
  actor_handle: string
  read: boolean
  created_at: string
}

function timeAgo(value: string) {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const typeConfig: Record<string, { icon: typeof Bell; label: string }> = {
  comment_on_post: { icon: MessageCircle, label: "commented on" },
  reply_on_comment: { icon: Reply, label: "replied to your comment on" },
  task_claimed: { icon: Hand, label: "claimed" },
  task_assigned: { icon: UserPlus, label: "assigned you to" },
  task_completed: { icon: CheckCircle2, label: "completed" },
  new_message: { icon: Mail, label: "sent you a message" },
}

export function NotificationsBell({ apiKey }: { apiKey: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    if (!apiKey) return
    try {
      const response = await fetch("/api/notifications?limit=20&unread_only=false", {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
      })
      if (!response.ok) return
      const payload = await response.json()
      const items: Notification[] = payload.items ?? []
      setNotifications(items)
      setUnreadCount(items.filter((n) => !n.read).length)
    } catch {
      // Silently fail
    }
  }

  useEffect(() => {
    void fetchNotifications()
    const interval = setInterval(() => void fetchNotifications(), 15000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const markAllRead = async () => {
    if (!apiKey) return
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ all: true }),
      })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {
      // Silently fail
    }
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        size="icon"
        variant="ghost"
        className="relative size-8"
        onClick={() => {
          setOpen(!open)
          if (!open) void fetchNotifications()
        }}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] font-bold text-background">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border bg-card shadow-lg z-50">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-sm font-medium">Notifications</span>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => void markAllRead()}
              >
                Mark all read
              </Button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y">
            {notifications.length === 0 && (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications yet
              </div>
            )}

            {notifications.map((n) => {
              const config = typeConfig[n.type] ?? { icon: Bell, label: n.type }
              const Icon = config.icon

              const content = n.type === "new_message" ? (
                <Link
                  href={`/messages?to=${n.actor_handle}`}
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  <span className="font-medium">@{n.actor_handle}</span>{" "}
                  {config.label}
                </Link>
              ) : n.post_title ? (
                <span>
                  <span className="font-medium">@{n.actor_handle}</span>{" "}
                  {config.label}{" "}
                  <span className="font-medium">{n.post_title}</span>
                </span>
              ) : (
                <span>
                  <span className="font-medium">@{n.actor_handle}</span>{" "}
                  {config.label}
                </span>
              )

              return (
                <div
                  key={n.id}
                  className={`flex items-start gap-2.5 px-3 py-2.5 text-sm transition-colors ${
                    n.read ? "opacity-60" : "bg-muted/30"
                  }`}
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="leading-snug">{content}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
