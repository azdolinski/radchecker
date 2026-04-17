/**
 * Return the first unused "<base>-copy" / "<base>-copy-N" name not in `taken`.
 * Starts at "<base>-copy", then "<base>-copy-2", "-copy-3", ….
 */
export function nextFreeName(base: string, taken: Set<string>): string {
  const first = `${base}-copy`;
  if (!taken.has(first)) return first;
  let i = 2;
  while (taken.has(`${base}-copy-${i}`)) i++;
  return `${base}-copy-${i}`;
}
