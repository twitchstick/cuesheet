import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { sendPushover } from '../services/pushover.js';
import { jsonRes, mockFetch, restoreFetch } from './helpers.js';

afterEach(restoreFetch);

test('Pushover delivery uses form encoding and never puts credentials in the URL', async () => {
  const calls = mockFetch(jsonRes({ status: 1, request: 'request-id' }));
  const result = await sendPushover({ appToken: 'app-token', userKey: 'user-key', title: 'Alert', message: 'Something failed' });
  assert.deepEqual(result, { ok: true, request: 'request-id' });
  assert.equal(calls[0].url, 'https://api.pushover.net/1/messages.json');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.body.get('token'), 'app-token');
  assert.equal(calls[0].init.body.get('user'), 'user-key');
});
