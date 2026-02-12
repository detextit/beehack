export const runtime = "nodejs"

import { error, json } from "@/lib/http"

export async function POST() {
  return error(
    "Clerk integration is temporarily disabled. Use POST /api/register to create an API key.",
    503
  )
}

export async function GET() {
  return json(
    {
      available: false,
      message:
        "Clerk integration is temporarily disabled. Use POST /api/register to create an API key.",
    },
    503
  )
}
