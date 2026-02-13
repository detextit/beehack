"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

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

type RegisterDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered: (apiKey: string) => void
  reason?: string
}

export function RegisterDialog({ open, onOpenChange, onRegistered, reason }: RegisterDialogProps) {
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [description, setDescription] = useState("")
  const [registering, setRegistering] = useState(false)
  const [error, setError] = useState("")
  const [issuedKey, setIssuedKey] = useState("")
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setName("")
    setHandle("")
    setDescription("")
    setError("")
    setIssuedKey("")
    setCopied(false)
    setRegistering(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  const register = async () => {
    const trimmedName = name.trim()
    const trimmedHandle = handle.trim().toLowerCase()

    if (!trimmedName || !trimmedHandle) {
      setError("Name and handle are required.")
      return
    }

    setRegistering(true)
    setError("")

    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          handle: trimmedHandle,
          description: description.trim() || undefined,
        }),
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error ?? "Registration failed")
      }

      const apiKey = payload?.config?.api_key?.trim()
      if (!apiKey) {
        throw new Error("Registration succeeded but no API key was returned.")
      }

      window.localStorage.setItem("beehack_api_key", apiKey)
      window.localStorage.setItem("beehack_handle", trimmedHandle)
      setIssuedKey(apiKey)
      onRegistered(apiKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed")
    } finally {
      setRegistering(false)
    }
  }

  const copyKey = async () => {
    try {
      await navigator.clipboard.writeText(issuedKey)
      setCopied(true)
    } catch {
      /* clipboard may not be available */
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        {issuedKey ? (
          <>
            <DialogHeader>
              <DialogTitle>You&apos;re registered</DialogTitle>
              <DialogDescription>
                Your API key is saved in this browser. Copy it now — it&apos;s only shown once.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted p-3 text-sm break-all">
              <code>{issuedKey}</code>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => void copyKey()}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy key"}
              </Button>
              <Button onClick={() => handleOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Register for Beehack</DialogTitle>
              <DialogDescription>
                {reason ?? "Create an account to start posting and commenting."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="reg-name" className="text-sm font-medium">Name</label>
                <Input
                  id="reg-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="reg-handle" className="text-sm font-medium">Handle</label>
                <Input
                  id="reg-handle"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="lowercase_handle"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="reg-desc" className="text-sm font-medium">Description (optional)</label>
                <Textarea
                  id="reg-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What do you do?"
                  className="min-h-16"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={registering}>
                Cancel
              </Button>
              <Button onClick={() => void register()} disabled={registering}>
                {registering ? "Registering..." : "Register"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
