import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
type Feedback = {
  id: string;
  category: string;
  severity: string;
  area: string;
  description: string;
  expected: string;
  rating: number | null;
  status: string;
  resolution: string;
  created_at: string;
};
type Inquiry = {
  id: string;
  listing_id: string;
  status: string;
  created_at: string;
  shared_by: string;
  current_owner: string | null;
};
async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error || "Request failed");
  return b.data;
}
const input =
  "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white";
export function PilotFeedback() {
  const { user } = useAuth(),
    isBroker = ["broker", "admin"].includes(user?.role || "");
  const [form, setForm] = useState({
    category: "bug",
    severity: "moderate",
    area: "other",
    description: "",
    expected: "",
    rating: 3,
  });
  const [feedback, setFeedback] = useState<Feedback[]>([]),
    [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const [f, i] = await Promise.all([
      api("/api/pilot/feedback"),
      isBroker ? api("/api/pilot/inquiries") : Promise.resolve([]),
    ]);
    setFeedback(f);
    setInquiries(i);
  }, [isBroker]);
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, [refresh]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  async function report() {
    const data = await api("/api/pilot/report");
    const text = JSON.stringify(data, null, 2);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `workspace-pilot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage(
      "Report downloaded. You can also ask for the pilot report in our Codex chat.",
    );
  }
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-white border border-gray-100 p-6 shadow-card">
        <h3 className="font-bold text-gray-800">Workspace feedback</h3>
        <p className="text-sm text-gray-500 mt-2">
          Tell us what worked or where you got stuck. Your broker can review and
          track the result. Do not include client names, contact details,
          passwords or confidential deal information.
        </p>
        <form
          className="space-y-4 mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void perform(async () => {
              await api("/api/pilot/feedback", "POST", form);
              setForm({ ...form, description: "", expected: "" });
              setMessage("Feedback saved. Thank you.");
            });
          }}
        >
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-sm">
              Type
              <select
                className={input}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {["bug", "friction", "idea", "success"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Impact
              <select
                className={input}
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                {["blocking", "moderate", "minor"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Area
              <select
                className={input}
                value={form.area}
                onChange={(e) => setForm({ ...form, area: e.target.value })}
              >
                {[
                  "login",
                  "listings",
                  "crm",
                  "deals",
                  "notifications",
                  "apps",
                  "other",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            What happened? Include steps to reproduce.
            <textarea
              required
              minLength={10}
              maxLength={4000}
              rows={4}
              className={input}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            What did you expect?
            <textarea
              maxLength={2000}
              rows={2}
              className={input}
              value={form.expected}
              onChange={(e) => setForm({ ...form, expected: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            How easy was this experience? (1 difficult — 5 easy)
            <select
              className={input}
              value={form.rating}
              onChange={(e) =>
                setForm({ ...form, rating: Number(e.target.value) })
              }
            >
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <button
            disabled={busy}
            className="rounded-xl bg-brand-navy text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Submit feedback
          </button>
        </form>
        <p role="status" className="text-sm mt-3">
          {message}
        </p>
      </section>
      {isBroker && (
        <section className="rounded-2xl bg-white border border-gray-100 p-6 space-y-4">
          <h3 className="font-bold">Pilot report & lead review</h3>
          <p className="text-sm text-gray-500">
            Export feedback, lead delivery totals and email outcomes. Reports
            are retrieved in Codex only when you ask. An email marked sent was
            accepted by the provider; it does not confirm inbox delivery.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              disabled={busy}
              className="rounded-xl border px-4 py-2 text-sm"
              onClick={() => void perform(report)}
            >
              Download pilot report
            </button>
            <button
              disabled={busy}
              className="rounded-xl border px-4 py-2 text-sm"
              onClick={() =>
                void perform(async () => {
                  await api("/api/pilot/email-retry", "POST");
                  setMessage("Failed emails queued for another attempt.");
                })
              }
            >
              Retry failed alert emails
            </button>
          </div>
          <h4 className="font-semibold text-sm">Inquiries needing attention</h4>
          {inquiries.length === 0 ? (
            <p className="text-sm text-gray-500">
              No inquiries awaiting review.
            </p>
          ) : (
            inquiries.map((i) => (
              <div
                key={i.id}
                className="border rounded-xl p-3 text-sm space-y-2"
              >
                <p>
                  {i.shared_by} · {i.status} · {i.created_at}
                </p>
                <p className="text-gray-500">
                  Listing reference: {i.listing_id}
                </p>
                {i.current_owner && (
                  <p>
                    Existing contact owner: {i.current_owner}. Preserve
                    ownership and attach this inquiry; the sharing attribution
                    stays in the record.
                  </p>
                )}
                <button
                  disabled={busy}
                  className="text-brand-navy font-semibold"
                  onClick={() =>
                    void perform(async () => {
                      const r = await api(
                        `/api/pilot/inquiries/${i.id}/resolve`,
                        "POST",
                      );
                      setMessage(
                        r.status === "delivered"
                          ? "Inquiry delivered."
                          : "Inquiry remains queued for review. Check CRM ownership and retry.",
                      );
                    })
                  }
                >
                  {i.status === "review"
                    ? "Attach inquiry to existing owner"
                    : "Retry CRM delivery"}
                </button>
              </div>
            ))
          )}
        </section>
      )}
      <section className="rounded-2xl bg-white border border-gray-100 p-6">
        <h3 className="font-bold mb-4">
          {isBroker ? "Feedback tracker" : "Your feedback"}
        </h3>
        {feedback.length === 0 && (
          <p className="text-sm text-gray-500">No feedback submitted yet.</p>
        )}
        {feedback.map((f) => (
          <FeedbackRow
            key={f.id}
            item={f}
            isBroker={isBroker}
            busy={busy}
            save={(status, resolution) =>
              perform(async () => {
                await api(`/api/pilot/feedback/${f.id}`, "PUT", {
                  status,
                  resolution,
                });
                setMessage("Feedback updated.");
              })
            }
          />
        ))}
      </section>
    </div>
  );
}
function FeedbackRow({
  item: f,
  isBroker,
  busy,
  save,
}: {
  item: Feedback;
  isBroker: boolean;
  busy: boolean;
  save: (status: string, resolution: string) => Promise<void>;
}) {
  const [status, setStatus] = useState(f.status),
    [resolution, setResolution] = useState(f.resolution);
  return (
    <article className="border-t py-4 space-y-2 text-sm">
      <p className="font-semibold">
        {f.area} · {f.category} · {f.severity} · {f.status}
      </p>
      <p className="whitespace-pre-wrap">{f.description}</p>
      {f.expected && <p className="text-gray-500">Expected: {f.expected}</p>}
      <p className="text-xs text-gray-400">
        {f.created_at} · Ease: {f.rating}/5 · Reference: {f.id}
      </p>
      {isBroker ? (
        <div className="space-y-2">
          <select
            aria-label="Feedback status"
            className={input}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {["new", "investigating", "planned", "resolved"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
          <textarea
            aria-label="Resolution or next step"
            placeholder="Resolution or next step"
            className={input}
            maxLength={2000}
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          />
          <button
            disabled={busy}
            className="font-semibold text-brand-navy"
            onClick={() => void save(status, resolution)}
          >
            Save update
          </button>
        </div>
      ) : (
        f.resolution && <p>Broker update: {f.resolution}</p>
      )}
    </article>
  );
}
