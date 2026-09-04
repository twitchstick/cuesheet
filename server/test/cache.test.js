import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { cached, invalidate, MAX_ENTRIES } from '../cache.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe('cached()', () => {
  test('a second call within the TTL returns the cached value without calling the loader again', async () => {
    let calls = 0;
    const load = () => {
      calls++;
      return `v${calls}`;
    };
    const first = await cached('ttl-basic', 10_000, load);
    const second = await cached('ttl-basic', 10_000, load);
    assert.equal(first, 'v1');
    assert.equal(second, 'v1');
    assert.equal(calls, 1);
  });

  test('a call after the TTL has passed calls the loader again', async () => {
    let calls = 0;
    const load = () => {
      calls++;
      return `v${calls}`;
    };
    await cached('ttl-expiry', 5, load);
    await sleep(20);
    const second = await cached('ttl-expiry', 5, load);
    assert.equal(second, 'v2');
    assert.equal(calls, 2);
  });

  test('concurrent calls for the same key while a fetch is in flight share one loader call', async () => {
    let calls = 0;
    const load = async () => {
      calls++;
      await sleep(20);
      return 'v';
    };
    const [a, b, c] = await Promise.all([cached('concurrent', 10_000, load), cached('concurrent', 10_000, load), cached('concurrent', 10_000, load)]);
    assert.deepEqual([a, b, c], ['v', 'v', 'v']);
    assert.equal(calls, 1);
  });

  test('a different key does not share another key’s cached value', async () => {
    await cached('key-a', 10_000, () => 'a');
    const b = await cached('key-b', 10_000, () => 'b');
    assert.equal(b, 'b');
  });

  describe('stale-on-error', () => {
    test('a loader failure after a previous success serves the stale value instead of throwing', async () => {
      await cached('stale-basic', 5, () => 'good');
      await sleep(20); // let it expire
      const result = await cached('stale-basic', 5, () => {
        throw new Error('upstream is down');
      });
      assert.equal(result, 'good');
    });

    test('the stale value is served again for a short window, without re-calling the loader every time', async () => {
      await cached('stale-window', 5, () => 'good');
      await sleep(20);
      let calls = 0;
      const flaky = () => {
        calls++;
        throw new Error('still down');
      };
      await cached('stale-window', 5, flaky); // first failure -- refreshes the stale window
      const second = await cached('stale-window', 5, flaky); // within that window -- no second call
      assert.equal(second, 'good');
      assert.equal(calls, 1);
    });

    test('a loader failure with no previous value at all propagates the error', async () => {
      await assert.rejects(
        () => cached('stale-none', 10_000, () => { throw new Error('no data yet'); }),
        /no data yet/,
      );
    });
  });

  describe('invalidate()', () => {
    test('removes only keys matching the given prefix', async () => {
      await cached('inv:a:1', 10_000, () => 'a1');
      await cached('inv:a:2', 10_000, () => 'a2');
      await cached('inv:b:1', 10_000, () => 'b1');
      invalidate('inv:a:');

      let calls = 0;
      const value = await cached('inv:a:1', 10_000, () => {
        calls++;
        return 'a1-refetched';
      });
      assert.equal(value, 'a1-refetched');
      assert.equal(calls, 1);

      // inv:b:1 was never touched by the prefix -- still cached, no refetch.
      let bCalls = 0;
      await cached('inv:b:1', 10_000, () => {
        bCalls++;
        return 'b1-refetched';
      });
      assert.equal(bCalls, 0);
    });

    test('an empty prefix matches every key -- a full flush', async () => {
      await cached('flush:1', 10_000, () => 'x');
      await cached('flush:2', 10_000, () => 'y');
      invalidate('');

      let calls = 0;
      await cached('flush:1', 10_000, () => {
        calls++;
        return 'refetched';
      });
      await cached('flush:2', 10_000, () => {
        calls++;
        return 'refetched';
      });
      assert.equal(calls, 2);
    });
  });

  // Last: pushes the store well past MAX_ENTRIES, so it doesn't shape what
  // any earlier test above sees.
  test(`evicts the oldest entries once more than MAX_ENTRIES (${MAX_ENTRIES}) accumulate`, async () => {
    const total = MAX_ENTRIES + 50;
    for (let i = 0; i < total; i++) {
      await cached(`evict-${i}`, 10_000_000, () => `v${i}`); // a TTL long enough that nothing here expires on its own
    }
    // The first 50 keys written were also the longest untouched -- if
    // eviction is working, at least some of them are gone and this refetches.
    let refetched = 0;
    for (let i = 0; i < 50; i++) {
      const v = await cached(`evict-${i}`, 10_000_000, () => `refetched-${i}`);
      if (v === `refetched-${i}`) refetched++;
    }
    assert.ok(refetched > 0, 'expected at least some of the oldest entries to have been evicted to stay under MAX_ENTRIES');
  });
});
