import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, buildUrl } from '../src/lib/api.js';

function stubFetch(res: Response | Error) {
  const fn = vi.fn(async () => {
    if (res instanceof Error) throw res;
    return res;
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('buildUrl', () => {
  it('appends query params and skips undefined values', () => {
    expect(buildUrl('/api/games/search', { q: 'hades', limit: 5, skip: undefined })).toBe(
      '/api/games/search?q=hades&limit=5',
    );
  });
  it('returns the bare path without a query', () => {
    expect(buildUrl('/api/library')).toBe('/api/library');
    expect(buildUrl('/api/library', { a: undefined })).toBe('/api/library');
  });
});

describe('api', () => {
  it('returns parsed JSON and sends credentials', async () => {
    const fetchFn = stubFetch(json({ entries: [] }));
    await expect(api.get('/api/library')).resolves.toEqual({ entries: [] });
    expect(fetchFn).toHaveBeenCalledWith(
      '/api/library',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('sends a JSON body with a content-type header', async () => {
    const fetchFn = stubFetch(json({ ok: true }, 201));
    await api.post('/api/library', { igdbId: 1 });
    const init = (fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"igdbId":1}');
    expect(new Headers(init.headers).get('content-type')).toBe('application/json');
  });

  it('throws ApiError with the server message and status', async () => {
    stubFetch(json({ error: 'q: too short' }, 400));
    const err = await api.get('/api/games/search').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: 'q: too short' });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    stubFetch(new Response('<html>bad gateway</html>', { status: 502 }));
    const err = await api.get('/api/library').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, message: 'Request failed (502)' });
  });

  it('turns a network failure into ApiError status 0', async () => {
    stubFetch(new TypeError('Failed to fetch'));
    const err = await api.get('/api/library').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0 });
  });

  it('rethrows aborts untouched', async () => {
    const abort = new DOMException('aborted', 'AbortError');
    stubFetch(abort);
    await expect(api.get('/api/library')).rejects.toBe(abort);
  });

  it('resolves undefined for an empty success body', async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(api.delete('/api/library/x')).resolves.toBeUndefined();
  });
});
