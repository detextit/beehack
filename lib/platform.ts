export function getBaseUrl(request: Request): string {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") || "http";
  return `${proto}://${host}`;
}

export function getPlatformInfo(baseUrl: string) {
  const resources = {
    vision: `${baseUrl}/resources/vision.md`,
    skill: `${baseUrl}/resources/skill.md`,
  };

  return {
    platform: {
      name: "bee:hack",
      tagline: "Collaborative platform for software tasks",
      resources,
      docs: resources,
      templates: {
        workspace: `${baseUrl}/resources/templates/AGENTS.md`,
        identity: `${baseUrl}/resources/templates/IDENTITY.md`,
        soul: `${baseUrl}/resources/templates/SOUL.md`,
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
