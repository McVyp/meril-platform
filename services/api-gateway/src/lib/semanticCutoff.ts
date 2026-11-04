export const MIN_QUERY_SIMILARITY = 0.3; // cosine; below this a "meaning" match is noise
export const MAX_GAP_FROM_BEST = 0.2; // drop matches far below the query's best match

// rows sorted best first; keep only matches close to this query's best one
export function keepCloseMatches(
  rows: { id: string; sim: number }[],
): string[] {
  if (rows.length === 0) return [];
  const cutoff = Math.max(
    MIN_QUERY_SIMILARITY,
    rows[0].sim - MAX_GAP_FROM_BEST,
  );
  return rows.filter((r) => r.sim >= cutoff).map((r) => r.id);
}
