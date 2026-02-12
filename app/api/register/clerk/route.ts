export const runtime = "nodejs"

import { auth } from "@clerk/nextjs/server"

import { pool } from "@/lib/db"
import { ensureDbReady } from "@/lib/bootstrap"
import { createApiKey, hashApiKey } from "@/lib/security"
import { error, json } from "@/lib/http"

type ClerkRegisterBody = {
  handle?: string
  name?: string
  description?: string
  email?: string
  rotate_api_key?: boolean
}

type DbUser = {
  id: string
  name: string
  handle: string
  description: string
  email: string | null
}

function normalizeHandle(input: string) {
  return input.trim().toLowerCase()
}

function isValidHandle(handle: string) {
  return /^[a-z0-9_]{3,30}$/.test(handle)
}

function fallbackHandleFromClerkId(clerkUserId: string) {
  const seed = clerkUserId.toLowerCase().replace(/[^a-z0-9]/g, "")
  const base = `user_${seed.slice(0, 20)}`
  return base.slice(0, 30)
}

async function findAvailableHandle(baseHandle: string) {
  if (!isValidHandle(baseHandle)) {
    throw new Error("Invalid handle seed")
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt === 0 ? "" : `${attempt}`
    const trimmedBase = baseHandle.slice(0, 30 - suffix.length)
    const candidate = `${trimmedBase}${suffix}`

    const exists = await pool.query("SELECT 1 FROM users WHERE handle = $1 LIMIT 1", [candidate])
    if (!exists.rowCount) {
      return candidate
    }
  }

  throw new Error("Could not allocate unique handle")
}

async function parseBody(request: Request): Promise<ClerkRegisterBody> {
  const raw = await request.text()
  if (!raw.trim()) {
    return {}
  }

  try {
    return JSON.parse(raw) as ClerkRegisterBody
  } catch {
    throw new Error("Invalid JSON body.")
  }
}

async function rotateApiKeyForUser(userId: string) {
  const apiKey = createApiKey()
  const apiKeyHash = hashApiKey(apiKey)

  const updated = await pool.query<DbUser>(
    `
      UPDATE users
      SET api_key_hash = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, handle, description, email
    `,
    [userId, apiKeyHash]
  )

  return {
    user: updated.rows[0],
    apiKey,
  }
}

export async function POST(request: Request) {
  await ensureDbReady()

  const { userId } = await auth()
  if (!userId) {
    return error("Unauthorized. Sign in with Clerk first.", 401)
  }

  let body: ClerkRegisterBody
  try {
    body = await parseBody(request)
  } catch {
    return error("Invalid JSON body.", 400)
  }

  const preferredName = body.name?.trim()
  const description = body.description?.trim() ?? ""
  const email = body.email?.trim().toLowerCase() || null
  const requestedHandle = body.handle ? normalizeHandle(body.handle) : null
  const rotateApiKey = body.rotate_api_key === true

  if (requestedHandle && !isValidHandle(requestedHandle)) {
    return error(
      "Invalid handle. Use 3-30 characters: lowercase letters, numbers, underscores.",
      400
    )
  }

  const byClerkId = await pool.query<DbUser>(
    `
      SELECT id, name, handle, description, email
      FROM users
      WHERE clerk_user_id = $1
      LIMIT 1
    `,
    [userId]
  )

  if (byClerkId.rows[0]) {
    const existing = byClerkId.rows[0]
    const nextName = preferredName ?? existing.name
    const nextDescription = body.description === undefined ? existing.description : description
    const nextEmail = email ?? existing.email

    await pool.query(
      `
        UPDATE users
        SET name = $2, description = $3, email = $4, updated_at = NOW()
        WHERE id = $1
      `,
      [existing.id, nextName, nextDescription, nextEmail]
    )

    if (!rotateApiKey) {
      const current = await pool.query<DbUser>(
        `
          SELECT id, name, handle, description, email
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [existing.id]
      )

      const user = current.rows[0]
      return json(
        {
          user,
          config: {
            profile_url: `/users/profile?name=${user.handle}`,
          },
          nextStep:
            "Clerk account linked. If you need an external API key, call this route with rotate_api_key=true.",
        },
        200
      )
    }

    const rotated = await rotateApiKeyForUser(existing.id)
    return json(
      {
        user: rotated.user,
        config: {
          api_key: rotated.apiKey,
          profile_url: `/users/profile?name=${rotated.user.handle}`,
        },
        nextStep:
          "Save this API key now. This rotation invalidated any previous API key for your account.",
      },
      200
    )
  }

  let linkTargetUserId: string | null = null
  if (requestedHandle) {
    const byHandle = await pool.query<{ id: string; clerk_user_id: string | null }>(
      "SELECT id, clerk_user_id FROM users WHERE handle = $1 LIMIT 1",
      [requestedHandle]
    )

    const existingByHandle = byHandle.rows[0]
    if (existingByHandle?.clerk_user_id && existingByHandle.clerk_user_id !== userId) {
      return error("Handle already linked to a different Clerk user.", 409)
    }

    if (existingByHandle?.id) {
      linkTargetUserId = existingByHandle.id
    }
  }

  if (linkTargetUserId) {
    const nextName = preferredName ?? requestedHandle ?? "Beehive User"

    await pool.query(
      `
        UPDATE users
        SET clerk_user_id = $2, name = $3, description = $4, email = $5, updated_at = NOW()
        WHERE id = $1
      `,
      [linkTargetUserId, userId, nextName, description, email]
    )

    if (!rotateApiKey) {
      const current = await pool.query<DbUser>(
        `
          SELECT id, name, handle, description, email
          FROM users
          WHERE id = $1
          LIMIT 1
        `,
        [linkTargetUserId]
      )

      const user = current.rows[0]
      return json(
        {
          user,
          config: {
            profile_url: `/users/profile?name=${user.handle}`,
          },
          nextStep:
            "Account linked to Clerk. If you need an external API key, call this route with rotate_api_key=true.",
        },
        200
      )
    }

    const rotated = await rotateApiKeyForUser(linkTargetUserId)
    return json(
      {
        user: rotated.user,
        config: {
          api_key: rotated.apiKey,
          profile_url: `/users/profile?name=${rotated.user.handle}`,
        },
        nextStep:
          "Account linked to Clerk. Save this API key now; previous keys for this account were invalidated.",
      },
      200
    )
  }

  let handle = requestedHandle
  if (!handle) {
    handle = await findAvailableHandle(fallbackHandleFromClerkId(userId))
  }

  const apiKey = createApiKey()
  const apiKeyHash = hashApiKey(apiKey)
  const name = preferredName ?? handle

  const created = await pool.query<DbUser>(
    `
      INSERT INTO users (name, handle, description, api_key_hash, clerk_user_id, email)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, handle, description, email
    `,
    [name, handle, description, apiKeyHash, userId, email]
  )

  const user = created.rows[0]
  return json(
    {
      user,
      config: {
        api_key: apiKey,
        profile_url: `/users/profile?name=${user.handle}`,
      },
      nextStep:
        "Welcome to Beehive. Save this API key now; use it for API access outside Clerk-authenticated browser sessions.",
    },
    201
  )
}
