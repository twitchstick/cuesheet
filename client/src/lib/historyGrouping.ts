import type { HistoryEvent } from '../types';

/** A HistoryEvent from the server, or the one row HistoryStrip already knows
 * client-side and costs no request: the trace's own start. Kept generic
 * (not HistoryEvent itself) since that synthetic row isn't part of any
 * download's own lifecycle -- it has no downloadId/episodeCode of its own. */
export interface HistoryRow {
  id: string;
  type: HistoryEvent['type'] | 'requested';
  at: number;
  detail?: string | null;
  release?: string | null;
  indexer?: string | null;
  downloadId?: string | null;
  episodeCode?: string | null;
}

export type AttemptOutcome = 'imported' | 'failed' | 'pending';

export interface AttemptEntry {
  kind: 'attempt';
  downloadId: string;
  /** 1-based, in the order this attempt actually started -- independent of
   * where it lands in the newest-first display order below. */
  attemptNumber: number;
  episodeCode: string | null;
  outcome: AttemptOutcome;
  /** This attempt's own rows, newest first, same as the top-level list. */
  rows: HistoryRow[];
  at: number;
}

export interface SingleEntry {
  kind: 'single';
  row: HistoryRow;
  at: number;
}

export type HistoryEntry = AttemptEntry | SingleEntry;

/**
 * Rows sharing a downloadId are the same Radarr/Sonarr download job -- a
 * failure and its eventual re-grab/import, not two unrelated events -- so
 * they're grouped into one "attempt" instead of read as a flat, unconnected
 * list. Grouping only kicks in once a title has actually had more than one
 * distinct download behind it: a title that's only ever had one grab reads
 * exactly as it always has, since numbering a single attempt would add a
 * label without adding any information.
 */
export function groupHistory(rows: HistoryRow[]): HistoryEntry[] {
  const byDownload = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    if (!row.downloadId) continue;
    const list = byDownload.get(row.downloadId);
    if (list) list.push(row);
    else byDownload.set(row.downloadId, [row]);
  }

  if (byDownload.size < 2) {
    return rows.map((row) => ({ kind: 'single', row, at: row.at }));
  }

  // Numbered by when each attempt actually started, not by display order.
  const startedAt = (group: HistoryRow[]) => Math.min(...group.map((r) => r.at));
  const attemptNumber = new Map(
    [...byDownload.entries()].sort(([, a], [, b]) => startedAt(a) - startedAt(b)).map(([id], i) => [id, i + 1]),
  );

  const attempts: AttemptEntry[] = [...byDownload.entries()].map(([downloadId, groupRows]) => ({
    kind: 'attempt',
    downloadId,
    attemptNumber: attemptNumber.get(downloadId)!,
    episodeCode: groupRows.find((r) => r.episodeCode)?.episodeCode ?? null,
    outcome: groupRows.some((r) => r.type === 'imported') ? 'imported' : groupRows.some((r) => r.type === 'failed') ? 'failed' : 'pending',
    rows: [...groupRows].sort((a, b) => b.at - a.at),
    at: Math.max(...groupRows.map((r) => r.at)),
  }));

  const standalone: SingleEntry[] = rows.filter((r) => !r.downloadId).map((row) => ({ kind: 'single', row, at: row.at }));

  return [...attempts, ...standalone].sort((a, b) => b.at - a.at);
}
