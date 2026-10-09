import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "./helpers/sqlite";
import { financialRoutes, reopenFinancials } from "../financials";
import {
  emptyFinancials,
  planPreset,
} from "../../../src/domain/deal-financials";

function setup() {
  const { sqlite, db } = sqliteD1();
  sqlite.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY); INSERT INTO tenants VALUES('tenant');
    CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,name TEXT,is_active INTEGER);
    INSERT INTO users VALUES('agent','tenant','Jane',1),('broker','tenant','Broker',1),('other','other','Other',1);
    CREATE TABLE transactions(id TEXT PRIMARY KEY,tenant_id TEXT,assigned_to TEXT,status TEXT,type TEXT,is_locked INTEGER,actual_close_date TEXT,target_close_date TEXT,is_active INTEGER,price REAL,commission_amount REAL,commission_rate REAL);
    INSERT INTO transactions VALUES('deal','tenant','agent','closed','sale',0,'2026-09-27',NULL,1,500000,20000,4);
    CREATE TABLE transaction_team(transaction_id TEXT,user_id TEXT);
    CREATE TABLE transaction_offers(id TEXT,transaction_id TEXT,tenant_id TEXT,purchase_price REAL,status TEXT);`);
  for (const file of [
    "050_commission_accounting.sql",
    "052_connected_delivery.sql",
    "058_deal_financials.sql",
  ])
    sqlite.exec(readFileSync(`worker/db/migrations/${file}`, "utf8"));
  const ctx = {
    userId: "broker",
    tenantId: "tenant",
    role: "broker",
    isAssistant: false,
    effectiveUserId: "broker",
  };
  const f = {
    ...emptyFinancials(),
    role: "listing" as const,
    agreement: "Listing agreement",
    document: "Signed listing.pdf",
    basis: "sold" as const,
    rate: 4,
    outsideRate: 2,
    outsideBroker: "Other brokerage",
    prices: {
      listing: 52000000,
      contract: 50000000,
      sold: 50000000,
      credits: null,
    },
    participants: [{ agentId: "agent", share: 100, side: "listing" as const }],
    funding: [{ payer: "Settlement", cents: 1000000 }],
  };
  const call = (
    suffix: string,
    method: string,
    body?: unknown,
    context = ctx,
  ) =>
    financialRoutes(
      new Request(`https://test/api/transactions/${suffix}`, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      db,
      context,
    );
  const plan = {
    ...planPreset("New licensee"),
    confirmed: true,
    effectiveFrom: "2026-01-01",
  };
  return { sqlite, db, ctx, f, call, plan };
}
describe("financial workflow with real SQLite", () => {
  it("reopens by reversing obligations and cap usage while retaining cash payments", async () => {
    const { call, db, sqlite, f } = setup();
    await call("financial-plans/agent", "POST", {
      ...planPreset("Expert"),
      effectiveFrom: "2026-01-01",
      capPeriod: "calendar",
      confirmed: true,
    });
    await call("deal/financials/approve", "POST", {
      version: 0,
      financials: f,
    });
    await call("deal/financials/payments", "POST", {
      id: "cash",
      agentId: "agent",
      amountCents: 50000,
      taxableCents: 50000,
      date: "2026-09-27",
      memo: "Check",
    });
    await db.batch(await reopenFinancials(db, "tenant", "deal", "broker"));
    expect(
      sqlite
        .prepare(
          "SELECT SUM(amount_cents) AS n FROM commission_ledger_entries WHERE entry_type!='payment'",
        )
        .get()?.n,
    ).toBe(0);
    expect(
      sqlite
        .prepare(
          "SELECT amount_cents FROM commission_ledger_entries WHERE entry_type='payment'",
        )
        .get()?.amount_cents,
    ).toBe(50000);
    expect(
      sqlite.prepare("SELECT amount_cents FROM financial_cap_balances").get()
        ?.amount_cents,
    ).toBe(0);
  });
  it("records account offsets separately and prevents duplicate charge settlement", async () => {
    const { call, plan, sqlite } = setup();
    await call("financial-plans/agent", "POST", {
      ...plan,
      chargePolicy: "withhold",
    });
    expect(
      (
        await call("financial-accounts/agent", "POST", {
          id: "charge",
          kind: "monthly",
          amountCents: 9900,
          date: "2026-09-01",
          description: "Cloud service",
        })
      )?.status,
    ).toBe(200);
    expect(
      (
        await call("financial-accounts/agent", "POST", {
          id: "charge2",
          kind: "monthly",
          amountCents: 9900,
          date: "2026-09-15",
          description: "Cloud service",
        })
      )?.status,
    ).toBe(409);
    const body = {
      id: "net-payment",
      agentId: "agent",
      amountCents: 640100,
      taxableCents: 650000,
      date: "2026-09-27",
      memo: "ACH ref",
      offsetChargeIds: ["charge"],
    };
    expect((await call("deal/financials/payments", "POST", body))?.status).toBe(
      200,
    );
    expect(
      sqlite
        .prepare(
          "SELECT amount_cents,taxable_amount_cents FROM commission_ledger_entries",
        )
        .get(),
    ).toMatchObject({ amount_cents: 640100, taxable_amount_cents: 650000 });
    expect(
      sqlite
        .prepare("SELECT settlement_method FROM agent_account_charges")
        .get()?.settlement_method,
    ).toBe("withheld");
    expect(
      (
        await call("deal/financials/payments", "POST", {
          ...body,
          id: "second",
        })
      )?.status,
    ).toBe(409);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM commission_ledger_entries")
        .get()?.n,
    ).toBe(1);
  });
  it("allows pending rules to be configured on the same effective date without changing approved history", async () => {
    const { call, plan, f, sqlite } = setup();
    await call("financial-plans/agent", "POST", { ...plan, confirmed: false });
    await call("financial-plans/agent", "POST", plan);
    expect(
      (
        await call("deal/financials/approve", "POST", {
          version: 0,
          financials: f,
        })
      )?.status,
    ).toBe(200);
    await call("financial-plans/agent", "POST", { ...plan, agentPercent: 80 });
    const saved = sqlite
      .prepare(
        "SELECT calculation_snapshot_json FROM commission_ledger_entries",
      )
      .get()?.calculation_snapshot_json as string;
    expect(JSON.parse(saved).agent.agentCents).toBe(650000);
  });
  it("saves, approves only the brokerage allocation, and preserves earnings through correction", async () => {
    const { sqlite, call, plan, f } = setup();
    expect((await call("financial-plans/agent", "POST", plan))?.status).toBe(
      200,
    );
    expect(
      (await call("deal/financials", "PUT", { version: 0, financials: f }))
        ?.status,
    ).toBe(200);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM commission_ledger_entries")
        .get()?.n,
    ).toBe(0);
    expect(
      (
        await call("deal/financials/approve", "POST", {
          version: 1,
          financials: f,
        })
      )?.status,
    ).toBe(200);
    const original = sqlite
      .prepare(
        "SELECT * FROM commission_ledger_entries WHERE entry_type='earned'",
      )
      .get();
    expect(original?.amount_cents).toBe(650000);
    const changed = {
      ...f,
      rate: 5,
      funding: [{ payer: "Settlement", cents: 1500000 }],
    };
    expect(
      (
        await call("deal/financials/approve", "POST", {
          version: 2,
          financials: changed,
        })
      )?.status,
    ).toBe(200);
    expect(
      sqlite
        .prepare("SELECT SUM(amount_cents) AS n FROM commission_ledger_entries")
        .get()?.n,
    ).toBe(975000);
    expect(
      sqlite
        .prepare(
          "SELECT * FROM commission_ledger_entries WHERE entry_type='earned'",
        )
        .get(),
    ).toEqual(original);
    expect(
      sqlite.prepare("SELECT commission_amount FROM transactions").get()
        ?.commission_amount,
    ).toBe(15000);
    expect(() =>
      sqlite.exec("UPDATE deal_financial_versions SET state='draft'"),
    ).toThrow();
  });
  it("rejects stale revisions and payments with duplicate request IDs", async () => {
    const { call, f, sqlite } = setup();
    await call("deal/financials", "PUT", { version: 0, financials: f });
    expect(
      (await call("deal/financials", "PUT", { version: 0, financials: f }))
        ?.status,
    ).toBe(409);
    const payment = {
      id: "pay",
      agentId: "agent",
      amountCents: 10000,
      taxableCents: 10000,
      date: "2026-09-27",
      memo: "Check 123",
    };
    expect(
      (await call("deal/financials/payments", "POST", payment))?.status,
    ).toBe(200);
    expect(
      (await call("deal/financials/payments", "POST", payment))?.status,
    ).toBe(409);
    expect(
      sqlite
        .prepare("SELECT COUNT(*) AS n FROM commission_ledger_entries")
        .get()?.n,
    ).toBe(1);
  });
  it("requires role, tenant access, complete funding and a configured plan", async () => {
    const { call, f, ctx, plan } = setup();
    expect(
      (
        await call("deal/financials", "GET", undefined, {
          ...ctx,
          tenantId: "other",
        })
      )?.status,
    ).toBe(404);
    expect(
      (
        await call(
          "deal/financials",
          "PUT",
          { version: 0, financials: f },
          {
            ...ctx,
            userId: "agent",
            effectiveUserId: "agent",
            role: "salesperson",
          },
        )
      )?.status,
    ).toBe(403);
    expect(
      (
        await call("deal/financials/approve", "POST", {
          version: 0,
          financials: f,
        })
      )?.status,
    ).toBe(400);
    await call("financial-plans/agent", "POST", plan);
    expect(
      (
        await call("deal/financials/approve", "POST", {
          version: 0,
          financials: { ...f, funding: [] },
        })
      )?.status,
    ).toBe(400);
  });
  it("redacts other agent compensation and protects concurrent cap contributions", async () => {
    const { call, f, ctx, sqlite } = setup();
    await call("financial-plans/agent", "POST", {
      ...planPreset("Expert"),
      effectiveFrom: "2026-01-01",
      confirmed: true,
      capPeriod: "calendar",
    });
    await call("deal/financials/approve", "POST", {
      version: 0,
      financials: f,
    });
    expect(
      sqlite.prepare("SELECT amount_cents FROM financial_cap_balances").get()
        ?.amount_cents,
    ).toBe(250000);
    expect(() =>
      sqlite.exec(
        "INSERT INTO financial_cap_movements VALUES('stale','tenant','agent','2026-01-01','other-deal',1,250000,0)",
      ),
    ).toThrow();
    const response = await call("deal/financials", "GET", undefined, {
      ...ctx,
      userId: "agent",
      effectiveUserId: "agent",
      role: "salesperson",
    });
    const body = (await response!.json()) as {
      data: {
        calculation: {
          companyCents: number | null;
          agents: { plan: unknown }[];
        };
      };
    };
    expect(body.data.calculation.companyCents).toBeNull();
    expect(body.data.calculation.agents[0].plan).toBeNull();
  });
});
