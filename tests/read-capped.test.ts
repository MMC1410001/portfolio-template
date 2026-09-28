/**
 * The body cap shared by /api/track and /api/chat counts bytes on the stream.
 */
// oxlint-disable typescript/no-floating-promises -- node:test's `test()`
// returns a promise by design and is meant to be called without awaiting.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCapped } from '../lib/read-capped';

const post = (body: string) => new Request('https://x.test/', { method: 'POST', body });

test('a body under the cap reads back whole', async () => {
  assert.equal(await readCapped(post('{"a":1}'), 64), '{"a":1}');
});

test('the cap is in bytes, not UTF-16 units', async () => {
  const hindi = 'क'.repeat(10); // 10 code units, 30 bytes
  assert.equal(await readCapped(post(hindi), 30), hindi);
  assert.equal(await readCapped(post(hindi), 29), null);
});

test('a chunked upload with no content-length is stopped at the cap', async () => {
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(1024)); },
  });
  const request = new Request('https://x.test/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
  assert.equal(await readCapped(request, 4096), null);
});

test('no body reads as empty', async () => {
  assert.equal(await readCapped(new Request('https://x.test/'), 10), '');
});
