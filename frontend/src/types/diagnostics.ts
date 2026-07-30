export type ProblemSeverity = "error" | "warning" | "info";

/** One row in the Problems panel -- a flattened, file-grouped view of a
 * single Monaco marker (see `useProblems.ts` for why Monaco's own marker
 * table is the source of truth rather than a separate diagnostics store). */
export interface ProblemEntry {
  id: string;
  fileId: string;
  filePath: string;
  fileName: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: ProblemSeverity;
  source: string;
}
