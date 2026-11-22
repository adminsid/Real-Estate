import {MAX_ATTEMPTS} from './policy.mjs';
type Job = {id: string; kind: string; file: string | null};
type Row = Job & {state: string; started: number; finished: number | null; elapsed: number | null; input_bytes: number | null; output_bytes: number | null; failure: string | null};
type Metrics = {elapsed?: number; input?: number; output?: number; failure?: string | null};
export function ledger(sql: SqlStorage) {
  sql.exec(`CREATE TABLE IF NOT EXISTS benchmark_jobs (id TEXT PRIMARY KEY, kind TEXT NOT NULL, file TEXT, state TEXT NOT NULL, started INTEGER NOT NULL, finished INTEGER, elapsed INTEGER, input_bytes INTEGER, output_bytes INTEGER, failure TEXT)`);
  sql.exec('CREATE TABLE IF NOT EXISTS benchmark_control (id INTEGER PRIMARY KEY CHECK(id=1), paused INTEGER NOT NULL)');
  sql.exec('CREATE TABLE IF NOT EXISTS benchmark_cleanup (id INTEGER PRIMARY KEY CHECK(id=1), pending INTEGER NOT NULL)');
  return {
    cleanupPending: () => Boolean(sql.exec('SELECT pending FROM benchmark_cleanup WHERE id=1').toArray()[0]?.pending),
    cleanupDone: () => {sql.exec('UPDATE benchmark_cleanup SET pending=0 WHERE id=1');},
    paused: () => Boolean(sql.exec('SELECT paused FROM benchmark_control WHERE id=1').toArray()[0]?.paused),
    snapshot: () => sql.exec<Row>('SELECT * FROM benchmark_jobs ORDER BY started').toArray(),
    get: (id: string) => sql.exec<Row>('SELECT * FROM benchmark_jobs WHERE id=?', id).toArray()[0],
    // Synchronous SQL before any await makes admission atomic in the one budget DO.
    admit(job: Job, now: number) {
      if (sql.exec('SELECT paused FROM benchmark_control WHERE id=1 AND paused=1').toArray().length) return 'paused_after_interruption';
      if (sql.exec("SELECT id FROM benchmark_jobs WHERE state='running' LIMIT 1").toArray().length) return 'busy';
      if (Number(sql.exec<{count: number}>('SELECT COUNT(*) AS count FROM benchmark_jobs').toArray()[0].count) >= MAX_ATTEMPTS) return 'limit';
      // Failed attempts keep their reservations. They are never automatically retried.
      if (sql.exec('SELECT id FROM benchmark_jobs WHERE id=?', job.id).toArray().length) return 'attempted';
      sql.exec("INSERT INTO benchmark_jobs(id,kind,file,state,started) VALUES(?,?,?,'running',?)", job.id, job.kind, job.file, now);
      return 'admitted';
    },
    finish(id: string, state: string, now: number, {elapsed = 0, input = 0, output = 0, failure = null}: Metrics = {}) {
      sql.exec("UPDATE benchmark_jobs SET state=?,finished=?,elapsed=?,input_bytes=?,output_bytes=?,failure=? WHERE id=? AND state='running'", state, now, elapsed, input, output, failure, id);
    },
    interrupt(now: number) {
      // A timed-out/evicted handler may still unwind. Freeze this benchmark
      // generation so its cleanup can never stop a newly admitted container.
      sql.exec('INSERT INTO benchmark_control VALUES(1,1) ON CONFLICT(id) DO UPDATE SET paused=1');
      sql.exec('INSERT INTO benchmark_cleanup VALUES(1,1) ON CONFLICT(id) DO UPDATE SET pending=1');
      sql.exec("UPDATE benchmark_jobs SET state='failed',finished=?,failure='interrupted_or_deadline' WHERE state='running'", now);
    },
  };
}
