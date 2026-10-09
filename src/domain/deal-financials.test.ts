import { describe, expect, it } from "vitest";
import {
  calculateAgent,
  calculateFinancials,
  capPeriod,
  emptyFinancials,
  planPreset,
  validateFinancials,
  validatePlan,
} from "./deal-financials";

describe("deal compensation", () => {
  it("allocates outside compensation before the internal split", () => {
    const f = {
      ...emptyFinancials(),
      role: "listing" as const,
      rate: 4,
      outsideRate: 2,
      prices: {
        listing: null,
        contract: 50_000_000,
        sold: null,
        credits: 1_000_000,
      },
    };
    const result = calculateFinancials(f, null);
    expect(result.totalCents).toBe(2_000_000);
    expect(result.primeCents).toBe(1_000_000);
    expect(
      calculateAgent(result.primeCents!, {
        ...planPreset("New licensee"),
        confirmed: true,
      }).agentCents,
    ).toBe(650_000);
  });
  it("does not deduct an external listing brokerage from buyer compensation or count funding twice", () => {
    const f = {
      ...emptyFinancials(),
      role: "buyer" as const,
      mode: "fixed" as const,
      fixedCents: 1_000_000,
      outsideCents: 500_000,
      funding: [
        { payer: "Listing broker", cents: 800_000 },
        { payer: "Buyer", cents: 200_000 },
      ],
    };
    expect(calculateFinancials(f, null)).toMatchObject({
      primeCents: 1_000_000,
      fundingCents: 1_000_000,
      fundingGapCents: 0,
    });
  });
  it("leaves unknown amounts unknown and distinguishes zero", () => {
    expect(calculateFinancials(emptyFinancials(), null).primeCents).toBeNull();
    expect(
      calculateFinancials(
        { ...emptyFinancials(), mode: "fixed", fixedCents: 0 },
        null,
      ).primeCents,
    ).toBe(0);
  });
  it("requires configured Pro boundaries and handles each tier", () => {
    const p = { ...planPreset("Pro"), confirmed: true };
    expect(calculateAgent(1_000_000, p).agentCents).toBeNull();
    for (const [base, fee] of [
      [500000, 25000],
      [500001, 50000],
      [1000000, 50000],
      [1000001, 75000],
      [1999999, 75000],
      [2000000, 100000],
      [2000001, 100000],
    ]) {
      expect(
        calculateAgent(base, { ...p, proBoundary: "1000", proBasis: "agent" })
          .companyCents,
      ).toBe(fee);
    }
    expect(
      calculateAgent(2000000, { ...p, proBoundary: "750", proBasis: "agent" })
        .companyCents,
    ).toBe(75000);
  });
  it("limits company contributions to the remaining cap, not agent income", () => {
    const p = {
      ...planPreset("Expert"),
      confirmed: true,
      capPeriod: "calendar" as const,
    };
    expect(calculateAgent(1_000_000, p, 2_400_000)).toMatchObject({
      companyCents: 100_000,
      agentCents: 900_000,
    });
    expect(calculateAgent(1_000_000, p, 2_500_000).agentCents).toBe(1_000_000);
    expect(capPeriod(p, "2026-12-31")).toBe("2026-01-01");
    expect(
      capPeriod(
        { ...p, capPeriod: "anniversary", anniversary: "2020-06-15" },
        "2026-06-14",
      ),
    ).toBe("2025-06-15");
  });
  it("rejects invalid money, percentages, and missing plan confirmation", () => {
    expect(() =>
      validateFinancials({ ...emptyFinancials(), rate: -1 }),
    ).toThrow();
    expect(() =>
      validateFinancials({ ...emptyFinancials(), fixedCents: 1.5 }),
    ).toThrow();
    expect(() =>
      validatePlan({ ...planPreset("Expert"), effectiveFrom: "2026-02-30" }),
    ).toThrow();
    expect(calculateAgent(100000, planPreset("Elite")).agentCents).toBeNull();
  });
});
