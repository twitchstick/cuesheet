import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { assertReachableUrl, fetchJson, fetchRaw, readCappedBody, UpstreamError } from '../http.js';
import { fakeRes, mockFetch, restoreFetch } from './helpers.js';

afterEach(restoreFetch);

describe('assertReachableUrl', () => {
  test('rejects an unparseable URL', () => {
    assert.throws(() => assertReachableUrl('not a url'), UpstreamError);
  });

  test('rejects non-http(s) protocols', () => {
    assert.throws(() => assertReachableUrl('file:///etc/passwd'), UpstreamError);
    assert.throws(() => assertReachableUrl('ftp://example.com/x'), UpstreamError);
    assert.throws(() => assertReachableUrl('javascript:alert(1)'), UpstreamError);
  });

  test('rejects link-local IPv4 (the cloud metadata range)', () => {
    assert.throws(() => assertReachableUrl('http://169.254.169.254/latest/meta-data'), UpstreamError);
  });

  test('rejects link-local IPv6', () => {
    assert.throws(() => assertReachableUrl('http://[fe80::1]/'), UpstreamError);
  });

  test('rejects the metadata hostnames directly', () => {
    assert.throws(() => assertReachableUrl('http://metadata.google.internal/'), UpstreamError);
    assert.throws(() => assertReachableUrl('http://metadata/'), UpstreamError);
  });

  test('accepts an ordinary LAN address', () => {
    assert.equal(assertReachableUrl('http://192.168.1.10:8080'), 'http://192.168.1.10:8080/');
  });

  test('accepts https', () => {
    assert.equal(assertReachableUrl('https://plex.example.com:32400'), 'https://plex.example.com:32400/');
  });

  test('is not fooled by a host merely containing the blocked pattern', () => {
    // "169.254.1.example.com" is a real, ordinary hostname; only the literal
    // link-local IPv4 range should be refused, not anything that looks like it.
    assert.doesNotThrow(() => assertReachableUrl('http://169.254.1.example.com/'));
  });

  test('still rejects the whole 169.254.0.0/16 range, not just the metadata IP', () => {
    assert.throws(() => assertReachableUrl('http://169.254.0.1/'), UpstreamError);
    assert.throws(() => assertReachableUrl('http://169.254.255.255/'), UpstreamError);
  });
});

describe('fetchJson body cap', () => {
  test('rejects a body whose declared Content-Length exceeds the cap', async () => {
    mockFetch(fakeRes({ headers: { 'content-length': String(20 * 1024 * 1024) }, body: 'irrelevant' }));
    await assert.rejects(() => fetchJson('http://10.0.0.5/'), UpstreamError);
  });

  test('rejects a body that is actually oversized even without an honest Content-Length header', async () => {
    const big = 'x'.repeat(13 * 1024 * 1024);
    mockFetch(fakeRes({ body: big })); // no content-length header -- the post-read size check must still catch it
    await assert.rejects(() => fetchJson('http://10.0.0.5/'), UpstreamError);
  });

  test('parses an ordinary small JSON body', async () => {
    mockFetch(fakeRes({ body: JSON.stringify({ hello: 'world' }) }));
    const data = await fetchJson('http://10.0.0.5/');
    assert.deepEqual(data, { hello: 'world' });
  });

  test('a non-JSON 200 response is a clear error, not a silent parse failure', async () => {
    mockFetch(fakeRes({ body: '<html>not json</html>' }));
    await assert.rejects(() => fetchJson('http://10.0.0.5/'), UpstreamError);
  });

  test('an error status body is also capped, and its detail is length-limited', async () => {
    mockFetch(fakeRes({ ok: false, status: 500, body: JSON.stringify({ message: 'x'.repeat(5000) }) }));
    await assert.rejects(() => fetchJson('http://10.0.0.5/'), (err) => {
      assert.ok(err instanceof UpstreamError);
      assert.ok(err.message.length < 400, `error message should be capped, got ${err.message.length} chars`);
      return true;
    });
  });

  test('a 204 response yields null, not a parse attempt on an empty body', async () => {
    mockFetch(fakeRes({ status: 204, body: '' }));
    assert.equal(await fetchJson('http://10.0.0.5/'), null);
  });
});

describe('readCappedBody', () => {
  test('accepts a body under the limit', async () => {
    const buf = await readCappedBody(fakeRes({ body: 'ok' }), 1024);
    assert.equal(buf.toString('utf8'), 'ok');
  });

  test('rejects on the declared header alone, without reading the body', async () => {
    let read = false;
    const res = fakeRes({ headers: { 'content-length': '2000' }, body: 'small' });
    const origArrayBuffer = res.arrayBuffer;
    res.arrayBuffer = async () => {
      read = true;
      return origArrayBuffer();
    };
    await assert.rejects(() => readCappedBody(res, 1024), UpstreamError);
    assert.equal(read, false, 'should reject from the declared Content-Length before ever reading the body');
  });

  test('rejects on actual size when the header under-reports it', async () => {
    await assert.rejects(() => readCappedBody(fakeRes({ headers: { 'content-length': '1' }, body: 'x'.repeat(2000) }), 1024), UpstreamError);
  });
});

describe('redirect handling', () => {
  test('follows a redirect to another reachable address', async () => {
    mockFetch([
      fakeRes({ status: 302, headers: { location: 'http://10.0.0.6/final' } }),
      fakeRes({ body: JSON.stringify({ ok: true }) }),
    ]);
    const data = await fetchJson('http://10.0.0.5/');
    assert.deepEqual(data, { ok: true });
  });

  test('a redirect landing on a link-local address is refused, not followed', async () => {
    mockFetch([fakeRes({ status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } })]);
    await assert.rejects(() => fetchJson('http://10.0.0.5/'), UpstreamError);
  });

  test('gives up after too many redirect hops rather than looping forever', async () => {
    mockFetch([
      fakeRes({ status: 302, headers: { location: 'http://10.0.0.6/1' } }),
      fakeRes({ status: 302, headers: { location: 'http://10.0.0.6/2' } }),
      fakeRes({ status: 302, headers: { location: 'http://10.0.0.6/3' } }),
      fakeRes({ status: 302, headers: { location: 'http://10.0.0.6/4' } }),
    ]);
    await assert.rejects(() => fetchJson('http://10.0.0.5/'), UpstreamError);
  });
});

describe('fetchRaw', () => {
  test('returns the raw response rather than parsing it', async () => {
    mockFetch(fakeRes({ body: 'binary-ish content' }));
    const res = await fetchRaw('http://10.0.0.5/image.jpg');
    assert.equal(res.ok, true);
    assert.equal(await res.text(), 'binary-ish content');
  });
});
