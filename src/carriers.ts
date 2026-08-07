// Live carrier adapters. Two providers, either of which is free in test mode:
//
//   SHIPPO_API_TOKEN   → Shippo   (https://goshippo.com, test tokens start `shippo_test_`)
//   EASYPOST_API_KEY   → EasyPost (https://easypost.com, test keys start `EZTK`)
//
// Shippo wins if both are set. With neither, src/service.ts falls back to the
// deterministic fixture rater and every response is labelled `source: "fixture"`.
//
// Both providers are called in *test mode* by default: rates are real rate-table
// lookups and labels are real PDFs, but nothing is charged and nothing ships.

import type { Address, Parcel, Rate } from "./fixtures.js";

export type Provider = "shippo" | "easypost" | "fixture";

export interface PurchasedLabel {
  labelUrl: string | null;
  labelPdfBase64: string | null;
  trackingNumber: string;
  trackingUrl: string | null;
  carrier: string;
  service: string;
  amount: number;
  currency: string;
  providerShipmentId: string | null;
  providerTransactionId: string | null;
}

export function activeProvider(): Provider {
  if (process.env.SHIPPO_API_TOKEN) return "shippo";
  if (process.env.EASYPOST_API_KEY) return "easypost";
  return "fixture";
}

/** Is the configured provider key a test-mode key? Surfaced in every response. */
export function isTestMode(): boolean {
  const provider = activeProvider();
  if (provider === "shippo") return (process.env.SHIPPO_API_TOKEN ?? "").includes("_test_");
  if (provider === "easypost") return (process.env.EASYPOST_API_KEY ?? "").startsWith("EZTK");
  return true;
}

class CarrierError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

async function jsonOrThrow(res: Response, what: string): Promise<unknown> {
  const body = await res.text();
  if (!res.ok) {
    throw new CarrierError(`${what} failed: ${res.status} ${body.slice(0, 400)}`, res.status === 422 ? 400 : 502);
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new CarrierError(`${what} returned non-JSON: ${body.slice(0, 200)}`);
  }
}

