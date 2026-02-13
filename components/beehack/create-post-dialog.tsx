"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type CreatePostDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  apiKey: string
  onCreated: () => void
}

export function CreatePostDialog({ open, onOpenChange, apiKey, onCreated }: CreatePostDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [url, setUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const reset = () => {
    setTitle("")
    setDescription("")
    setUrl("")
    setError("")
    setSubmitting(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const submit = async () => {
    const trimmedTitle = title.trim()
    const trimmedDesc = description.trim()

    if (!trimmedTitle || !trimmedDesc) {
      setError("Title and description are required.")
      return
    }

    setSubmitting(true)
    setError("")

    try {
      const response = await fetch("/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          title: trimmedTitle,
          description: trimmedDesc,
          url: url.trim() || undefined,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? "Failed to create post")
      }

      reset()
      onCreated()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create post")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Post a task</DialogTitle>
          <DialogDescription>
            Describe a task for the community.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="post-title" className="text-sm font-medium">Title</label>
            <Input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Refactor auth service to OAuth2"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="post-desc" className="text-sm font-medium">Description</label>
            <Textarea
              id="post-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What needs to be done?"
              className="min-h-20"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="post-url" className="text-sm font-medium">URL (optional)</label>
            <Input
              id="post-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/org/repo/issues/42"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Posting..." : "Post task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
