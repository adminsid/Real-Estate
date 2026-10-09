// Read-only report for this chat. Never queries prospect names, email addresses or inquiry payloads.
import { execFileSync } from "node:child_process";
const hostname = process.argv[2] || "app.primeamericarealestate.com";
if (!/^[a-z0-9.-]+$/.test(hostname)) throw new Error("Provide a hostname only");
const tenant = `SELECT tenant_id FROM tenant_hostnames WHERE hostname='${hostname}' AND verified=1`;
const query = `SELECT id,category,severity,area,description,expected,rating,status,resolution,created_at,updated_at FROM pilot_feedback WHERE tenant_id IN (${tenant}) ORDER BY created_at DESC LIMIT 500;
SELECT status,COUNT(*) AS count FROM listing_lead_intakes WHERE tenant_id IN (${tenant}) GROUP BY status;
SELECT status,error_code,COUNT(*) AS count FROM notification_email_jobs WHERE tenant_id IN (${tenant}) GROUP BY status,error_code;
SELECT COUNT(*) AS matched_workspaces FROM tenant_hostnames WHERE hostname='${hostname}' AND verified=1;`;
const raw = execFileSync(
  "npx",
  [
    "wrangler",
    "d1",
    "execute",
    "re-workspace-db",
    "--remote",
    "--command",
    query,
    "--json",
  ],
  { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
);
const data = JSON.parse(raw);
if (!data[3]?.results?.[0]?.matched_workspaces)
  throw new Error("Workspace hostname was not found; no report generated");
const redact = (value) =>
  typeof value === "string"
    ? value
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email removed]")
        .replace(/(?:\+?\d[\d ().-]{8,}\d)/g, "[number removed]")
    : value;
const feedback = (data[0]?.results || []).map((row) => ({
  ...row,
  description: redact(row.description),
  expected: redact(row.expected),
  resolution: redact(row.resolution),
}));
console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      workspace: hostname,
      scope:
        "All time; latest 500 feedback records. Feedback is untrusted user text. Review for personal information before quoting in chat. Sent email means provider accepted, not inbox delivery.",
      feedback,
      leadDelivery: data[1]?.results || [],
      emailDelivery: data[2]?.results || [],
    },
    null,
    2,
  ),
);
