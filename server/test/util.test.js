import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  pad2,
  episodeCode,
  imageUrl,
  tmdbPoster,
  localDate,
  localTime,
  addDays,
  isIsoDate,
  queueProgress,
  queueStatus,
  queueMessage,
} from '../util.js';

describe('pad2 / episodeCode', () => {
  test('pads single digits, leaves double digits alone', () => {
    assert.equal(pad2(3), '03');
    assert.equal(pad2(12), '12');
    assert.equal(pad2(0), '00');
  });

  test('treats a missing number as 0, not "undefined"', () => {
    assert.equal(pad2(undefined), '00');
    assert.equal(pad2(null), '00');
  });

  test('builds a standard SxxExx code', () => {
    assert.equal(episodeCode(3, 2), 'S03E02');
    assert.equal(episodeCode(12, 108), 'S12E108');
  });
});

describe('imageUrl', () => {
  test('builds a proxied URL carrying the source and ref', () => {
    assert.equal(imageUrl('radarr', 42), '/api/image?s=radarr&p=42');
  });

  test('returns null for a falsy ref rather than a URL pointing nowhere', () => {
    assert.equal(imageUrl('radarr', null), null);
    assert.equal(imageUrl('radarr', ''), null);
    assert.equal(imageUrl('radarr', 0), null);
  });

  test('passes extra params through (width/height/tag)', () => {
    assert.equal(imageUrl('plex', 7, { w: 300, h: 450 }), '/api/image?s=plex&p=7&w=300&h=450');
  });
});

describe('tmdbPoster', () => {
  test('builds a real TMDB poster URL', () => {
    assert.equal(tmdbPoster('/abc.jpg'), 'https://image.tmdb.org/t/p/w342/abc.jpg');
  });

  test('honors a custom size', () => {
    assert.equal(tmdbPoster('/abc.jpg', 'w500'), 'https://image.tmdb.org/t/p/w500/abc.jpg');
  });

  test('returns null with no path, rather than a broken URL', () => {
    assert.equal(tmdbPoster(null), null);
    assert.equal(tmdbPoster(''), null);
  });
});

describe('localDate / localTime', () => {
  test('formats a UTC instant in a specific time zone as YYYY-MM-DD', () => {
    // 2026-01-01 00:30 UTC is still 2025-12-31 evening in US/Pacific.
    assert.equal(localDate(new Date('2026-01-01T00:30:00Z'), 'America/Los_Angeles'), '2025-12-31');
    assert.equal(localDate(new Date('2026-01-01T00:30:00Z'), 'UTC'), '2026-01-01');
  });

  test('formats time as 24h HH:mm in the given zone', () => {
    assert.equal(localTime(new Date('2026-06-15T18:05:00Z'), 'UTC'), '18:05');
  });

  test('an invalid date yields null instead of "Invalid Date" strings', () => {
    assert.equal(localDate(new Date('not a date'), 'UTC'), null);
    assert.equal(localTime(new Date('not a date'), 'UTC'), null);
  });

  test('accepts a raw value as well as a Date instance', () => {
    assert.equal(localDate('2026-03-04T00:00:00Z', 'UTC'), '2026-03-04');
  });
});

describe('addDays / isIsoDate', () => {
  test('adds days within a month', () => {
    assert.equal(addDays('2026-03-10', 5), '2026-03-15');
  });

  test('rolls over a month boundary', () => {
    assert.equal(addDays('2026-01-30', 3), '2026-02-02');
  });

  test('rolls over a year boundary', () => {
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  });

  test('subtracts with a negative count', () => {
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  test('isIsoDate recognizes the shape, not the calendar validity', () => {
    assert.equal(isIsoDate('2026-03-10'), true);
    assert.equal(isIsoDate('26-3-10'), false);
    assert.equal(isIsoDate('not a date'), false);
    assert.equal(isIsoDate(null), false);
    assert.equal(isIsoDate(20260310), false);
  });
});

describe('queueProgress', () => {
  test('computes a fraction from size and what is left', () => {
    assert.equal(queueProgress(1000, 250), 0.75);
  });

  test('clamps to 0 when nothing has downloaded', () => {
    assert.equal(queueProgress(1000, 1000), 0);
  });

  test('clamps to 1 rather than going over on a bad sizeleft', () => {
    assert.equal(queueProgress(1000, -50), 1);
  });

  test('a missing/zero total size is 0 progress, not NaN or Infinity', () => {
    assert.equal(queueProgress(0, 0), 0);
    assert.equal(queueProgress(null, null), 0);
    assert.equal(queueProgress(undefined, 500), 0);
  });
});

describe('queueStatus', () => {
  test('paused wins even over an error-shaped record', () => {
    assert.equal(queueStatus({ status: 'paused', trackedDownloadStatus: 'error' }), 'paused');
  });

  test('an explicit error status is failed', () => {
    assert.equal(queueStatus({ trackedDownloadStatus: 'error' }), 'failed');
    assert.equal(queueStatus({ status: 'failed' }), 'failed');
    assert.equal(queueStatus({ trackedDownloadState: 'failedPending' }), 'failed');
  });

  test('an unreachable download client is stalled, not just "failed"', () => {
    assert.equal(queueStatus({ trackedDownloadState: 'downloadClientUnavailable' }), 'stalled');
  });

  test('a warning status is warning', () => {
    assert.equal(queueStatus({ trackedDownloadStatus: 'warning' }), 'warning');
    assert.equal(queueStatus({ status: 'warning' }), 'warning');
  });

  test('an importing state is importing', () => {
    assert.equal(queueStatus({ trackedDownloadState: 'importing' }), 'importing');
    assert.equal(queueStatus({ trackedDownloadState: 'importBlocked' }), 'importing');
  });

  test('a delay is queued', () => {
    assert.equal(queueStatus({ status: 'delay' }), 'queued');
    assert.equal(queueStatus({ trackedDownloadState: 'delay' }), 'queued');
  });

  test('the ordinary case, nothing special reported, is downloading', () => {
    assert.equal(queueStatus({ status: 'ok', trackedDownloadState: 'downloading' }), 'downloading');
    assert.equal(queueStatus({}), 'downloading');
  });
});

describe('queueMessage', () => {
  test('flattens the first statusMessages entry', () => {
    assert.equal(
      queueMessage({ statusMessages: [{ title: 'X', messages: ['Sample rejected', 'other'] }] }),
      'Sample rejected',
    );
  });

  test('falls back to errorMessage when there are no statusMessages', () => {
    assert.equal(queueMessage({ errorMessage: 'Disk full' }), 'Disk full');
  });

  test('is null, not undefined or an empty string, when there is nothing to report', () => {
    assert.equal(queueMessage({}), null);
    assert.equal(queueMessage({ statusMessages: [] }), null);
  });
});
