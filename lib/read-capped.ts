/**
 * A request body as text, or null once it passes `max` BYTES.
 *
 * Bytes, not characters: `text.length` counts UTF-16 code units, so a body of
 * three-byte characters passed a 32 KB check at 96 KB. And read on the stream,
 * not with `request.text()`: a chunked upload has no content-length, so
 * `text()` buffered all of it before any size check could run. The reader is
 * cancelled on the way out so the rest of an oversized upload is not read.
 *
 * Shared by /api/track and /api/chat, both public and unauthenticated.
 */
export async function readCapped(
  request: Request,
  max: number,
): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}
