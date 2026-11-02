import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

const night = '2026-10-28';
const totals = { ok: 0, retry: 0, fail: 0 };

// Read semantic table cells, without depending on classes, wrappers, or attributes.
function tableRows(html: string): string[][] {
  return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
      cell[1].replace(/<[^>]*>/g, '').replace(/&mdash;|&#8212;|&#x2014;/gi, '—').trim(),
    ),
  );
}

describe('digest routes', () => {
  let runsDir: string;

  beforeEach(async () => {
    runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  });

  afterEach(async () => {
    // This directory is created by this test, never the repository's runs/.
    if (runsDir) await rm(runsDir, { recursive: true, force: true });
  });

  function app() {
    return createApp({
      adapter: 'shim',
      installed: '2026-10-29T14:06:00+01:00',
      beatEverySeconds: 60,
      runsDir,
    });
  }

  async function writeNight(lines: unknown[]) {
    await writeFile(join(runsDir, `${night}.jsonl`), lines.map((line) => JSON.stringify(line)).join('\n'));
  }

  it('serves the same sorted jobs in HTML and the complete JSON digest', async () => {
    const firstAt = '2026-10-28T01:00:00+05:30';
    const lastAt = '2026-10-28T01:04:00+05:30';
    await writeNight([
      { at: firstAt, job: 'zulu', owner: 'Zoe', status: 'fail', error: 'temporary outage' },
      { at: firstAt, job: 'beta', owner: 'Bea', status: 'fail', error: 'still broken' },
      { at: firstAt, job: 'alpha', owner: null, status: 'retry' },
      { at: '2026-10-28T01:01:00+05:30', job: 'alpha', owner: null, status: 'retry' },
      { at: '2026-10-28T01:02:00+05:30', job: 'alpha', owner: null, status: 'retry' },
      { at: lastAt, job: 'alpha', owner: null, status: 'ok' },
      { at: lastAt, job: 'zulu', owner: 'Zoe', status: 'ok' },
    ]);

    const service = app();
    const page = await service.request(`/digest/${night}`);
    const api = await service.request(`/api/digest/${night}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect(api.status).toBe(200);
    expect(api.headers.get('content-type')).toContain('application/json');

    const expected: NightDigest = {
      night,
      found: true,
      malformedLines: 0,
      totals: { ok: 2, retry: 3, fail: 2 },
      rows: [
        { job: 'alpha', owner: null, runs: 4, retries: 3, lastStatus: 'ok', lastError: null, firstAt, lastAt, hasFailure: false },
        { job: 'beta', owner: 'Bea', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'still broken', firstAt, lastAt: firstAt, hasFailure: true },
        { job: 'zulu', owner: 'Zoe', runs: 2, retries: 0, lastStatus: 'ok', lastError: 'temporary outage', firstAt, lastAt, hasFailure: true },
      ],
    };
    const digest = await api.json() as NightDigest;
    expect(digest).toEqual(expected);

    const html = await page.text();
    expect(html).toMatch(/<table\b/i);
    const jobs = digest.rows.map((row) => row.job);
    const rows = tableRows(html).filter((cells) => cells.some((cell) => jobs.includes(cell)));
    expect(rows.map((cells) => cells.find((cell) => jobs.includes(cell)))).toEqual(jobs);
    expect(rows.find((cells) => cells.includes('alpha'))).toContain('—');
    expect(html).toContain(firstAt);
    expect(html).toContain(lastAt);
  });

  it.each(['/digest', '/api/digest'])('returns 404 for a missing night at %s', async (route) => {
    const response = await app().request(`${route}/${night}`);
    expect(response.status).toBe(404);
  });

  it('renders an empty night as nothing ran and returns an empty complete digest', async () => {
    await writeFile(join(runsDir, `${night}.jsonl`), '');
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const api = await service.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(await page.text()).toMatch(/nothing ran/i);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({ night, found: true, rows: [], malformedLines: 0, totals });
  });

  it('counts malformed lines without losing valid rows, null owners, or timestamp offsets', async () => {
    const at = '2026-10-28T22:15:00-04:00';
    const valid = { at, job: 'surviving-job', owner: null, status: 'ok' };
    await writeFile(join(runsDir, `${night}.jsonl`), [
      '{broken json',
      '',
      JSON.stringify(valid),
      JSON.stringify({ ...valid, job: 'invalid-job', status: 'unknown' }),
      '   ',
    ].join('\n'));
    const service = app();
    const page = await service.request(`/digest/${night}`);
    const api = await service.request(`/api/digest/${night}`);

    expect(page.status).toBe(200);
    expect(api.status).toBe(200);
    expect(await api.json()).toEqual({
      night,
      found: true,
      malformedLines: 2,
      totals: { ok: 1, retry: 0, fail: 0 },
      rows: [{ job: 'surviving-job', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: at, lastAt: at, hasFailure: false }],
    } satisfies NightDigest);
    const html = await page.text();
    const rows = tableRows(html);
    expect(rows.filter((cells) => cells.includes('surviving-job'))).toHaveLength(1);
    expect(rows.find((cells) => cells.includes('surviving-job'))).toContain('—');
    expect(html).toContain(at);
    expect(html).not.toContain('invalid-job');
  });
});
