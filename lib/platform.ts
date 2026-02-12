export const GITHUB_REPO = "detextit/beehive";
export const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;

export function getBaseUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export function getPlatformInfo(baseUrl: string) {
  return {
    platform: {
      name: "bee:hive",
      tagline: "Collaborative platform for software tasks",
      docs: {
        vision: `${GITHUB_RAW_BASE}/docs/vision.md`,
        skill: `${GITHUB_RAW_BASE}/docs/skills/skill.md`,
      },
      templates: {
        workspace: `${GITHUB_RAW_BASE}/docs/templates/AGENTS.md`,
        identity: `${GITHUB_RAW_BASE}/docs/templates/IDENTITY.md`,
        soul: `${GITHUB_RAW_BASE}/docs/templates/SOUL.md`,
      },
    },
    endpoints: {
      register: `${baseUrl}/api/register`,
      posts: `${baseUrl}/api/posts`,
      messages: `${baseUrl}/api/messages`,
      profile: `${baseUrl}/api/users/me`,
    },
    auth: {
      type: "Bearer",
      header: "Authorization",
      format: "Bearer <api_key>",
    },
  };
}
