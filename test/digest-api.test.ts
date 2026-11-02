import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { NightDigest, ReadNight } from '../src/digest/types.js';
import { createDigestApiRouter } from '../src/routes/digest-api.js';

const { readNight } = vi.hoisted(() => ({ readNight: vi.fn<ReadNight>() }));

vi.mock('../src/digest/read-night.js', () => ({ readNight }));

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '/configured/runs',
};

function app() {
  return new Hono().route('/api/digest', createDigestApiRouter(config));
}

describe('digest JSON API', () => {
  it('returns the complete reader result without changing rows or metadata', async () => {
    const digest: NightDigest = {
      night: '2026-10-28',
      found: true,
      rows: ['A-job', 'z-job'].map((job) => ({
        job,
        owner: null,
        runs: 5,
        retries: 3,
        lastStatus: 'ok',
        lastError: 'earlier failure',
        firstAt: '2026-10-28T01:00:00+01:00',
        lastAt: '2026-10-28T02:00:00+01:00',
        hasFailure: true,
      })),
      malformedLines: 1,
      totals: { ok: 2, retry: 6, fail: 2 },
    };
    readNight.mockResolvedValueOnce(digest);

    const response = await app().request('/api/digest/2026-10-28');

    expect(readNight).toHaveBeenLastCalledWith(config.runsDir, digest.night);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(digest);
  });

  it.each([true, false])('maps an empty result with found=%s to its status', async (found) => {
    const digest: NightDigest = {
      night: '2026-10-29',
      found,
      rows: [],
      malformedLines: 0,
      totals: { ok: 0, retry: 0, fail: 0 },
    };
    readNight.mockResolvedValueOnce(digest);

    const response = await app().request('/api/digest/2026-10-29');

    expect(response.status).toBe(found ? 200 : 404);
    expect(await response.json()).toEqual(digest);
  });
});
