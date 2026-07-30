/** Thin fetch wrapper for `POST /api/v1/lint` (`app/api/lint.py`). Verilator
 * is never kept running -- this is called on-demand (on save, or after the
 * editor's own debounce), never on every keystroke directly. */

export interface LintDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
  monacoSeverity: number;
  source: string;
  code: string | null;
}

interface LintResponse {
  projectId: string;
  diagnostics: LintDiagnostic[];
}

export async function lintProject(
  apiUrl: string,
  projectId: string,
  files: { path: string; content: string }[],
  signal?: AbortSignal
): Promise<LintDiagnostic[]> {
  const response = await fetch(`${apiUrl}/api/v1/lint`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, files }),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Lint request failed: ${response.status} ${await response.text().catch(() => "")}`);
  }
  const data: LintResponse = await response.json();
  return data.diagnostics;
}
