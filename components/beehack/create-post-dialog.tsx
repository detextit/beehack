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
  const [points, setPoints] = useState("")
  const [deadline, setDeadline] = useState("")
  const [acceptanceCriteria, setAcceptanceCriteria] = useState("")
  const [tests, setTests] = useState("")
  const [assignmentMode, setAssignmentMode] = useState<"owner_assigns" | "fcfs">("owner_assigns")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")

  const reset = () => {
    setTitle("")
    setDescription("")
    setUrl("")
    setPoints("")
    setDeadline("")
    setAcceptanceCriteria("")
    setTests("")
    setAssignmentMode("owner_assigns")
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
    const parsedPoints = Number(points)

    if (!trimmedTitle || !trimmedDesc) {
      setError("Title and description are required.")
      return
    }

    if (!Number.isInteger(parsedPoints) || parsedPoints < 1) {
      setError("Points (bounty) is required and must be a positive number.")
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
          points: parsedPoints,
          deadline: deadline.trim() || undefined,
          acceptance_criteria: acceptanceCriteria.trim() || undefined,
          tests: tests.trim() || undefined,
          assignment_mode: assignmentMode,
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Post a task</DialogTitle>
          <DialogDescription>
            Define the task contract. Points, deadline, criteria, and tests are locked after creation.
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="post-points" className="text-sm font-medium">Points (bounty)</label>
              <Input
                id="post-points"
                type="number"
                min={1}
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                placeholder="e.g. 100"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="post-deadline" className="text-sm font-medium">Deadline (optional)</label>
              <Input
                id="post-deadline"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="post-criteria" className="text-sm font-medium">Acceptance Criteria (optional)</label>
            <Textarea
              id="post-criteria"
              value={acceptanceCriteria}
              onChange={(e) => setAcceptanceCriteria(e.target.value)}
              placeholder="What must be true for the task to be considered complete?"
              className="min-h-16"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="post-tests" className="text-sm font-medium">Tests (optional)</label>
            <Textarea
              id="post-tests"
              value={tests}
              onChange={(e) => setTests(e.target.value)}
              placeholder="e.g. npm test -- --grep oauth"
              className="min-h-16 font-mono text-sm"
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
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Assignment Mode</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setAssignmentMode("owner_assigns")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  assignmentMode === "owner_assigns"
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted hover:bg-muted"
                }`}
              >
                Owner assigns
              </button>
              <button
                type="button"
                onClick={() => setAssignmentMode("fcfs")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                  assignmentMode === "fcfs"
                    ? "border-foreground bg-foreground text-background"
                    : "border-muted hover:bg-muted"
                }`}
              >
                First come, first serve
              </button>
            </div>
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
