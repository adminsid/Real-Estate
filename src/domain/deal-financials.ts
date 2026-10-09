import { isDateOnly } from "./reporting-period";

export type Money = number | null;
export interface FinancialPlan {
  name: "New licensee" | "Team Leader" | "Expert" | "Pro" | "Elite" | "Custom";
  agentPercent: number;
  companyCapCents: Money;
  capPeriod: "pending" | "calendar" | "anniversary";
  anniversary: string;
  proBoundary: "pending" | "750" | "1000";
  proBasis: "pending" | "agent" | "deal";
  effectiveFrom: string;
  confirmed: boolean;
  openingCapCents: number;
  openingCapPeriod: string;
  profitSharePercent: number;
  profitShareBasis: string;
  profitShareSchedule: string;
  chargePolicy: "pending" | "separate" | "withhold" | "either";
  setupFeeCents: number;
  monthlyFeeCents: number;
}
export interface DealFinancials {
  source: "inventory" | "mls" | "other";
  role: "" | "listing" | "buyer" | "subagent" | "both";
  prices: { listing: Money; contract: Money; sold: Money; credits: Money };
  acceptedOfferId: string;
  agreement: string;
  document: string;
  basis: "listing" | "accepted" | "contract" | "sold" | "custom";
  customBasisCents: Money;
  mode: "percent" | "fixed";
  rate: number | null;
  fixedCents: Money;
  outsideMode: "percent" | "fixed";
  outsideRate: number | null;
  outsideCents: Money;
  outsideBroker: string;
  funding: { payer: string; cents: number }[];
  participants: {
    agentId: string;
    share: number;
    side: "listing" | "buyer" | "shared";
  }[];
  adjustments: { recipient: string; cents: number; reason: string }[];
  note: string;
}
export interface FinancialCalculation {
  basisCents: Money;
  totalCents: Money;
  outsideCents: number;
  primeCents: Money;
  distributableCents: Money;
  fundingCents: number;
  fundingGapCents: Money;
  issues: string[];
}
export function emptyFinancials(): DealFinancials {
  return {
    source: "other",
    role: "",
    prices: { listing: null, contract: null, sold: null, credits: null },
    acceptedOfferId: "",
    agreement: "",
    document: "",
    basis: "contract",
    customBasisCents: null,
    mode: "percent",
    rate: null,
    fixedCents: null,
    outsideMode: "percent",
    outsideRate: null,
    outsideCents: null,
    outsideBroker: "",
    funding: [],
    participants: [],
    adjustments: [],
    note: "",
  };
}
export function planPreset(name: FinancialPlan["name"]): FinancialPlan {
  return {
    name,
    agentPercent:
      name === "New licensee"
        ? 65
        : name === "Team Leader"
          ? 70
          : name === "Expert"
            ? 75
            : 100,
    companyCapCents: name === "Expert" ? 2500000 : null,
    capPeriod: "pending",
    anniversary: "",
    proBoundary: "pending",
    proBasis: "pending",
    effectiveFrom: new Date().toISOString().slice(0, 10),
    confirmed: false,
    openingCapCents: 0,
    openingCapPeriod: "",
    profitSharePercent: name === "Team Leader" ? 5 : 0,
    profitShareBasis: "",
    profitShareSchedule: "",
    chargePolicy: "pending",
    setupFeeCents: ["Pro", "Elite"].includes(name) ? 15000 : 0,
    monthlyFeeCents: name === "Elite" ? 9900 : 0,
  };
}
export function cents(value: string | number): Money {
  if (value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
export function money(value: Money): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value / 100);
}
function nonnegative(value: unknown, label: string, optional = false): void {
  if (optional && value === null) return;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 100_000_000_000
  )
    throw new Error(`${label} must be a valid non-negative amount`);
}
function percent(value: unknown, label: string, optional = false) {
  if (optional && value === null) return;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 100
  )
    throw new Error(`${label} must be between 0 and 100`);
}
function text(value: unknown, label: string, max = 2000) {
  if (typeof value !== "string" || value.length > max)
    throw new Error(`${label} is invalid or too long`);
}
export function validateFinancials(f: DealFinancials) {
  if (
    !f ||
    !["inventory", "mls", "other"].includes(f.source) ||
    !["", "listing", "buyer", "subagent", "both"].includes(f.role)
  )
    throw new Error("Select a valid property source and representation role");
  if (!f.prices) throw new Error("Prices are required");
  for (const key of ["listing", "contract", "sold", "credits"] as const)
    nonnegative(f.prices[key], `${key} price`, true);
  if (!["listing", "accepted", "contract", "sold", "custom"].includes(f.basis))
    throw new Error("Invalid commission basis");
  for (const mode of [f.mode, f.outsideMode])
    if (!["percent", "fixed"].includes(mode))
      throw new Error("Invalid compensation mode");
  percent(f.rate, "Commission rate", true);
  percent(f.outsideRate, "Outside rate", true);
  nonnegative(f.fixedCents, "Fixed commission", true);
  nonnegative(f.outsideCents, "Outside commission", true);
  nonnegative(f.customBasisCents, "Custom basis", true);
  for (const key of [
    "agreement",
    "document",
    "outsideBroker",
    "note",
    "acceptedOfferId",
  ] as const)
    text(f[key], key);
  for (const rows of [f.participants, f.funding, f.adjustments])
    if (!Array.isArray(rows) || rows.length > 30)
      throw new Error("Too many financial entries");
  const ids = new Set<string>();
  for (const p of f.participants) {
    text(p.agentId, "Agent ID", 100);
    percent(p.share, "Allocation");
    if (!p.agentId || ids.has(p.agentId))
      throw new Error("Select each participating agent only once");
    if (!["listing", "buyer", "shared"].includes(p.side))
      throw new Error("Invalid agent side");
    ids.add(p.agentId);
  }
  for (const row of f.funding) {
    text(row.payer, "Payer");
    nonnegative(row.cents, "Funding");
    if (!row.payer.trim()) throw new Error("Name each funding source");
  }
  for (const row of f.adjustments) {
    text(row.recipient, "Recipient");
    text(row.reason, "Adjustment reason");
    nonnegative(row.cents, "Adjustment");
    if (!row.recipient.trim() || !row.reason.trim())
      throw new Error("Adjustments require a recipient and reason");
  }
}
export function validatePlan(p: FinancialPlan) {
  if (
    !p ||
    ![
      "New licensee",
      "Team Leader",
      "Expert",
      "Pro",
      "Elite",
      "Custom",
    ].includes(p.name)
  )
    throw new Error("Invalid plan");
  percent(p.agentPercent, "Agent split");
  nonnegative(p.companyCapCents, "Company cap", true);
  if (!isDateOnly(p.effectiveFrom))
    throw new Error("A valid effective date is required");
  if (
    !["pending", "calendar", "anniversary"].includes(p.capPeriod) ||
    !["pending", "750", "1000"].includes(p.proBoundary) ||
    !["pending", "agent", "deal"].includes(p.proBasis)
  )
    throw new Error("Invalid plan rules");
  if (p.capPeriod === "anniversary" && !isDateOnly(p.anniversary))
    throw new Error("Anniversary date is required");
  if (typeof p.confirmed !== "boolean")
    throw new Error("Confirm the plan rules explicitly");
  if (p.name === "Expert" && p.companyCapCents === null)
    throw new Error("Expert plan requires a company cap");
  nonnegative(p.openingCapCents, "Opening cap contributions");
  if (p.openingCapCents && !isDateOnly(p.openingCapPeriod))
    throw new Error("Specify the cap period start for existing contributions");
  percent(p.profitSharePercent, "Profit share");
  text(p.profitShareBasis, "Profit-sharing basis");
  text(p.profitShareSchedule, "Profit-sharing schedule");
  nonnegative(p.setupFeeCents, "Setup fee");
  nonnegative(p.monthlyFeeCents, "Monthly service fee");
  if (!["pending", "separate", "withhold", "either"].includes(p.chargePolicy))
    throw new Error("Invalid account charge policy");
}
export function calculateFinancials(
  f: DealFinancials,
  acceptedCents: Money,
): FinancialCalculation {
  const issues: string[] = [];
  const basisCents =
    f.basis === "custom"
      ? f.customBasisCents
      : f.basis === "accepted"
        ? acceptedCents
        : f.prices[f.basis];
  const totalCents =
    f.mode === "fixed"
      ? f.fixedCents
      : basisCents !== null && f.rate !== null
        ? Math.round((basisCents * f.rate) / 100)
        : null;
  const hasOutside = f.role === "listing" || f.role === "both";
  const outsideCents = !hasOutside
    ? 0
    : f.outsideMode === "fixed"
      ? (f.outsideCents ?? 0)
      : basisCents !== null
        ? Math.round((basisCents * (f.outsideRate ?? 0)) / 100)
        : 0;
  const primeCents = totalCents === null ? null : totalCents - outsideCents;
  const distributableCents =
    primeCents === null
      ? null
      : primeCents - f.adjustments.reduce((sum, a) => sum + a.cents, 0);
  const fundingCents = f.funding.reduce((sum, a) => sum + a.cents, 0);
  if (!f.role) issues.push("Confirm Prime America’s representation role.");
  if (!f.agreement.trim()) issues.push("Record the compensation agreement.");
  if (!f.document.trim())
    issues.push("Link or identify the supporting agreement document.");
  if (totalCents === null)
    issues.push("Confirm the compensation amount and price basis.");
  if (hasOutside && outsideCents > 0 && !f.outsideBroker.trim())
    issues.push("Identify the outside brokerage.");
  if (primeCents !== null && primeCents < 0)
    issues.push("Outside compensation exceeds the total commission.");
  if (distributableCents !== null && distributableCents < 0)
    issues.push("Adjustments exceed Prime America’s commission.");
  if (primeCents !== null && fundingCents !== primeCents)
    issues.push("Reconcile funding sources to Prime America’s commission.");
  if (
    !f.participants.length ||
    Math.abs(f.participants.reduce((s, p) => s + p.share, 0) - 100) > 0.000001
  )
    issues.push("Agent allocations must total 100%.");
  return {
    basisCents,
    totalCents,
    outsideCents,
    primeCents,
    distributableCents,
    fundingCents,
    fundingGapCents: primeCents === null ? null : primeCents - fundingCents,
    issues,
  };
}
export function capPeriod(p: FinancialPlan, closeDate: string): string | null {
  if (p.companyCapCents === null || p.capPeriod === "pending") return null;
  const year = Number(closeDate.slice(0, 4));
  if (p.capPeriod === "calendar") return `${year}-01-01`;
  const suffix = p.anniversary.slice(4);
  return `${closeDate.slice(4) < suffix ? year - 1 : year}${suffix}`;
}
export function calculateAgent(
  base: number,
  plan: FinancialPlan,
  capUsed = 0,
  dealBase = base,
) {
  if (!plan.confirmed)
    return {
      agentCents: null,
      companyCents: null,
      issue: "Agent plan awaits confirmation.",
    };
  if (plan.companyCapCents !== null && plan.capPeriod === "pending")
    return {
      agentCents: null,
      companyCents: null,
      issue: "Confirm the cap reset period.",
    };
  let company = Math.round((base * (100 - plan.agentPercent)) / 100);
  if (plan.name === "Pro") {
    if (plan.proBoundary === "pending" || plan.proBasis === "pending")
      return {
        agentCents: null,
        companyCents: null,
        issue: "Confirm Pro fee boundaries and allocation basis.",
      };
    const feeBase = plan.proBasis === "deal" ? dealBase : base;
    const fee =
      feeBase <= 500000
        ? 25000
        : feeBase <= 1000000
          ? 50000
          : feeBase < 2000000 ||
              (feeBase === 2000000 && plan.proBoundary === "750")
            ? 75000
            : 100000;
    company =
      plan.proBasis === "deal" && dealBase > 0
        ? Math.round((fee * base) / dealBase)
        : fee;
  }
  if (plan.name === "Elite") company = 0;
  if (plan.companyCapCents !== null)
    company = Math.min(company, Math.max(0, plan.companyCapCents - capUsed));
  if (company > base)
    return {
      agentCents: null,
      companyCents: null,
      issue: "Fee exceeds this agent’s allocation; broker review required.",
    };
  return { agentCents: base - company, companyCents: company, issue: null };
}
