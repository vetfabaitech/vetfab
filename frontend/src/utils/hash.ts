/** Fast, non-cryptographic djb2 hash -- good enough to detect content changes
 * between analysis runs for incremental sync, not for security purposes. */
export function hashString(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
