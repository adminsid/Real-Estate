import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Plus,
  Save,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  calculateFinancials,
  cents,
  emptyFinancials,
  money,
  type DealFinancials,
  type FinancialCalculation,
  type FinancialPlan,
  type Money,
} from "@/domain/deal-financials";
import { useTransactionDetail } from "./TransactionContext";

interface AgentResult {
  agentId: string;
  name: string;
  share: number;
  baseCents: number;
  agentCents: Money;
  companyCents: Money;
  issue: string | null;
  plan: FinancialPlan | null;
  capUsed: number;
}
interface LedgerRow {
  id: string;
  agent_id: string;
  agent_name: string;
  entry_type: string;
  amount_cents: number;
  paid_at: string | null;
  effective_date: string;
  memo: string;
  status: string;
}
interface Receipt {
  id: string;
  payer: string;
  amount_cents: number;
  received_date: string;
  reference: string;
  reverses_id: string | null;
}
interface Charge {
  id: string;
  agent_id: string;
  description: string;
  amount_cents: number;
  charge_date: string;
  settled_at: string | null;
  settlement_method?: string;
  payment_id?: string;
}
export interface FinancialRecord {
  version: number;
  state: string;
  financials: DealFinancials;
  canEdit: boolean;
  canApprove: boolean;
  calculation: FinancialCalculation & {
    agents: AgentResult[];
    companyCents: Money;
    calculatedDate: string;
  };
  history: {
    version: number;
    state: string;
    created_at: string;
    prices: DealFinancials["prices"];
  }[];
  ledger: LedgerRow[];
  receipts: Receipt[];
  charges: Charge[];
  legacy: { price: number | null; commission: number | null } | null;
}
export async function financialRequest<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  if (!response.ok || !result.success)
    throw new Error(result.error || "Unable to load financials");
  return result.data;
}
export function useFinancialRecord(id?: string) {
  const [record, setRecord] = useState<FinancialRecord | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    if (!id) return;
    try {
      const result = await financialRequest<FinancialRecord>(
        `/api/transactions/${id}/financials`,
      );
      setRecord(result);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load financials");
    }
  }, [id]);
  useEffect(() => {
    setRecord(null);
    void reload();
  }, [reload]);
  return { record, error, reload };
}
const input =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const button =
  "inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50";
const primary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50";
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}
function Amount({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Money;
  onChange: (v: Money) => void;
}) {
  return (
    <Field label={label}>
      <input
        className={input}
        type="number"
        min="0"
        step="0.01"
        value={value === null ? "" : value / 100}
        onChange={(e) => onChange(cents(e.target.value))}
      />
    </Field>
  );
}
function Row({ label, value }: { label: string; value: Money }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold tabular-nums text-gray-900">
        {money(value)}
      </span>
    </div>
  );
}
function Card({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-3.5">
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
        {action}
      </div>
      <div className="space-y-3 p-5">{children}</div>
    </section>
  );
}

