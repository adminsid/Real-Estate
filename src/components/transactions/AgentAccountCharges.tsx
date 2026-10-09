import { useState } from "react";
import { money } from "@/domain/deal-financials";
import { financialRequest } from "./TransactionFinancials";

interface Charge {
  id: string;
  description: string;
  charge_date: string;
  amount_cents: number;
  settled_at: string | null;
  settlement_method: string | null;
}
export function AgentAccountCharges({
  users,
}: {
  users: { id: string; name: string }[];
}) {
  const [agent, setAgent] = useState("");
  const [charges, setCharges] = useState<Charge[]>([]);
  const [kind, setKind] = useState("other");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const field =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm";
  const load = async (id: string) => {
    setAgent(id);
    setCharges([]);
    if (!id) return;
    try {
      setCharges(
        await financialRequest<Charge[]>(
          `/api/transactions/financial-accounts/${id}`,
        ),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load account");
    }
  };
  const post = async (settleId?: string) => {
    setBusy(true);
    setMessage("");
    try {
      await financialRequest(
        `/api/transactions/financial-accounts/${agent}`,
        "POST",
        {
          id: requestId,
          description,
          amountCents: Math.round(Number(amount) * 100),
          date,
          kind,
          settleId,
          reference,
        },
      );
      setRequestId(crypto.randomUUID());
      await load(agent);
      setMessage(
        settleId ? "Separate payment recorded." : "Account charge posted.",
      );
      if (!settleId) {
        setAmount("");
        setDescription("");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
      <h3 className="font-bold text-gray-900">Agent Account Charges</h3>
      <p className="mt-1 text-xs text-gray-500">
        Setup, monthly services, and agent-paid expenses. Post each billing
        period explicitly; duplicate monthly and setup charges are prevented.
      </p>
      <div className="mt-4 space-y-4">
        <label className="block text-xs font-semibold">
          Agent
          <select
            className={field}
            value={agent}
            onChange={(e) => void load(e.target.value)}
          >
            <option value="">Select agent</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        {message ? (
          <p
            role="status"
            className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800"
          >
            {message}
          </p>
        ) : null}
        {agent ? (
          <>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void post();
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Charge type
                  <select
                    className={field}
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="other">Expense / other</option>
                    <option value="setup">Setup (once per agent)</option>
                    <option value="monthly">
                      Monthly service (once per month)
                    </option>
                  </select>
                </label>
                <label className="text-xs font-semibold">
                  Billing date
                  <input
                    required
                    type="date"
                    className={field}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Amount ($)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={field}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold">
                  Description
                  <input
                    required
                    className={field}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
              </div>
              <button
                disabled={busy}
                className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                Post charge
              </button>
            </form>
            <p className="text-sm font-semibold">
              Outstanding charges:{" "}
              {money(
                charges
                  .filter((c) => !c.settled_at)
                  .reduce((sum, c) => sum + c.amount_cents, 0),
              )}
            </p>
            <label className="block text-xs font-semibold">
              Reference for a separate payment
              <input
                className={field}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Receipt / payment reference"
              />
            </label>
            <div className="divide-y divide-gray-100">
              {charges.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <div>
                    <p className="font-medium">
                      {c.description} · {money(c.amount_cents)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {c.charge_date} ·{" "}
                      {c.settled_at
                        ? `${c.settlement_method || "Paid"} on ${c.settled_at}`
                        : "Outstanding"}
                    </p>
                  </div>
                  {!c.settled_at ? (
                    <button
                      disabled={busy || !reference.trim()}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold disabled:opacity-50"
                      onClick={() => void post(c.id)}
                    >
                      Record separate payment
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Withholding from a commission payment is recorded in that deal’s
              Financials tab, subject to the agent’s configured policy.
            </p>
          </>
        ) : null}
      </div>
    </section>
  );
}
