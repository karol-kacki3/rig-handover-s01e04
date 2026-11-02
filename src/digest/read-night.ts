import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DigestRow, NightDigest, ReadNight, RunStatus } from './types.js';

type RunEvent = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  // Extended ISO timestamps, with seconds and an explicit offset; never normalize.
  const match = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.exec(value);
  if (!match || match[0] !== value) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function parseEvent(line: string): RunEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const event = value as Record<string, unknown>;
  if (
    !isTimestamp(event.at) ||
    typeof event.job !== 'string' || event.job.trim().length === 0 ||
    (event.status !== 'ok' && event.status !== 'retry' && event.status !== 'fail') ||
    (event.owner !== null && typeof event.owner !== 'string') ||
    ('error' in event && typeof event.error !== 'string')
  ) return null;

  return {
    at: event.at,
    job: event.job,
    status: event.status,
    owner: event.owner,
    ...(typeof event.error === 'string' ? { error: event.error } : {}),
  };
}

export const readNight: ReadNight = async (runsDir, night) => {
  const digest: NightDigest = {
    night,
    found: false,
    rows: [],
    malformedLines: 0,
    totals: { ok: 0, retry: 0, fail: 0 },
  };
  if (night.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(night)) return digest;

  let text: string;
  try {
    text = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return digest;
    }
    throw error;
  }
  digest.found = true;

  const jobs = new Map<string, DigestRow>();
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    const event = parseEvent(line);
    if (!event) {
      digest.malformedLines += 1;
      continue;
    }
    digest.totals[event.status] += 1;
    const row = jobs.get(event.job);
    if (row) {
      row.owner = event.owner;
      row.runs += 1;
      row.retries += event.status === 'retry' ? 1 : 0;
      row.lastStatus = event.status;
      row.lastError = event.error ?? row.lastError;
      row.lastAt = event.at;
      row.hasFailure ||= event.status === 'fail';
    } else {
      jobs.set(event.job, {
        job: event.job,
        owner: event.owner,
        runs: 1,
        retries: event.status === 'retry' ? 1 : 0,
        lastStatus: event.status,
        lastError: event.error ?? null,
        firstAt: event.at,
        lastAt: event.at,
        hasFailure: event.status === 'fail',
      });
    }
  }
  digest.rows = [...jobs.values()].sort((a, b) => a.job < b.job ? -1 : a.job > b.job ? 1 : 0);
  return digest;
};
