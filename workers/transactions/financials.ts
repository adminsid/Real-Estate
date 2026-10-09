import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import {
  calculateAgent,
  calculateFinancials,
  capPeriod,
  emptyFinancials,
  validateFinancials,
  validatePlan,
  type DealFinancials,
  type FinancialPlan,
} from "../../src/domain/deal-financials";
import { isDateOnly } from "../../src/domain/reporting-period";

type Context = {
  tenantId: string;
  userId: string;
  role: string;
  effectiveUserId: string | null;
  isAssistant: boolean;
};
interface Deal {
  id: string;
  assigned_to: string;
  status: string;
  type: string;
  is_locked: number;
  actual_close_date: string | null;
  target_close_date: string | null;
  financials_version: number;
  price: number | null;
  commission_amount: number | null;
}
interface Version {
  version: number;
  data_json: string;
  calculation_json: string;
  state: string;
  created_at: string;
  actor_id: string;
}
interface AgentCalculation {
  agentId: string;
  name: string;
  share: number;
  baseCents: number;
  planId: string | null;
  plan: FinancialPlan | null;
  period: string | null;
  capUsed: number;
  capRevision: number;
  agentCents: number | null;
  companyCents: number | null;
  issue: string | null;
}
const json = (data: unknown, status = 200) =>
  Response.json(
    status >= 400 ? { success: false, error: data } : { success: true, data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
const broker = (ctx: Context) => ["admin", "broker"].includes(ctx.role);

async function calculation(
  db: D1Database,
  ctx: Context,
  tx: Deal,
  f: DealFinancials,
) {
  const offer = f.acceptedOfferId
    ? await db
        .prepare(
          "SELECT purchase_price FROM transaction_offers WHERE id=? AND transaction_id=? AND tenant_id=? AND status=?",
        )
        .bind(f.acceptedOfferId, tx.id, ctx.tenantId, "accepted")
        .first<{ purchase_price: number }>()
    : null;
  const result = calculateFinancials(
    f,
    offer ? Math.round(offer.purchase_price * 100) : null,
  );
  if (f.acceptedOfferId && !offer)
    result.issues.push(
      "The selected offer is no longer accepted; review the price basis.",
    );
  const agents: AgentCalculation[] = [];
  const date =
    tx.actual_close_date ||
    tx.target_close_date ||
    new Date().toISOString().slice(0, 10);
  let allocated = 0;
  for (const [index, participant] of f.participants.entries()) {
    const user = await db
      .prepare(
        "SELECT name FROM users WHERE id=? AND tenant_id=? AND is_active=1",
      )
      .bind(participant.agentId, ctx.tenantId)
      .first<{ name: string }>();
    if (!user)
      throw new Error("A participating agent is unavailable in this workspace");
    const row = await db
      .prepare(
        "SELECT id,rules_json FROM agent_financial_plans WHERE tenant_id=? AND agent_id=? AND effective_from<=? ORDER BY effective_from DESC,rowid DESC LIMIT 1",
      )
      .bind(ctx.tenantId, participant.agentId, date)
      .first<{ id: string; rules_json: string }>();
    const plan: FinancialPlan | null = row ? JSON.parse(row.rules_json) : null;
    const base = Math.max(0, result.distributableCents ?? 0);
    const validShares =
      Math.abs(f.participants.reduce((s, p) => s + p.share, 0) - 100) <
      0.000001;
    const baseCents =
      validShares && index === f.participants.length - 1
        ? base - allocated
        : Math.round((base * participant.share) / 100);
    allocated += baseCents;
    const period = plan ? capPeriod(plan, date) : null;
    const balance = period
      ? await db
          .prepare(
            "SELECT amount_cents,revision FROM financial_cap_balances WHERE tenant_id=? AND agent_id=? AND period=?",
          )
          .bind(ctx.tenantId, participant.agentId, period)
          .first<{ amount_cents: number; revision: number }>()
      : null;
    const prior = period
      ? await db
          .prepare(
            "SELECT COALESCE(SUM(amount_cents),0) AS amount FROM financial_cap_movements WHERE tenant_id=? AND transaction_id=? AND agent_id=? AND period=?",
          )
          .bind(ctx.tenantId, tx.id, participant.agentId, period)
          .first<{ amount: number }>()
      : null;
    const capUsed =
      (balance?.amount_cents ?? 0) -
      (prior?.amount ?? 0) +
      (plan?.openingCapPeriod === period ? plan.openingCapCents : 0);
    const values = plan
      ? calculateAgent(baseCents, plan, capUsed, base)
      : {
          agentCents: null,
          companyCents: null,
          issue: "Assign a financial plan in HR.",
        };
    agents.push({
      agentId: participant.agentId,
      name: user.name,
      share: participant.share,
      baseCents,
      planId: row?.id ?? null,
      plan,
      period,
      capUsed,
      capRevision: balance?.revision ?? 0,
      ...values,
    });
    if (values.issue) result.issues.push(`${user.name}: ${values.issue}`);
  }
  const dealFeeAgents = agents.filter(a => a.plan?.name === 'Pro' && a.plan.proBasis === 'deal');
  if (dealFeeAgents.length) {
    const first = dealFeeAgents[0].plan!;
    if (dealFeeAgents.length !== agents.length || dealFeeAgents.some(a => a.plan?.proBoundary !== first.proBoundary)) {
      result.issues.push('A per-deal Pro fee requires matching Pro terms for every participant. Configure per-agent fees or review the agreement.');
    } else if (!result.issues.length && result.distributableCents !== null) {
      const full = calculateAgent(result.distributableCents, first);
      const total = agents.reduce((sum,a) => sum + (a.companyCents ?? 0),0);
      const last = agents[agents.length - 1];
      const remainder = (full.companyCents ?? total) - total;
      if (last.companyCents !== null && last.agentCents !== null) {
        last.companyCents += remainder;
        last.agentCents -= remainder;
        if (last.agentCents < 0) result.issues.push('The fee exceeds an agent allocation; review the allocation.');
      }
    }
  }
  return {
    ...result,
    acceptedCents: offer ? Math.round(offer.purchase_price * 100) : null,
    agents,
    companyCents:
      !agents.length || agents.some((a) => a.companyCents === null)
        ? null
        : agents.reduce((s, a) => s + (a.companyCents ?? 0), 0),
    calculatedDate: date,
  };
}

export async function financialRoutes(
  request: Request,
  db: D1Database,
  ctx: Context,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (!path.includes("/financial")) return null;
  try {
    const accountMatch = path.match(
      /^\/api\/transactions\/financial-accounts\/([^/]+)$/,
    );
    if (accountMatch) {
      if (!broker(ctx)) return json("Broker access required", 403);
      const agentId = accountMatch[1];
      if (
        !(await db
          .prepare("SELECT id FROM users WHERE tenant_id=? AND id=?")
          .bind(ctx.tenantId, agentId)
          .first())
      )
        return json("Agent not found", 404);
      if (request.method === "GET") {
        const charges = await db
          .prepare(
            "SELECT * FROM agent_account_charges WHERE tenant_id=? AND agent_id=? ORDER BY charge_date DESC",
          )
          .bind(ctx.tenantId, agentId)
          .all();
        return json(charges.results);
      }
      if (request.method === "POST") {
        const b: {
          id: string;
          description: string;
          amountCents: number;
          date: string;
          kind: "setup" | "monthly" | "other";
          settleId?: string;
          reference?: string;
        } = await request.json();
        if (!b.id || !isDateOnly(b.date))
          return json("A valid date and request ID are required", 400);
        if (b.settleId) {
          if (!b.reference?.trim())
            return json("Payment reference is required", 400);
          const result = await db
            .prepare(
              "UPDATE agent_account_charges SET settled_at=?,settlement_reference=?,settlement_method='separate' WHERE id=? AND tenant_id=? AND agent_id=? AND settled_at IS NULL",
            )
            .bind(b.date, b.reference, b.settleId, ctx.tenantId, agentId)
            .run();
          return result.meta.changes
            ? json({ saved: true })
            : json("Charge is already settled or unavailable", 409);
        }
        if (
          !Number.isSafeInteger(b.amountCents) ||
          b.amountCents <= 0 ||
          !b.description?.trim() ||
          !["setup", "monthly", "other"].includes(b.kind)
        )
          return json("Specify a positive charge and description", 400);
        const source =
          b.kind === "monthly"
            ? `monthly:${agentId}:${b.date.slice(0, 7)}`
            : b.kind === "setup"
              ? `setup:${agentId}`
              : `manual:${b.id}`;
        await db
          .prepare(
            "INSERT INTO agent_account_charges(id,tenant_id,agent_id,description,amount_cents,charge_date,created_by,source_key) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            b.id,
            ctx.tenantId,
            agentId,
            b.description,
            b.amountCents,
            b.date,
            ctx.userId,
            source,
          )
          .run();
        return json({ saved: true });
      }
      return json("Method not allowed", 405);
    }
    const plansMatch = path.match(
      /^\/api\/transactions\/financial-plans(?:\/([^/]+))?$/,
    );
    if (plansMatch) {
      if (!broker(ctx)) return json("Broker access required", 403);
      if (request.method === "GET") {
        const rows = await db
          .prepare(
            "SELECT p.*,u.name AS agent_name FROM agent_financial_plans p JOIN users u ON u.id=p.agent_id AND u.tenant_id=p.tenant_id WHERE p.tenant_id=? ORDER BY effective_from DESC,p.rowid DESC",
          )
          .bind(ctx.tenantId)
          .all();
        return json(rows.results);
      }
      if (request.method === "POST" && plansMatch[1]) {
        const plan: FinancialPlan = await request.json();
        validatePlan(plan);
        const agent = await db
          .prepare(
            "SELECT id FROM users WHERE tenant_id=? AND id=? AND is_active=1",
          )
          .bind(ctx.tenantId, plansMatch[1])
          .first();
        if (!agent) return json("Agent not found", 404);
        await db
          .prepare(
            "INSERT INTO agent_financial_plans(id,tenant_id,agent_id,effective_from,rules_json,created_by) VALUES(?,?,?,?,?,?)",
          )
          .bind(
            crypto.randomUUID(),
            ctx.tenantId,
            plansMatch[1],
            plan.effectiveFrom,
            JSON.stringify(plan),
            ctx.userId,
          )
          .run();
        return json({ saved: true });
      }
      return json("Method not allowed", 405);
    }
    const match = path.match(
      /^\/api\/transactions\/([^/]+)\/financials(?:\/(approve|receipts|payments|charges))?$/,
    );
    if (!match) return null;
    const tx = await db
      .prepare(
        "SELECT * FROM transactions WHERE id=? AND tenant_id=? AND is_active=1",
      )
      .bind(match[1], ctx.tenantId)
      .first<Deal>();
    if (!tx) return json("Deal not found", 404);
    const member =
      !broker(ctx) && tx.assigned_to !== ctx.effectiveUserId
        ? await db
            .prepare(
              "SELECT 1 FROM transaction_team WHERE transaction_id=? AND user_id=?",
            )
            .bind(tx.id, ctx.effectiveUserId)
            .first()
        : true;
    if (!member) return json("Deal not found", 404);
    const latest = await db
      .prepare(
        "SELECT * FROM deal_financial_versions WHERE tenant_id=? AND transaction_id=? ORDER BY version DESC LIMIT 1",
      )
      .bind(ctx.tenantId, tx.id)
      .first<Version>();
    const f: DealFinancials = latest
      ? JSON.parse(latest.data_json)
      : emptyFinancials();
    const action = match[2];
    if (request.method === "GET" && !action) {
      const calc =
        latest?.state === "approved"
          ? JSON.parse(latest.calculation_json)
          : await calculation(db, ctx, tx, f);
      const history = await db
        .prepare(
          "SELECT version,state,created_at,actor_id,data_json FROM deal_financial_versions WHERE tenant_id=? AND transaction_id=? ORDER BY version DESC LIMIT 50",
        )
        .bind(ctx.tenantId, tx.id)
        .all<Version>();
      const receipts = await db
        .prepare(
          "SELECT * FROM deal_receipts WHERE tenant_id=? AND transaction_id=? ORDER BY received_date DESC,created_at DESC",
        )
        .bind(ctx.tenantId, tx.id)
        .all();
      const ledger = await db
        .prepare(
          "SELECT l.*,u.name AS agent_name FROM commission_ledger_entries l JOIN users u ON u.id=l.agent_id AND u.tenant_id=l.tenant_id WHERE l.tenant_id=? AND l.transaction_id=? ORDER BY l.created_at DESC",
        )
        .bind(ctx.tenantId, tx.id)
        .all<{ agent_id: string }>();
      const charges = await db
        .prepare(
          "SELECT * FROM agent_account_charges WHERE tenant_id=? AND (transaction_id=? OR (transaction_id IS NULL AND agent_id IN (SELECT json_extract(value,'$.agentId') FROM json_each(?,'$.participants')))) ORDER BY charge_date DESC",
        )
        .bind(ctx.tenantId, tx.id, JSON.stringify(f))
        .all<{ agent_id: string }>();
      if (!broker(ctx)) {
        calc.agents = ctx.isAssistant
          ? []
          : calc.agents.filter(
              (a: AgentCalculation) => a.agentId === ctx.userId,
            );
        calc.companyCents = null;
        for (const a of calc.agents) {
          a.plan = null;
          a.companyCents = null;
        }
        calc.issues = calc.issues.filter(
          (issue: string) => !issue.includes(": "),
        );
        for (const row of ledger.results)
          delete (row as Record<string, unknown>).calculation_snapshot_json;
      }
      return json({
        version: latest?.version ?? 0,
        state: latest?.state ?? "legacy",
        financials: f,
        calculation: calc,
        canEdit: broker(ctx) && !tx.is_locked,
        canApprove: broker(ctx) && !tx.is_locked,
        history: history.results.map((h) => ({
          version: h.version,
          state: h.state,
          created_at: h.created_at,
          prices: JSON.parse(h.data_json).prices,
        })),
        receipts: broker(ctx) ? receipts.results : [],
        ledger: broker(ctx)
          ? ledger.results
          : ctx.isAssistant
            ? []
            : ledger.results.filter((r) => r.agent_id === ctx.userId),
        charges: broker(ctx)
          ? charges.results
          : ctx.isAssistant
            ? []
            : charges.results.filter((r) => r.agent_id === ctx.userId),
        legacy: latest
          ? null
          : { price: tx.price, commission: tx.commission_amount },
      });
    }
    if (!broker(ctx))
      return json("Broker access required to change financial records", 403);
    if (tx.is_locked)
      return json("Unlock this deal before changing financial records", 409);
    if (
      (request.method === "PUT" && !action) ||
      (request.method === "POST" && action === "approve")
    ) {
      const body: { version: number; financials: DealFinancials } =
        await request.json();
      if (body.version !== (latest?.version ?? 0))
        return json("Financials changed; reload before saving", 409);
      validateFinancials(body.financials);
      const calc = await calculation(db, ctx, tx, body.financials);
      const approving = action === "approve";
      if (
        approving &&
        (tx.status !== "closed" ||
          !tx.actual_close_date ||
          !isDateOnly(tx.actual_close_date))
      )
        return json(
          "Close the deal with an actual closing date before finalizing compensation",
          400,
        );
      if (approving && tx.type === "sale" && !body.financials.prices.sold)
        return json("Confirm the final sold price", 400);
      if (approving && calc.issues.length)
        return json(calc.issues.join(" "), 400);
      const version = body.version + 1;
      const statements: D1PreparedStatement[] = [
        db
          .prepare(
            "INSERT INTO deal_financial_versions(tenant_id,transaction_id,version,data_json,calculation_json,state,actor_id) VALUES(?,?,?,?,?,?,?)",
          )
          .bind(
            ctx.tenantId,
            tx.id,
            version,
            JSON.stringify(body.financials),
            JSON.stringify(calc),
            approving ? "approved" : "draft",
            ctx.userId,
          ),
      ];
      const prices = body.financials.prices;
      const selectedPrice =
        tx.status === "closed"
          ? prices.sold
          : ["under_contract", "board_package", "closing_prep"].includes(
                tx.status,
              )
            ? prices.contract
            : (calc.acceptedCents ?? prices.listing);
      const label =
        tx.status === "closed"
          ? "Sold"
          : ["under_contract", "board_package", "closing_prep"].includes(
                tx.status,
              )
            ? "Contract"
            : calc.acceptedCents !== null
              ? "Accepted offer"
              : "Asking";
      statements.push(
        db
          .prepare(
            "UPDATE transactions SET price=?,financial_price_label=?,commission_amount=?,commission_rate=NULL,revision=revision+1 WHERE tenant_id=? AND id=?",
          )
          .bind(
            selectedPrice === null ? null : selectedPrice / 100,
            label,
            calc.primeCents === null ? null : calc.primeCents / 100,
            ctx.tenantId,
            tx.id,
          ),
      );
      if (approving) {
        // Reverse prior cap usage for this deal, then apply this calculation. Triggers serialize concurrent cap consumption.
        const previousCaps = await db
          .prepare(
            "SELECT agent_id,period,SUM(amount_cents) AS amount FROM financial_cap_movements WHERE tenant_id=? AND transaction_id=? GROUP BY agent_id,period HAVING SUM(amount_cents)!=0",
          )
          .bind(ctx.tenantId, tx.id)
          .all<{ agent_id: string; period: string; amount: number }>();
        const caps = new Map<
          string,
          { agentId: string; period: string; amount: number }
        >();
        for (const p of previousCaps.results)
          caps.set(`${p.agent_id}:${p.period}`, {
            agentId: p.agent_id,
            period: p.period,
            amount: -p.amount,
          });
        for (const a of calc.agents)
          if (a.period) {
            const key = `${a.agentId}:${a.period}`;
            caps.set(key, {
              agentId: a.agentId,
              period: a.period,
              amount: (caps.get(key)?.amount ?? 0) + (a.companyCents ?? 0),
            });
          }
        for (const c of caps.values()) {
          const b = await db
            .prepare(
              "SELECT revision FROM financial_cap_balances WHERE tenant_id=? AND agent_id=? AND period=?",
            )
            .bind(ctx.tenantId, c.agentId, c.period)
            .first<{ revision: number }>();
          const computed = calc.agents.find(
            (a) => a.agentId === c.agentId && a.period === c.period,
          );
          if (computed && computed.capRevision !== (b?.revision ?? 0))
            return json("Cap balance changed; reload before approving", 409);
          statements.push(
            db
              .prepare(
                "INSERT INTO financial_cap_movements(id,tenant_id,agent_id,period,transaction_id,version,amount_cents,expected_revision) VALUES(?,?,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                ctx.tenantId,
                c.agentId,
                c.period,
                tx.id,
                version,
                c.amount,
                b?.revision ?? 0,
              ),
          );
        }
        const prior = await db
          .prepare(
            "SELECT agent_id,SUM(amount_cents) AS amount FROM commission_ledger_entries WHERE tenant_id=? AND transaction_id=? AND status='posted' AND (entry_type='earned' OR (entry_type='adjustment' AND corrects_entry_id IS NOT NULL)) GROUP BY agent_id",
          )
          .bind(ctx.tenantId, tx.id)
          .all<{ agent_id: string; amount: number }>();
        const ids = new Set([
          ...prior.results.map((p) => p.agent_id),
          ...calc.agents.map((a) => a.agentId),
        ]);
        for (const id of ids) {
          const agent = calc.agents.find((a) => a.agentId === id);
          const amount =
            (agent?.agentCents ?? 0) -
            (prior.results.find((p) => p.agent_id === id)?.amount ?? 0);
          const anchor = await db
            .prepare(
              "SELECT id FROM commission_ledger_entries WHERE tenant_id=? AND transaction_id=? AND agent_id=? AND status='posted' AND entry_type='earned' ORDER BY created_at,id LIMIT 1",
            )
            .bind(ctx.tenantId, tx.id, id)
            .first<{ id: string }>();
          statements.push(
            db
              .prepare(
                "INSERT INTO commission_ledger_entries(id,tenant_id,agent_id,transaction_id,entry_type,status,amount_cents,taxable_amount_cents,effective_date,source_key,memo,created_by,corrects_entry_id,calculation_snapshot_json) VALUES(?,?,?,?,?,'posted',?,0,?,?,?,?,?,?)",
              )
              .bind(
                crypto.randomUUID(),
                ctx.tenantId,
                id,
                tx.id,
                anchor ? "adjustment" : "earned",
                amount,
                tx.actual_close_date,
                `financial:${tx.id}:${version}:${id}`,
                "Broker-approved financials",
                ctx.userId,
                anchor?.id ?? null,
                JSON.stringify({
                  version,
                  agent,
                  financials: body.financials,
                  calculation: calc,
                }),
              ),
          );
        }
      }
      await db.batch(statements);
      return json({ version, state: approving ? "approved" : "draft" });
    }
    if (request.method === "POST" && action === "receipts") {
      const b: {
        id: string;
        payer: string;
        amountCents: number;
        date: string;
        reference: string;
        reversesId?: string;
      } = await request.json();
      if (
        !b.id ||
        !b.payer?.trim() ||
        !isDateOnly(b.date) ||
        !Number.isSafeInteger(b.amountCents) ||
        b.amountCents <= 0 ||
        !b.reference?.trim()
      )
        return json(
          "Payer, positive amount, date, and reference are required",
          400,
        );
      let amount = b.amountCents;
      if (b.reversesId) {
        const receipt = await db
          .prepare(
            "SELECT amount_cents FROM deal_receipts WHERE id=? AND tenant_id=? AND transaction_id=? AND reverses_id IS NULL",
          )
          .bind(b.reversesId, ctx.tenantId, tx.id)
          .first<{ amount_cents: number }>();
        if (!receipt || receipt.amount_cents !== amount)
          return json("Reversal must match the original receipt", 400);
        amount = -amount;
      }
      await db
        .prepare(
          "INSERT INTO deal_receipts(id,tenant_id,transaction_id,payer,amount_cents,received_date,reference,reverses_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .bind(
          b.id,
          ctx.tenantId,
          tx.id,
          b.payer,
          amount,
          b.date,
          b.reference,
          b.reversesId ?? null,
          ctx.userId,
        )
        .run();
      return json({ saved: true });
    }
    if (
      request.method === "POST" &&
      (action === "payments" || action === "charges")
    ) {
      const b: {
        id: string;
        agentId: string;
        amountCents: number;
        taxableCents: number;
        date: string;
        memo: string;
        settleId?: string;
        offsetChargeIds?: string[];
      } = await request.json();
      if (
        !b.id ||
        !isDateOnly(b.date) ||
        !Number.isSafeInteger(b.amountCents) ||
        b.amountCents <= 0 ||
        !b.memo?.trim()
      )
        return json(
          "Positive amount, date, and description/reference required",
          400,
        );
      const agent = await db
        .prepare(
          "SELECT id FROM users WHERE tenant_id=? AND id=? AND is_active=1",
        )
        .bind(ctx.tenantId, b.agentId)
        .first();
      if (!agent) return json("Agent not found", 404);
      if (action === "payments") {
        if (!Number.isSafeInteger(b.taxableCents) || b.taxableCents < 0)
          return json("Specify the reportable payment amount", 400);
        const writes = [
          db
            .prepare(
              "INSERT INTO commission_ledger_entries(id,tenant_id,agent_id,transaction_id,entry_type,status,amount_cents,taxable_amount_cents,effective_date,paid_at,source_key,memo,created_by) VALUES(?,?,?,?,'payment','posted',?,?,?,?,?,?,?)",
            )
            .bind(
              b.id,
              ctx.tenantId,
              b.agentId,
              tx.id,
              b.amountCents,
              b.taxableCents,
              b.date,
              b.date,
              `financial-payment:${b.id}`,
              b.memo,
              ctx.userId,
            ),
        ];
        if (b.offsetChargeIds?.length) {
          if (
            !Array.isArray(b.offsetChargeIds) ||
            b.offsetChargeIds.length > 30 ||
            new Set(b.offsetChargeIds).size !== b.offsetChargeIds.length
          )
            return json("Invalid charge selection", 400);
          const row = await db
            .prepare(
              "SELECT rules_json FROM agent_financial_plans WHERE tenant_id=? AND agent_id=? AND effective_from<=? ORDER BY effective_from DESC,rowid DESC LIMIT 1",
            )
            .bind(ctx.tenantId, b.agentId, b.date)
            .first<{ rules_json: string }>();
          const rules: FinancialPlan | null = row
            ? JSON.parse(row.rules_json)
            : null;
          if (!rules || !["withhold", "either"].includes(rules.chargePolicy))
            return json(
              "Configure the agent’s charge withholding policy in HR first",
              400,
            );
          for (const chargeId of b.offsetChargeIds) {
            const charge = await db
              .prepare(
                "SELECT id FROM agent_account_charges WHERE id=? AND tenant_id=? AND agent_id=? AND settled_at IS NULL AND (transaction_id IS NULL OR transaction_id=?)",
              )
              .bind(chargeId, ctx.tenantId, b.agentId, tx.id)
              .first();
            if (!charge)
              return json(
                "A selected charge is unavailable or already settled",
                409,
              );
            // A uniqueness guard rolls back the entire payment if another request settles this charge first.
            writes.push(
              db
                .prepare(
                  "INSERT INTO charge_settlements(charge_id,tenant_id,payment_id,settled_date) VALUES(?,?,?,?)",
                )
                .bind(chargeId, ctx.tenantId, b.id, b.date),
            );
            writes.push(
              db
                .prepare(
                  "UPDATE agent_account_charges SET settled_at=?,settlement_reference=?,settlement_method='withheld',payment_id=? WHERE id=? AND tenant_id=?",
                )
                .bind(b.date, b.memo, b.id, chargeId, ctx.tenantId),
            );
          }
        }
        await db.batch(writes);
      } else if (b.settleId) {
        await db
          .prepare(
            "UPDATE agent_account_charges SET settled_at=?,settlement_reference=? WHERE id=? AND tenant_id=? AND agent_id=? AND transaction_id=? AND settled_at IS NULL",
          )
          .bind(b.date, b.memo, b.settleId, ctx.tenantId, b.agentId, tx.id)
          .run();
      } else {
        await db
          .prepare(
            "INSERT INTO agent_account_charges(id,tenant_id,agent_id,transaction_id,description,amount_cents,charge_date,created_by) VALUES(?,?,?,?,?,?,?,?)",
          )
          .bind(
            b.id,
            ctx.tenantId,
            b.agentId,
            tx.id,
            b.memo,
            b.amountCents,
            b.date,
            ctx.userId,
          )
          .run();
      }
      return json({ saved: true });
    }
    return json("Method not allowed", 405);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save financials";
    if (/UNIQUE|changed|constraint/i.test(message))
      return json(
        "Record already saved or changed; reload before retrying.",
        409,
      );
    return json(message, 400);
  }
}

// Reopening reverses obligations and cap contributions, never actual cash payments.
export async function reopenFinancials(
  db: D1Database,
  tenantId: string,
  transactionId: string,
  actorId: string,
): Promise<D1PreparedStatement[]> {
  const latest = await db
    .prepare(
      "SELECT * FROM deal_financial_versions WHERE tenant_id=? AND transaction_id=? ORDER BY version DESC LIMIT 1",
    )
    .bind(tenantId, transactionId)
    .first<Version>();
  if (!latest) return [];
  const version = latest.version + 1;
  const writes = [
    db
      .prepare(
        "INSERT INTO deal_financial_versions(tenant_id,transaction_id,version,data_json,calculation_json,state,actor_id) VALUES(?,?,?,?,?,'draft',?)",
      )
      .bind(
        tenantId,
        transactionId,
        version,
        latest.data_json,
        latest.calculation_json,
        actorId,
      ),
  ];
  const prior = await db
    .prepare(
      "SELECT agent_id,SUM(amount_cents) AS amount FROM commission_ledger_entries WHERE tenant_id=? AND transaction_id=? AND status='posted' AND (entry_type='earned' OR (entry_type='adjustment' AND corrects_entry_id IS NOT NULL)) GROUP BY agent_id HAVING SUM(amount_cents)!=0",
    )
    .bind(tenantId, transactionId)
    .all<{ agent_id: string; amount: number }>();
  for (const p of prior.results) {
    const anchor = await db
      .prepare(
        "SELECT id FROM commission_ledger_entries WHERE tenant_id=? AND transaction_id=? AND agent_id=? AND entry_type='earned' AND status='posted' ORDER BY created_at,id LIMIT 1",
      )
      .bind(tenantId, transactionId, p.agent_id)
      .first<{ id: string }>();
    writes.push(
      db
        .prepare(
          "INSERT INTO commission_ledger_entries(id,tenant_id,agent_id,transaction_id,entry_type,status,amount_cents,taxable_amount_cents,effective_date,source_key,memo,created_by,corrects_entry_id,calculation_snapshot_json) VALUES(?,?,?,?,'adjustment','posted',?,0,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          p.agent_id,
          transactionId,
          -p.amount,
          new Date().toISOString().slice(0, 10),
          `financial-reopen:${transactionId}:${version}:${p.agent_id}`,
          "Deal reopened; earned obligation reversed, payments retained",
          actorId,
          anchor?.id ?? null,
          latest.calculation_json,
        ),
    );
  }
  const caps = await db
    .prepare(
      "SELECT agent_id,period,SUM(amount_cents) AS amount FROM financial_cap_movements WHERE tenant_id=? AND transaction_id=? GROUP BY agent_id,period HAVING SUM(amount_cents)!=0",
    )
    .bind(tenantId, transactionId)
    .all<{ agent_id: string; period: string; amount: number }>();
  for (const c of caps.results) {
    const b = await db
      .prepare(
        "SELECT revision FROM financial_cap_balances WHERE tenant_id=? AND agent_id=? AND period=?",
      )
      .bind(tenantId, c.agent_id, c.period)
      .first<{ revision: number }>();
    writes.push(
      db
        .prepare(
          "INSERT INTO financial_cap_movements(id,tenant_id,agent_id,period,transaction_id,version,amount_cents,expected_revision) VALUES(?,?,?,?,?,?,?,?)",
        )
        .bind(
          crypto.randomUUID(),
          tenantId,
          c.agent_id,
          c.period,
          transactionId,
          version,
          -c.amount,
          b?.revision ?? 0,
        ),
    );
  }
  return writes;
}
