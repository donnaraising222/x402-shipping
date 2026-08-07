// Fixture data — used when SHIPPO_API_TOKEN / EASYPOST_API_KEY are unset.
// Deterministic: the same shipment always yields the same rates, the same
// carrier ordering, and the same tracking number.

export interface Address {
  name?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface Parcel {
  /** Inches unless `distanceUnit` says otherwise. */
  length: number;
  width: number;
  height: number;
  /** Ounces unless `massUnit` says otherwise. */
  weight: number;
  distanceUnit?: "in" | "cm";
  massUnit?: "oz" | "lb" | "g" | "kg";
}

export interface Rate {
  rateId: string;
  carrier: string;
  service: string;
  serviceToken: string;
  amount: number;
  currency: string;
  estimatedDays: number | null;
  durationTerms: string;
  /** True for the cheapest rate in the table. */
  cheapest: boolean;
  /** True for the fastest rate in the table. */
  fastest: boolean;
}

/**
 * Carrier services the fixture rater quotes. Prices are a base fee plus a
 * per-pound and per-cubic-foot component, so heavier or bulkier parcels really
 * do cost more — the numbers move the way real rate tables move.
 */
interface FixtureService {
  carrier: string;
  service: string;
  serviceToken: string;
  base: number;
  perPound: number;
  perCubicFoot: number;
  estimatedDays: number;
  durationTerms: string;
}

// Fixture data — used when SHIPPO_API_TOKEN / EASYPOST_API_KEY are unset.
const SERVICES: FixtureService[] = [
  {
    carrier: "USPS",
    service: "Ground Advantage",
    serviceToken: "usps_ground_advantage",
    base: 5.35,
    perPound: 0.72,
    perCubicFoot: 1.1,
    estimatedDays: 4,
    durationTerms: "Delivery in 2 to 5 business days.",
  },
  {
    carrier: "USPS",
    service: "Priority Mail",
    serviceToken: "usps_priority",
    base: 8.9,
    perPound: 1.05,
    perCubicFoot: 1.6,
    estimatedDays: 2,
    durationTerms: "Delivery in 1 to 3 business days.",
  },
  {
    carrier: "USPS",
    service: "Priority Mail Express",
    serviceToken: "usps_priority_express",
    base: 28.5,
    perPound: 1.4,
    perCubicFoot: 2.2,
    estimatedDays: 1,
    durationTerms: "Next business day by 6pm to most US addresses.",
  },
  {
    carrier: "UPS",
    service: "Ground",
    serviceToken: "ups_ground",
    base: 9.15,
    perPound: 0.88,
    perCubicFoot: 1.35,
    estimatedDays: 4,
    durationTerms: "Delivery in 1 to 5 business days depending on distance.",
  },
  {
    carrier: "UPS",
    service: "2nd Day Air",
    serviceToken: "ups_2nd_day_air",
    base: 21.4,
    perPound: 1.25,
    perCubicFoot: 1.95,
    estimatedDays: 2,
    durationTerms: "Delivery by end of the second business day.",
  },
  {
    carrier: "FedEx",
    service: "Home Delivery",
    serviceToken: "fedex_home_delivery",
    base: 9.6,
    perPound: 0.84,
    perCubicFoot: 1.3,
    estimatedDays: 3,
    durationTerms: "Delivery in 1 to 5 business days, Tuesday through Saturday.",
  },
  {
    carrier: "FedEx",
    service: "2Day",
    serviceToken: "fedex_2day",
    base: 22.75,
    perPound: 1.3,
    perCubicFoot: 2.0,
    estimatedDays: 2,
    durationTerms: "Delivery by 4:30pm on the second business day.",
  },
];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Weight in pounds, whatever unit the caller used. */
export function toPounds(parcel: Parcel): number {
  switch (parcel.massUnit ?? "oz") {
    case "lb":
      return parcel.weight;
    case "g":
      return parcel.weight / 453.592;
    case "kg":
      return (parcel.weight * 1000) / 453.592;
    default:
      return parcel.weight / 16;
  }
}

/** Volume in cubic feet, whatever unit the caller used. */
export function toCubicFeet(parcel: Parcel): number {
  const factor = (parcel.distanceUnit ?? "in") === "cm" ? 1 / 2.54 : 1;
  const inches = parcel.length * parcel.width * parcel.height * factor ** 3;
  return inches / 1728;
}

/**
 * Zone surcharge, 1 (same region) to 8 (coast to coast), derived from the first
 * digit of each ZIP. Real carriers do exactly this, just with a bigger table.
 */
export function zoneFactor(fromZip: string, toZip: string): number {
  const a = Number(fromZip.replace(/\D/g, "").slice(0, 1));
  const b = Number(toZip.replace(/\D/g, "").slice(0, 1));
  if (Number.isNaN(a) || Number.isNaN(b)) return 4;
  return Math.min(8, Math.max(1, Math.abs(a - b) + 1));
}

/** Deterministic rate table for a shipment. */
export function fixtureRates(from: Address, to: Address, parcel: Parcel): Rate[] {
  const pounds = toPounds(parcel);
  const cubicFeet = toCubicFeet(parcel);
  const zone = zoneFactor(from.zip, to.zip);
  const zoneMultiplier = 1 + (zone - 1) * 0.06;

  const rates: Rate[] = SERVICES.map((s, i) => {
    const amount = round2(
      (s.base + s.perPound * pounds + s.perCubicFoot * cubicFeet) * zoneMultiplier,
    );
    return {
      rateId: `rate_fixture_${String(i + 1).padStart(2, "0")}_${s.serviceToken}`,
      carrier: s.carrier,
      service: s.service,
      serviceToken: s.serviceToken,
      amount,
      currency: "USD",
      // Longer zones add transit days to ground services, not to express ones.
      estimatedDays: s.estimatedDays + (s.estimatedDays >= 3 ? Math.floor((zone - 1) / 3) : 0),
      durationTerms: s.durationTerms,
      cheapest: false,
      fastest: false,
    };
  }).sort((a, b) => a.amount - b.amount);

  const minAmount = Math.min(...rates.map((r) => r.amount));
  const minDays = Math.min(...rates.map((r) => r.estimatedDays ?? 99));
  for (const r of rates) {
    r.cheapest = r.amount === minAmount;
    r.fastest = (r.estimatedDays ?? 99) === minDays;
  }
  return rates;
}

/**
 * A 1-page PDF containing the label's human-readable text. Small, valid, and
 * openable — so the base64 in the response is a real document, not a placeholder
 * blob. Built by hand because a fixture shouldn't drag in a PDF library.
 */
export function fixtureLabelPdf(lines: string[]): string {
  const esc = (s: string): string => s.replace(/([\\()])/g, "\\$1");
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 16 : 11} Tf 40 ${700 - i * 22} Td (${esc(line)}) Tj ET`)
    .join("\n");
  const content = `q 0.6 w 25 ${700 - lines.length * 22 - 20} 350 ${lines.length * 22 + 60} re S Q\n${text}`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 396 612] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1").toString("base64");
}

/**
 * Deterministic tracking number in the shape the carrier actually uses, derived
 * from a hash of the shipment so the same shipment always tracks the same.
 */
export function fixtureTracking(carrier: string, seed: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const digits = String(h).padStart(10, "0");
  switch (carrier) {
    case "UPS":
      return `1Z999AA1${digits.slice(0, 10)}`;
    case "FedEx":
      return `7${digits}${digits.slice(0, 1)}`;
    default:
      return `9400 1000 0000 ${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 10)}`;
  }
}
