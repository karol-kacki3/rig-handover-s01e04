import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import type { DigestRow, NightDigest } from '../src/digest/types.js';
import { Digest } from '../src/views/digest.js';
import { Layout } from '../src/views/layout.js';

const row: DigestRow = {
  job: 'alpha',
  owner: null,
  runs: 5,
  retries: 3,
  lastStatus: 'ok',
  lastError: null,
  firstAt: '2026-10-28T22:00:00+02:00',
  lastAt: '2026-10-29T04:00:00+01:00',
  hasFailure: true,
};

const night: NightDigest = {
  night: '2026-10-28',
  found: true,
  rows: [row],
  malformedLines: 1,
  totals: { ok: 1, retry: 3, fail: 1 },
};

async function render(digest: NightDigest) {
  const app = new Hono();
  app.get('/', (c) => c.html(
    <Layout title="digest" lane={{ id: 'test-lane', marker: 'test-marker' }}>
      <Digest digest={digest} />
    </Layout>,
  ));
  return (await app.request('/')).text();
}

describe('digest view', () => {
  it('keeps shared row order, null fields, offsets, malformed count and lane banner', async () => {
    const html = await render({ ...night, rows: [row, { ...row, job: 'zeta' }] });
    expect(html.indexOf('<td>alpha</td>')).toBeLessThan(html.indexOf('<td>zeta</td>'));
    expect(html).toContain('<td>—</td>');
    expect(html.match(/<td>—<\/td>/g)).toHaveLength(4);
    expect(html).toContain(row.firstAt);
    expect(html).toContain(row.lastAt);
    expect(html).toContain('malformed lines: 1');
    expect(html).toContain('test-lane');
    expect(html).toContain('test-marker');
    expect(html).not.toContain('<script');
  });

  it('marks a recovered failure and retry counts at the threshold', async () => {
    const html = await render(night);
    expect(html).toContain('<tr class="warn"><td>alpha</td>');
    expect(html).toContain('<td class="warn">3</td>');
    expect(html).toContain('ok · failure recorded');
  });

  it('does not mark jobs without failures or fewer than three retries', async () => {
    const html = await render({
      ...night,
      malformedLines: 0,
      rows: [{ ...row, retries: 2, hasFailure: false }],
    });
    expect(html).not.toContain('class="warn"');
    expect(html).not.toContain('failure recorded');
    expect(html).toContain('<td>2</td>');
    expect(html).toContain('malformed lines: 0');
  });

  it('distinguishes an empty log from a missing night', async () => {
    const empty = await render({ ...night, rows: [], malformedLines: 0 });
    expect(empty).toContain('nothing ran');
    expect(empty).not.toContain('<table>');
    const missing = await render({ ...night, found: false, rows: [] });
    expect(missing).toContain('night not found');
    expect(missing).not.toContain('nothing ran');
  });

  it('escapes log text rather than rendering it as markup', async () => {
    const html = await render({
      ...night,
      rows: [{ ...row, job: '<script>bad()</script>', lastError: '<b>error</b>' }],
    });
    expect(html).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;error&lt;/b&gt;');
    expect(html).not.toContain('<script');
  });
});
