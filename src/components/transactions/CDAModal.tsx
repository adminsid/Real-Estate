import { useEffect, useRef } from "react";
import { Printer, X, ShieldCheck } from "lucide-react";
import { money } from "@/domain/deal-financials";
import type { FinancialRecord } from "./TransactionFinancials";

interface CDAModalProps {
  deal: {
    id: string;
    name: string;
    price?: number;
    client?: string;
    agent?: string;
    targetCloseDate?: string;
    propertyType?: string;
  };
  financial: FinancialRecord | null;
  onClose: () => void;
}
export function CDAModal({ deal, financial, onClose }: CDAModalProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
      previous?.focus();
    };
  }, [onClose]);
  const approved = financial?.state === "approved";
  const c = financial?.calculation;
  const rows: [string, number | null][] = c
    ? [
        ["Agreed commission", c.totalCents],
        ["Outside brokerage allocation", c.outsideCents],
        ["Prime America commission", c.primeCents],
        ...financial.financials.adjustments.map(
          (a) =>
            [`Deduction: ${a.recipient} — ${a.reason}`, a.cents] as [
              string,
              number,
            ],
        ),
        ...c.agents.map(
          (a) =>
            [`Agent compensation: ${a.name}`, a.agentCents] as [
              string,
              number | null,
            ],
        ),
        ["Company retention", c.companyCents],
      ]
    : [];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cda-title"
      onKeyDown={(e) => {
        if (e.key === "Tab") {
          const controls = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),a[href]",
            ),
          );
          const first = controls[0],
            last = controls[controls.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div
        id="financial-cda"
        className="relative my-8 w-full max-w-3xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl sm:p-8"
      >
        <style>{`@media print { body * { visibility:hidden; } #financial-cda, #financial-cda * { visibility:visible; } #financial-cda { position:absolute; left:0; top:0; margin:0; width:100%; max-width:none; box-shadow:none; border:0; } #financial-cda .cda-actions { display:none; } }`}</style>
        <div className="cda-actions mb-6 flex items-center justify-between gap-3 border-b border-gray-100 pb-4">
          <h2
            id="cda-title"
            className="flex items-center gap-2 text-base font-bold text-gray-900"
          >
            <ShieldCheck size={20} /> Commission Disbursement Authorization
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close CDA"
            className="rounded-lg p-2 hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b-2 border-brand-navy pb-4">
          <div>
            <h1 className="text-xl font-black text-brand-navy">
              PRIME AMERICA REAL ESTATE
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Commission settlement · {deal.name}
            </p>
          </div>
          <span
            className={`rounded-lg px-3 py-1 text-xs font-bold ${approved ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}
          >
            {approved
              ? `Approved · Revision ${financial?.version}`
              : "DRAFT — NOT AUTHORIZED"}
          </span>
        </div>
        {!financial?.version ? (
          <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            Complete and save Financials before preparing this document. No
            assumed prices, rates, or fees are included.
          </p>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
              <p>
                Final sold price:{" "}
                <strong>{money(financial.financials.prices.sold)}</strong>
              </p>
              <p>
                Calculation date:{" "}
                <strong>{c?.calculatedDate || "Pending"}</strong>
              </p>
              <p>
                Role: <strong>{financial.financials.role || "Pending"}</strong>
              </p>
              <p>
                Agreement:{" "}
                <strong>{financial.financials.agreement || "Pending"}</strong>
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-brand-navy text-white">
                <tr>
                  <th className="p-3 text-left">Allocation</th>
                  <th className="p-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label} className="border-b border-gray-200">
                    <td className="p-3">{label}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {money(value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 className="mb-2 mt-5 text-sm font-bold">Expected funding</h3>
            {financial.financials.funding.map((f, i) => (
              <p key={i} className="flex justify-between gap-4 py-1 text-sm">
                <span>{f.payer}</span>
                <span>{money(f.cents)}</span>
              </p>
            ))}
            <p className="mt-5 text-xs text-gray-500">
              Based on saved financial revision {financial.version}. Approval
              authorizes the calculation; it does not establish receipt or
              payment. Account charges and actual payments are recorded
              separately.
            </p>
          </>
        )}
        <div className="cda-actions mt-6 flex justify-end">
          <button
            disabled={!financial?.version || !financial.canApprove}
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}
