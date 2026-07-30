export interface FuzzyMatch {
  score: number;
  /** Half-open [start, end) character ranges within `target` that matched --
   * consumed by callers to highlight the matched characters (VS Code Quick
   * Open-style), merging adjacent single-character matches into runs. */
  ranges: [number, number][];
}

/** Simple ordered-subsequence fuzzy matcher: every character of `query` must
 * appear in `target`, in order, case-insensitively. Consecutive-run and
 * word-boundary matches score higher, so "cpu" ranks "cpu_core" above
 * "decode_cpu" above "accept_pull_unit". Shared by the Search Symbols panel
 * and the Search Everywhere palette so ranking/highlighting behaves
 * identically in both rather than each rolling its own. */
export function fuzzyMatch(query: string, target: string): FuzzyMatch | null {
  if (!query.trim()) return { score: 0, ranges: [] };
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  let qi = 0;
  let score = 0;
  let lastMatchIndex = -2;
  const ranges: [number, number][] = [];

  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue;

    let bonus = 1;
    if (ti === lastMatchIndex + 1) bonus += 3;
    if (ti === 0 || /[^a-z0-9]/i.test(target[ti - 1])) bonus += 2;
    score += bonus;

    if (ranges.length > 0 && ranges[ranges.length - 1][1] === ti) {
      ranges[ranges.length - 1][1] = ti + 1;
    } else {
      ranges.push([ti, ti + 1]);
    }

    lastMatchIndex = ti;
    qi += 1;
  }

  if (qi < q.length) return null;
  score -= (t.length - q.length) * 0.05;
  return { score, ranges };
}
