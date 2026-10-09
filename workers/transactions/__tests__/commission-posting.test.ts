import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { sqliteD1 } from './helpers/sqlite'
import { commissionPosting } from '../commission-posting'
function setup() {
  const { sqlite, db } = sqliteD1()
  sqlite.exec(`CREATE TABLE tenants (id TEXT PRIMARY KEY); CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE transactions (id TEXT PRIMARY KEY, tenant_id TEXT); INSERT INTO tenants VALUES ('tenant'); INSERT INTO users VALUES ('agent');
    INSERT INTO transactions VALUES ('deal','tenant');`)
  for (const migration of ['050_commission_accounting.sql', '052_connected_delivery.sql']) {
    sqlite.exec(readFileSync(`worker/db/migrations/${migration}`, 'utf8'))
  }
  sqlite.exec(`INSERT INTO commission_plans (id,tenant_id,agent_id,plan_type,agent_percent,effective_from,created_by)
    VALUES ('plan','tenant','agent','percentage',80,'2026-01-01','agent')`)
  const input = { tenantId: 'tenant', transactionId: 'deal', agentId: 'agent', actorId: 'agent', revision: 1,
    closed: true, closeDate: '2026-09-01', gross: 10000 }
  return { sqlite, db, input }
}
describe('posted commission history', () => {
  it('preserves original facts through correction, reopen, and reclose', async () => {
    const { sqlite, db, input } = setup()
    await db.batch(await commissionPosting(db, input))
    const original = sqlite.prepare('SELECT * FROM commission_ledger_entries').get()
    await db.batch(await commissionPosting(db, { ...input, revision: 2, gross: 12000 }))
    expect(sqlite.prepare("SELECT SUM(amount_cents) AS total FROM commission_ledger_entries WHERE status='posted'").get()?.total).toBe(960000)
    expect(sqlite.prepare("SELECT * FROM commission_ledger_entries WHERE entry_type='earned'").get()).toEqual(original)
    expect(() => sqlite.exec("UPDATE commission_ledger_entries SET amount_cents=1 WHERE status='posted'")).toThrow()
    await db.batch(await commissionPosting(db, { ...input, revision: 3, closed: false }))
    expect(sqlite.prepare('SELECT SUM(amount_cents) AS total FROM commission_ledger_entries').get()?.total).toBe(0)
    await db.batch(await commissionPosting(db, { ...input, revision: 4 }))
    expect(sqlite.prepare('SELECT SUM(amount_cents) AS total FROM commission_ledger_entries').get()?.total).toBe(800000)
  })
  it('rolls back the business revision and earning when a later consequence fails', async () => {
    const { sqlite, db, input } = setup()
    const statements = [db.prepare("UPDATE transactions SET revision=1 WHERE id='deal'"), ...await commissionPosting(db, input),
      db.prepare("INSERT INTO tenants VALUES ('tenant')")]
    await expect(db.batch(statements)).rejects.toThrow()
    expect(sqlite.prepare('SELECT revision FROM transactions').get()?.revision).toBe(0)
    expect(sqlite.prepare('SELECT COUNT(*) AS total FROM commission_ledger_entries').get()?.total).toBe(0)
  })
  it('rejects duplicate revision earnings and stale optimistic writes atomically', async () => {
    const { sqlite, db, input } = setup()
    await db.batch(await commissionPosting(db, input))
    await expect(db.batch(await commissionPosting(db, input))).rejects.toThrow()
    expect(sqlite.prepare('SELECT COUNT(*) AS total FROM commission_ledger_entries').get()?.total).toBe(1)
    expect(() => sqlite.exec('UPDATE transactions SET revision = CASE WHEN revision=9 THEN revision+1 ELSE -1 END')).toThrow()
  })
})
