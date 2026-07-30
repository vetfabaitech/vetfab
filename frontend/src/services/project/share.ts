export interface ShareLinkResult {
  url: string;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "project";
}

/** Mock "generate a shareable link" call -- stands in for a future backend
 * endpoint (e.g. `POST /api/v1/project/share`) that would mint a real,
 * durable link to the saved snapshot. Kept as an isolated async function
 * (not baked into the Share button) precisely so swapping the body for a
 * real `fetch` later doesn't touch any UI code. */
export async function createShareLink(projectId: string | null, workspaceName: string): Promise<ShareLinkResult> {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const slug = projectId || slugify(workspaceName);
  const token = Math.random().toString(36).slice(2, 10);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return { url: `${origin}/share/${slug}-${token}` };
}
