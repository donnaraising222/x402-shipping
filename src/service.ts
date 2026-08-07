import { createHash } from "node:crypto";
import {
  fixtureLabelPdf,
  fixtureRates,
  fixtureTracking,
  toCubicFeet,
  toPounds,
  zoneFactor,
  type Address,
  type Parcel,
  type Rate,
} from "./fixtures.js";
import { activeProvider, isTestMode, liveLabel, liveRates, type Provider } from "./carriers.js";

export type { Address, Parcel, Rate };
export type Source = Provider;

export interface RatesResult {
  source: Source;
  testMode: boolean;
  quotedAt: string;
  shipmentId: string;
  shipment: {
    from: { city: string; state: string; zip: string; country: string };
    to: { city: string; state: string; zip: string; country: string };
    parcel: { pounds: number; cubicFeet: number; zone: number };
  };
  rateCount: number;
  cheapest: Rate | null;
  fastest: Rate | null;
  rates: Rate[];
}

export interface LabelResult {
  source: Source;
  testMode: boolean;
  purchasedAt: string;
  labelId: string;
  rateId: string;
  carrier: string;
  service: string;
  amount: number;
  currency: string;
  trackingNumber: string;
  trackingUrl: string | null;
  labelFormat: "PDF";
  labelPdfBase64: string;
  labelUrl: string | null;
  providerShipmentId: string | null;
  providerTransactionId: string | null;
}

export class ServiceError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function activeSource(): Source {
  return activeProvider();
}

export function testMode(): boolean {
  return isTestMode();
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

const ADDRESS_FIELDS = ["street1", "city", "state", "zip", "country"] as const;

function validateAddress(value: unknown, which: string): Address {
  if (!value || typeof value !== "object") {
    throw new ServiceError("invalid_address", `\`${which}\` must be an address object`);
  }
  const a = value as Record<string, unknown>;
  for (const field of ADDRESS_FIELDS) {
    if (typeof a[field] !== "string" || !(a[field] as string).trim()) {
      throw new ServiceError("invalid_address", `\`${which}.${field}\` is required`);
    }
  }
  return a as unknown as Address;
}

function validateParcel(value: unknown): Parcel {
  if (!value || typeof value !== "object") {
    throw new ServiceError("invalid_parcel", "`parcel` must be an object");
  }
  const p = value as Record<string, unknown>;
  for (const field of ["length", "width", "height", "weight"] as const) {
    const n = Number(p[field]);
    if (!Number.isFinite(n) || n <= 0) {
      throw new ServiceError("invalid_parcel", `\`parcel.${field}\` must be a positive number`);
    }
  }
  return {
    length: Number(p.length),
    width: Number(p.width),
    height: Number(p.height),
    weight: Number(p.weight),
    distanceUnit: p.distanceUnit === "cm" ? "cm" : "in",
    massUnit: ["oz", "lb", "g", "kg"].includes(String(p.massUnit)) ? (p.massUnit as Parcel["massUnit"]) : "oz",
  };
}

/** Stable id for a shipment, so the same request always names the same shipment. */
function shipmentIdFor(from: Address, to: Address, parcel: Parcel, source: Source): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({ from, to, parcel }))
    .digest("hex")
    .slice(0, 16);
  return `shp_${source}_${digest}`;
}

export interface RatesRequest {
  from?: unknown;
  to?: unknown;
  parcel?: unknown;
}

export async function quoteRates(body: RatesRequest): Promise<RatesResult> {
  const from = validateAddress(body.from, "from");
  const to = validateAddress(body.to, "to");
  const parcel = validateParcel(body.parcel);
  const source = activeSource();

  let rates: Rate[];
  if (source === "fixture") {
    rates = fixtureRates(from, to, parcel);
  } else {
    rates = await liveRates(from, to, parcel);
    // Live providers don't flag cheapest/fastest; do it here so both modes match.
    if (rates.length > 0) {
      const minAmount = Math.min(...rates.map((r) => r.amount));
      const minDays = Math.min(...rates.map((r) => r.estimatedDays ?? 99));
      for (const r of rates) {
        r.cheapest = r.amount === minAmount;
        r.fastest = (r.estimatedDays ?? 99) === minDays;
      }
      rates.sort((a, b) => a.amount - b.amount);
    }
  }

  return {
    source,
    testMode: testMode(),
    quotedAt: new Date().toISOString(),
    shipmentId: shipmentIdFor(from, to, parcel, source),
    shipment: {
      from: { city: from.city, state: from.state, zip: from.zip, country: from.country },
      to: { city: to.city, state: to.state, zip: to.zip, country: to.country },
      parcel: {
        pounds: round2(toPounds(parcel)),
        cubicFeet: round2(toCubicFeet(parcel)),
        zone: zoneFactor(from.zip, to.zip),
      },
    },
    rateCount: rates.length,
    cheapest: rates.find((r) => r.cheapest) ?? null,
    fastest: rates.find((r) => r.fastest) ?? null,
    rates,
  };
}

