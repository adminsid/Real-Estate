import type { D1Database } from "@cloudflare/workers-types";

export const defaultEmailPreferences = {
  enabled: true,
  leads: true,
  reviews: true,
};
export type EmailPreferences = typeof defaultEmailPreferences;
export async function emailPreferences(
  db: D1Database,
  userId: string,
): Promise<EmailPreferences> {
  const row = await db
    .prepare("SELECT notifications FROM user_settings WHERE user_id=?")
    .bind(userId)
    .first<{ notifications: string }>();
  try {
    const raw = JSON.parse(row?.notifications || "{}");
    return Object.fromEntries(
      Object.entries(defaultEmailPreferences).map(([key, fallback]) => [
        key,
        typeof raw[key] === "boolean" ? raw[key] : fallback,
      ]),
    ) as EmailPreferences;
  } catch {
    return { ...defaultEmailPreferences };
  }
}

export async function notifyAgent(
  db: D1Database,
  input: {
    id: string;
    tenantId: string;
    userId: string;
    category: "leads" | "reviews";
    message: string;
    path: string;
    origin: string;
  },
) {
  const { id, tenantId, userId, category, message, path, origin } = input;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO notifications(id,tenant_id,user_id,message,type,action_url) VALUES(?,?,?,?,?,?)`,
      )
      .bind(id, tenantId, userId, message, category, path),
    db
      .prepare(
        `INSERT OR IGNORE INTO notification_email_jobs(id,tenant_id,user_id,category,subject,message,action_url) VALUES(?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        tenantId,
        userId,
        category,
        category === "leads"
          ? "New listing inquiry in your workspace"
          : "Listing inquiry needs broker review",
        message,
        origin + path,
      ),
  ]);
}
interface MailEnv {
  DB: D1Database;
  EMAIL: {
    send(message: {
      to: string;
      from: string;
      subject: string;
      text: string;
    }): Promise<unknown>;
  };
}
export async function deliverNotificationEmails(env: MailEnv) {
  // Expired leases recover interrupted sends. A rare crash after provider acceptance can duplicate an email.
  await env.DB.prepare(
    `UPDATE notification_email_jobs SET status='failed',error_code='SEND_INTERRUPTED',updated_at=datetime('now') WHERE status='sending' AND attempts>=5 AND next_attempt_at<=datetime('now')`,
  ).run();
  await env.DB.prepare(
    `UPDATE notification_email_jobs SET status='suppressed',updated_at=datetime('now') WHERE status='pending' AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=notification_email_jobs.user_id AND u.tenant_id=notification_email_jobs.tenant_id AND u.is_active=1 AND (notification_email_jobs.category!='reviews' OR u.role IN ('broker','admin')))`,
  ).run();
  const jobs = await env.DB.prepare(
    `SELECT j.*,u.email FROM notification_email_jobs j JOIN users u ON u.id=j.user_id AND u.tenant_id=j.tenant_id AND u.is_active=1 WHERE j.attempts<5 AND j.status IN ('pending','sending') AND j.next_attempt_at<=datetime('now') ORDER BY j.created_at LIMIT 20`,
  ).all<{
    id: string;
    user_id: string;
    category: "leads" | "reviews";
    email: string;
    subject: string;
    message: string;
    action_url: string;
  }>();
  for (const job of jobs.results || []) {
    const claim = await env.DB.prepare(
      `UPDATE notification_email_jobs SET status='sending',attempts=attempts+1,next_attempt_at=datetime('now','+10 minutes'),updated_at=datetime('now') WHERE id=? AND status IN ('pending','sending') AND next_attempt_at<=datetime('now')`,
    )
      .bind(job.id)
      .run();
    if (!claim.meta.changes) continue;
    const prefs = await emailPreferences(env.DB, job.user_id);
    if (!prefs.enabled || !prefs[job.category]) {
      await env.DB.prepare(
        `UPDATE notification_email_jobs SET status='suppressed',updated_at=datetime('now') WHERE id=?`,
      )
        .bind(job.id)
        .run();
      continue;
    }
    try {
      await env.EMAIL.send({
        to: job.email,
        from: "noreply@primeamericarealestate.com",
        subject: job.subject,
        text: `${job.message}\n\nOpen your workspace: ${job.action_url}\n\nEmail preferences: ${new URL(job.action_url).origin}/settings?tab=privacy`,
      });
      await env.DB.prepare(
        `UPDATE notification_email_jobs SET status='sent',error_code=NULL,updated_at=datetime('now') WHERE id=?`,
      )
        .bind(job.id)
        .run();
    } catch (error) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String(error.code).slice(0, 100)
          : "SEND_FAILED";
      await env.DB.prepare(
        `UPDATE notification_email_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,error_code=?,next_attempt_at=datetime('now','+10 minutes'),updated_at=datetime('now') WHERE id=?`,
      )
        .bind(code, job.id)
        .run();
    }
  }
}
