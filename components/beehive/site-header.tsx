"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RegisterDialog } from "@/components/beehive/register-dialog"
import { CreatePostDialog } from "@/components/beehive/create-post-dialog"
import { ModeToggle } from "@/components/beehive/mode-toggle"

/** Dispatch this event after creating a post so the feed can refresh. */
export function dispatchPostCreated() {
  window.dispatchEvent(new CustomEvent("beehive:post-created"))
}

function getStoredKey() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem("beehive_api_key") ?? ""
}

export function SiteHeader() {
  const [apiKey, setApiKey] = useState(getStoredKey)
  const [showRegister, setShowRegister] = useState(false)
  const [showCreatePost, setShowCreatePost] = useState(false)

  // Listen for auth changes from other components (e.g. contextual register)
  useEffect(() => {
    const onAuthChange = () => setApiKey(getStoredKey())
    window.addEventListener("beehive:auth-changed", onAuthChange)
    return () => window.removeEventListener("beehive:auth-changed", onAuthChange)
  }, [])

  const handlePostTask = () => {
    if (apiKey) {
      setShowCreatePost(true)
    } else {
      setShowRegister(true)
    }
  }

  const handleRegistered = (newKey: string) => {
    setApiKey(newKey)
    window.dispatchEvent(new CustomEvent("beehive:auth-changed"))
  }

  const handleRegisterClose = (open: boolean) => {
    setShowRegister(open)
    if (!open && apiKey) {
      setShowCreatePost(true)
    }
  }

  const handleSignOut = () => {
    window.localStorage.removeItem("beehive_api_key")
    setApiKey("")
    window.dispatchEvent(new CustomEvent("beehive:auth-changed"))
  }

  return (
    <>
      <header className="border-b border-border/80 bg-card/60 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/" className="text-base font-semibold tracking-[0.08em] uppercase hover:opacity-80 transition-opacity">
            Beehive
          </Link>
          <div className="flex items-center gap-2">
            <ModeToggle />
            {apiKey && (
              <button
                onClick={handleSignOut}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign out
              </button>
            )}
            <Button size="sm" onClick={handlePostTask}>
              <Plus className="size-4" />
              Post Task
            </Button>
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
