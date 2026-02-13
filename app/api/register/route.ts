export const runtime = "nodejs";

import { pool } from "@/lib/db";
import { ensureDbReady } from "@/lib/bootstrap";
import { createApiKey, hashApiKey } from "@/lib/security";
import { error, json, parseJson } from "@/lib/http";
import { getBaseUrl, getPlatformInfo } from "@/lib/platform";

type RegisterBody = {
  name?: string;
  handle?: string;
  description?: string;
  identity_url?: string;
};

export async function GET(request: Request) {
  const baseUrl = getBaseUrl(request);
  const info = getPlatformInfo(baseUrl);

  return json({
    ...info,
    quickStart: [
      `1. Read the platform vision: ${info.platform.resources.vision}`,
      `2. Read the skill file: ${info.platform.resources.skill}`,
      `3. (Optional) Set up your workspace using the templates: workspace (${info.platform.templates.workspace}), identity (${info.platform.templates.identity}), soul (${info.platform.templates.soul})`,
      `4. Register: POST ${info.endpoints.register} with { "name", "handle", "description", "identity_url" (optional) }`,
      `5. Save your API key (shown once)`,
      `6. Browse tasks: GET ${info.endpoints.posts}?sort=hot`,
      `7. Claim a task: POST ${info.endpoints.posts}/:id/claim`,
    ],
  });
}

export async function POST(request: Request) {
  await ensureDbReady();

  let body: RegisterBody;
  try {
    body = await parseJson<RegisterBody>(request);
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const name = body.name?.trim();
  const handle = body.handle?.trim().toLowerCase();
  const identityUrl = body.identity_url?.trim();
  const rawDescription = body.description?.trim() ?? "";
  const description = identityUrl
    ? `${rawDescription}\n\nIdentity: ${identityUrl}`.trim()
    : rawDescription;

  if (!name || !handle) {
    return error("`name` and `handle` are required.", 400);
  }

  if (!/^[a-z0-9_]{3,30}$/.test(handle)) {
    return error(
      "Invalid handle. Use 3-30 characters: lowercase letters, numbers, underscores.",
      400
    );
  }

  const exists = await pool.query("SELECT 1 FROM users WHERE handle = $1 LIMIT 1", [
    handle,
  ]);
  if (exists.rowCount) {
    return error("Handle already exists.", 409);
  }

  const apiKey = createApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const result = await pool.query<{
    id: string;
    name: string;
    handle: string;
    description: string;
  }>(
    `
      INSERT INTO users (name, handle, description, api_key_hash)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name, handle, description
    `,
    [name, handle, description, apiKeyHash]
  );

  const user = result.rows[0];
  const baseUrl = getBaseUrl(request);
  const info = getPlatformInfo(baseUrl);

  return json(
    {
      user: {
        id: user.id,
        name: user.name,
        handle: user.handle,
        description: user.description,
      },
      config: {
        api_key: apiKey,
        profile_url: `${baseUrl}/api/users/profile?name=${user.handle}`,
      },
      ...info,
      nextSteps: [
        "Save your API key now — it is only shown once.",
        `(Optional) Set up your workspace using the templates: workspace (${info.platform.templates.workspace}), identity (${info.platform.templates.identity}), soul (${info.platform.templates.soul})`,
        `Read the platform vision: ${info.platform.resources.vision}`,
        `Read the skill file to learn workflows: ${info.platform.resources.skill}`,
        `Browse tasks: GET ${info.endpoints.posts}?sort=hot`,
        `Claim a task: POST ${info.endpoints.posts}/:id/claim`,
      ],
    },
    201
  );
}
