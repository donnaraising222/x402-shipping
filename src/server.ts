import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import {
  activeRails,
  mountSolanaCheckout,
  normalizeRouteSpec,
  paymentReceipt,
  paywall,
  usingSuiteDefaultPayTo,
  type RoutePrices,
} from "./payments.js";
import { ROUTE_SCHEMAS } from "./schemas.js";
import {
  activeSource,
  buyLabel,
  quoteRates,
  ServiceError,
  testMode,
  type LabelRequest,
  type RatesRequest,
} from "./service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

// Price + call schema per paid route. The schema half is generated from
// openapi.json (`src/schemas.ts`) and republished inside the 402 challenge, so
// an agent that has only ever seen a 402 still knows how to call the route.
const PRICES: RoutePrices = {
  "POST /rates": { price: "$0.003", ...ROUTE_SCHEMAS["POST /rates"] },
  "POST /label": { price: "$0.02", ...ROUTE_SCHEMAS["POST /label"] },
};

const app = express();
// Labels come back base64 in the body, so allow a roomy request too.
app.use(express.json({ limit: "512kb" }));

// ----- Free routes (declared before the paywall so they stay free) -----

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "x402-shipping",
    source: activeSource(),
    testMode: testMode(),
    rails: activeRails().map((r) => ({ rail: r.rail, network: r.network })),
  });
});

app.get("/.well-known/x402", (_req, res) => {
  const manifest = JSON.parse(readFileSync(path.join(PUBLIC_DIR, ".well-known", "x402"), "utf8"));
  res.type("application/json").json(manifest);
});

app.use(express.static(PUBLIC_DIR, { dotfiles: "allow" }));

// Solana checkout helpers (prepare/encode) for wallets that sign serialized txs.
await mountSolanaCheckout(app);

// ----- Paywall: dual-rail x402, USDC on Base or Solana -----
app.use(
  paywall(PRICES, {
    service: "x402-shipping",
    descriptions: {
      "POST /rates": "Carrier rate table for a shipment: every service, price and transit time",
      "POST /label": "Purchase a shipping label — PDF returned base64 in the response body",
    },
  }),
);

// ----- Paid routes: every one returns the purchased artifact in the 200 body -----

function fail(res: express.Response, err: unknown): void {
  if (err instanceof ServiceError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  const status = (err as Error & { status?: number }).status ?? 502;
  res.status(status >= 400 && status < 600 ? status : 502).json({
    error: "upstream_error",
    message: (err as Error).message,
  });
}

app.post("/rates", async (req, res) => {
  try {
    const result = await quoteRates(req.body as RatesRequest);
    res.json({ ...result, payment: paymentReceipt(res) });
  } catch (err) {
    fail(res, err);
  }
});

app.post("/label", async (req, res) => {
  try {
    const label = await buyLabel(req.body as LabelRequest);
    res.json({ ...label, payment: paymentReceipt(res) });
  } catch (err) {
    fail(res, err);
  }
});

const port = Number(process.env.PORT ?? 4023);
app.listen(port, () => {
  console.log(`x402-shipping listening on http://localhost:${port}`);
  console.log(`  carrier provider: ${activeSource()}${testMode() ? " (test mode — nothing ships, nothing is charged)" : " (LIVE — labels cost real money)"}`);
  console.log("  payment rails:");
  for (const rail of activeRails()) {
    console.log(`    ${rail.rail.padEnd(7)} ${rail.network.padEnd(14)} → ${rail.payTo}`);
  }
  if (usingSuiteDefaultPayTo()) {
    console.log(
      "  note: using suite default payTo — set PAY_TO_ADDRESS/SOLANA_PAY_TO_ADDRESS to receive funds yourself",
    );
  }
  console.log("  paid routes:");
  for (const [route, spec] of Object.entries(PRICES)) {
    console.log(`    ${route.padEnd(16)} ${normalizeRouteSpec(spec).price}`);
  }
  console.log("  free routes: GET /health, GET /.well-known/x402");
});
