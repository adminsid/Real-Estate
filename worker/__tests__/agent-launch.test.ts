import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { sqliteD1 } from "../../workers/transactions/__tests__/helpers/sqlite";
import handler from "../index";
import { signJWT } from "../lib/crypto";
import { launchRoutes } from "../lib/agent-launch";
import {
  deliverNotificationEmails,
  notifyAgent,
} from "../lib/agent-notifications";
import { processIntake } from "../lib/lead-intake";
function setup() {
  const { sqlite, db } = sqliteD1();
  sqlite.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY); INSERT INTO tenants VALUES('t'),('other');
 CREATE TABLE tenant_hostnames(hostname TEXT,tenant_id TEXT,verified INTEGER); INSERT INTO tenant_hostnames VALUES('workspace.test','t',1);
 CREATE TABLE users(id TEXT PRIMARY KEY,tenant_id TEXT,role TEXT,is_active INTEGER,email TEXT,name TEXT);
 INSERT INTO users VALUES('a','t','salesperson',1,'a@example.com','Agent A'),('b','t','salesperson',1,'b@example.com','Agent B'),('broker','t','broker',1,'broker@example.com','Broker'),('broker2','t','broker',1,'broker2@example.com','Broker 2'),('outsider','other','salesperson',1,'o@example.com','Other');
 CREATE TABLE user_settings(user_id TEXT PRIMARY KEY,notifications TEXT DEFAULT '{}',updated_at TEXT);
 CREATE TABLE notifications(id TEXT PRIMARY KEY,tenant_id TEXT,user_id TEXT,message TEXT,type TEXT,action_url TEXT,created_at TEXT DEFAULT(datetime('now')));
 CREATE TABLE contacts(id TEXT PRIMARY KEY,tenant_id TEXT,assigned_to TEXT);
 INSERT INTO contacts VALUES('existing','t','b');`);
  sqlite.exec(
    readFileSync("worker/db/migrations/059_agent_launch.sql", "utf8"),
  );
  const CRM = {
    fetch: vi.fn(async () =>
      Response.json({ data: { contactId: "contact-a" } }),
    ),
  };
  const EMAIL = { send: vi.fn(async () => ({ messageId: "accepted" })) };
  const env = {
    DB: db,
    CRM,
    EMAIL,
    JWT_SECRET: "test-secret",
    INVENTORY_WORKER_URL: "https://inventory.test",
    INTERNAL_API_SECRET: "test",
  };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p) };
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    userId = "a",
    tenantId = "t",
  ) => {
    const cookie = await signJWT(
      {
        userId,
        tenantId,
        role: userId.startsWith("broker") ? "broker" : "salesperson",
      },
      "test-secret",
    );
    return handler.fetch(
      new Request(`https://workspace.test${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Cookie: `re_session=${cookie}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
      env as never,
      ctx as never,
    );
  };
  return { sqlite, db, env, call, ctx, pending };
}
afterEach(() => vi.unstubAllGlobals());
describe("agent launch safeguards", () => {
  it("routes a shared lead to an active sharing agent, keeps retries idempotent and rejects cross-tenant links", async () => {
    const { env, ctx, pending, sqlite } = setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "listing",
          tenantId: "t",
          data: { listAgentUserId: "b" },
        }),
      ),
    );
    const submit = (sharedBy = "a") =>
      handler.fetch(
        new Request("https://workspace.test/api/public/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: "listing",
            inquiryId: "inquiry",
            sharedBy,
            first_name: "Test",
            last_name: "Buyer",
            email: "buyer@example.com",
            phone: "5550100100",
          }),
        }),
        env as never,
        ctx as never,
      );
    expect((await submit()).status).toBe(200);
    await Promise.all(pending);
    expect((await submit()).status).toBe(200);
    expect(env.CRM.fetch).toHaveBeenCalledTimes(1);
    const init = env.CRM.fetch.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      assignedTo: "a",
      metadata: { sharedBy: "a" },
    });
    expect(
      sqlite
        .prepare("SELECT assigned_to,status FROM listing_lead_intakes")
        .get(),
    ).toMatchObject({ assigned_to: "a", status: "delivered" });
    expect((await submit("outsider")).status).toBe(409);
  });
  it("preserves conflicting inquiries and lets brokers attach them to the existing owner without transferring ownership", async () => {
    const { env, db, sqlite } = setup();
    const payload = {
      sourceId: "i",
      listingId: "listing",
      firstName: "Test",
      lastName: "Buyer",
      email: "test@example.com",
      metadata: { sharedBy: "a" },
    };
    await db
      .prepare(
        "INSERT INTO listing_lead_intakes(tenant_id,id,listing_id,assigned_to,payload_json) VALUES(?,?,?,?,?)",
      )
      .bind("t", "i", "listing", "a", JSON.stringify(payload))
      .run();
    const intake = {
      tenant_id: "t",
      id: "i",
      listing_id: "listing",
      assigned_to: "a",
      payload_json: JSON.stringify(payload),
      status: "pending",
      contact_id: null,
    };
    env.CRM.fetch.mockResolvedValueOnce(
      Response.json({ contactId: "existing" }, { status: 409 }),
    );
    expect(await processIntake(env, intake, "https://workspace.test")).toBe(
      "review",
    );
    expect(
      sqlite
        .prepare("SELECT status,contact_id FROM listing_lead_intakes")
        .get(),
    ).toMatchObject({ status: "review", contact_id: "existing" });
    const req = new Request(
      "https://workspace.test/api/pilot/inquiries/i/resolve",
      { method: "POST" },
    );
    expect(
      (
        await launchRoutes(req, env as never, {
          userId: "a",
          tenantId: "t",
          role: "salesperson",
        })
      )?.status,
    ).toBe(403);
    env.CRM.fetch.mockResolvedValueOnce(
      Response.json({ data: { contactId: "existing" } }),
    );
    expect(
      (
        await launchRoutes(req, env as never, {
          userId: "broker",
          tenantId: "t",
          role: "broker",
        })
      )?.status,
    ).toBe(200);
    expect(
      sqlite.prepare("SELECT assigned_to FROM contacts").get(),
    ).toMatchObject({ assigned_to: "b" });
    expect(
      sqlite
        .prepare("SELECT status,reviewed_by FROM listing_lead_intakes")
        .get(),
    ).toMatchObject({ status: "delivered", reviewed_by: "broker" });
    const init = env.CRM.fetch.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      assignedTo: "b",
      metadata: { sharedBy: "a" },
    });
  });
  it("retains a failed delivery and creates broker alerts when CRM is unavailable", async () => {
    const { env, db, sqlite } = setup();
    env.CRM.fetch.mockRejectedValueOnce(new Error("offline"));
    await db
      .prepare(
        "INSERT INTO listing_lead_intakes(tenant_id,id,listing_id,assigned_to,payload_json) VALUES(?,?,?,?,?)",
      )
      .bind("t", "i", "l", "a", "{}")
      .run();
    expect(
      await processIntake(
        env,
        {
          tenant_id: "t",
          id: "i",
          listing_id: "l",
          assigned_to: "a",
          payload_json: "{}",
          status: "pending",
          contact_id: null,
        },
        "https://workspace.test",
      ),
    ).toBe("failed");
    expect(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notifications WHERE user_id IN ('broker','broker2')",
        )
        .get(),
    ).toMatchObject({ n: 2 });
  });
  it("isolates personal notifications and independent broker read/dismiss state", async () => {
    const { sqlite, call } = setup();
    sqlite.exec(
      "INSERT INTO notifications(id,tenant_id,user_id,message) VALUES('personal','t','a','Private'),('broadcast','t',NULL,'Legacy'),('outside','other','outsider','Other')",
    );
    const a = await (await call("/api/notifications")).json();
    expect(a.data.map((n: any) => n.id)).toEqual(["personal"]);
    await call("/api/notifications/personal", "DELETE", undefined, "b");
    expect((await (await call("/api/notifications")).json()).data).toHaveLength(
      1,
    );
    await call("/api/notifications/read-all", "POST", undefined, "broker");
    expect(
      (
        await (
          await call("/api/notifications", "GET", undefined, "broker")
        ).json()
      ).data[0].is_read,
    ).toBe(1);
    expect(
      (
        await (
          await call("/api/notifications", "GET", undefined, "broker2")
        ).json()
      ).data[0].is_read,
    ).toBe(0);
    await call("/api/notifications/broadcast", "DELETE", undefined, "broker");
    expect(
      (
        await (
          await call("/api/notifications", "GET", undefined, "broker")
        ).json()
      ).data,
    ).toHaveLength(0);
    expect(
      (
        await (
          await call("/api/notifications", "GET", undefined, "broker2")
        ).json()
      ).data,
    ).toHaveLength(1);
  });
  it("persists user preferences, suppresses opted-out email and records provider failures without losing alerts", async () => {
    const { env, db, call, sqlite } = setup();
    expect(
      (
        await call("/api/user/notification-preferences", "PUT", {
          enabled: false,
          leads: true,
          reviews: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (await (await call("/api/user/notification-preferences")).json()).data
        .enabled,
    ).toBe(false);
    const base = {
      tenantId: "t",
      userId: "a",
      category: "leads" as const,
      message: "New inquiry",
      path: "/marketing/crm",
      origin: "https://workspace.test",
    };
    await notifyAgent(db, { ...base, id: "off" });
    await deliverNotificationEmails(env as never);
    expect(env.EMAIL.send).not.toHaveBeenCalled();
    expect(
      sqlite
        .prepare("SELECT status FROM notification_email_jobs WHERE id='off'")
        .get(),
    ).toMatchObject({ status: "suppressed" });
    await call("/api/user/notification-preferences", "PUT", {
      enabled: true,
      leads: true,
      reviews: true,
    });
    await notifyAgent(db, { ...base, id: "retry" });
    env.EMAIL.send.mockRejectedValueOnce(
      Object.assign(new Error("do not log addresses"), {
        code: "E_DELIVERY_FAILED",
      }),
    );
    await deliverNotificationEmails(env as never);
    expect(
      sqlite
        .prepare(
          "SELECT status,error_code FROM notification_email_jobs WHERE id='retry'",
        )
        .get(),
    ).toMatchObject({ status: "pending", error_code: "E_DELIVERY_FAILED" });
    sqlite.exec(
      "UPDATE notification_email_jobs SET next_attempt_at=datetime('now') WHERE id='retry'",
    );
    await deliverNotificationEmails(env as never);
    expect(
      sqlite
        .prepare("SELECT status FROM notification_email_jobs WHERE id='retry'")
        .get(),
    ).toMatchObject({ status: "sent" });
    expect(
      sqlite.prepare("SELECT COUNT(*) AS n FROM notifications").get(),
    ).toMatchObject({ n: 2 });
  });
  it("bounds retries and prevents concurrent email claims", async () => {
    const { env, db, sqlite } = setup();
    await notifyAgent(db, {
      tenantId: "t",
      userId: "a",
      category: "leads",
      id: "job",
      message: "New inquiry",
      path: "/marketing/crm",
      origin: "https://workspace.test",
    });
    await Promise.all([
      deliverNotificationEmails(env as never),
      deliverNotificationEmails(env as never),
    ]);
    expect(env.EMAIL.send).toHaveBeenCalledTimes(1);
    sqlite.exec(
      "UPDATE notification_email_jobs SET status='pending',attempts=4,next_attempt_at=datetime('now')",
    );
    env.EMAIL.send.mockRejectedValueOnce(new Error("provider down"));
    await deliverNotificationEmails(env as never);
    expect(
      sqlite
        .prepare("SELECT status,attempts FROM notification_email_jobs")
        .get(),
    ).toMatchObject({ status: "failed", attempts: 5 });
  });
  it("scopes feedback and reports, validates inputs, and allows broker status tracking", async () => {
    const { call } = setup(),
      body = {
        category: "bug",
        severity: "blocking",
        area: "apps",
        description: "The app link does not open",
        expected: "Open app",
        rating: 2,
      };
    expect(
      (await call("/api/pilot/feedback", "POST", { ...body, rating: 9 }))
        .status,
    ).toBe(400);
    const saved = await (
      await call("/api/pilot/feedback", "POST", body)
    ).json();
    expect(
      (await (await call("/api/pilot/feedback", "GET", undefined, "b")).json())
        .data,
    ).toHaveLength(0);
    expect((await call("/api/pilot/report")).status).toBe(403);
    expect(
      (
        await call(
          `/api/pilot/feedback/${saved.data.id}`,
          "PUT",
          { status: "resolved", resolution: "Fixed" },
          "b",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          `/api/pilot/feedback/${saved.data.id}`,
          "PUT",
          { status: "resolved", resolution: "Fixed" },
          "broker",
        )
      ).status,
    ).toBe(200);
    const report = await (
      await call("/api/pilot/report", "GET", undefined, "broker")
    ).json();
    expect(report.data.feedback[0]).toMatchObject({
      status: "resolved",
      resolution: "Fixed",
    });
    expect(report.data.feedback[0]).not.toHaveProperty("user_id");
    expect(JSON.stringify(report)).not.toContain("payload_json");
  });
});