export interface LabelRequest {
  rateId?: unknown;
  /** Required in fixture mode (a fixture rate id carries no shipment). */
  from?: unknown;
  to?: unknown;
  parcel?: unknown;
}

export async function buyLabel(body: LabelRequest): Promise<LabelResult> {
  const rateId = typeof body.rateId === "string" ? body.rateId.trim() : "";
  if (!rateId) {
    throw new ServiceError("missing_rate_id", "`rateId` is required — use one returned by POST /rates");
  }
  const source = activeSource();

  if (source !== "fixture") {
    const bought = await liveLabel(rateId);
    if (!bought.labelPdfBase64) {
      throw new ServiceError(
        "label_unavailable",
        `The carrier issued tracking ${bought.trackingNumber || "(none)"} but the label PDF could not be fetched. Retrieve it at ${bought.labelUrl ?? "the provider dashboard"}.`,
        502,
      );
    }
    return {
      source,
      testMode: testMode(),
      purchasedAt: new Date().toISOString(),
      labelId: `lbl_${createHash("sha256").update(rateId).digest("hex").slice(0, 16)}`,
      rateId,
      carrier: bought.carrier,
      service: bought.service,
      amount: bought.amount,
      currency: bought.currency,
      trackingNumber: bought.trackingNumber,
      trackingUrl: bought.trackingUrl,
      labelFormat: "PDF",
      labelPdfBase64: bought.labelPdfBase64,
      labelUrl: bought.labelUrl,
      providerShipmentId: bought.providerShipmentId,
      providerTransactionId: bought.providerTransactionId,
    };
  }

  // ── Fixture mode ──────────────────────────────────────────────────────────
  // A fixture rate id encodes only the service, so the caller must re-send the
  // shipment. That's the honest trade: we never invent an address we weren't given.
  const from = validateAddress(body.from, "from");
  const to = validateAddress(body.to, "to");
  const parcel = validateParcel(body.parcel);

  const rate = fixtureRates(from, to, parcel).find((r) => r.rateId === rateId);
  if (!rate) {
    throw new ServiceError(
      "rate_not_found",
      `Rate ${rateId} is not one of the rates for this shipment. Call POST /rates with the same from/to/parcel and use a rateId from the response.`,
      404,
    );
  }

  const seed = `${rate.rateId}|${from.zip}|${to.zip}|${parcel.weight}`;
  const trackingNumber = fixtureTracking(rate.carrier, seed);
  const labelId = `lbl_fixture_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;

  const labelPdfBase64 = fixtureLabelPdf([
    `${rate.carrier} ${rate.service}`,
    "",
    `FROM: ${from.name ?? from.company ?? "Shipper"}`,
    `      ${from.street1}`,
    `      ${from.city}, ${from.state} ${from.zip} ${from.country}`,
    "",
    `TO:   ${to.name ?? to.company ?? "Recipient"}`,
    `      ${to.street1}`,
    `      ${to.city}, ${to.state} ${to.zip} ${to.country}`,
    "",
    `TRACKING: ${trackingNumber}`,
    `POSTAGE:  $${rate.amount.toFixed(2)} ${rate.currency}`,
    `LABEL ID: ${labelId}`,
    "",
    "TEST LABEL - NOT VALID FOR SHIPPING",
  ]);

  return {
    source,
    testMode: true,
    purchasedAt: new Date().toISOString(),
    labelId,
    rateId,
    carrier: rate.carrier,
    service: rate.service,
    amount: rate.amount,
    currency: rate.currency,
    trackingNumber,
    trackingUrl: null,
    labelFormat: "PDF",
    labelPdfBase64,
    labelUrl: null,
    providerShipmentId: null,
    providerTransactionId: null,
  };
}
