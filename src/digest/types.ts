export type RunStatus = 'ok' | 'retry' | 'fail';

/** Counts of valid log events, not jobs or their final statuses. */
export type StatusTotals = Record<RunStatus, number>;

/** One job, aggregated in log-file order (not timestamp-sorted). */
export type DigestRow = {
  job: string;
  /** Owner on the job's last valid event, including an explicit null. */
  owner: string | null;
  /** All valid events for this job, including retries and failures. */
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  /** Most recent supplied error; a later event without an error does not clear it. */
  lastError: string | null;
  /** Original timestamp strings on the first/last events; preserve their offsets. */
  firstAt: string;
  lastAt: string;
  /** True if ANY event failed, even when lastStatus is now ok. */
  hasFailure: boolean;
};

/** Shared page/JSON result, also used to obtain the board's event totals. */
export type NightDigest = {
  night: string;
  /** False for a missing file or invalid night; true even for an empty file. */
  found: boolean;
  /** One row per job, ascending by job using case-sensitive code-unit order. */
  rows: DigestRow[];
  /** Nonblank lines that fail JSON parsing OR event validation. */
  malformedLines: number;
  totals: StatusTotals;
};

/**
 * Contract for the named readNight export in src/digest/read-night.ts.
 *
 * Read runsDir/<night>.jsonl asynchronously. Only YYYY-MM-DD-shaped nights
 * are accepted; invalid names return found:false without filesystem access.
 * ENOENT also returns found:false. In both cases rows is [], malformedLines
 * is 0, and all totals are 0. Other filesystem errors reject the promise.
 * Routes map found:false to 404 and otherwise return 200, including empty logs.
 *
 * Ignore blank lines. Valid events have a nonempty job, an ISO timestamp with
 * an explicit Z or numeric offset, a RunStatus, an owner of string or null,
 * and an optional string error. Extra fields are ignored. Invalid events are
 * counted in malformedLines and contribute neither rows nor totals.
 * Both routes consume this result unchanged; no independent aggregation.
 */
export type ReadNight = (runsDir: string, night: string) => Promise<NightDigest>;