/** Fetch a label PDF and return it base64 — so the artifact is IN our response. */
async function fetchLabelBase64(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────── Shippo ──────────

const SHIPPO_BASE = process.env.SHIPPO_BASE_URL ?? "https://api.goshippo.com";

function shippoHeaders(): Record<string, string> {
  return {
    Authorization: `ShippoToken ${process.env.SHIPPO_API_TOKEN}`,
    "Content-Type": "application/json",
  };
}

interface ShippoRate {
  object_id: string;
  provider: string;
  servicelevel?: { name?: string; token?: string };
  amount: string;
  currency: string;
  estimated_days?: number;
  duration_terms?: string;
}

function shippoAddress(a: Address): Record<string, unknown> {
  return {
    name: a.name ?? "Recipient",
    company: a.company,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
    email: a.email,
  };
}

function shippoParcel(p: Parcel): Record<string, unknown> {
  return {
    length: String(p.length),
    width: String(p.width),
    height: String(p.height),
    distance_unit: p.distanceUnit ?? "in",
    weight: String(p.weight),
    mass_unit: p.massUnit ?? "oz",
  };
}

function mapShippoRate(r: ShippoRate, i: number): Rate {
  return {
    rateId: r.object_id,
    carrier: r.provider,
    service: r.servicelevel?.name ?? "Standard",
    serviceToken: r.servicelevel?.token ?? `service_${i}`,
    amount: Number(r.amount),
    currency: r.currency,
    estimatedDays: r.estimated_days ?? null,
    durationTerms: r.duration_terms ?? "",
    cheapest: false,
    fastest: false,
  };
}

async function shippoRates(from: Address, to: Address, parcel: Parcel): Promise<Rate[]> {
  const res = await fetch(`${SHIPPO_BASE}/shipments/`, {
    method: "POST",
    headers: shippoHeaders(),
    body: JSON.stringify({
      address_from: shippoAddress(from),
      address_to: shippoAddress(to),
      parcels: [shippoParcel(parcel)],
      async: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await jsonOrThrow(res, "Shippo shipment")) as { rates?: ShippoRate[] };
  return (data.rates ?? []).map(mapShippoRate);
}

async function shippoLabel(rateId: string): Promise<PurchasedLabel> {
  const res = await fetch(`${SHIPPO_BASE}/transactions/`, {
    method: "POST",
    headers: shippoHeaders(),
    body: JSON.stringify({ rate: rateId, label_file_type: "PDF", async: false }),
    signal: AbortSignal.timeout(45_000),
  });
  const tx = (await jsonOrThrow(res, "Shippo transaction")) as {
    object_id?: string;
    status?: string;
    label_url?: string;
    tracking_number?: string;
    tracking_url_provider?: string;
    rate?: ShippoRate | string;
    messages?: Array<{ text?: string }>;
  };
  if (tx.status && tx.status !== "SUCCESS") {
    throw new CarrierError(
      `Shippo label purchase ${tx.status}: ${(tx.messages ?? []).map((m) => m.text).join("; ")}`,
      400,
    );
  }
  const rate = typeof tx.rate === "object" && tx.rate ? tx.rate : null;
  return {
    labelUrl: tx.label_url ?? null,
    labelPdfBase64: await fetchLabelBase64(tx.label_url ?? null),
    trackingNumber: tx.tracking_number ?? "",
    trackingUrl: tx.tracking_url_provider ?? null,
    carrier: rate?.provider ?? "",
    service: rate?.servicelevel?.name ?? "",
    amount: Number(rate?.amount ?? 0),
    currency: rate?.currency ?? "USD",
    providerShipmentId: null,
    providerTransactionId: tx.object_id ?? null,
  };
}

// ───────────────────────────────────────────────────────── EasyPost ──────────

const EASYPOST_BASE = process.env.EASYPOST_BASE_URL ?? "https://api.easypost.com/v2";

function easypostHeaders(): Record<string, string> {
  const basic = Buffer.from(`${process.env.EASYPOST_API_KEY}:`).toString("base64");
  return { Authorization: `Basic ${basic}`, "Content-Type": "application/json" };
}

interface EasyPostRate {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days?: number | null;
  est_delivery_days?: number | null;
}

function easypostAddress(a: Address): Record<string, unknown> {
  return {
    name: a.name ?? "Recipient",
    company: a.company,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
    email: a.email,
  };
}

function easypostParcel(p: Parcel): Record<string, unknown> {
  // EasyPost is inches + ounces only, so convert whatever the caller sent.
  const toIn = (v: number): number => ((p.distanceUnit ?? "in") === "cm" ? v / 2.54 : v);
  const oz =
    (p.massUnit ?? "oz") === "lb"
      ? p.weight * 16
      : (p.massUnit ?? "oz") === "g"
        ? p.weight / 28.3495
        : (p.massUnit ?? "oz") === "kg"
          ? (p.weight * 1000) / 28.3495
          : p.weight;
  return {
    length: Number(toIn(p.length).toFixed(2)),
    width: Number(toIn(p.width).toFixed(2)),
    height: Number(toIn(p.height).toFixed(2)),
    weight: Number(oz.toFixed(2)),
  };
}

function mapEasyPostRate(r: EasyPostRate, i: number): Rate {
  return {
    rateId: r.id,
    carrier: r.carrier,
    service: r.service,
    serviceToken: r.service.toLowerCase().replace(/[^a-z0-9]+/g, "_") || `service_${i}`,
    amount: Number(r.rate),
    currency: r.currency,
    estimatedDays: r.delivery_days ?? r.est_delivery_days ?? null,
    durationTerms: "",
    cheapest: false,
    fastest: false,
  };
}

/** EasyPost needs the shipment id to buy a rate, so `rateId` carries both. */
function packEasyPostRateId(shipmentId: string, rateId: string): string {
  return `${shipmentId}::${rateId}`;
}

async function easypostRates(
  from: Address,
  to: Address,
  parcel: Parcel,
): Promise<{ rates: Rate[]; shipmentId: string }> {
  const res = await fetch(`${EASYPOST_BASE}/shipments`, {
    method: "POST",
    headers: easypostHeaders(),
    body: JSON.stringify({
      shipment: {
        to_address: easypostAddress(to),
        from_address: easypostAddress(from),
        parcel: easypostParcel(parcel),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const data = (await jsonOrThrow(res, "EasyPost shipment")) as { id: string; rates?: EasyPostRate[] };
  return {
    shipmentId: data.id,
    rates: (data.rates ?? []).map((r, i) => {
      const rate = mapEasyPostRate(r, i);
      rate.rateId = packEasyPostRateId(data.id, r.id);
      return rate;
    }),
  };
}

async function easypostLabel(packedRateId: string): Promise<PurchasedLabel> {
  const [shipmentId, rateId] = packedRateId.split("::");
  if (!shipmentId || !rateId) {
    throw new CarrierError(
      "EasyPost rate ids look like `shp_...::rate_...` — pass the rateId exactly as POST /rates returned it",
      400,
    );
  }
  const res = await fetch(`${EASYPOST_BASE}/shipments/${encodeURIComponent(shipmentId)}/buy`, {
    method: "POST",
    headers: easypostHeaders(),
    body: JSON.stringify({ rate: { id: rateId } }),
    signal: AbortSignal.timeout(45_000),
  });
  const shp = (await jsonOrThrow(res, "EasyPost buy")) as {
    id?: string;
    tracking_code?: string;
    tracker?: { public_url?: string };
    selected_rate?: EasyPostRate;
    postage_label?: { label_pdf_url?: string; label_url?: string };
  };
  const labelUrl = shp.postage_label?.label_pdf_url ?? shp.postage_label?.label_url ?? null;
  return {
    labelUrl,
    labelPdfBase64: await fetchLabelBase64(labelUrl),
    trackingNumber: shp.tracking_code ?? "",
    trackingUrl: shp.tracker?.public_url ?? null,
    carrier: shp.selected_rate?.carrier ?? "",
    service: shp.selected_rate?.service ?? "",
    amount: Number(shp.selected_rate?.rate ?? 0),
    currency: shp.selected_rate?.currency ?? "USD",
    providerShipmentId: shp.id ?? null,
    providerTransactionId: null,
  };
}

// ───────────────────────────────────────────────────── Provider facade ───────

export async function liveRates(
  from: Address,
  to: Address,
  parcel: Parcel,
): Promise<Rate[]> {
  if (activeProvider() === "shippo") return shippoRates(from, to, parcel);
  return (await easypostRates(from, to, parcel)).rates;
}

export async function liveLabel(rateId: string): Promise<PurchasedLabel> {
  if (activeProvider() === "shippo") return shippoLabel(rateId);
  return easypostLabel(rateId);
}
