import { useMemo } from "react";

/** Returns a `Set` whose identity only changes when its actual membership
 * does -- not merely when the caller happened to construct a new array/Set
 * this render. Used to keep the Explorer's virtualized tree from
 * re-rendering every row on every marker update (Problems panel diagnostics
 * can change on nearly every keystroke) when the set of affected file ids
 * hasn't actually changed. Same "compare a signature, cache the object"
 * pattern `useLspClient.ts`'s `pathsSignature` already uses, expressed here
 * as `useMemo` keyed on the signature rather than the (already-changed-by-
 * the-time-you'd-compare-it) array/Set reference itself. */
export function useMemoizedIdSet(ids: Iterable<string>): Set<string> {
  const sorted = Array.from(ids).sort();
  const signature = sorted.join("\n");
  return useMemo(
    () => new Set(sorted),
    // `signature` is a full, order-independent encoding of `sorted`'s
    // contents; depending on `sorted` itself (a fresh array every render)
    // would defeat the memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature]
  );
}
