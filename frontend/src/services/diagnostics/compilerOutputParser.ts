/** Legacy fallback parser for iverilog compile-stage stderr/stdout text.
 *
 * As of the Verilator migration, `/ws/execute/{jobId}`'s `output` message
 * (stream: "compiler") carries a structured `diagnostics` array built
 * server-side by whichever `SimulatorAdapter` ran the job (see
 * `app/services/simulators/*_adapter.py`'s `parse_compiler_output` and
 * `execution_manager.py`'s `_output` helper) -- every engine converts its
 * own output into the same `{file, line, column, severity, message, code}`
 * shape there, unified with what `/api/v1/lint` (Verilator) already
 * produces. `useCompilerMarkers.ts` prefers that structured array and only
 * falls back to this regex when a message has raw text but no diagnostics
 * (e.g. an older cached session, or a future engine that hasn't wired
 * structured parsing yet). Kept named after iverilog's shape specifically
 * because that's the one format this regex actually understands. */

export interface CompilerDiagnostic {
  file: string;
  line: number;
  message: string;
  severity: "error" | "warning";
  /** Present when sourced from the backend's structured diagnostics;
   * absent when derived by this file's own regex fallback. */
  column?: number;
  code?: string | null;
}

const LINE_RE = /^([^\s:][^:]*):(\d+):\s*(?:(error|warning):\s*)?(.+)$/i;

export function parseCompilerOutput(text: string): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = LINE_RE.exec(line);
    if (!match) continue;
    const [, file, lineNoStr, severityWord, message] = match;
    diagnostics.push({
      file: file.trim(),
      line: Number(lineNoStr),
      message: message.trim(),
      severity: severityWord ? (severityWord.toLowerCase() as "error" | "warning") : "error",
    });
  }
  return diagnostics;
}
