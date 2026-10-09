import type { D1Database, Fetcher } from "@cloudflare/workers-types";
import { notifyAgent } from "./agent-notifications";
export interface Intake {
  tenant_id: string;
  id: string;
  listing_id: string;
  assigned_to: string;
  payload_json: string;
  status: string;
  contact_id: string | null;
}
interface LeadEnv {
  DB: D1Database;
  CRM: Fetcher;
}
export async function processIntake(
  env: LeadEnv,
  intake: Intake,
  origin: string,
  assignee = intake.assigned_to,
) {
  if (intake.status === "delivered") return "delivered";
  const claim = await env.DB.prepare(
    `UPDATE listing_lead_intakes SET status='processing',updated_at=datetime('now') WHERE tenant_id=? AND id=? AND status!='delivered' AND (status!='processing' OR updated_at<datetime('now','-2 minutes'))`,
  )
    .bind(intake.tenant_id, intake.id)
    .run();
  if (!claim.meta.changes) return "processing";
  let status = "failed",
    contactId: string | null = null;
  try {
    const response = await env.CRM.fetch(
      "https://internal/api/contacts/upsert-inquiry",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": assignee,
          "X-Tenant-Id": intake.tenant_id,
          "X-User-Role": "system",
        },
        body: JSON.stringify({
          ...JSON.parse(intake.payload_json),
          assignedTo: assignee,
        }),
      },
    );
    const body = (await response.json()) as {
      data?: { contactId?: string };
      contactId?: string;
    };
    status = response.ok
      ? "delivered"
      : response.status === 409
        ? "review"
        : "failed";
    contactId = body.data?.contactId || body.contactId || null;
  } catch {
    /* Durable intake remains available to the broker when CRM is unavailable. */
  }
  if (status === "delivered") {
    await notifyAgent(env.DB, {
      id: `lead:${intake.tenant_id}:${intake.id}:${assignee}`,
      tenantId: intake.tenant_id,
      userId: assignee,
      category: "leads",
      message: "A new property inquiry is available in your CRM.",
      path: "/marketing/crm",
      origin,
    });
  } else {
    const brokers = await env.DB.prepare(
      `SELECT id FROM users WHERE tenant_id=? AND is_active=1 AND role IN ('broker','admin')`,
    )
      .bind(intake.tenant_id)
      .all<{ id: string }>();
    for (const broker of brokers.results || [])
      await notifyAgent(env.DB, {
        id: `review:${intake.tenant_id}:${intake.id}:${broker.id}`,
        tenantId: intake.tenant_id,
        userId: broker.id,
        category: "reviews",
        message:
          status === "review"
            ? "A saved listing inquiry needs an ownership review."
            : "A saved listing inquiry needs a CRM delivery retry.",
        path: "/settings?tab=pilot",
        origin,
      });
    await notifyAgent(env.DB, {
      id: `lead-pending:${intake.tenant_id}:${intake.id}`,
      tenantId: intake.tenant_id,
      userId: intake.assigned_to,
      category: "leads",
      message: "An inquiry from your listing link was saved for broker review.",
      path: "/marketing/crm",
      origin,
    });
  }
  await env.DB.prepare(
    `UPDATE listing_lead_intakes SET status=?,contact_id=COALESCE(?,contact_id),updated_at=datetime('now') WHERE tenant_id=? AND id=?`,
  )
    .bind(status, contactId, intake.tenant_id, intake.id)
    .run();
  return status;
}