export function FinancialSummary({
  record,
  open,
}: {
  record: FinancialRecord | null;
  open: () => void;
}) {
  return (
    <div className="space-y-2">
      <Row
        label="Prime America commission"
        value={record?.calculation.primeCents ?? null}
      />
      {record?.calculation.agents.map((a) => (
        <Row
          key={a.agentId}
          label={`${a.name} · compensation`}
          value={a.agentCents}
        />
      ))}
      <div className="flex items-center justify-between gap-2">
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${record?.state === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
        >
          {record?.state === "approved"
            ? "Finalized"
            : record?.state === "legacy"
              ? "Review legacy values"
              : "Estimated · pending review"}
        </span>
        <button
          className="text-xs font-semibold text-blue-600 hover:underline"
          onClick={open}
        >
          View financials →
        </button>
      </div>
    </div>
  );
}

export function TransactionFinancials({
  record,
  error,
  reload,
}: ReturnType<typeof useFinancialRecord>) {
  const { id, data, offers, directoryUsers, fetchTransaction } =
    useTransactionDetail();
  const [editing, setEditing] = useState(false);
  const [section, setSection] = useState<"prices" | "agreement" | "agents">(
    "prices",
  );
  const [draft, setDraft] = useState<DealFinancials>(emptyFinancials);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState(false);
  const [entry, setEntry] = useState<
    "receipts" | "payments" | "charges" | null
  >(null);
  const [entryId, setEntryId] = useState("");
  const [reversesId, setReversesId] = useState<string | undefined>();
  const [party, setParty] = useState("");
  const [amount, setAmount] = useState<Money>(null);
  const [taxable, setTaxable] = useState<Money>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [offsets, setOffsets] = useState<string[]>([]);
  if (!record)
    return (
      <Card title="Financials">
        <p className="text-sm text-gray-500">
          {error || "Loading financial records…"}
        </p>
        <button className={button} onClick={() => void reload()}>
          Retry
        </button>
      </Card>
    );
  const f = editing ? draft : record.financials;
  const selectedOffer = offers.find((o) => o.id === f.acceptedOfferId);
  const preview = editing
    ? calculateFinancials(
        draft,
        selectedOffer ? cents(selectedOffer.purchasePrice) : null,
      )
    : record.calculation;
  const change = <K extends keyof DealFinancials>(
    key: K,
    value: DealFinancials[K],
  ) => setDraft((d) => ({ ...d, [key]: value }));
  const begin = (target: typeof section) => {
    if (!editing) setDraft(structuredClone(record.financials));
    setSection(target);
    setEditing(true);
    setMessage("");
  };
  const save = async (approve = false) => {
    setBusy(true);
    setMessage("");
    try {
      await financialRequest(
        `/api/transactions/${id}/financials${approve ? "/approve" : ""}`,
        approve ? "POST" : "PUT",
        {
          version: record.version,
          financials: editing ? draft : record.financials,
        },
      );
      setEditing(false);
      await reload();
      await fetchTransaction();
      setMessage(
        approve
          ? "Compensation finalized. Payments remain separate."
          : "Financial revision saved.",
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  };
  const addEntry = async () => {
    if (!amount || !entry) return;
    setBusy(true);
    setMessage("");
    try {
      await financialRequest(
        `/api/transactions/${id}/financials/${entry}`,
        "POST",
        {
          id: entryId,
          payer: party,
          agentId: party,
          amountCents: amount,
          taxableCents: taxable,
          date,
          reference: memo,
          memo,
          offsetChargeIds: offsets,
          reversesId,
        },
      );
      setEntry(null);
      await reload();
      setMessage("Record saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Unable to save");
    } finally {
      setBusy(false);
    }
  };
  const startEntry = (type: "receipts" | "payments" | "charges") => {
    setEntry(type);
    setReversesId(undefined);
    setEntryId(crypto.randomUUID());
    setAmount(null);
    setTaxable(null);
    setParty("");
    setMemo("");
    setOffsets([]);
  };
  const earnings = record.ledger
    .filter(
      (l) =>
        l.status === "posted" &&
        ["earned", "adjustment", "chargeback"].includes(l.entry_type),
    )
    .reduce((sum, l) => sum + l.amount_cents, 0);
  const paid = record.ledger
    .filter(
      (l) =>
        l.status === "posted" &&
        ["payment", "advance", "repayment"].includes(l.entry_type),
    )
    .reduce((sum, l) => sum + l.amount_cents, 0);
  const withheld = record.charges
    .filter(
      (c) =>
        c.settlement_method === "withheld" &&
        record.ledger.some((l) => l.id === c.payment_id),
    )
    .reduce((sum, c) => sum + c.amount_cents, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-gray-900">Deal Financials</h2>
          <p className="text-xs text-gray-500">
            {record.state === "approved" ? "Finalized" : "Draft estimates"} ·
            Revision {record.version} ·{" "}
            {data.transaction.type === "lease"
              ? "Lease compensation"
              : "Sale compensation"}
          </p>
        </div>
        {record.canEdit && !editing ? (
          <button className={button} onClick={() => begin("prices")}>
            Edit financials
          </button>
        ) : editing ? <div className="flex gap-2"><button disabled={busy} className={button} onClick={() => setEditing(false)}>Cancel edits</button><button disabled={busy} className={primary} onClick={() => void save()}>Save changes</button></div> : null}
      </div>
      {error || message ? (
        <p
          role="status"
          className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm text-blue-800"
        >
          {error || message}
        </p>
      ) : null}
      {record.legacy ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <strong>Existing amounts need classification.</strong>
          <p className="mt-1">
            Legacy target price:{" "}
            {money(
              record.legacy.price === null
                ? null
                : Math.round(record.legacy.price * 100),
            )}{" "}
            · Legacy commission:{" "}
            {money(
              record.legacy.commission === null
                ? null
                : Math.round(record.legacy.commission * 100),
            )}
            . Confirm their meaning below. Posted payments and earnings remain
            intact.
          </p>
        </div>
      ) : null}
      <fieldset disabled={busy} className="space-y-4">
        <Card
          title="Prices"
          action={
            record.canEdit ? (
              <button
                disabled={busy}
                className="text-xs font-semibold text-blue-600"
                onClick={() => begin("prices")}
              >
                Edit
              </button>
            ) : null
          }
        >
          {editing && section === "prices" ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {(["listing", "contract", "sold", "credits"] as const).map(
                  (key) => (
                    <Amount
                      key={key}
                      label={
                        key === "credits"
                          ? "Seller credits ($)"
                          : `${key === "listing" ? "Asking" : key === "contract" ? "Executed contract" : "Final sold"} price ($)`
                      }
                      value={f.prices[key]}
                      onChange={(v) =>
                        change("prices", { ...f.prices, [key]: v })
                      }
                    />
                  ),
                )}
                <Field label="Accepted offer">
                  <select
                    className={input}
                    value={f.acceptedOfferId}
                    onChange={(e) => change("acceptedOfferId", e.target.value)}
                  >
                    <option value="">Select accepted offer</option>
                    {offers
                      .filter((o) => o.status === "accepted")
                      .map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.purchaserName} · {money(cents(o.purchasePrice))}
                        </option>
                      ))}
                  </select>
                </Field>
              </div>
              {selectedOffer ? (
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    change("prices", {
                      ...f.prices,
                      contract: cents(selectedOffer.purchasePrice),
                    })
                  }
                >
                  Use accepted amount for contract review
                </button>
              ) : null}
              <p className="text-xs text-gray-500">
                Confirm the executed contract separately. Credits do not
                automatically reduce price or commission.
              </p>
            </>
          ) : (
            <>
              <Row label="Asking price" value={f.prices.listing} />
              <Row
                label="Accepted offer"
                value={
                  selectedOffer ? cents(selectedOffer.purchasePrice) : null
                }
              />
              <Row label="Contract price" value={f.prices.contract} />
              <Row label="Sold price" value={f.prices.sold} />
              <Row label="Seller credits" value={f.prices.credits} />
            </>
          )}
        </Card>
        <Card
          title="Commission agreement"
          action={
            record.canEdit ? (
              <button
                disabled={busy}
                className="text-xs font-semibold text-blue-600"
                onClick={() => begin("agreement")}
              >
                Edit
              </button>
            ) : null
          }
        >
          {editing && section === "agreement" ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Property source">
                  <select
                    className={input}
                    value={f.source}
                    onChange={(e) =>
                      change(
                        "source",
                        e.target.value as DealFinancials["source"],
                      )
                    }
                  >
                    <option value="inventory">Prime America inventory</option>
                    <option value="mls">External MLS</option>
                    <option value="other">Other / off-market</option>
                  </select>
                </Field>
                <Field label="Prime America’s role">
                  <select
                    className={input}
                    value={f.role}
                    onChange={(e) =>
                      change("role", e.target.value as DealFinancials["role"])
                    }
                  >
                    <option value="">Select representation</option>
                    <option value="listing">Listing broker</option>
                    <option value="buyer">Buyer’s broker</option>
                    <option value="subagent">Subagent</option>
                    <option value="both">Both sides</option>
                  </select>
                </Field>
                <Field label="Compensation agreement">
                  <input
                    className={input}
                    value={f.agreement}
                    onChange={(e) => change("agreement", e.target.value)}
                    placeholder="Buyer agreement / listing agreement / co-broke"
                  />
                </Field>
                <Field label="Supporting document reference">
                  <input
                    className={input}
                    value={f.document}
                    onChange={(e) => change("document", e.target.value)}
                    placeholder="Document name, ID, or link from Documents"
                  />
                </Field>
                <Field label="Commission basis">
                  <select
                    className={input}
                    value={f.basis}
                    onChange={(e) =>
                      change("basis", e.target.value as DealFinancials["basis"])
                    }
                  >
                    <option value="listing">Asking price</option>
                    <option value="accepted">Accepted offer</option>
                    <option value="contract">Contract price</option>
                    <option value="sold">Sold price</option>
                    <option value="custom">Agreed custom basis</option>
                  </select>
                </Field>
                {f.basis === "custom" ? (
                  <Amount
                    label="Agreed basis ($)"
                    value={f.customBasisCents}
                    onChange={(v) => change("customBasisCents", v)}
                  />
                ) : null}
                <Field
                  label={
                    f.role === "listing" || f.role === "both"
                      ? "Total agreed commission"
                      : "Prime America compensation"
                  }
                >
                  <select
                    className={input}
                    value={f.mode}
                    onChange={(e) =>
                      change("mode", e.target.value as DealFinancials["mode"])
                    }
                  >
                    <option value="percent">
                      Percentage of selected price
                    </option>
                    <option value="fixed">Fixed dollar amount</option>
                  </select>
                </Field>
                {f.mode === "percent" ? (
                  <Field label="Commission rate (% of basis)">
                    <input
                      className={input}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={f.rate ?? ""}
                      onChange={(e) =>
                        change(
                          "rate",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </Field>
                ) : (
                  <Amount
                    label="Fixed compensation ($)"
                    value={f.fixedCents}
                    onChange={(v) => change("fixedCents", v)}
                  />
                )}
                {f.role === "listing" || f.role === "both" ? (
                  <>
                    <Field label="Outside brokerage (if applicable)">
                      <input
                        className={input}
                        value={f.outsideBroker}
                        onChange={(e) =>
                          change("outsideBroker", e.target.value)
                        }
                      />
                    </Field>
                    <Field label="Outside allocation basis">
                      <select
                        className={input}
                        value={f.outsideMode}
                        onChange={(e) =>
                          change(
                            "outsideMode",
                            e.target.value as DealFinancials["outsideMode"],
                          )
                        }
                      >
                        <option value="percent">
                          Percentage of selected price
                        </option>
                        <option value="fixed">Fixed amount</option>
                      </select>
                    </Field>
                    {f.outsideMode === "percent" ? (
                      <Field label="Outside rate (% of price, not commission)">
                        <input
                          className={input}
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={f.outsideRate ?? ""}
                          onChange={(e) =>
                            change(
                              "outsideRate",
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            )
                          }
                        />
                      </Field>
                    ) : (
                      <Amount
                        label="Outside allocation ($)"
                        value={f.outsideCents}
                        onChange={(v) => change("outsideCents", v)}
                      />
                    )}
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="text-sm text-gray-600">
              <p>
                {f.source === "mls"
                  ? "External MLS"
                  : f.source === "inventory"
                    ? "Prime America inventory"
                    : "Other"}{" "}
                · {f.role || "Role pending"}
              </p>
              <p className="mt-1">{f.agreement || "Agreement pending"}</p>
              <p className="mt-1 text-xs">
                Supporting document: {f.document || "Not recorded"}
              </p>
              <p className="mt-2">
                {f.mode === "percent"
                  ? `${f.rate ?? "—"}% of ${f.basis} price`
                  : "Fixed compensation"}{" "}
                · Basis {money(preview.basisCents)}
              </p>
            </div>
          )}
          <div className="rounded-lg bg-gray-50 p-3">
            <Row label="Agreed commission" value={preview.totalCents} />
            <Row
              label="Outside brokerage allocation"
              value={preview.outsideCents}
            />
            <div className="border-t border-gray-200 pt-1">
              <Row
                label="Prime America commission"
                value={preview.primeCents}
              />
            </div>
          </div>
          <h4 className="text-xs font-bold text-gray-700">
            Expected funding for Prime America
          </h4>
          {f.funding.map((r, i) =>
            editing && section === "agreement" ? (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
              >
                <Field label="Payer">
                  <input
                    className={input}
                    value={r.payer}
                    onChange={(e) =>
                      change(
                        "funding",
                        f.funding.map((v, n) =>
                          n === i ? { ...v, payer: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </Field>
                <Amount
                  label="Amount ($)"
                  value={r.cents}
                  onChange={(v) =>
                    change(
                      "funding",
                      f.funding.map((row, n) =>
                        n === i ? { ...row, cents: v ?? 0 } : row,
                      ),
                    )
                  }
                />
                <button
                  className={button}
                  aria-label="Remove funding source"
                  onClick={() =>
                    change(
                      "funding",
                      f.funding.filter((_, n) => n !== i),
                    )
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <Row key={i} label={r.payer} value={r.cents} />
            ),
          )}
          {editing && section === "agreement" ? (
            <button
              className={button}
              onClick={() =>
                change("funding", [...f.funding, { payer: "", cents: 0 }])
              }
            >
              <Plus size={14} /> Add funding source
            </button>
          ) : null}
          <Row
            label="Funding difference to resolve"
            value={preview.fundingGapCents}
          />
        </Card>
        <Card
          title="Agent compensation"
          action={
            record.canEdit ? (
              <button
                disabled={busy}
                className="text-xs font-semibold text-blue-600"
                onClick={() => begin("agents")}
              >
                Edit
              </button>
            ) : null
          }
        >
          {editing && section === "agents" ? (
            <>
              <p className="text-xs text-gray-500">
                Allocate Prime America’s commission after the agreed adjustments
                below. Plans are managed in HR.
              </p>
              {f.participants.map((p, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 items-end gap-2 rounded-lg border border-gray-100 p-3 sm:grid-cols-[2fr_1fr_1fr_auto]"
                >
                  <Field label="Agent">
                    <select
                      className={input}
                      value={p.agentId}
                      onChange={(e) =>
                        change(
                          "participants",
                          f.participants.map((v, n) =>
                            n === i ? { ...v, agentId: e.target.value } : v,
                          ),
                        )
                      }
                    >
                      <option value="">Select agent</option>
                      {directoryUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name ||
                            `${u.first_name || ""} ${u.last_name || ""}`}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Allocation (%)">
                    <input
                      className={input}
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={p.share}
                      onChange={(e) =>
                        change(
                          "participants",
                          f.participants.map((v, n) =>
                            n === i
                              ? { ...v, share: Number(e.target.value) }
                              : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Side">
                    <select
                      className={input}
                      value={p.side}
                      onChange={(e) =>
                        change(
                          "participants",
                          f.participants.map((v, n) =>
                            n === i
                              ? { ...v, side: e.target.value as typeof p.side }
                              : v,
                          ),
                        )
                      }
                    >
                      <option value="listing">Listing</option>
                      <option value="buyer">Buyer</option>
                      <option value="shared">Shared</option>
                    </select>
                  </Field>
                  <button
                    className={button}
                    aria-label="Remove agent"
                    onClick={() =>
                      change(
                        "participants",
                        f.participants.filter((_, n) => n !== i),
                      )
                    }
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  change("participants", [
                    ...f.participants,
                    {
                      agentId: "",
                      share: f.participants.length ? 0 : 100,
                      side: "shared",
                    },
                  ])
                }
              >
                <Plus size={14} /> Add agent
              </button>
              <h4 className="pt-2 text-xs font-bold text-gray-700">
                Agreed deductions before agent allocation
              </h4>
              <p className="text-xs text-gray-500">
                Enter a documented fixed amount and its basis in the reason.
                These deductions reduce the allocation pool, not the gross
                commission.
              </p>
              {f.adjustments.map((a, i) => (
                <div
                  key={i}
                  className="space-y-2 rounded-lg border border-gray-100 p-3"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Recipient">
                      <input
                        className={input}
                        value={a.recipient}
                        onChange={(e) =>
                          change(
                            "adjustments",
                            f.adjustments.map((v, n) =>
                              n === i ? { ...v, recipient: e.target.value } : v,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Amount
                      label="Amount ($)"
                      value={a.cents}
                      onChange={(v) =>
                        change(
                          "adjustments",
                          f.adjustments.map((r, n) =>
                            n === i ? { ...r, cents: v ?? 0 } : r,
                          ),
                        )
                      }
                    />
                  </div>
                  <Field label="Reason and calculation basis">
                    <input
                      className={input}
                      value={a.reason}
                      onChange={(e) =>
                        change(
                          "adjustments",
                          f.adjustments.map((v, n) =>
                            n === i ? { ...v, reason: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </Field>
                  <button
                    className={button}
                    onClick={() =>
                      change(
                        "adjustments",
                        f.adjustments.filter((_, n) => n !== i),
                      )
                    }
                  >
                    Remove deduction
                  </button>
                </div>
              ))}
              <button
                className={button}
                onClick={() =>
                  change("adjustments", [
                    ...f.adjustments,
                    { recipient: "", cents: 0, reason: "" },
                  ])
                }
              >
                <Plus size={14} /> Add agreed deduction
              </button>
              <p className="text-xs text-gray-500">
                Save to refresh plan calculations and cap progress.
              </p>
            </>
          ) : (
            <>
              {f.adjustments.map((a, i) => (
                <Row
                  key={i}
                  label={`${a.recipient} · ${a.reason}`}
                  value={a.cents}
                />
              ))}
              {record.calculation.agents.map((a) => (
                <div
                  key={a.agentId}
                  className="rounded-lg border border-gray-200 p-3"
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {a.name} · {a.share}% allocation
                  </p>
                  <p className="text-xs text-gray-500">
                    {a.plan?.name || "Assigned plan"}
                    {a.plan ? ` · Effective ${a.plan.effectiveFrom}` : ""}
                  </p>
                  <Row label="Allocated commission" value={a.baseCents} />
                  <Row label="Agent compensation" value={a.agentCents} />
                  {record.canEdit ? (
                    <Row label="Company retention" value={a.companyCents} />
                  ) : null}
                  {a.plan?.companyCapCents !== null &&
                  a.plan?.companyCapCents !== undefined ? (
                    <p className="text-xs text-gray-500">
                      Cap contributions before this deal: {money(a.capUsed)} /{" "}
                      {money(a.plan.companyCapCents)}
                    </p>
                  ) : null}
                  {a.issue ? (
                    <p className="mt-2 text-xs text-amber-700">{a.issue}</p>
                  ) : null}
                </div>
              ))}
              {!record.calculation.agents.length ? (
                <p className="text-sm text-gray-500">
                  No compensation available for this view.
                </p>
              ) : null}
            </>
          )}
          <Row
            label="Commission available for internal allocation"
            value={preview.distributableCents}
          />
        </Card>
        {editing ? (
          <Card title="Revision notes">
            <Field label="Reason for this revision / agreement changes">
              <textarea
                className={input}
                rows={3}
                value={f.note}
                onChange={(e) => change("note", e.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <button className={button} onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className={primary} onClick={() => void save()}>
                <Save size={14} />
                {busy ? "Saving…" : "Save revision"}
              </button>
            </div>
          </Card>
        ) : null}
      </fieldset>
      {!editing && record.calculation.issues.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
          <p className="mb-2 flex items-center gap-2 font-bold">
            <AlertCircle size={14} /> Before financial approval
          </p>
          <ul className="list-disc space-y-1 pl-4">
            {record.calculation.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!editing && record.canApprove && record.state !== "approved" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Finalization requires a closed deal, actual closing date, and
            resolved review items.
          </p>
          <button
            disabled={
              busy ||
              data.transaction.status !== "closed" ||
              record.calculation.issues.length > 0 ||
              !record.version
            }
            className={primary}
            onClick={() => void save(true)}
          >
            <ShieldCheck size={14} /> Finalize compensation
          </button>
        </div>
      ) : null}
      <Card
        title="Receipts & payments"
        action={<DollarSign className="h-4 w-4 text-emerald-600" />}
      >
        {record.canEdit ? (
          <>
            <Row
              label="Commission received"
              value={record.receipts.reduce((s, r) => s + r.amount_cents, 0)}
            />
            <Row
              label="Commission still to receive"
              value={
                record.calculation.primeCents === null
                  ? null
                  : record.calculation.primeCents -
                    record.receipts.reduce((s, r) => s + r.amount_cents, 0)
              }
            />
          </>
        ) : null}
        <Row
          label="Posted agent earnings"
          value={record.ledger
            .filter(
              (l) =>
                l.status === "posted" &&
                ["earned", "adjustment", "chargeback"].includes(l.entry_type),
            )
            .reduce((s, r) => s + r.amount_cents, 0)}
        />
        <Row
          label="Agent payments / advances, less repayments"
          value={record.ledger
            .filter(
              (l) =>
                l.status === "posted" &&
                ["payment", "advance", "repayment"].includes(l.entry_type),
            )
            .reduce((s, r) => s + r.amount_cents, 0)}
        />
        <Row label="Account charges withheld" value={withheld} />
        <Row
          label="Agent balance outstanding (negative = overpayment)"
          value={earnings - paid - withheld}
        />
        {record.canEdit ? (
          <div className="flex flex-wrap gap-2">
            <button className={button} onClick={() => startEntry("receipts")}>
              Record receipt
            </button>
            <button className={button} onClick={() => startEntry("payments")}>
              Record agent payment
            </button>
            <button className={button} onClick={() => startEntry("charges")}>
              Add account charge
            </button>
          </div>
        ) : null}
        {entry ? (
          <form
            className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/30 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void addEntry();
            }}
          >
            <h4 className="text-sm font-bold">
              {entry === "receipts"
                ? "Commission receipt"
                : entry === "payments"
                  ? "Agent payment"
                  : "Agent account charge"}
            </h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={entry === "receipts" ? "Payer" : "Agent"}>
                {entry === "receipts" ? (
                  <input
                    required
                    className={input}
                    value={party}
                    onChange={(e) => setParty(e.target.value)}
                  />
                ) : (
                  <select
                    required
                    className={input}
                    value={party}
                    onChange={(e) => setParty(e.target.value)}
                  >
                    <option value="">Select agent</option>
                    {directoryUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Amount label="Amount ($)" value={amount} onChange={setAmount} />
              <Field label="Date">
                <input
                  required
                  className={input}
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
              {entry === "payments" ? (
                <Amount
                  label="Reportable compensation in this payment ($)"
                  value={taxable}
                  onChange={setTaxable}
                />
              ) : null}
            </div>
            <Field label="Description / payment reference">
              <input
                required
                className={input}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </Field>
            {entry === "payments" && party ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-gray-700">
                  Account charges withheld from this settlement
                </p>
                {record.charges
                  .filter((c) => c.agent_id === party && !c.settled_at)
                  .map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={offsets.includes(c.id)}
                        onChange={(e) =>
                          setOffsets((v) =>
                            e.target.checked
                              ? [...v, c.id]
                              : v.filter((id) => id !== c.id),
                          )
                        }
                      />
                      {c.description} · {money(c.amount_cents)}
                    </label>
                  ))}
                <p className="text-xs text-gray-500">
                  Enter actual cash paid above; selected charges are separate
                  offsets. Confirm the reportable amount independently.
                </p>
              </div>
            ) : null}
            <p className="text-xs text-gray-500">
              Records completed activity; this does not transfer funds. Account
              charges are separate from earned compensation.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={button}
                onClick={() => setEntry(null)}
              >
                Cancel
              </button>
              <button
                disabled={
                  busy ||
                  amount === null ||
                  (entry === "payments" && taxable === null)
                }
                className={primary}
              >
                Save record
              </button>
            </div>
          </form>
        ) : null}
        <div className="divide-y divide-gray-100">
          {record.receipts.map((r) => (
            <div key={r.id} className="py-2 text-xs">
              <div className="flex justify-between gap-3">
                <span>
                  {r.received_date} · {r.payer}
                </span>
                <strong>{money(r.amount_cents)}</strong>
              </div>
              <p className="text-gray-500">{r.reference}</p>
              {record.canEdit && !r.reverses_id && !record.receipts.some(other => other.reverses_id === r.id) ? <button disabled={busy} className="mt-1 text-xs font-semibold text-blue-600" onClick={() => { startEntry('receipts'); setReversesId(r.id); setAmount(r.amount_cents); setParty(r.payer); setMemo(`Reversal of receipt ${r.reference}`) }}>Prepare receipt reversal</button> : null}
            </div>
          ))}
          {record.ledger.map((l) => (
            <div key={l.id} className="py-2 text-xs">
              <div className="flex justify-between gap-3">
                <span>
                  {l.paid_at || l.effective_date} · {l.agent_name} ·{" "}
                  {l.entry_type} · {l.status}
                </span>
                <strong>{money(l.amount_cents)}</strong>
              </div>
              <p className="text-gray-500">{l.memo}</p>
            </div>
          ))}
          {record.charges.map((c) => (
            <div key={c.id} className="py-2 text-xs">
              <div className="flex justify-between gap-3">
                <span>
                  {c.charge_date} · {c.description} ·{" "}
                  {c.settled_at ? "Settled" : "Charge outstanding"}
                </span>
                <strong>{money(c.amount_cents)}</strong>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <button
        className="flex items-center gap-2 text-xs font-semibold text-gray-600"
        onClick={() => setHistory((v) => !v)}
      >
        {history ? <ChevronUp size={14} /> : <ChevronDown size={14} />}{" "}
        Financial revision history ({record.history.length})
      </button>
      {history ? (
        <Card title="Saved revisions">
          {record.history.map((h) => (
            <div
              key={h.version}
              className="border-b border-gray-100 py-2 text-xs"
            >
              <strong>
                Revision {h.version} · {h.state}
              </strong>
              <span className="ml-2 text-gray-500">{h.created_at}</span>
              <p className="mt-1">
                Asking {money(h.prices.listing)} · Contract{" "}
                {money(h.prices.contract)} · Sold {money(h.prices.sold)}
              </p>
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  );
}
