import type { D1Database, Fetcher } from "@cloudflare/workers-types";
interface AuthSession {
  userId: string;
  tenantId: string;
  role: string;
}
import { emailPreferences } from "./agent-notifications";
import { processIntake, type Intake } from "./lead-intake";
const ok = (data: unknown) =>
  Response.json(
    { success: true, data },
    { headers: { "Cache-Control": "no-store" } },
  );
const fail = (error: string, status = 400) =>
  Response.json({ success: false, error }, { status });
const broker = (s: AuthSession) => ["broker", "admin"].includes(s.role);

export async function launchRoutes(
  request: Request,
  env: { DB: D1Database; CRM: Fetcher },
  s: AuthSession,
): Promise<Response | null> {
  const url = new URL(request.url),
    path = url.pathname,
    db = env.DB;
  if (path === "/api/user/notification-preferences") {
    if (request.method === "GET")
      return ok(await emailPreferences(db, s.userId));
    if (request.method === "PUT") {
      const b = (await request.json()) as Record<string, unknown>;
      if (
        ["enabled", "leads", "reviews"].some((k) => typeof b[k] !== "boolean")
      )
        return fail("All email preferences must be true or false");
      const prefs = JSON.stringify({
        enabled: b.enabled,
        leads: b.leads,
        reviews: b.reviews,
      });
      await db
        .prepare(
          `INSERT INTO user_settings(user_id,notifications) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET notifications=excluded.notifications,updated_at=datetime('now')`,
        )
        .bind(s.userId, prefs)
        .run();
      return ok(JSON.parse(prefs));
    }
  }
  if (path === "/api/pilot/feedback") {
    if (request.method === "POST") {
      const b = (await request.json()) as Record<string, unknown>;
      if (
        !["bug", "friction", "idea", "success"].includes(String(b.category)) ||
        !["blocking", "moderate", "minor"].includes(String(b.severity)) ||
        ![
          "login",
          "listings",
          "crm",
          "deals",
          "notifications",
          "apps",
          "other",
        ].includes(String(b.area))
      )
        return fail("Choose a category, impact and workspace area");
      if (
        typeof b.description !== "string" ||
        b.description.trim().length < 10 ||
        b.description.length > 4000 ||
        typeof b.expected !== "string" ||
        b.expected.length > 2000
      )
        return fail(
          "Describe what happened (10–4000 characters) and your expected result",
        );
      if (
        b.rating != null &&
        (!Number.isInteger(b.rating) ||
          Number(b.rating) < 1 ||
          Number(b.rating) > 5)
      )
        return fail("Rating must be 1–5");
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO pilot_feedback(id,tenant_id,user_id,category,severity,area,description,expected,rating) VALUES(?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          s.tenantId,
          s.userId,
          b.category,
          b.severity,
          b.area,
          b.description.trim(),
          b.expected.trim(),
          b.rating ?? null,
        )
        .run();
      return ok({ id });
    }
    if (request.method === "GET") {
      const rows = await db
        .prepare(
          `SELECT id,category,severity,area,description,expected,rating,status,resolution,created_at,updated_at FROM pilot_feedback WHERE tenant_id=? ${broker(s) ? "" : "AND user_id=?"} ORDER BY created_at DESC LIMIT 200`,
        )
        .bind(...(broker(s) ? [s.tenantId] : [s.tenantId, s.userId]))
        .all();
      return ok(rows.results);
    }
  }
  const feedback = path.match(/^\/api\/pilot\/feedback\/([^/]+)$/);
  if (feedback && request.method === "PUT") {
    if (!broker(s)) return fail("Broker access required", 403);
    const b = (await request.json()) as { status: string; resolution: string };
    if (
      !["new", "investigating", "planned", "resolved"].includes(b.status) ||
      typeof b.resolution !== "string" ||
      b.resolution.length > 2000
    )
      return fail("Invalid feedback update");
    const changed = await db
      .prepare(
        `UPDATE pilot_feedback SET status=?,resolution=?,updated_at=datetime('now') WHERE id=? AND tenant_id=?`,
      )
      .bind(b.status, b.resolution, feedback[1], s.tenantId)
      .run();
    return changed.meta.changes
      ? ok({ saved: true })
      : fail("Report not found", 404);
  }
  if (path === "/api/pilot/report" && request.method === "GET") {
    if (!broker(s)) return fail("Broker access required", 403);
    const [feedback, intakes, email] = await Promise.all([
      db
        .prepare(
          `SELECT id,category,severity,area,description,expected,rating,status,resolution,created_at,updated_at FROM pilot_feedback WHERE tenant_id=? ORDER BY created_at DESC LIMIT 500`,
        )
        .bind(s.tenantId)
        .all(),
      db
        .prepare(
          `SELECT status,COUNT(*) AS count FROM listing_lead_intakes WHERE tenant_id=? GROUP BY status`,
        )
        .bind(s.tenantId)
        .all(),
      db
        .prepare(
          `SELECT status,error_code,COUNT(*) AS count FROM notification_email_jobs WHERE tenant_id=? GROUP BY status,error_code`,
        )
        .bind(s.tenantId)
        .all(),
    ]);
    return ok({
      generatedAt: new Date().toISOString(),
      scope:
        "All-time, latest 500 feedback entries. Email sent means provider accepted, not inbox delivery.",
      feedback: feedback.results,
      leadDelivery: intakes.results,
      emailDelivery: email.results,
    });
  }
  if (path === "/api/pilot/inquiries" && request.method === "GET") {
    if (!broker(s)) return fail("Broker access required", 403);
    const rows = await db
      .prepare(
        `SELECT i.id,i.listing_id,i.status,i.created_at,i.contact_id,u.name AS shared_by,c.assigned_to AS current_owner_id,o.name AS current_owner FROM listing_lead_intakes i LEFT JOIN users u ON u.id=i.assigned_to AND u.tenant_id=i.tenant_id LEFT JOIN contacts c ON c.id=i.contact_id AND c.tenant_id=i.tenant_id LEFT JOIN users o ON o.id=c.assigned_to WHERE i.tenant_id=? AND i.status IN ('review','failed','pending','processing') ORDER BY i.created_at LIMIT 100`,
      )
      .bind(s.tenantId)
      .all();
    return ok(rows.results);
  }
  const retry = path.match(/^\/api\/pilot\/inquiries\/([^/]+)\/resolve$/);
  if (retry && request.method === "POST") {
    if (!broker(s)) return fail("Broker access required", 403);
    const intake = await db
      .prepare("SELECT * FROM listing_lead_intakes WHERE tenant_id=? AND id=?")
      .bind(s.tenantId, retry[1])
      .first<Intake>();
    if (!intake) return fail("Inquiry not found", 404);
    let assignee = intake.assigned_to;
    if (intake.status === "review") {
      const contact = await db
        .prepare("SELECT assigned_to FROM contacts WHERE tenant_id=? AND id=?")
        .bind(s.tenantId, intake.contact_id)
        .first<{ assigned_to: string }>();
      if (!contact?.assigned_to)
        return fail(
          "Contact ownership changed; review the contact in CRM first",
          409,
        );
      assignee = contact.assigned_to;
    }
    const status = await processIntake(env, intake, url.origin, assignee);
    if (status === "delivered")
      await db
        .prepare(
          `UPDATE listing_lead_intakes SET reviewed_by=?,resolution=?,updated_at=datetime('now') WHERE tenant_id=? AND id=?`,
        )
        .bind(
          s.userId,
          assignee === intake.assigned_to
            ? "Delivered to sharing agent"
            : "Attached to existing owner; original sharing attribution retained",
          s.tenantId,
          intake.id,
        )
        .run();
    return ok({ status });
  }
  if (path === "/api/pilot/email-retry" && request.method === "POST") {
    if (!broker(s)) return fail("Broker access required", 403);
    await db
      .prepare(
        `UPDATE notification_email_jobs SET status='pending',attempts=0,next_attempt_at=datetime('now'),updated_at=datetime('now') WHERE tenant_id=? AND status='failed'`,
      )
      .bind(s.tenantId)
      .run();
    return ok({ queued: true });
  }
  return null;
}
