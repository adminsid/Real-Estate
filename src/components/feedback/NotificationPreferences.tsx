import { useEffect, useState } from "react";
export function NotificationPreferences() {
  const [prefs, setPrefs] = useState({
    enabled: true,
    leads: true,
    reviews: true,
  });
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error);
        setPrefs(b.data);
        setLoaded(true);
      })
      .catch(() =>
        setMessage("Unable to load email preferences. Refresh to try again."),
      );
  }, []);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/user/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!r.ok) throw new Error();
      setMessage("Email preferences saved.");
    } catch {
      setMessage("Unable to save. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="border-b border-gray-100 pb-5 mb-5">
      <h4 className="font-semibold text-gray-800">Email notifications</h4>
      <p className="text-sm text-gray-500 my-2">
        Choose immediate lead and broker-review alerts. In-app alerts stay
        available. Account security emails are unaffected.
      </p>
      {(
        [
          ["enabled", "Receive workspace alert emails"],
          ["leads", "New listing inquiries and routing updates"],
          ["reviews", "Inquiries needing broker review (brokers only)"],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="flex items-center gap-3 py-2 text-sm">
          <input
            type="checkbox"
            disabled={!loaded || busy || (key !== "enabled" && !prefs.enabled)}
            checked={prefs[key]}
            onChange={(e) => setPrefs({ ...prefs, [key]: e.target.checked })}
          />
          {label}
        </label>
      ))}
      <button
        disabled={!loaded || busy}
        onClick={save}
        className="rounded-xl bg-brand-navy px-4 py-2 mt-3 text-white text-sm disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save email preferences"}
      </button>
      <p role="status" className="text-sm mt-2">
        {message}
      </p>
    </section>
  );
}
