/** Backs the Preferences panel's "Format on Save" toggle with the backend's
 * real Verible formatter (`POST /api/v1/format`) -- Monaco has no built-in
 * formatter registered for Verilog/SystemVerilog/VHDL, so its own
 * `editor.action.formatDocument` action is a silent no-op for every file
 * this IDE edits.
 *
 * The format endpoint reads from the on-disk workspace, not the request
 * body (see backend's `FormatRequest` docstring), so the current buffer is
 * pushed via `/workspace/save` immediately beforehand -- both calls target
 * just the one file being saved, not the whole project. */

async function errorDetail(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return body?.detail ?? fallback;
}

export async function formatFileOnSave(
  apiUrl: string,
  projectId: string,
  relativePath: string,
  content: string
): Promise<string> {
  const saveRes = await fetch(`${apiUrl}/api/v1/workspace/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, files: [{ path: relativePath, content }] }),
  });
  if (!saveRes.ok) throw new Error(await errorDetail(saveRes, `Couldn't save before formatting (${saveRes.status})`));

  const formatRes = await fetch(`${apiUrl}/api/v1/format`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace: projectId, filename: relativePath }),
  });
  if (!formatRes.ok) throw new Error(await errorDetail(formatRes, `Format failed (${formatRes.status})`));

  const data = await formatRes.json();
  return data.formatted as string;
}
