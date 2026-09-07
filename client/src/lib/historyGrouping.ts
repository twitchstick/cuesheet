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

export type AttemptOutcome = 'imported' | 'failed' | 'mixed' | 'pending' | 'unknown';

export interface AttemptEntry {
  kind: 'attempt';
  downloadId: string;
  /** 1-based, in the order this attempt actually started -- independent of
   * where it lands in the newest-first display order below. Null when
   * there's nothing else covering the same episode(s) to number this
   * against -- a movie's download jobs are always numbered against each
   * other (there's only one subject); two TV jobs are only numbered
   * against each other when they actually cover the same episode(s). */
  attemptNumber: number | null;
  /** Every distinct episode this job's own rows touch, sorted -- a season
   * pack's history is one row per episode sharing one downloadId, so this
   * can hold more than one. Empty for a movie. */
  episodeCodes: string[];
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

/** Movies carry no episode code at all, so every movie job is one cluster
 * by construction (there's only one subject, the movie itself -- exactly
 * the case "attempt" numbering has always meant). TV jobs cluster by their
 * exact set of covered episodes: two single-episode grabs of S01E01 are
 * comparable attempts at the same thing; a S01E01 grab and a S01E02 grab
 * are not, and must never be numbered as if one were a retry of the other. */
function clusterKey(episodeCodes: string[]): string {
  return episodeCodes.length === 0 ? '\0movie' : [...episodeCodes].sort().join(',');
}

/** Each episode must finish before the whole pack is imported. Use the
 * newest evidence for each subject, so an earlier failure followed by a
 * successful import is resolved rather than permanently marked mixed. */
function jobOutcome(rows: HistoryRow[], active: boolean): AttemptOutcome {
  const latest = new Map<string, HistoryRow>();
  for (const row of [...rows].sort((a, b) => b.at - a.at)) {
    const subject = row.episodeCode ?? '\0job';
    if (!latest.has(subject)) latest.set(subject, row);
  }
  const states = [...latest.values()].map((row) => row.type);
  if (states.every((state) => state === 'imported')) return 'imported';
  if (states.some((state) => state === 'imported')) return 'mixed';
  if (states.every((state) => state === 'failed')) return 'failed';
  return active ? 'pending' : 'unknown';
}

/**
 * Rows sharing a downloadId are the same Radarr/Sonarr download job -- a
 * failure and its eventual re-grab/import, not two unrelated events -- so
 * they're grouped into one "attempt" instead of read as a flat, unconnected
 * list. Grouping only kicks in once a title has actually had more than one
 * distinct download behind it: a title that's only ever had one grab reads
 * exactly as it always has, since numbering a single attempt would add a
 * label without adding any information.
 *
 * `activeDownloadId` is the job Radarr/Sonarr's queue currently says is
 * running (LifecycleItem.activeDownloadId) -- only the group carrying that
 * id, if any, is actually still moving. A grab with nothing recorded after
 * it that *isn't* the active job is an old, unresolved job sitting in
 * history for some other reason (manually removed from the download
 * client, replaced by a different release, ...), not something in
 * progress right now, so it reads "outcome unknown" instead of implying
 * activity Cuesheet has no evidence for.
 */
export function groupHistory(rows: HistoryRow[], activeDownloadId: string | null): HistoryEntry[] {
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

  const episodeCodesOf = (group: HistoryRow[]) => [...new Set(group.map((r) => r.episodeCode).filter((c): c is string => Boolean(c)))].sort();
  const startedAt = (group: HistoryRow[]) => Math.min(...group.map((r) => r.at));

  // Only clusters with more than one job in them are genuine "attempt 1 vs
  // attempt 2" comparisons -- a job with no sibling covering the same
  // episode(s) gets no attempt number at all, just its own episode list.
  const clusters = new Map<string, string[]>(); // clusterKey -> downloadIds, in that cluster
  for (const [downloadId, group] of byDownload) {
    const key = clusterKey(episodeCodesOf(group));
    const ids = clusters.get(key);
    if (ids) ids.push(downloadId);
    else clusters.set(key, [downloadId]);
  }
  const attemptNumber = new Map<string, number>();
  for (const ids of clusters.values()) {
    if (ids.length < 2) continue;
    const ordered = [...ids].sort((a, b) => startedAt(byDownload.get(a)!) - startedAt(byDownload.get(b)!));
    ordered.forEach((id, i) => attemptNumber.set(id, i + 1));
  }

  const attempts: AttemptEntry[] = [...byDownload.entries()].map(([downloadId, groupRows]) => {
    const outcome = jobOutcome(groupRows, downloadId === activeDownloadId);
    return {
      kind: 'attempt',
      downloadId,
      attemptNumber: attemptNumber.get(downloadId) ?? null,
      episodeCodes: episodeCodesOf(groupRows),
      outcome,
      rows: [...groupRows].sort((a, b) => b.at - a.at),
      at: Math.max(...groupRows.map((r) => r.at)),
    };
  });

  const standalone: SingleEntry[] = rows.filter((r) => !r.downloadId).map((row) => ({ kind: 'single', row, at: row.at }));

  return [...attempts, ...standalone].sort((a, b) => b.at - a.at);
}

/** "S01E01" alone; "S01E01-03" for a contiguous run in one season (a season
 * pack, the common multi-episode case); "S01E01, S01E05" otherwise, rather
 * than guessing at a range that isn't really there. */
export function formatEpisodeCodes(codes: string[]): string | null {
  if (codes.length === 0) return null;
  if (codes.length === 1) return codes[0];
  const parsed = codes
    .map((code) => {
      const m = code.match(/^S(\d+)E(\d+)$/);
      return m ? { season: Number(m[1]), episode: Number(m[2]), code } : null;
    })
    .filter((p): p is { season: number; episode: number; code: string } => p !== null)
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  if (parsed.length !== codes.length) return codes.join(', '); // an unrecognized shape -- don't guess at a range
  const sameSeason = parsed.every((p) => p.season === parsed[0].season);
  const contiguous = parsed.every((p, i) => i === 0 || p.episode === parsed[i - 1].episode + 1);
  if (sameSeason && contiguous) {
    return `${parsed[0].code}-${String(parsed[parsed.length - 1].episode).padStart(2, '0')}`;
  }
  return parsed.map((p) => p.code).join(', ');
}
