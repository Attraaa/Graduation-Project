export interface ScoredSessions {
  average_score: number | null;
  session_count: number;
}

export function averageSessionScore(rows: readonly ScoredSessions[]): number | null {
  const scoredRows = rows.filter((row) => row.average_score !== null);
  const count = scoredRows.reduce((sum, row) => sum + row.session_count, 0);
  return count > 0
    ? Math.round(scoredRows.reduce((sum, row) => sum + row.average_score! * row.session_count, 0) / count)
    : null;
}
