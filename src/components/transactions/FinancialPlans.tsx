import { useEffect, useState } from "react";
import {
  money,
  planPreset,
  type FinancialPlan,
} from "@/domain/deal-financials";
import { financialRequest } from "./TransactionFinancials";

interface PlanRow {
  id: string;
  agent_id: string;
  agent_name: string;
  effective_from: string;
  rules_json: string;
}
export function FinancialPlans({
  users,
}: {
  users: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [agent, setAgent] = useState("");
  const [plan, setPlan] = useState<FinancialPlan>(() =>
    planPreset("New licensee"),
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const load = async () => {
    try {
      setRows(
        await financialRequest<PlanRow[]>("/api/transactions/financial-plans"),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to load plans");
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await financialRequest(
        `/api/transactions/financial-plans/${agent}`,
        "POST",
        plan,
      );
      setAgent("");
      await load();
      setMessage(
        "Plan version saved. Earlier calculations retain their original plan.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  };
  const field =
    "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm";
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-card">
      <div className="border-b border-gray-100 px-6 py-4">
        <h3 className="font-bold text-gray-900">Agent Compensation Plans</h3>
        <p className="mt-1 text-xs text-gray-500">
          Applies to deals using Financials. Each effective date creates a
          preserved plan version.
        </p>
      </div>
      <div className="space-y-4 p-6">
        {message ? (
          <p
            role="status"
            className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800"
          >
            {message}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs text-gray-500">
              <tr>
                <th className="p-2">Agent</th>
                <th className="p-2">Plan</th>
                <th className="p-2">Rules</th>
                <th className="p-2">Effective</th>
                <th className="p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const row = rows.find(
                  (r) =>
                    r.agent_id === u.id &&
                    r.effective_from <= new Date().toISOString().slice(0, 10),
                );
                const p: FinancialPlan | null = row
                  ? JSON.parse(row.rules_json)
                  : null;
                return (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="p-2 font-medium">{u.name}</td>
                    <td className="p-2">{p?.name || "Not assigned"}</td>
                    <td className="p-2 text-xs">
                      {p
                        ? p.name === "Pro"
                          ? `Tiered fee · ${p.proBasis} basis`
                          : `${p.agentPercent}% agent${p.companyCapCents !== null ? ` · ${money(p.companyCapCents)} cap (${p.capPeriod})` : ""}`
                        : "Review required"}
                      {p && !p.confirmed ? " · Unconfirmed" : ""}
                    </td>
                    <td className="p-2 text-xs">{p?.effectiveFrom || "—"}</td>
                    <td className="p-2">
                      <button
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold"
                        onClick={() => {
                          setAgent(u.id);
                          setPlan(
                            p
                              ? {
                                  ...p,
                                  effectiveFrom: new Date()
                                    .toISOString()
                                    .slice(0, 10),
                                  confirmed: false,
                                }
                              : planPreset("New licensee"),
                          );
                          setMessage("");
                        }}
                      >
                        Configure
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {agent ? (
          <form
            className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4"
            onSubmit={save}
          >
            <h4 className="text-sm font-bold">
              New plan version · {users.find((u) => u.id === agent)?.name}
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-semibold">
                Plan
                <select
                  className={field}
                  value={plan.name}
                  onChange={(e) =>
                    setPlan({
                      ...planPreset(e.target.value as FinancialPlan["name"]),
                      effectiveFrom: plan.effectiveFrom,
                    })
                  }
                >
                  {[
                    "New licensee",
                    "Team Leader",
                    "Expert",
                    "Pro",
                    "Elite",
                    "Custom",
                  ].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-semibold">
                Effective from
                <input
                  className={field}
                  required
                  type="date"
                  value={plan.effectiveFrom}
                  onChange={(e) =>
                    setPlan((p) => ({ ...p, effectiveFrom: e.target.value }))
                  }
                />
              </label>
              {!["Pro", "Elite"].includes(plan.name) ? (
                <label className="space-y-1 text-xs font-semibold">
                  Agent share (%)
                  <input
                    className={field}
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={plan.agentPercent}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        agentPercent: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              ) : null}
              {plan.name === "Expert" ? (
                <>
                  <label className="space-y-1 text-xs font-semibold">
                    Company contribution cap ($)
                    <input
                      className={field}
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={(plan.companyCapCents ?? 0) / 100}
                      onChange={(e) =>
                        setPlan((p) => ({
                          ...p,
                          companyCapCents: Math.round(
                            Number(e.target.value) * 100,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs font-semibold">
                    Cap resets
                    <select
                      className={field}
                      value={plan.capPeriod}
                      onChange={(e) =>
                        setPlan((p) => ({
                          ...p,
                          capPeriod: e.target
                            .value as FinancialPlan["capPeriod"],
                        }))
                      }
                    >
                      <option value="pending">Pending decision</option>
                      <option value="calendar">Calendar year</option>
                      <option value="anniversary">Agent anniversary</option>
                    </select>
                  </label>
                  {plan.capPeriod === "anniversary" ? (
                    <label className="space-y-1 text-xs font-semibold">
                      Anniversary date
                      <input
                        required
                        className={field}
                        type="date"
                        value={plan.anniversary}
                        onChange={(e) =>
                          setPlan((p) => ({
                            ...p,
                            anniversary: e.target.value,
                          }))
                        }
                      />
                    </label>
                  ) : null}
                </>
              ) : null}
              {plan.name === "Pro" ? (
                <>
                  <label className="space-y-1 text-xs font-semibold">
                    Fee at exactly $20,000
                    <select
                      className={field}
                      value={plan.proBoundary}
                      onChange={(e) =>
                        setPlan((p) => ({
                          ...p,
                          proBoundary: e.target
                            .value as FinancialPlan["proBoundary"],
                        }))
                      }
                    >
                      <option value="pending">Pending decision</option>
                      <option value="750">$750</option>
                      <option value="1000">$1,000</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-semibold">
                    Tier basis / fee allocation
                    <select
                      className={field}
                      value={plan.proBasis}
                      onChange={(e) =>
                        setPlan((p) => ({
                          ...p,
                          proBasis: e.target.value as FinancialPlan["proBasis"],
                        }))
                      }
                    >
                      <option value="pending">Pending decision</option>
                      <option value="agent">
                        Per agent’s allocated commission
                      </option>
                      <option value="deal">
                        Deal pool; fee prorated by allocation
                      </option>
                    </select>
                  </label>
                </>
              ) : null}
            </div>
            {plan.name === "Pro" ? (
              <p className="text-xs text-gray-600">
                Fees: up to $5,000 → $250; up to $10,000 → $500; below $20,000 →
                $750; above $20,000 → $1,000. Confirm the $20,000 boundary and
                fee basis.
              </p>
            ) : null}
            {plan.name === "Team Leader" ? (
              <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Configure the separate profit-sharing benefit below. It is not
                deducted from a deal automatically.
              </p>
            ) : null}
            {plan.name === "Expert" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Company contributions before migration ($)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className={field}
                    value={plan.openingCapCents / 100}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        openingCapCents: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-semibold">
                  Opening contribution period start
                  <input
                    type="date"
                    className={field}
                    value={plan.openingCapPeriod}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        openingCapPeriod: e.target.value,
                      }))
                    }
                  />
                </label>
                <p className="text-xs text-gray-500 sm:col-span-2">
                  Enter reconciled contributions from before Financials
                  adoption. Do not include contributions already posted by this
                  workspace.
                </p>
              </div>
            ) : null}
            {plan.name === "Team Leader" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold">
                  Profit share (%)
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    className={field}
                    value={plan.profitSharePercent}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        profitSharePercent: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-semibold">
                  Profit-sharing basis
                  <input
                    className={field}
                    placeholder="Pending agreement definition"
                    value={plan.profitShareBasis}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        profitShareBasis: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-xs font-semibold">
                  Payment schedule
                  <input
                    className={field}
                    placeholder="Pending agreement definition"
                    value={plan.profitShareSchedule}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        profitShareSchedule: e.target.value,
                      }))
                    }
                  />
                </label>
                <p className="text-xs text-gray-500">
                  Profit sharing is a separate reviewed HR ledger
                  adjustment/payment; it is not inferred from a sale price.
                </p>
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">
                Agent account charge collection
                <select
                  className={field}
                  value={plan.chargePolicy}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      chargePolicy: e.target
                        .value as FinancialPlan["chargePolicy"],
                    }))
                  }
                >
                  <option value="pending">Pending configuration</option>
                  <option value="separate">Bill separately</option>
                  <option value="withhold">Withhold from payment</option>
                  <option value="either">
                    Either, selected per settlement
                  </option>
                </select>
              </label>
              <label className="text-xs font-semibold">
                Setup charge ($)
                <input
                  className={field}
                  min="0"
                  step="0.01"
                  type="number"
                  value={plan.setupFeeCents / 100}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      setupFeeCents: Math.round(Number(e.target.value) * 100),
                    }))
                  }
                />
              </label>
              <label className="text-xs font-semibold">
                Monthly service charge ($)
                <input
                  className={field}
                  min="0"
                  step="0.01"
                  type="number"
                  value={plan.monthlyFeeCents / 100}
                  onChange={(e) =>
                    setPlan((p) => ({
                      ...p,
                      monthlyFeeCents: Math.round(Number(e.target.value) * 100),
                    }))
                  }
                />
              </label>
              <p className="text-xs text-gray-500">
                Charges are posted explicitly to the agent account. Saving a
                plan does not create an invoice or transfer funds.
              </p>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={plan.confirmed}
                onChange={(e) =>
                  setPlan((p) => ({ ...p, confirmed: e.target.checked }))
                }
              />
              <span>
                These commission rules match the agent’s agreement. Unresolved
                cap or fee settings will still prevent finalization.
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-xs"
                onClick={() => setAgent("")}
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="rounded-lg bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Save plan version"}
              </button>
            </div>
          </form>
        ) : null}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer font-semibold">
            Plan history and scheduled versions ({rows.length})
          </summary>
          {rows.map((r) => (
            <p className="mt-2" key={r.id}>
              {r.agent_name} · {JSON.parse(r.rules_json).name} · Effective{" "}
              {r.effective_from}
            </p>
          ))}
        </details>
      </div>
    </section>
  );
}
