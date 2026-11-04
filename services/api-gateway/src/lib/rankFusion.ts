const RRF_K = 60; // standard Reciprocal Rank Fusion constant

// reciprocal rank fusion: sum 1/(k + rank) over every list a video appears in
export function fuseRankings(...lists: string[][]): string[] {
  const scores = new Map<string, number>();
  for (const list of lists) {
    list.forEach((id, i) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (RRF_K + i + 1));
    });
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}
