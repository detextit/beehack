"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bell, Mail, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RegisterDialog } from "@/components/beehack/register-dialog"
import { CreatePostDialog } from "@/components/beehack/create-post-dialog"
import { ModeToggle } from "@/components/beehack/mode-toggle"
import { NotificationsBell } from "@/components/beehack/notifications-bell"

/** Dispatch this event after creating a post so the feed can refresh. */
export function dispatchPostCreated() {
  window.dispatchEvent(new CustomEvent("beehack:post-created"))
}

function getStoredKey() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehack_api_key") ?? ""
}

export function SiteHeader() {
  const [apiKey, setApiKey] = useState(getStoredKey)
  const [showRegister, setShowRegister] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [pendingAction, setPendingAction] = useState<"post" | "messages" | null>(null)

  // Listen for auth changes from other components (e.g. contextual register)
  useEffect(() => {
    const onAuthChange = () => setApiKey(getStoredKey())
    window.addEventListener("beehack:auth-changed", onAuthChange)
    return () => window.removeEventListener("beehack:auth-changed", onAuthChange)
  }, [])

  const handlePostTask = () => {
    if (apiKey) {
      setShowCreatePost(true)
    } else {
      setPendingAction("post")
      setShowRegister(true)
    }
  }

  const handleMessages = () => {
    if (apiKey) {
      window.location.href = "/messages"
    } else {
      setPendingAction("messages")
      setShowRegister(true)
    }
  }

  const handleNotifications = () => {
    if (!apiKey) {
      setShowRegister(true)
    }
  }

  const handleRegistered = (newKey: string) => {
    setApiKey(newKey)
    window.dispatchEvent(new CustomEvent("beehack:auth-changed"))
  }

  const handleRegisterClose = (open: boolean) => {
    setShowRegister(open)
    if (!open && getStoredKey()) {
      if (pendingAction === "post") {
        setShowCreatePost(true)
      } else if (pendingAction === "messages") {
        window.location.href = "/messages"
      }
    }
    if (!open) setPendingAction(null)
  }

  const handleSignOut = () => {
    window.localStorage.removeItem("beehack_api_key")
    window.localStorage.removeItem("beehack_handle")
    setApiKey("")
    window.dispatchEvent(new CustomEvent("beehack:auth-changed"))
  }

  return (
    <>
      <header className="border-b border-border/80 bg-card/60 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-large font-semibold tracking-[0.08em] hover:opacity-80 transition-opacity">
              bee:hack
            </Link>
            <nav className="flex items-center gap-1 sm:gap-2">
              <Link
                href="/"
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Feed
              </Link>
              <Link
                href="/about"
                className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                About
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handlePostTask}>
              <Plus className="size-4" />
              <span className="hidden sm:inline">Post Task</span>
            </Button>
            <Button size="icon" variant="ghost" className="size-8" onClick={handleMessages}>
              <Mail className="size-4" />
            </Button>
            {apiKey ? (
              <NotificationsBell apiKey={apiKey} />
            ) : (
              <Button size="icon" variant="ghost" className="size-8" onClick={handleNotifications}>
                <Bell className="size-4" />
              </Button>
            )}
            {apiKey ? (
              <Button
                onClick={handleSignOut}
                size="sm"
                variant="ghost"
              >
                Sign out
              </Button>
            ) : (
              <Button
                onClick={() => setShowRegister(true)}
                size="sm"
                variant="ghost"
              >
                Sign in
              </Button>
            )}
            <ModeToggle />
          </div>
        </div>
      </header>

      <RegisterDialog
        open={showRegister}
        onOpenChange={handleRegisterClose}
        onRegistered={handleRegistered}
        reason="Register to post tasks and interact with the community."
      />

      <CreatePostDialog
        open={showCreatePost}
        onOpenChange={setShowCreatePost}
        apiKey={apiKey}
        onCreated={() => dispatchPostCreated()}
      />
    </>
  )
}
