import { DatabaseSync } from 'node:sqlite'
// Real SQLite transaction semantics, including constraints and triggers.
export function sqliteD1() {
  const sqlite = new DatabaseSync(':memory:')
  function prepare(sql: string) {
    const stmt = sqlite.prepare(sql)
    function bind(...args: (string | number | null)[]) {
      return { bind, run: async () => ({ success: true, meta: { changes: stmt.run(...args).changes } }),
        first: async () => stmt.get(...args) || null, all: async () => ({ results: stmt.all(...args) }) }
    }
    return { ...bind(), bind }
  }
  const db = { prepare, batch: async (statements: { run(): Promise<unknown> }[]) => {
    sqlite.exec('BEGIN')
    try { const result = []; for (const s of statements) result.push(await s.run()); sqlite.exec('COMMIT'); return result }
    catch (error) { sqlite.exec('ROLLBACK'); throw error }
  } }
  return { sqlite, db: db as unknown as D1Database }
}
