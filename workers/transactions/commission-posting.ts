import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import { calculateAgentCommission, dollarsToCents, type CommissionPlanCalculation } from '../../worker/lib/commission'

export async function commissionPosting(db: D1Database, input: {
  tenantId: string; transactionId: string; agentId: string; actorId: string;
  revision: number; closed: boolean; closeDate: string | null; gross: unknown;
}): Promise<D1PreparedStatement[]> {
  const { tenantId, transactionId, agentId, actorId, revision, closed, closeDate } = input
  const prefix = `deal:${transactionId}:`
  const anchor = await db.prepare(`SELECT id FROM commission_ledger_entries
    WHERE tenant_id = ? AND transaction_id = ? AND entry_type = 'earned' AND status = 'posted'
    ORDER BY created_at, id LIMIT 1`).bind(tenantId, transactionId).first<{ id: string }>()
  const prior = await db.prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS amount FROM commission_ledger_entries
    WHERE tenant_id = ? AND transaction_id = ? AND status = 'posted'
      AND (entry_type = 'earned' OR (entry_type = 'adjustment' AND corrects_entry_id IS NOT NULL))`)
    .bind(tenantId, transactionId).first<{ amount: number }>()
  const effectiveCloseDate = closeDate || new Date().toISOString().slice(0, 10)
  const plan = closed ? await db.prepare(`SELECT * FROM commission_plans WHERE tenant_id = ? AND agent_id = ?
    AND date(effective_from) <= date(?) AND (effective_to IS NULL OR date(effective_to) >= date(?))
    ORDER BY effective_from DESC, created_at DESC LIMIT 1`)
    .bind(tenantId, agentId, effectiveCloseDate, effectiveCloseDate).first<CommissionPlanCalculation & { id: string }>() : null
  const gross = dollarsToCents(input.gross)
  const ready = !closed || Boolean(plan && gross > 0)
  // Never negate an already posted fact simply because a correction lacks a plan.
  if (!ready && anchor) throw new Error('A posted commission correction requires an effective plan and gross amount')
  const calculation = closed && plan && ready ? calculateAgentCommission(gross, plan) : null
  const amount = (calculation?.agentEarnedCents || 0) - (prior?.amount || 0)
  const statements = [db.prepare(`UPDATE commission_ledger_entries SET status = 'void'
    WHERE tenant_id = ? AND transaction_id = ? AND status = 'pending' AND entry_type = 'earned'`)
    .bind(tenantId, transactionId)]
  if (!closed && !anchor) return statements
  statements.push(db.prepare(`INSERT INTO commission_ledger_entries
    (id, tenant_id, agent_id, transaction_id, commission_plan_id, entry_type, status, amount_cents,
     taxable_amount_cents, effective_date, source_key, memo, created_by, corrects_entry_id, calculation_snapshot_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`)
    .bind(crypto.randomUUID(), tenantId, agentId, transactionId, plan?.id || null,
      anchor ? 'adjustment' : 'earned', ready ? 'posted' : 'pending', amount,
      effectiveCloseDate, `${prefix}revision:${Number(revision) || 1}`,
      ready ? (anchor ? 'Linked commission correction' : 'Earned at closing') : 'Plan or gross commission missing; broker review required',
      actorId || null, anchor?.id || null, JSON.stringify({ version: 1, plan, grossCents: gross, calculation, closed, closeDate: effectiveCloseDate, revision: Number(revision) || 1 })))
  return statements
}
