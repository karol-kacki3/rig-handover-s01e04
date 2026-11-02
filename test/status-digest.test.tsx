import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readNight } from '../src/digest/read-night.js';
import { nightsOnDisk, readStatus, type Status } from '../src/status.js';
import { StatusBoard } from '../src/views/status.js';

vi.mock('../src/digest/read-night.js', () => ({ readNight: vi.fn() }));

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};
const directories: string[] = [];

afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function runsDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'rig-status-digest-'));
  directories.push(directory);
  return directory;
}

async function render(status: Status) {
  const app = new Hono();
  app.get('/', (c) => c.html(<StatusBoard status={status} />));
  const response = await app.request('/');
  expect(response.status).toBe(200);
  return response.text();
}

describe('status board digest links', () => {
  it('links every discovered night newest first with shared valid-event totals', async () => {
    const runsDir = await runsDirectory();
    await Promise.all(['2026-10-27.jsonl', '2026-10-28.jsonl', 'notes.txt'].map((file) =>
      writeFile(join(runsDir, file), ''),
    ));
    vi.mocked(readNight).mockImplementation(async (_directory: string, night: string) => ({
      night,
      found: true,
      rows: [],
      malformedLines: 2,
      totals: night === '2026-10-28' ? { ok: 4, retry: 3, fail: 1 } : { ok: 0, retry: 0, fail: 0 },
    }));

    const status = await readStatus({ ...config, runsDir });
    expect(nightsOnDisk(runsDir)).toEqual(['2026-10-28', '2026-10-27']);
    expect(readNight).toHaveBeenCalledTimes(2);
    expect(readNight).toHaveBeenCalledWith(runsDir, '2026-10-28');
    expect(readNight).toHaveBeenCalledWith(runsDir, '2026-10-27');
    expect(status.nights).toEqual([
      { night: '2026-10-28', totals: { ok: 4, retry: 3, fail: 1 } },
      { night: '2026-10-27', totals: { ok: 0, retry: 0, fail: 0 } },
    ]);
    const html = await render(status);
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html.indexOf('/digest/2026-10-28')).toBeLessThan(html.indexOf('/digest/2026-10-27'));
    expect(html).toContain('4 ok / 3 retry / 1 fail');
    expect(html).toContain('0 ok / 0 retry / 0 fail');
    expect(html).toContain(config.adapter);
    expect(html).toContain(config.installed);
    expect(html).toContain('last beat');
    expect(html).not.toContain('notes.txt');
  });

  it('preserves the empty-runs message without reading a night', async () => {
    const runsDir = await runsDirectory();
    const status = await readStatus({ ...config, runsDir });
    expect(status.nights).toEqual([]);
    expect(readNight).not.toHaveBeenCalled();
    expect(await render(status)).toContain('nothing in runs/');
  });

  it('preserves missing-directory behavior', async () => {
    const runsDir = join(await runsDirectory(), 'missing');
    const status = await readStatus({ ...config, runsDir });
    expect(status.nights).toEqual([]);
    expect(readNight).not.toHaveBeenCalled();
    expect(await render(status)).toContain('nothing in runs/');
  });
});
