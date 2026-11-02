import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';

const fixtures = fileURLToPath(new URL('../runs/', import.meta.url));
const night = '2026-10-28';
const event = {
  at: '2026-10-28T23:00:02+01:00',
  job: 'job',
  status: 'ok',
  owner: 'rook',
};
const dirs: string[] = [];

async function tempRuns(text?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rig-digest-reader-'));
  dirs.push(dir);
  if (text !== undefined) await writeFile(join(dir, `${night}.jsonl`), text);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('readNight', () => {
  it('reads the real night: five sorted jobs, one malformed line, and event totals', async () => {
    const digest = await readNight(fixtures, night);
    expect(digest).toEqual({
      night,
      found: true,
      malformedLines: 1,
      totals: { ok: 10, retry: 4, fail: 1 },
      rows: [
        {
          job: 'digest/render', owner: null, runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null, hasFailure: false,
          firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
        },
        {
          job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
          lastStatus: 'ok', lastError: 'upstream 503', hasFailure: false,
          firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
        },
        {
          job: 'lane/sync', owner: 'rook', runs: 8, retries: 1,
          lastStatus: 'ok', lastError: 'lock held', hasFailure: false,
          firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
        },
        {
          job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'fail', lastError: 'quota exceeded', hasFailure: true,
          firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
        },
        {
          job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0,
          lastStatus: 'ok', lastError: null, hasFailure: false,
          firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
        },
      ],
    });
  });

  it('reads the other fixture without malformed events', async () => {
    const digest = await readNight(fixtures, '2026-10-27');
    expect(digest.found).toBe(true);
    expect(digest.rows.map((row) => row.job)).toEqual([
      'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(digest.malformedLines).toBe(0);
    expect(digest.totals).toEqual({ ok: 7, retry: 0, fail: 0 });
  });

  it('returns a uniform missing result for a missing file or directory', async () => {
    const dir = await tempRuns();
    const missing = { night, found: false, rows: [], malformedLines: 0, totals: { ok: 0, retry: 0, fail: 0 } };
    expect(await readNight(dir, night)).toEqual(missing);
    expect(await readNight(join(dir, 'absent'), night)).toEqual(missing);
  });

  it.each(['', '2026-1-01', '../2026-10-28', '2026-10-28/../x', '2026-10-28.jsonl', '2026-10-28\n', '2026-10-28\0'])('rejects invalid night %j without filesystem access', async (invalid) => {
    expect(await readNight('\0', invalid)).toEqual({
      night: invalid, found: false, rows: [], malformedLines: 0,
      totals: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('rejects filesystem errors other than ENOENT', async () => {
    const dir = await tempRuns('');
    await expect(readNight(join(dir, `${night}.jsonl`), night)).rejects.toMatchObject({ code: 'ENOTDIR' });
  });

  it.each(['', ' \r\n\t\n\n'])('distinguishes an empty or blank file from a missing file', async (text) => {
    expect(await readNight(await tempRuns(text), night)).toEqual({
      night, found: true, rows: [], malformedLines: 0,
      totals: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('keeps file order, latest owner/error, all failures, and original offsets', async () => {
    const events = [
      { ...event, status: 'fail', error: 'first', at: '2026-10-29T03:00:00+02:00' },
      { ...event, status: 'retry', error: 'second', at: '2026-10-29T01:00:00-03:30' },
      { ...event, owner: null, at: '2026-10-28T23:00:00.123Z', extra: 'ignored' },
    ];
    const digest = await readNight(await tempRuns(events.map((e) => JSON.stringify(e)).join('\r\n')), night);
    expect(digest.rows).toEqual([{
      job: 'job', owner: null, runs: 3, retries: 1,
      lastStatus: 'ok', lastError: 'second', hasFailure: true,
      firstAt: events[0].at, lastAt: events[2].at,
    }]);
    expect(digest.totals).toEqual({ ok: 1, retry: 1, fail: 1 });
    expect(digest.malformedLines).toBe(0);
  });

  it('counts malformed JSON and invalid events without losing good events', async () => {
    const text = ['{broken', JSON.stringify(event), 'null', JSON.stringify({ ...event, status: 'fail', error: '' }), '[]'].join('\n');
    const digest = await readNight(await tempRuns(text), night);
    expect(digest.malformedLines).toBe(3);
    expect(digest.totals).toEqual({ ok: 1, retry: 0, fail: 1 });
    expect(digest.rows[0]).toMatchObject({ runs: 2, lastError: '', hasFailure: true });
  });

  it.each([
    null, [], 42, 'text', {},
    { ...event, job: '' }, { ...event, job: ' \t' }, { ...event, job: 1 },
    { ...event, status: 'unknown' }, { ...event, status: null },
    { ...event, owner: undefined }, { ...event, owner: 42 },
    { ...event, error: null }, { ...event, error: 42 },
    { ...event, at: null }, { ...event, at: 'not a date' },
    { ...event, at: '2026-10-28T23:00:02' },
    { ...event, at: '2026-10-28T23:00:02Z\n' },
    { ...event, at: '2026-02-29T23:00:02+01:00' },
    { ...event, at: '2026-04-31T23:00:02+01:00' },
    { ...event, at: '2026-13-01T23:00:02+01:00' },
    { ...event, at: '2026-10-28T24:00:02+01:00' },
    { ...event, at: '2026-10-28T23:60:02+01:00' },
    { ...event, at: '2026-10-28T23:00:60+01:00' },
    { ...event, at: '2026-10-28T23:00:02+24:00' },
    { ...event, at: '2026-10-28T23:00:02+01:60' },
  ])('counts invalid event %j exactly once', async (invalid) => {
    const digest = await readNight(await tempRuns(JSON.stringify(invalid)), night);
    expect(digest).toEqual({
      night, found: true, rows: [], malformedLines: 1,
      totals: { ok: 0, retry: 0, fail: 0 },
    });
  });

  it('accepts leap days, fractional seconds, and a null owner', async () => {
    const at = '2024-02-29T01:02:03.123456+05:45';
    const digest = await readNight(await tempRuns(JSON.stringify({ ...event, at, owner: null })), night);
    expect(digest.malformedLines).toBe(0);
    expect(digest.rows[0]).toMatchObject({ firstAt: at, lastAt: at, owner: null });
  });

  it('sorts jobs by code units and handles object-property-like job names', async () => {
    const names = ['z', 'a', '__proto__', 'Z', 'constructor', 'A'];
    const text = names.map((job) => JSON.stringify({ ...event, job })).join('\n');
    const digest = await readNight(await tempRuns(text), night);
    expect(digest.rows.map((row) => row.job)).toEqual(['A', 'Z', '__proto__', 'a', 'constructor', 'z']);
    expect(digest.totals.ok).toBe(names.length);
  });
});
